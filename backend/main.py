from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import json
from parser import parse_sql_files, build_graph

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
CURRENT_DIRECTORY = os.path.join(os.path.dirname(__file__), "../sql_examples")
DIAGRAM_FILE = "sql_diagram.json"

@app.get("/graph")
def get_graph():
    """Parses SQL files in the current directory and returns graph data."""
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "error": "Directory not found"}
        
    tables = parse_sql_files(CURRENT_DIRECTORY)
    nodes, edges = build_graph(tables)
    return {"nodes": nodes, "edges": edges}

@app.post("/config/path")
def set_path(path_data: dict = Body(...)):
    """Updates the directory to scan."""
    global CURRENT_DIRECTORY
    path = path_data.get("path")
    # Basic validation
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Directory does not exist")
    
    
    CURRENT_DIRECTORY = path
    return {"message": "Path updated", "path": CURRENT_DIRECTORY}

@app.post("/scan/folders")
def scan_folders(path_data: dict = Body(...)):
    """Scans a directory and returns immediate subfolders."""
    path = path_data.get("path")
    if not path or not os.path.exists(path):
         raise HTTPException(status_code=400, detail="Directory does not exist")
    
    try:
        subfolders = [f.name for f in os.scandir(path) if f.is_dir() and not f.name.startswith('.')]
        return {"folders": subfolders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/graph/filtered")
def get_filtered_graph(data: dict = Body(...)):
    """Parses SQL files with subfolder filtering."""
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "error": "Directory not found"}
    
    subfolders = data.get("subfolders") # List of strings or None
    tables = parse_sql_files(CURRENT_DIRECTORY, allowed_subfolders=subfolders)
    nodes, edges = build_graph(tables)
    return {"nodes": nodes, "edges": edges}

@app.get("/config/path")
def get_path():
    return {"path": CURRENT_DIRECTORY}

@app.post("/save")
def save_state(data: dict = Body(...)):
    """Saves the current diagram state to sql_diagram.json in the current directory."""
    try:
        file_path = os.path.join(CURRENT_DIRECTORY, DIAGRAM_FILE)
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return {"message": f"Saved to {file_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/load")
def load_state():
    """Loads the diagram state if it exists."""
    file_path = os.path.join(CURRENT_DIRECTORY, DIAGRAM_FILE)
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            return data
        except Exception as e:
             return {}
    return {} # Return empty object if no save file

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
