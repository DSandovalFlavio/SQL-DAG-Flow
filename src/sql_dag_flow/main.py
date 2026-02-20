from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os
import sys
import json
import webbrowser
import threading
import time
from .parser import parse_sql_files, build_graph

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Package structure
# __file__ is inside src/sql_dag_flow/main.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Global state
CURRENT_DIRECTORY = os.getcwd() # Default, updated by start()
DIAGRAM_FILE = "sql_diagram.json"

@app.get("/graph")
def get_graph(dialect: str = "bigquery", discovery: bool = False):
    """Parses SQL files in the current directory and returns graph data."""
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "error": "Directory not found"}
        
    tables = parse_sql_files(CURRENT_DIRECTORY, dialect=dialect)
    nodes, edges = build_graph(tables, discovery_mode=discovery)
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
    """Scans a directory and returns all subfolders (recursive, relative paths)."""
    path = path_data.get("path")
    if not path or not os.path.exists(path):
         raise HTTPException(status_code=400, detail="Directory does not exist")
    
    try:
        subfolders = []
        # Walk the directory tree
        for root, dirs, files in os.walk(path):
            # Skip hidden folders
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            
            for d in dirs:
                # Create relative path from the root path
                full_path = os.path.join(root, d)
                rel_path = os.path.relpath(full_path, path)
                # Normalize separators to forward slashes for consistency
                rel_path = rel_path.replace(os.sep, '/')
                subfolders.append(rel_path)
                
        # Sort for better UX
        subfolders.sort()
        return {"folders": subfolders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/graph/filtered")
def get_filtered_graph(data: dict = Body(...)):
    """Parses SQL files with subfolder filtering."""
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "error": "Directory not found"}
    
    subfolders = data.get("subfolders") # List of strings or None
    dialect = data.get("dialect", "bigquery")
    discovery = data.get("discovery", False)
    
    tables = parse_sql_files(CURRENT_DIRECTORY, allowed_subfolders=subfolders, dialect=dialect)
    nodes, edges = build_graph(tables, discovery_mode=discovery)
    return {"nodes": nodes, "edges": edges}

@app.get("/config/path")
def get_path():
    return {"path": CURRENT_DIRECTORY}

class SaveRequest(BaseModel):
    nodes: list
    edges: list
    viewport: dict
    metadata: dict
    filename: str = "sql_diagram.json" # Default filename

@app.post("/save")
def save_graph(request: SaveRequest):
    try:
        # Use the path from metadata if available, otherwise default
        path = request.metadata.get("path", ".")
        if not os.path.isabs(path):
             path = os.path.abspath(path)
        
        filepath = os.path.join(path, request.filename)
        
        data = {
            "nodes": request.nodes,
            "edges": request.edges,
            "viewport": request.viewport,
            "metadata": request.metadata
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=4)
        return {"message": f"Graph saved successfully to {filepath}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/load")
def load_graph(path: str = ".", filename: str = "sql_diagram.json"):
    try:
        if not os.path.isabs(path):
             path = os.path.abspath(path)
        
        filepath = os.path.join(path, filename)
        
        if not os.path.exists(filepath):
            return {"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}, "metadata": {}}
        
        with open(filepath, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"Error loading graph: {e}")
        return {"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}, "metadata": {}}

@app.get("/config_files")
def list_config_files(path: str = "."):
    try:
        if not os.path.isabs(path):
             path = os.path.abspath(path)
        
        if not os.path.exists(path):
            return {"files": []}

        files = [f for f in os.listdir(path) if f.endswith(".json") and os.path.isfile(os.path.join(path, f))]
        return {"files": files}
    except Exception as e:
        print(f"Error listing config files: {e}")
        return {"files": []}

class CreateFileRequest(BaseModel):
    path: str
    content: str

@app.post("/files/create")
def create_file(request: CreateFileRequest):
    try:
        # validation: ensure path is within project directory to prevent security issues
        # loose check: must not contain ..
        if ".." in request.path:
             raise HTTPException(status_code=400, detail="Invalid path")

        full_path = os.path.join(CURRENT_DIRECTORY, request.path)
        
        # Create directories if they don't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        if os.path.exists(full_path):
             raise HTTPException(status_code=400, detail="File already exists")

        with open(full_path, "w") as f:
            f.write(request.content)
            
        return {"message": f"File created at {request.path}", "path": full_path}
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve Static Files (Frontend)
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
    
    # Catch-all for SPA routing
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Serve index.html with cache-busting headers to ensure updates are seen immediately
        response = FileResponse(os.path.join(STATIC_DIR, "index.html"))
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

def start():
    """Entry point for the CLI tool."""
    global CURRENT_DIRECTORY
    
    # CLI Argument Parsing
    if len(sys.argv) > 1:
        path_arg = sys.argv[1]
        if os.path.exists(path_arg):
            CURRENT_DIRECTORY = os.path.abspath(path_arg)
            print(f"Setting project path from CLI: {CURRENT_DIRECTORY}")
        else:
            print(f"Warning: Path '{path_arg}' does not exist. Using defaults.")
    else:
        CURRENT_DIRECTORY = os.getcwd()
        print(f"Using current directory: {CURRENT_DIRECTORY}")

    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:8000")

    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run uvicorn programmatically
    # Note: When running programmatically, reload=True is not supported easily without other hacks
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    start()
