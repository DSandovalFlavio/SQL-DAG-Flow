import os
import sqlglot
from sqlglot import exp
import networkx as nx

import os
import sqlglot
from sqlglot import exp
import networkx as nx
import re

def parse_sql_files(directory, allowed_subfolders=None, dialect="bigquery"):
    """
    Recursively scans a directory for .sql files and parses them.
    Returns a dictionary mapping table names to their dependencies and metadata.
    """
    tables = {}
    
    for root, dirs, files in os.walk(directory):
        # Filter subfolders if allowed_subfolders is specified
        if allowed_subfolders is not None:
             # allowed_subfolders contains relative paths like "sub1", "sub1/nested"
             # We must prune 'dirs' so we only traverse relevant paths.
             
             rel_root = os.path.relpath(root, directory).replace(os.sep, '/')
             if rel_root == ".": rel_root = ""
             
             allowed_dirs = []
             for d in dirs:
                 rel_d = f"{rel_root}/{d}" if rel_root else d
                 # Keep 'd' if:
                 # 1. rel_d is exactly one of the allowed paths
                 # 2. rel_d is a parent of an allowed path (e.g. 'sub1' parent of 'sub1/nested')
                 # 3. rel_d is inside an allowed path (e.g. 'sub1/nested' inside 'sub1' which is allowed)
                 
                 is_allowed = False
                 for allowed in allowed_subfolders:
                     if rel_d == allowed:
                         is_allowed = True
                         break
                     if allowed.startswith(rel_d + '/'): # rel_d is parent
                         is_allowed = True
                         break
                     if rel_d.startswith(allowed + '/'): # rel_d is child
                         is_allowed = True
                         break
                 
                 if is_allowed:
                     allowed_dirs.append(d)
             
             dirs[:] = allowed_dirs

        # Check if the current directory is valid for file parsing
        # We only parse files if we are IN a selected folder or a SUBFOLDER of a selected folder.
        # We do NOT parse files if we are just traversing a PARENT folder to get to a selected one.
        should_parse_files = True
        if allowed_subfolders is not None:
            should_parse_files = False
            rel_root_check = os.path.relpath(root, directory).replace(os.sep, '/')
            if rel_root_check == ".": rel_root_check = ""
            
            # 1. Decide if we should parse files in THIS folder
            if rel_root_check in allowed_subfolders:
                should_parse_files = True
            
            # 2. Prune 'dirs' to only traverse towards allowed folders
            allowed_dirs = []
            for d in dirs:
                rel_d = f"{rel_root_check}/{d}" if rel_root_check else d
                
                # Keep 'd' if:
                # A. It is explicitly in the allowed list (so we can go there and parse)
                # B. It is an ANCESTOR of something in the allowed list (so we can reach the allowed child)
                
                is_traversal_allowed = False
                if rel_d in allowed_subfolders:
                    is_traversal_allowed = True
                else:
                    # Check if it's an ancestor
                    for allowed in allowed_subfolders:
                        if allowed.startswith(rel_d + '/'):
                            is_traversal_allowed = True
                            break
                            
                if is_traversal_allowed:
                    allowed_dirs.append(d)
            
            dirs[:] = allowed_dirs
        
        if not should_parse_files:
            continue

        for file in files:
            if file.endswith(".sql"):
                filepath = os.path.join(root, file)
                # Heuristic for table name: filename without extension
                filename_base = os.path.splitext(file)[0]
                
                # Layer detection based on folder structure first, then filename
                lower_path = filepath.lower()
                layer = "other"
                if "bronze" in lower_path or "bronce" in lower_path:
                    layer = "bronze"
                elif "silver" in lower_path:
                    layer = "silver"
                elif "gold" in lower_path:
                    layer = "gold"
                
                with open(filepath, "r", encoding="utf-8") as f:
                    sql_content = f.read()
                
                try:
                    # Parse with BigQuery dialect to support CREATE OR REPLACE TABLE/VIEW
                    parsed = sqlglot.parse_one(sql_content, read=dialect)
                    
                    # Detect Node Type (Table or View)
                    node_type = "table" # default
                    if isinstance(parsed, exp.Create):
                        if parsed.kind == "VIEW":
                            node_type = "view"
                    
                    # Attempt to extract Project and Dataset from the CREATE statement
                    # pattern: project.dataset.table or dataset.table
                    # We look for the creation target
                    target_table_name = filename_base
                    project = "default"
                    dataset = "default"
                    
                    create_node = parsed.find(exp.Create)
                    if create_node and create_node.this:
                        # sqlglot represents the target as an exp.Table or exp.Schema
                        target_exp = create_node.this
                        if isinstance(target_exp, exp.Table):
                            target_table_name = target_exp.name
                            dataset = target_exp.db or "default"
                            project = target_exp.catalog or "default"

                    # Fallback: Extract from filename (project.dataset.table.sql)
                    if project == "default" and dataset == "default":
                        parts = filename_base.split('.')
                        if len(parts) == 3:
                            project, dataset, target_table_name = parts
                        elif len(parts) == 2:
                            dataset, target_table_name = parts
                    
                    # Fallback: Extract from directory structure if straightforward
                    # e.g. /project/dataset/table.sql
                    if project == "default" and dataset == "default":
                         path_parts = os.path.normpath(filepath).split(os.sep)
                         # Simple heuristic: parent dir is dataset, grandparent is project? 
                         # This is risky without strict structure, so maybe just stick to filename for now.
                         # Or just capture parent folder as dataset if it's not the layer name
                         parent_dir = path_parts[-2] if len(path_parts) > 1 else ""
                         if parent_dir.lower() not in ["bronze", "bronce", "silver", "gold", "other"] and dataset == "default":
                             dataset = parent_dir
                    
                    dependencies = set()
                    
                    # 1. Identify CTEs defined in the query to exclude them from dependencies
                    defined_ctes = set()
                    for cte in parsed.find_all(exp.CTE):
                        if cte.alias_or_name:
                            defined_ctes.add(cte.alias_or_name)
                    
                    # Find all tables referenced in the query
                    for table in parsed.find_all(exp.Table):
                        dep_name = table.name
                        # Construct full name if available to match lookup
                        full_name = dep_name
                        if table.db:
                            full_name = f"{table.db}.{dep_name}"
                            if table.catalog:
                                full_name = f"{table.catalog}.{table.db}.{dep_name}"
                        
                        # Avoid self-reference if it matches the target
                        if dep_name == target_table_name:
                            continue
                            
                        # Avoid Internal CTE references
                        if dep_name in defined_ctes:
                            continue
                            
                        # If we haven't found a CREATE statement, this might just be a SELECT
                        # and we treat the filename as the target.
                        
                        dependencies.add(full_name)
                        # REMOVED: partial match addition to prevent double counting in visual metadata
                        # matches are now handled in build_graph via fuzzy lookup
                             
                    tables[filename_base] = { 
                        # Use filename_base as unique ID for the graph to avoid ambiguity
                        # Visual label can be the actual table name
                        "id": filename_base,
                        "label": target_table_name,
                        "layer": layer,
                        "type": node_type,
                        "project": project,
                        "dataset": dataset,
                        "path": filepath,
                        "dependencies": list(dependencies),
                        "content": sql_content 
                    }
                except Exception as e:
                    print(f"Error parsing {filepath}: {e}")
                    tables[filename_base] = {
                        "id": filename_base,
                        "label": filename_base,
                        "layer": layer,
                        "type": "unknown",
                        "project": "n/a",
                        "dataset": "n/a",
                        "path": filepath,
                        "dependencies": [],
                        "error": str(e),
                        "content": sql_content
                    }
    
    return tables


def build_graph(tables, discovery_mode=False):
    """
    Constructs nodes and edges for React Flow.
    If discovery_mode is True, creates 'ghost' nodes for dependencies 
    that are not found in the parsed tables.
    """
    nodes = []
    edges = []
    
    # Create a lookup map: identifier -> node_id
    lookup = {}
    
    for node_id, data in tables.items():
        lookup[node_id] = node_id
        if "label" in data:
            lookup[data["label"]] = node_id
            
        project = data.get("project", "default")
        dataset = data.get("dataset", "default")
        table = data.get("label", "")
        
        if table:
             if dataset != "default":
                 lookup[f"{dataset}.{table}"] = node_id
                 if project != "default":
                     lookup[f"{project}.{dataset}.{table}"] = node_id
    
    # Track incoming edges for accurate dependency counting
    incoming_edges_count = {node_id: 0 for node_id in tables}
    
    # Track missing dependencies if in discovery mode
    missing_nodes = {}

    # Create edges first (conceptually) to count dependencies
    for source_id, data in tables.items():
        for dep in data["dependencies"]:
            target_id = lookup.get(dep)
            
            # Fuzzy lookup: if exact match fails, try splitting by dot and matching last part (table name)
            if not target_id and "." in dep:
                short_name = dep.split(".")[-1]
                target_id = lookup.get(short_name)

            if target_id and target_id != source_id:
                edges.append({
                    "id": f"{target_id}-{source_id}",
                    "source": target_id,
                    "target": source_id,
                    "animated": True,
                    "style": {"stroke": "#b1b1b7"}
                })
                incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1
            else:
                 # Discovery Mode: Handle missing dependencies
                 if discovery_mode and not target_id:
                     # Create a unique ID for the missing node
                     # Use the full dependency name as the ID
                     ghost_id = dep
                     
                     if ghost_id not in missing_nodes:
                         # Attempt to parse project/dataset from the dependency string
                         parts = ghost_id.split('.')
                         ghost_project = "default"
                         ghost_dataset = "default"
                         ghost_table = ghost_id
                         
                         if len(parts) == 3:
                             ghost_project, ghost_dataset, ghost_table = parts
                         elif len(parts) == 2:
                             ghost_dataset, ghost_table = parts
                         
                         missing_nodes[ghost_id] = {
                             "id": ghost_id,
                             "label": ghost_table,
                             "layer": "external", # Special layer for discovered nodes
                             "type": "table",
                             "project": ghost_project,
                             "dataset": ghost_dataset,
                             "path": "discovered",
                             "dependencies": [],
                             "content": "-- Discovered dependency"
                         }
                         
                     # Add edge from ghost node to current node
                     edges.append({
                        "id": f"{ghost_id}-{source_id}",
                        "source": ghost_id,
                        "target": source_id,
                        "animated": True,
                        "style": {"stroke": "#ff9f1c", "strokeDasharray": "5,5"} # Distinct style
                     })
                     
                     # Initialize incoming count for ghost node if not present (it captures its own incoming deps? no, it's a source usually)
                     # But we should track if it has incoming edges? (Unlikely as we don't parse it)
                     incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1


    # Merge missing nodes into the main tables list for node creation
    # We don't add them to 'tables' input to avoid side effects, just iterate for node creation
    all_nodes_data = {**tables, **missing_nodes}
    
    # Recalculate G for all nodes including ghosts
    G = nx.DiGraph()
    for edge in edges:
        G.add_edge(edge["source"], edge["target"])

    for table_name, data in all_nodes_data.items():
        # Calculate nested dependencies (all ancestors in the dependency graph)
        nested_count = 0
        if G.has_node(table_name):
            try:
                # ancestors() returns all nodes u such that there is a path from u to table_name
                nested_count = len(nx.ancestors(G, table_name))
            except Exception:
                pass # distinct graph parts or cycles? cycles shouldn't exist in DAG but safety first

        nodes.append({
            "id": table_name,
            "data": {
                "label": data["label"], 
                "layer": data["layer"],
                "details": data,
                "incomingCount": incoming_edges_count.get(table_name, 0),
                "nestedCount": nested_count
            },
            "position": {"x": 0, "y": 0}, 
            "type": "custom", 
        })

    return nodes, edges
