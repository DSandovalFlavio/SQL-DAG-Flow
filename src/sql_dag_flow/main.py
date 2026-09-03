from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse, Response
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
import socket
import argparse
import shutil
import subprocess
from . import __version__
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

# Parse cache to avoid re-parsing on concurrent/rapid requests
_parse_cache = {"key": None, "tables": None, "time": 0}
PARSE_CACHE_TTL = 5  # seconds

def _cached_parse(directory, subfolders_tuple, dialect, visible_node_ids=None, target_ids=None):
    """Parse with simple TTL cache. Prevents re-parsing on concurrent requests."""
    target_key = tuple(sorted(target_ids)) if target_ids else None
    cache_key = (directory, subfolders_tuple, dialect, target_key)
    now = time.time()
    if _parse_cache["key"] == cache_key and (now - _parse_cache["time"]) < PARSE_CACHE_TTL:
        return _parse_cache["tables"]

    subfolders_list = list(subfolders_tuple) if subfolders_tuple else None
    tables = parse_sql_files(directory, allowed_subfolders=subfolders_list, dialect=dialect, visible_node_ids=visible_node_ids, target_ids=target_ids)
    _parse_cache["key"] = cache_key
    _parse_cache["tables"] = tables
    _parse_cache["time"] = now
    return tables

def _normalize_expanded(expanded_nodes):
    """Accept the dict form, the legacy list form, or the query-string form."""
    if isinstance(expanded_nodes, dict):
        return expanded_nodes
    if isinstance(expanded_nodes, list):
        return {n: "all" for n in expanded_nodes}
    result = {}
    for item in (expanded_nodes or "").split(","):
        item = item.strip()
        if not item:
            continue
        parts = item.rsplit(":", 1)
        if len(parts) == 2 and parts[1] in ("all", "external", "cte"):
            result[parts[0]] = parts[1]
        else:
            result[item] = "all"
    return result


def _graph_response(dialect="bigquery", discovery=False, expanded_nodes=None,
                    discovery_filter="all", subfolders=None,
                    visible_node_ids=None, target_ids=None):
    """Single implementation behind every graph route.

    The three routes below differ only in how the request arrives (query
    string, subfolder filter, explicit scope) — the parse → build → serialize
    pipeline is identical, so it lives here once.
    """
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "cycles": [], "warnings": [], "error": "Directory not found"}

    try:
        tables = _cached_parse(
            CURRENT_DIRECTORY,
            tuple(subfolders) if subfolders else None,
            dialect,
            visible_node_ids=visible_node_ids,
            target_ids=target_ids,
        )
        nodes, edges, cycles, warnings = build_graph(
            tables,
            discovery_mode=discovery,
            expanded_nodes=_normalize_expanded(expanded_nodes),
            discovery_filter=discovery_filter,
        )
        return {"nodes": nodes, "edges": edges, "cycles": cycles, "warnings": warnings}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"nodes": [], "edges": [], "cycles": [], "warnings": [], "error": f"Backend Error: {str(e)}"}


@app.get("/graph")
def get_graph(dialect: str = "bigquery", discovery: bool = False, expanded_nodes: str = "", visible_node_ids: str = "", discovery_filter: str = "all"):
    """Full-project graph."""
    visible_list = [n.strip() for n in visible_node_ids.split(",")] if visible_node_ids else None
    return _graph_response(
        dialect=dialect, discovery=discovery, expanded_nodes=expanded_nodes,
        discovery_filter=discovery_filter, visible_node_ids=visible_list,
    )

@app.post("/config/path")
def set_path(path_data: dict = Body(...)):
    """Updates the directory to scan."""
    global CURRENT_DIRECTORY
    path = path_data.get("path")
    # Basic validation
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Directory does not exist")
    
    CURRENT_DIRECTORY = path
    _parse_cache["key"] = None  # Invalidate cache on path change
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
    """Graph restricted to a set of subfolders."""
    return _graph_response(
        dialect=data.get("dialect", "bigquery"),
        discovery=data.get("discovery", False),
        expanded_nodes=data.get("expanded_nodes", {}),
        discovery_filter=data.get("discovery_filter", "all"),
        subfolders=data.get("subfolders"),
        visible_node_ids=data.get("visible_node_ids"),
    )

@app.post("/graph/scoped")
def get_scoped_graph(data: dict = Body(...)):
    """Parse + build the graph for ONLY the given node ids (a saved view).

    This is the fast path for reopening/refreshing a curated diagram: files
    outside the scope are never parsed, and newly-added files never appear
    unless the user explicitly adds them (see /scan/new). Any dependency that
    points outside the scope simply stays unresolved rather than flooding the
    canvas.
    """
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"nodes": [], "edges": [], "cycles": [], "error": "Directory not found"}

    node_ids = data.get("node_ids") or []
    if not node_ids:
        return {"nodes": [], "edges": [], "cycles": [], "warnings": []}

    return _graph_response(
        dialect=data.get("dialect", "bigquery"),
        discovery=data.get("discovery", False),
        expanded_nodes=data.get("expanded_nodes", {}),
        discovery_filter=data.get("discovery_filter", "all"),
        visible_node_ids=node_ids,
        target_ids=node_ids,
    )


@app.post("/scan/new")
def scan_new_files(data: dict = Body(...)):
    """List .sql models present on disk but not in the caller's known set.

    Pure filesystem walk — no SQL parsing — so it stays instant even on huge
    projects. Lets the UI say "5 new models found. Add?" instead of silently
    re-indexing everything on refresh.
    """
    if not os.path.exists(CURRENT_DIRECTORY):
        return {"new": []}

    known = set(data.get("known_ids") or [])
    new_models = []
    seen = set()
    for root, dirs, files in os.walk(CURRENT_DIRECTORY):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if not f.endswith(".sql"):
                continue
            node_id = os.path.splitext(f)[0]
            if node_id in known or node_id in seen:
                continue
            seen.add(node_id)
            rel = os.path.relpath(os.path.join(root, f), CURRENT_DIRECTORY).replace(os.sep, '/')
            new_models.append({"id": node_id, "path": rel})
    new_models.sort(key=lambda m: m["path"])
    return {"new": new_models}


def _run_git(args, timeout=10):
    """Run a git command inside CURRENT_DIRECTORY, return stdout or None on failure."""
    try:
        r = subprocess.run(
            ["git", "-C", CURRENT_DIRECTORY] + args,
            capture_output=True, text=True, timeout=timeout,
        )
        if r.returncode != 0:
            return None
        return r.stdout
    except Exception:
        return None


@app.get("/git/changes")
def git_changes(base: str = ""):
    """Return the .sql models changed in the current git working tree.

    Maps changed files to node ids (filename base) so the UI can highlight the
    edited models and their downstream blast radius — the core "what does this
    PR affect?" view. If `base` (a branch/ref) is given, also includes files
    that differ from that ref (committed changes on the current branch).
    Degrades gracefully to {is_git:false} outside a repo.
    """
    inside = _run_git(["rev-parse", "--is-inside-work-tree"])
    if inside is None or inside.strip() != "true":
        return {"is_git": False, "changed": [], "base": base}

    files = set()

    # 1. Uncommitted + staged + untracked changes
    porcelain = _run_git(["status", "--porcelain", "--untracked-files=all"]) or ""
    for line in porcelain.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip()
        # Renames show as "old -> new"; keep the new path.
        if " -> " in path:
            path = path.split(" -> ")[-1]
        path = path.strip().strip('"')
        files.add(path)

    # 2. Committed diff vs a base ref (e.g. main) — the PR view
    if base:
        diff = _run_git(["diff", "--name-only", f"{base}...HEAD"])
        if diff is None:
            # Fall back to a two-dot diff if the merge-base form fails
            diff = _run_git(["diff", "--name-only", base]) or ""
        for line in diff.splitlines():
            files.add(line.strip())

    changed_ids = sorted({
        os.path.splitext(os.path.basename(f))[0]
        for f in files if f.endswith(".sql")
    })
    return {"is_git": True, "changed": changed_ids, "base": base}


@app.get("/git/branches")
def git_branches():
    """List local branch names (for the base-branch picker). Empty outside a repo."""
    out = _run_git(["branch", "--format=%(refname:short)"])
    if out is None:
        return {"is_git": False, "branches": []}
    branches = [b.strip() for b in out.splitlines() if b.strip()]
    return {"is_git": True, "branches": branches}


@app.get("/version")
def get_version():
    """Version of the installed package, so the UI can show which build is running."""
    return {"version": __version__}


@app.get("/config/path")
def get_path():
    return {"path": CURRENT_DIRECTORY}

@app.post("/export")
def export_data_dictionary(data: dict = Body(...)):
    """Generates a Markdown data dictionary report for visible nodes only."""
    dialect = data.get("dialect", "bigquery")
    visible_node_ids = data.get("visible_node_ids", None)  # None = export all

    if not os.path.exists(CURRENT_DIRECTORY):
        raise HTTPException(status_code=400, detail="Directory not found")

    # Scope the parse to the visible nodes so we don't run the expensive
    # qualify_columns + column-lineage passes over the whole project just to
    # throw most of it away. target_ids skips non-visible files entirely.
    tables = parse_sql_files(
        CURRENT_DIRECTORY,
        dialect=dialect,
        visible_node_ids=visible_node_ids,
        target_ids=visible_node_ids,
    )
    nodes, edges, cycles, _warnings = build_graph(tables, discovery_mode=False)
    
    # Filter to only visible nodes if list provided
    if visible_node_ids is not None:
        visible_set = set(visible_node_ids)
        nodes = [n for n in nodes if n['id'] in visible_set]
        edges = [e for e in edges if e['source'] in visible_set and e['target'] in visible_set]
    
    lines = []
    lines.append(f"# Data Dictionary")
    lines.append(f"")
    lines.append(f"**Project Path:** `{CURRENT_DIRECTORY}`  ")
    lines.append(f"**Total Models:** {len(nodes)}  ")
    lines.append(f"**Total Dependencies:** {len(edges)}  ")
    lines.append(f"")
    
    if cycles:
        lines.append(f"## ⚠️ Circular Dependencies ({len(cycles)})")
        lines.append(f"")
        for i, cycle in enumerate(cycles, 1):
            cycle_str = " → ".join([n['label'] for n in cycle])
            lines.append(f"{i}. {cycle_str} → {cycle[0]['label']}")
        lines.append(f"")
    
    # Group by layer
    layer_order = ['bronze', 'silver', 'gold', 'external', 'cte', 'other']
    node_by_layer = {}
    for n in nodes:
        layer = n['data'].get('layer', 'other')
        if layer not in node_by_layer:
            node_by_layer[layer] = []
        node_by_layer[layer].append(n)
    
    for layer in layer_order:
        layer_nodes = node_by_layer.get(layer, [])
        if not layer_nodes:
            continue
        lines.append(f"## {layer.capitalize()} Layer ({len(layer_nodes)} models)")
        lines.append(f"")
        
        for n in sorted(layer_nodes, key=lambda x: x['data']['label']):
            d = n['data'].get('details', {})
            label = n['data']['label']
            lines.append(f"### {label}")
            lines.append(f"")
            
            # Metadata table
            lines.append(f"| Property | Value |")
            lines.append(f"|----------|-------|")
            lines.append(f"| **Project** | {d.get('project', '-')} |")
            lines.append(f"| **Dataset** | {d.get('dataset', '-')} |")
            lines.append(f"| **Type** | {d.get('type', 'table')} |")
            lines.append(f"| **Layer** | {layer} |")
            
            complexity = d.get('complexity', {})
            if complexity:
                lines.append(f"| **Complexity** | {complexity.get('score', 0)} |")
            
            header_meta = d.get('header_meta', {})
            if header_meta.get('description'):
                lines.append(f"| **Description** | {header_meta['description']} |")
            if header_meta.get('author'):
                lines.append(f"| **Author** | {header_meta['author']} |")
            
            incoming = n['data'].get('incomingCount', 0)
            downstream = n['data'].get('downstreamCount', 0)
            lines.append(f"| **Dependencies** | {incoming} incoming, {downstream} downstream |")
            lines.append(f"")
            
            # Dependencies
            deps = d.get('dependencies', {})
            if deps:
                lines.append(f"**Dependencies:** {', '.join(f'`{k}` ({v})' for k, v in deps.items()) if isinstance(deps, dict) else ', '.join(f'`{x}`' for x in deps)}")
                lines.append(f"")
            
            # Business Rules
            br = d.get('business_rules', {})
            rules_items = []
            for cat, items in br.items():
                if items:
                    rules_items.extend([f"- **{cat}**: `{r}`" for r in items[:3]])
            if rules_items:
                lines.append(f"**Business Rules:**")
                lines.append(f"")
                lines.extend(rules_items[:6])
                lines.append(f"")
            
            # Schema columns
            schema = d.get('schema', [])
            if schema:
                lines.append(f"**Schema ({len(schema)} columns):**")
                lines.append(f"")
                lines.append(f"| Column | Type |")
                lines.append(f"|--------|------|")
                for col in schema:
                    lines.append(f"| `{col.get('name', '?')}` | {col.get('type', 'UNKNOWN')} |")
                lines.append(f"")
            
            # Column consumers
            col_consumers = d.get('column_consumers', {})
            if col_consumers:
                lines.append(f"**Column Usage (downstream):**")
                lines.append(f"")
                lines.append(f"| Column | Consumers |")
                lines.append(f"|--------|-----------|")
                for col, consumers in sorted(col_consumers.items()):
                    consumer_labels = ', '.join([c['label'] for c in consumers])
                    lines.append(f"| `{col}` | {consumer_labels} |")
                lines.append(f"")
            
            # Column lineage
            col_lineage = d.get('column_lineage', {})
            if col_lineage:
                lines.append(f"**Column Lineage:**")
                lines.append(f"")
                lines.append(f"| Output Column | Source | Transform |")
                lines.append(f"|---------------|--------|-----------|")
                for col, sources in sorted(col_lineage.items()):
                    for src in sources:
                        src_ref = f"{src.get('source_table', '')}.{src.get('source_column', '')}" if src.get('source_table') else src.get('source_column', '')
                        transform = src.get('transform', '') or '—'
                        lines.append(f"| `{col}` | `{src_ref}` | {transform} |")
                lines.append(f"")
            
            # Syntax warnings
            syntax_warnings = d.get('syntax_warnings', [])
            if syntax_warnings:
                lines.append(f"**⚠️ Syntax Issues ({len(syntax_warnings)}):**")
                lines.append(f"")
                for w in syntax_warnings:
                    loc = f"Line {w.get('line', '?')}, Col {w.get('col', '?')}" if w.get('line') else ""
                    lines.append(f"- {w.get('description', 'Unknown error')} {f'({loc})' if loc else ''}")
                lines.append(f"")
            
            lines.append(f"---")
            lines.append(f"")
    
    md_content = "\n".join(lines)
    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=data_dictionary.md"}
    )

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

class MoveFileRequest(BaseModel):
    current_path: str
    target_layer: str

@app.post("/files/move")
def move_file(request: MoveFileRequest):
    try:
        target_layer = request.target_layer.strip()
        if ".." in request.current_path:
             raise HTTPException(status_code=400, detail="Invalid path")
             
        current_path = os.path.join(CURRENT_DIRECTORY, request.current_path)
        if not os.path.exists(current_path):
             raise HTTPException(status_code=404, detail="Original file not found")
             
        filename = os.path.basename(current_path)
        dir_name = os.path.dirname(current_path)
        
        parent_dir_name = os.path.basename(dir_name).lower()
        if parent_dir_name in ["bronze", "bronce", "silver", "gold", "other"]:
            new_dir = os.path.dirname(dir_name)
            new_dir = os.path.join(new_dir, target_layer)
        else:
            new_dir = os.path.join(dir_name, target_layer)
            
        new_full_path = os.path.join(new_dir, filename)
        
        if new_full_path == current_path:
             return {"message": "File already in target layer", "path": request.current_path}
             
        if os.path.exists(new_full_path):
             raise HTTPException(status_code=400, detail="A file with this name already exists in the target layer folder")
             
        os.makedirs(new_dir, exist_ok=True)
        shutil.move(current_path, new_full_path)
        
        # Normalize response relative path 
        rel_new_path = os.path.relpath(new_full_path, CURRENT_DIRECTORY).replace(os.sep, '/')
        return {"message": f"File moved to {target_layer}", "path": rel_new_path}

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

# ===== Standalone app window =====
# Chromium browsers accept --app=<url>, which opens a window with no tabs and no
# address bar that gets its own taskbar entry. That turns the tool into
# something that reads as an application rather than "a page in my browser",
# without adding a single dependency or a packaging step.

def _chromium_candidates():
    """Likely Chromium-family executables for this platform, best first."""
    if sys.platform == "win32":
        roots = [
            os.environ.get("PROGRAMFILES", ""),
            os.environ.get("PROGRAMFILES(X86)", ""),
            os.environ.get("LOCALAPPDATA", ""),
        ]
        relative = [
            ("Google", "Chrome", "Application", "chrome.exe"),
            ("Microsoft", "Edge", "Application", "msedge.exe"),
            ("BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        ]
        return [os.path.join(root, *parts)
                for root in roots if root
                for parts in relative]

    if sys.platform == "darwin":
        return [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]

    return [
        shutil.which(name) for name in
        ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
         "microsoft-edge", "brave-browser")
    ]


def _find_app_browser():
    """First Chromium-family browser actually present, or None."""
    for candidate in _chromium_candidates():
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def _open_app_window(url):
    """Open `url` as a standalone window. Returns False if that isn't possible."""
    browser = _find_app_browser()
    if not browser:
        return False
    try:
        subprocess.Popen(
            [browser, "--app=" + url, "--window-size=1500,950"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def _is_port_available(port):
    """Check if a port is available by attempting to bind to it."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False

def _find_available_port(start_port, max_attempts=10):
    """Find an available port starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        if _is_port_available(port):
            return port
    return None

def start():
    """Entry point for the CLI tool."""
    global CURRENT_DIRECTORY
    
    # CLI Argument Parsing with argparse
    parser = argparse.ArgumentParser(
        prog='sql-dag-flow',
        description=f'SQL DAG Flow {__version__} - Medallion Architecture Visualizer'
    )
    parser.add_argument('path', nargs='?', default=None, help='Path to SQL project folder')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to run the server on (default: 8000)')
    parser.add_argument('--version', '-V', action='version', version=f'sql-dag-flow {__version__}')
    parser.add_argument('--tab', action='store_true',
                        help='Open in a normal browser tab instead of a standalone app window')
    
    # Use parse_known_args to be tolerant of unexpected args
    args, unknown = parser.parse_known_args()
    
    if args.path:
        # Normalize the path (handles backslashes on Windows, trailing separators, etc.)
        normalized_path = os.path.normpath(os.path.abspath(args.path))
        if os.path.exists(normalized_path) and os.path.isdir(normalized_path):
            CURRENT_DIRECTORY = normalized_path
            print(f"Setting project path from CLI: {CURRENT_DIRECTORY}")
        else:
            print(f"Warning: Path '{args.path}' does not exist or is not a directory. Using current directory.")
            CURRENT_DIRECTORY = os.getcwd()
    else:
        CURRENT_DIRECTORY = os.getcwd()
        print(f"Using current directory: {CURRENT_DIRECTORY}")

    # Find an available port
    requested_port = args.port
    port = _find_available_port(requested_port)
    
    if port is None:
        print(f"Error: Could not find an available port (tried {requested_port}-{requested_port + 9}).")
        sys.exit(1)
    
    if port != requested_port:
        print(f"Port {requested_port} is in use. Using port {port} instead.")
    else:
        print(f"Starting server on port {port}")
    if not args.tab and _find_app_browser():
        print("Opening in a standalone app window (use --tab for a browser tab)")

    def open_browser():
        time.sleep(1.5)
        url = f"http://localhost:{port}"
        # Prefer a standalone app window; fall back to a normal browser tab when
        # no Chromium-family browser is installed or the user asked for one.
        if args.tab or not _open_app_window(url):
            webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run uvicorn programmatically
    uvicorn.run(app, host="127.0.0.1", port=port)

if __name__ == "__main__":
    start()
