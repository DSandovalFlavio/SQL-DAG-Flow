import PyInstaller.__main__
import os
import sys

# Define base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")

# Ensure frontend build exists
if not os.path.exists(FRONTEND_DIST):
    print("Error: Frontend dist directory not found. Run 'npm run build' in frontend/ first.")
    sys.exit(1)

# PyInstaller arguments
args = [
    'backend/main.py',                # Main script
    '--name=SQL_DAG_Flow',            # Executable name
    '--onefile',                      # Create a single executable
    '--noconsole',                    # Hide console window (optional, maybe keep for debug first?)
    # '--windowed',                   # Same as noconsole
    '--add-data=frontend/dist;dist',  # Include frontend static files (source;dest)
    
    # Hidden imports often missed by analysis
    '--hidden-import=uvicorn',
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--hidden-import=sqlglot',
    '--hidden-import=networkx',
    '--hidden-import=fastapi',
    '--hidden-import=starlette',
    '--hidden-import=pydantic',
    
    '--clean',                        # Clean cache
    '--distpath=dist_exe',            # Output directory
    '--workpath=build_exe',           # Work directory
]

# Run PyInstaller
print("Starting PyInstaller build...")
PyInstaller.__main__.run(args)
print("Build complete! Executable is in dist_exe/")
