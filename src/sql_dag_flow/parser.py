import os
import re
import time
import json
import hashlib
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.qualify_columns import qualify_columns as sqlglot_qualify_columns
import networkx as nx


# ===== Persistent File Cache =====
CACHE_DIR = ".sqldagflow"
CACHE_FILENAME = "cache.json"

def _get_cache_path(directory):
    return os.path.join(directory, CACHE_DIR, CACHE_FILENAME)

def _load_cache(directory):
    """Load parse cache from disk. Returns empty dict if not found."""
    cache_path = _get_cache_path(directory)
    try:
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"  Cache load error (will rebuild): {e}")
    return {}

def _save_cache(directory, cache):
    """Save parse cache to disk."""
    cache_path = _get_cache_path(directory)
    cache_dir = os.path.dirname(cache_path)
    try:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cache, f, separators=(',', ':'))
    except Exception as e:
        print(f"  Cache save error: {e}")

def _file_cache_key(filepath):
    """Cache key = filepath mtime + size for fast invalidation."""
    try:
        stat = os.stat(filepath)
        return f"{stat.st_mtime_ns}:{stat.st_size}"
    except Exception:
        return None


def extract_output_columns(parsed, dialect="bigquery"):
    """
    Extract output column schema from a parsed SQL AST.
    Returns a list of {"name": str, "type": str} dicts.
    
    Handles:
    - DDL with explicit column definitions (CREATE TABLE t (col TYPE))
    - CTAS / CREATE VIEW AS SELECT
    - WITH...SELECT (final SELECT after CTEs)
    - Standalone SELECT
    - Window functions, nested functions, CASE expressions
    - SELECT * (returns [{"name": "*", "type": "ALL"}])
    """
    columns = []

    # Case 1: DDL with explicit column definitions
    if isinstance(parsed, exp.Create):
        schema_node = parsed.this
        if isinstance(schema_node, exp.Schema):
            for col_def in schema_node.expressions:
                if isinstance(col_def, exp.ColumnDef):
                    col_name = col_def.name
                    col_type_node = col_def.args.get("kind")
                    type_str = col_type_node.sql(dialect=dialect) if col_type_node else "UNKNOWN"
                    columns.append({"name": col_name, "type": type_str})
            if columns:
                return columns

    # Case 2: Find the final SELECT statement
    # For CTAS, CREATE VIEW AS, WITH...SELECT, standalone SELECT
    # We want the outermost SELECT that isn't inside a CTE or subquery
    select_node = None
    
    if isinstance(parsed, exp.Create):
        # For CTAS / CREATE VIEW AS: get the SELECT inside the CREATE
        inner = parsed.expression
        if inner:
            if isinstance(inner, exp.Select):
                select_node = inner
            elif hasattr(inner, 'find'):
                select_node = inner.find(exp.Select)
    
    if not select_node:
        # For standalone queries: find WITH wrapper or direct SELECT
        # Walk to find the top-level Select (not nested in subquery)
        if isinstance(parsed, exp.Select):
            select_node = parsed
        else:
            # Could be a WITH or UNION — find the first select
            select_node = parsed.find(exp.Select)
    
    if select_node:
        for expr in select_node.expressions:
            try:
                if isinstance(expr, exp.Star):
                    columns.append({"name": "*", "type": "ALL"})
                elif isinstance(expr, exp.Alias):
                    alias_name = expr.alias
                    inner_expr = expr.this
                    type_str = inner_expr.sql(dialect=dialect, pretty=False)
                    # Truncate very long expressions for readability
                    if len(type_str) > 80:
                        type_str = type_str[:77] + "..."
                    columns.append({"name": alias_name, "type": type_str})
                elif isinstance(expr, exp.Column):
                    columns.append({"name": expr.name, "type": "column"})
                else:
                    # Computed expression without alias
                    expr_sql = expr.sql(dialect=dialect, pretty=False)
                    name = expr_sql[:40] + "..." if len(expr_sql) > 40 else expr_sql
                    columns.append({"name": name, "type": "expression"})
            except Exception:
                continue

    return columns

def parse_sql_files(directory, allowed_subfolders=None, dialect="bigquery", visible_node_ids=None, target_ids=None):
    """
    Recursively scans a directory for .sql files and parses them.
    Returns a dictionary mapping table names to their dependencies and metadata.

    Uses persistent mtime-based cache to skip re-parsing unchanged files.
    If visible_node_ids is provided, qualify_columns and column_lineage
    are only computed for visible nodes (performance optimization).
    If target_ids is provided (a set/list of node ids = filename bases), ONLY
    those files are parsed and returned — the walk still runs (cheap) but
    non-scoped files are skipped, so the heavy sqlglot work stays O(scope).
    This is what powers saved "views": reopening one never re-parses the whole
    project nor floods the canvas with newly-added files.
    """
    tables = {}
    cache = _load_cache(directory)
    cache_hits = 0
    cache_misses = 0
    target_set = set(target_ids) if target_ids is not None else None

    for root, dirs, files in os.walk(directory):
        # Skip hidden config folders like .sqldagflow
        dirs[:] = [d for d in dirs if not d.startswith('.')]
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

                # Scoped parse: skip any file not in the requested view.
                if target_set is not None and filename_base not in target_set:
                    continue

                # Layer detection based on folder structure first, then filename
                lower_path = filepath.lower()
                layer = "other"
                if "bronze" in lower_path or "bronce" in lower_path:
                    layer = "bronze"
                elif "silver" in lower_path:
                    layer = "silver"
                elif "gold" in lower_path:
                    layer = "gold"
                
                # ===== Cache check: skip re-parsing if file unchanged =====
                file_key = _file_cache_key(filepath)
                cached_entry = cache.get(filepath)
                if cached_entry and cached_entry.get("cache_key") == file_key and cached_entry.get("dialect") == dialect:
                    # Cache hit — use stored parse result
                    tables[filename_base] = cached_entry["data"]
                    cache_hits += 1
                    continue
                
                cache_misses += 1
                
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
                        # Handle Schema wrapping (DDL with column definitions)
                        # e.g. CREATE TABLE project.dataset.table (id INT64, name STRING)
                        if isinstance(target_exp, exp.Schema):
                            target_exp = target_exp.this
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
                    
                    dependencies = {}  # dep_name -> dep_type
                    
                    # 1. Identify CTEs defined in the query and their internal dependencies
                    defined_ctes = {}
                    cte_deps = {}  # cte_name -> {full_dep_name: dep_type}
                    
                    for cte in parsed.find_all(exp.CTE):
                        cte_name = cte.alias_or_name
                        if not cte_name:
                            continue
                        defined_ctes[cte_name] = cte.sql(dialect=dialect, pretty=True)
                        
                        # Extract tables referenced INSIDE this CTE definition
                        cte_internal_deps = {}
                        cte_join_tables = set()
                        for j in cte.find_all(exp.Join):
                            jt = j.find(exp.Table)
                            if jt:
                                cte_join_tables.add(jt.name)
                        
                        for t in cte.find_all(exp.Table):
                            t_name = t.name
                            # Skip self-references and references to other CTEs in the same query
                            if t_name == target_table_name or t_name in defined_ctes:
                                continue
                            t_full = t_name
                            if t.db:
                                t_full = f"{t.db}.{t_name}"
                                if t.catalog:
                                    t_full = f"{t.catalog}.{t.db}.{t_name}"
                            cte_internal_deps[t_full] = "JOIN" if t_name in cte_join_tables else "FROM"
                        
                        cte_deps[cte_name] = cte_internal_deps
                    
                    # Collect all table names that appear inside CTE definitions
                    # These should NOT be direct dependencies of the parent model
                    tables_inside_ctes = set()
                    for cte_name, ct in cte_deps.items():
                        for dep_key in ct:
                            tables_inside_ctes.add(dep_key.split(".")[-1])
                    
                    # Detect JOIN tables for labeling (only at the top-level query, not inside CTEs)
                    join_tables = set()
                    for join_node in parsed.find_all(exp.Join):
                        # Check this join is not inside a CTE
                        parent_cte = join_node.find_ancestor(exp.CTE)
                        if parent_cte is None:
                            join_table = join_node.find(exp.Table)
                            if join_table:
                                join_tables.add(join_table.name)
                    
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
                            
                        # Internal CTE references (main query references a CTE)
                        if dep_name in defined_ctes:
                            dependencies[f"cte:{filename_base}:{dep_name}"] = "CTE"
                            continue
                        
                        # Skip tables that belong inside a CTE definition
                        # These will be wired as CTE_node deps in build_graph
                        if dep_name in tables_inside_ctes:
                            continue

                        # Regular external dependency at the main query level
                        dep_type = "JOIN" if dep_name in join_tables else "FROM"
                        dependencies[full_name] = dep_type
                    
                    # ===== Business Rule Extraction =====
                    business_rules = {
                        "filters": [],       # WHERE conditions
                        "case_logic": [],    # CASE statements
                        "having": [],        # HAVING conditions
                        "aggregations": [],  # Aggregate functions
                    }
                    
                    # Extract WHERE clauses
                    for where_node in parsed.find_all(exp.Where):
                        try:
                            where_sql = where_node.this.sql(dialect=dialect, pretty=False)
                            business_rules["filters"].append(where_sql)
                        except Exception:
                            pass
                    
                    # Extract CASE statements
                    for case_node in parsed.find_all(exp.Case):
                        try:
                            case_sql = case_node.sql(dialect=dialect, pretty=False)
                            # Try to get the alias if available
                            parent = case_node.parent
                            alias = ""
                            if hasattr(parent, 'alias') and parent.alias:
                                alias = parent.alias
                            label = f"{alias}: {case_sql}" if alias else case_sql
                            business_rules["case_logic"].append(label)
                        except Exception:
                            pass
                    
                    # Extract HAVING clauses
                    for having_node in parsed.find_all(exp.Having):
                        try:
                            having_sql = having_node.this.sql(dialect=dialect, pretty=False)
                            business_rules["having"].append(having_sql)
                        except Exception:
                            pass
                    
                    # Extract aggregate functions
                    agg_types = (exp.Count, exp.Sum, exp.Avg, exp.Min, exp.Max)
                    for agg_node in parsed.find_all(*agg_types):
                        try:
                            agg_sql = agg_node.sql(dialect=dialect, pretty=False)
                            parent = agg_node.parent
                            alias = ""
                            if hasattr(parent, 'alias') and parent.alias:
                                alias = parent.alias
                            label = f"{alias}: {agg_sql}" if alias else agg_sql
                            business_rules["aggregations"].append(label)
                        except Exception:
                            pass
                    
                    # ===== Complexity Score =====
                    # Weights: JOIN=3, CTE=2, Subquery=3, WHERE=1, CASE=2, Aggregation=1, UNION=2
                    complexity_breakdown = {
                        "joins": len(list(parsed.find_all(exp.Join))),
                        "ctes": len(defined_ctes),
                        "subqueries": len(list(parsed.find_all(exp.Subquery))),
                        "filters": len(business_rules["filters"]),
                        "case_statements": len(business_rules["case_logic"]),
                        "aggregations": len(business_rules["aggregations"]),
                        "unions": len(list(parsed.find_all(exp.Union))),
                    }
                    
                    complexity_score = (
                        complexity_breakdown["joins"] * 3 +
                        complexity_breakdown["ctes"] * 2 +
                        complexity_breakdown["subqueries"] * 3 +
                        complexity_breakdown["filters"] * 1 +
                        complexity_breakdown["case_statements"] * 2 +
                        complexity_breakdown["aggregations"] * 1 +
                        complexity_breakdown["unions"] * 2
                    )
                    
                    complexity_breakdown["score"] = complexity_score
                    
                    # ===== Column Reference Extraction =====
                    # Extract which columns this model references from each source table
                    # This enables downstream impact analysis
                    column_references = {}  # source_table -> [columns]
                    
                    # Build alias -> table name mapping for the query
                    alias_map = {}  # alias -> full_table_name
                    for t in parsed.find_all(exp.Table):
                        t_name = t.name
                        t_full = t_name
                        if t.db:
                            t_full = f"{t.db}.{t_name}"
                            if t.catalog:
                                t_full = f"{t.catalog}.{t.db}.{t_name}"
                        if t.alias:
                            alias_map[t.alias] = t_full
                        alias_map[t_name] = t_full
                    
                    # Extract column references with their table qualifier
                    # Also capture unqualified columns and assign them to source tables
                    unqualified_columns = set()
                    
                    for col in parsed.find_all(exp.Column):
                        col_name = col.name
                        col_table = col.table  # The table qualifier (alias or name)
                        if col_table and col_table in alias_map:
                            source = alias_map[col_table]
                            if source not in column_references:
                                column_references[source] = set()
                            column_references[source].add(col_name)
                        elif not col_table:
                            # Unqualified column — track separately
                            unqualified_columns.add(col_name)
                    
                    # Assign unqualified columns to source tables
                    # Filter out CTEs and the target table itself (both short and full name)
                    source_tables = [
                        v for k, v in alias_map.items() 
                        if v != target_table_name 
                        and v.split('.')[-1] != target_table_name
                        and v not in defined_ctes
                        and v.split('.')[-1] not in defined_ctes
                    ]
                    # Deduplicate (aliases may point to same table)
                    source_tables = list(set(source_tables))
                    
                    if unqualified_columns and source_tables:
                        if len(source_tables) == 1:
                            # Single source: assign all unqualified columns to it
                            src = source_tables[0]
                            if src not in column_references:
                                column_references[src] = set()
                            column_references[src].update(unqualified_columns)
                        else:
                            # Multiple sources: assign to ALL sources (best effort)
                            # The UI will show them as "used" which is better than missing
                            for src in source_tables:
                                if src not in column_references:
                                    column_references[src] = set()
                                column_references[src].update(unqualified_columns)
                    
                    # Convert sets to sorted lists for JSON serialization
                    column_references = {k: sorted(list(v)) for k, v in column_references.items()}
                    
                    # ===== Header Comment Extraction =====
                    # Extract metadata from SQL header comments:
                    #   -- @description: ...
                    #   -- @author: ...
                    #   -- @modified: ...
                    #   -- Description: ... (first block comment)
                    header_meta = {}
                    header_lines = []
                    for line in sql_content.split('\n'):
                        stripped = line.strip()
                        if stripped.startswith('--'):
                            header_lines.append(stripped[2:].strip())
                        elif stripped == '' and not header_lines:
                            continue  # skip leading blank lines
                        else:
                            break  # stop at first non-comment line
                    
                    for hline in header_lines:
                        # Match @key: value patterns
                        meta_match = re.match(r'^@(\w+)[:\s]+(.+)$', hline, re.IGNORECASE)
                        if meta_match:
                            key = meta_match.group(1).lower()
                            header_meta[key] = meta_match.group(2).strip()
                    
                    # If no @description, use first non-@ comment lines as description
                    if 'description' not in header_meta:
                        desc_lines = [l for l in header_lines if not l.startswith('@') and l.strip()]
                        if desc_lines:
                            header_meta['description'] = ' '.join(desc_lines[:3])
                    # ===== File Modification Timestamp =====
                    try:
                        mtime = os.path.getmtime(filepath)
                        days_ago = int((time.time() - mtime) / 86400)
                    except Exception:
                        mtime = None
                        days_ago = None
                             
                    tables[filename_base] = { 
                        "id": filename_base,
                        "label": target_table_name,
                        "layer": layer,
                        "type": node_type,
                        "project": project,
                        "dataset": dataset,
                        "path": filepath,
                        "dependencies": dependencies,
                        "content": sql_content,
                        "ctes": defined_ctes,
                        "cte_deps": cte_deps,
                        "schema": extract_output_columns(parsed, dialect),
                        "business_rules": business_rules,
                        "complexity": complexity_breakdown,
                        "column_references": column_references,
                        "header_meta": header_meta,
                        "last_modified_days": days_ago
                    }
                except sqlglot.errors.ParseError as pe:
                    # Feature 4: Capture structured syntax errors
                    syntax_warnings = []
                    for err in pe.errors:
                        syntax_warnings.append({
                            "description": err.get("description", str(pe)),
                            "line": err.get("line"),
                            "col": err.get("col"),
                            "highlight": err.get("highlight", "")
                        })
                    print(f"Syntax error in {filepath}: {pe}")
                    tables[filename_base] = {
                        "id": filename_base,
                        "label": filename_base,
                        "layer": layer,
                        "type": "unknown",
                        "project": "n/a",
                        "dataset": "n/a",
                        "path": filepath,
                        "dependencies": {},
                        "error": str(pe),
                        "syntax_warnings": syntax_warnings,
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
                        "dependencies": {},
                        "error": str(e),
                        "content": sql_content
                    }
                
                # ===== Save to cache after parsing (success or error) =====
                if filename_base in tables:
                    file_key = _file_cache_key(filepath)
                    if file_key:
                        # Store a cache-safe copy (no sets, convert to lists)
                        cache_data = {}
                        for k, v in tables[filename_base].items():
                            if isinstance(v, set):
                                cache_data[k] = list(v)
                            elif isinstance(v, dict):
                                cache_data[k] = {
                                    dk: list(dv) if isinstance(dv, set) else dv 
                                    for dk, dv in v.items()
                                }
                            else:
                                cache_data[k] = v
                        cache[filepath] = {
                            "cache_key": file_key,
                            "dialect": dialect,
                            "data": cache_data
                        }

    # ===== Cache stats & persist =====
    total_files = cache_hits + cache_misses
    if total_files > 0:
        print(f"  Parse cache: {cache_hits}/{total_files} hits ({cache_misses} re-parsed)")
    _save_cache(directory, cache)
    
    # ===== Second Pass: Qualify Columns & Column Lineage =====
    # Build a global schema dict for qualify_columns and lineage
    # (schema building is always done for ALL tables — it's fast)
    global_schema = {}  # {dataset: {table: {col: type}}}
    for tid, tdata in tables.items():
        schema_cols = tdata.get("schema", [])
        if not schema_cols:
            continue
        ds = tdata.get("dataset", "default")
        label = tdata.get("label", tid)
        if ds not in global_schema:
            global_schema[ds] = {}
        col_dict = {}
        for c in schema_cols:
            col_dict[c["name"]] = c.get("type", "UNKNOWN")
        global_schema[ds][label] = col_dict
        # Also add without dataset prefix for simpler lookups
        if "default" not in global_schema:
            global_schema["default"] = {}
        global_schema["default"][label] = col_dict
    
    # Re-extract column_references using qualify_columns for precision
    # Protected with per-table time budget to prevent hanging on large projects
    # If visible_node_ids provided, only qualify visible nodes (performance)
    qualify_tables = [(tid, tdata) for tid, tdata in tables.items() 
                      if not tdata.get("error") and tdata.get("content")]
    if visible_node_ids is not None:
        visible_set = set(visible_node_ids)
        qualify_tables = [(tid, tdata) for tid, tdata in qualify_tables if tid in visible_set]
        print(f"  Selective qualify: {len(qualify_tables)} visible of {len(tables)} total")
    total_qualify = len(qualify_tables)
    
    for idx, (tid, tdata) in enumerate(qualify_tables):
        table_start = time.time()
        if idx % 10 == 0 and total_qualify > 10:
            print(f"  Qualifying columns: {idx}/{total_qualify} tables...")
        try:
            parsed = sqlglot.parse_one(tdata["content"], read=dialect)
            
            # Try to qualify columns using the global schema (with 2s budget)
            try:
                qualified_ast = sqlglot_qualify_columns(parsed.copy(), schema=global_schema, dialect=dialect)
            except Exception:
                qualified_ast = parsed  # Fallback to unqualified
            
            # Check time budget
            if time.time() - table_start > 2.0:
                continue  # Skip extraction if qualification took too long
            
            # Re-extract column references from qualified AST
            alias_map = {}
            defined_ctes = set()
            for cte in qualified_ast.find_all(exp.CTE):
                cn = cte.alias_or_name
                if cn:
                    defined_ctes.add(cn)
            
            for t in qualified_ast.find_all(exp.Table):
                t_name = t.name
                t_full = t_name
                if t.db:
                    t_full = f"{t.db}.{t_name}"
                    if t.catalog:
                        t_full = f"{t.catalog}.{t.db}.{t_name}"
                if t.alias:
                    alias_map[t.alias] = t_full
                alias_map[t_name] = t_full
            
            column_references = {}
            target_name = tdata.get("label", tid)
            unqualified_columns = set()
            
            for col in qualified_ast.find_all(exp.Column):
                col_name = col.name
                col_table = col.table
                if col_table and col_table in alias_map:
                    source = alias_map[col_table]
                    if source not in column_references:
                        column_references[source] = set()
                    column_references[source].add(col_name)
                elif not col_table:
                    unqualified_columns.add(col_name)
            
            # Fallback for any remaining unqualified columns
            if unqualified_columns:
                source_tables = [
                    v for k, v in alias_map.items()
                    if v != target_name
                    and v.split('.')[-1] != target_name
                    and v not in defined_ctes
                    and v.split('.')[-1] not in defined_ctes
                ]
                source_tables = list(set(source_tables))
                if source_tables:
                    for src in source_tables:
                        if src not in column_references:
                            column_references[src] = set()
                        column_references[src].update(unqualified_columns)
            
            column_references = {k: sorted(list(v)) for k, v in column_references.items()}
            tdata["column_references"] = column_references
            
        except Exception:
            pass  # Keep original column_references
    
    if total_qualify > 10:
        print(f"  Qualifying columns: {total_qualify}/{total_qualify} done.")
    
    # ===== Column-Level Lineage =====
    # For each table, trace how each output column derives from source columns
    # Protected: skip if project is very large (>100 tables) and cap columns per table
    # If visible_node_ids provided, only compute lineage for visible nodes
    MAX_LINEAGE_TABLES = 500
    MAX_COLS_PER_TABLE = 30
    LINEAGE_TIME_BUDGET = 1.5  # seconds per table
    
    lineage_tables = [(tid, tdata) for tid, tdata in tables.items()
                      if not tdata.get("error") and tdata.get("content") and tdata.get("schema")]
    if visible_node_ids is not None:
        visible_set = set(visible_node_ids)
        lineage_tables = [(tid, tdata) for tid, tdata in lineage_tables if tid in visible_set]
        print(f"  Selective lineage: {len(lineage_tables)} visible of {len(tables)} total")
    total_lineage = len(lineage_tables)
    
    if total_lineage > MAX_LINEAGE_TABLES:
        print(f"  Skipping column lineage: {total_lineage} tables exceeds limit of {MAX_LINEAGE_TABLES}")
    else:
        for idx, (tid, tdata) in enumerate(lineage_tables):
            table_start = time.time()
            if idx % 10 == 0 and total_lineage > 10:
                print(f"  Column lineage: {idx}/{total_lineage} tables...")
            
            schema_cols = tdata.get("schema", [])
            if not schema_cols:
                continue
            
            column_lineage = {}  # col_name -> [{source_table, source_column, transform}]
            sql_content = tdata["content"]
            
            cols_processed = 0
            for col_info in schema_cols:
                # Check time budget
                if time.time() - table_start > LINEAGE_TIME_BUDGET:
                    break
                if cols_processed >= MAX_COLS_PER_TABLE:
                    break
                    
                col_name = col_info["name"]
                if col_name == "*":
                    continue
                cols_processed += 1
                try:
                    from sqlglot.lineage import lineage as sqlglot_lineage
                    node = sqlglot_lineage(
                        col_name, sql_content,
                        schema=global_schema,
                        dialect=dialect
                    )
                    sources = []
                    for child in node.downstream:
                        source_col = child.name
                        # Extract the source table from the expression
                        source_table = ""
                        if child.source and isinstance(child.source, exp.Table):
                            source_table = child.source.name
                            if child.source.db:
                                source_table = f"{child.source.db}.{child.source.name}"
                        
                        transform = ""
                        if child.expression and str(child.expression) != source_col:
                            transform = str(child.expression)
                        
                        sources.append({
                            "source_table": source_table,
                            "source_column": source_col,
                            "transform": transform
                        })
                    if sources:
                        column_lineage[col_name] = sources
                except Exception:
                    pass  # Lineage not available for this column
            
            if column_lineage:
                tdata["column_lineage"] = column_lineage
        
        if total_lineage > 10:
            print(f"  Column lineage: {total_lineage}/{total_lineage} done.")
    
    return tables


def build_graph(tables, discovery_mode=False, expanded_nodes=None, discovery_filter='all'):
    """
    Constructs nodes and edges for React Flow.
    If discovery_mode is True, creates 'ghost' nodes for dependencies 
    that are not found in the parsed tables.
    expanded_nodes: dict {node_id: 'all'|'external'|'cte'} or list (legacy, treated as 'all').
    discovery_filter: 'all' | 'external' | 'cte' — controls which ghost types to show.
    """
    # Normalize legacy list format to dict
    if isinstance(expanded_nodes, list):
        expanded_nodes = {n: 'all' for n in expanded_nodes}
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
        deps = data["dependencies"]
        # Support both dict (name->type) and list (legacy) formats
        dep_items = deps.items() if isinstance(deps, dict) else [(d, "FROM") for d in deps]
        for dep, dep_type in dep_items:
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
                    "label": dep_type,
                    "style": {"stroke": "#b1b1b7"}
                })
                incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1
            else:
                 # Handle CTE dependency references
                 if dep.startswith("cte:"):
                     parts = dep.split(":")
                     if len(parts) >= 3:
                         cte_name = ":".join(parts[2:])
                         cte_internal_deps = tables[source_id].get("cte_deps", {}).get(cte_name, {})
                         
                         expand_mode = expanded_nodes.get(source_id, None) if expanded_nodes else None
                         if (discovery_mode and discovery_filter in ('all', 'cte')) or (expand_mode and expand_mode in ('all', 'cte')):
                             # Discovery Mode or Expanded: Create CTE ghost node with incoming edges
                             cte_id = dep
                             
                             if cte_id not in missing_nodes:
                                 cte_content = f"-- CTE: {cte_name}"
                                 if source_id in tables and "ctes" in tables[source_id]:
                                     if cte_name in tables[source_id]["ctes"]:
                                         cte_content = tables[source_id]["ctes"][cte_name]

                                 missing_nodes[cte_id] = {
                                     "id": cte_id,
                                     "label": cte_name,
                                     "layer": "cte",
                                     "type": "cte",
                                     "project": "internal",
                                     "dataset": "cte",
                                     "path": "internal",
                                     "dependencies": {},
                                     "content": cte_content
                                 }
                                 
                                 # Wire CTE's internal dependencies as incoming edges
                                 for inner_dep, inner_type in cte_internal_deps.items():
                                     inner_target = lookup.get(inner_dep)
                                     if not inner_target and "." in inner_dep:
                                         inner_target = lookup.get(inner_dep.split(".")[-1])
                                     
                                     if inner_target:
                                         edges.append({
                                             "id": f"{inner_target}-{cte_id}",
                                             "source": inner_target,
                                             "target": cte_id,
                                             "animated": True,
                                             "label": inner_type,
                                             "style": {"stroke": "#E91E63"}
                                         })
                                         incoming_edges_count[cte_id] = incoming_edges_count.get(cte_id, 0) + 1
                                     else:
                                         # Create ghost node for missing CTE dep
                                         ghost_id = inner_dep
                                         if ghost_id not in missing_nodes:
                                             dep_parts = ghost_id.split('.')
                                             ghost_project, ghost_dataset, ghost_table = "default", "default", ghost_id
                                             if len(dep_parts) == 3:
                                                 ghost_project, ghost_dataset, ghost_table = dep_parts
                                             elif len(dep_parts) == 2:
                                                 ghost_dataset, ghost_table = dep_parts
                                             missing_nodes[ghost_id] = {
                                                 "id": ghost_id, "label": ghost_table,
                                                 "layer": "external", "type": "table",
                                                 "project": ghost_project, "dataset": ghost_dataset,
                                                 "path": "discovered", "dependencies": {},
                                                 "content": "-- Discovered dependency (via CTE)"
                                             }
                                         edges.append({
                                             "id": f"{ghost_id}-{cte_id}",
                                             "source": ghost_id, "target": cte_id,
                                             "animated": True, "label": inner_type,
                                             "style": {"stroke": "#ff9f1c", "strokeDasharray": "5,5"}
                                         })
                                         incoming_edges_count[cte_id] = incoming_edges_count.get(cte_id, 0) + 1
                                 
                             # Edge from CTE to parent Table
                             edges.append({
                                "id": f"{cte_id}-{source_id}",
                                "source": cte_id,
                                "target": source_id,
                                "animated": True,
                                "label": "CTE",
                                "style": {"stroke": "#E91E63", "strokeDasharray": "2,2"}
                             })
                             incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1
                         else:
                             # Non-discovery: Flatten CTE deps as direct edges to parent
                             for inner_dep, inner_type in cte_internal_deps.items():
                                 inner_target = lookup.get(inner_dep)
                                 if not inner_target and "." in inner_dep:
                                     inner_target = lookup.get(inner_dep.split(".")[-1])
                                 if inner_target and inner_target != source_id:
                                     edge_id = f"{inner_target}-{source_id}"
                                     # Avoid duplicate edges
                                     if not any(e["id"] == edge_id for e in edges):
                                         edges.append({
                                             "id": edge_id,
                                             "source": inner_target,
                                             "target": source_id,
                                             "animated": True,
                                             "label": inner_type,
                                             "style": {"stroke": "#b1b1b7"}
                                         })
                                         incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1
                     continue

                 # Handle missing external nodes (discovery mode or expanded node only)
                 expand_mode_ext = expanded_nodes.get(source_id, None) if expanded_nodes else None
                 if ((discovery_mode and discovery_filter in ('all', 'external')) or (expand_mode_ext and expand_mode_ext in ('all', 'external'))) and not target_id:
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
                         
                         incoming_edges_count[source_id] = incoming_edges_count.get(source_id, 0) + 1


    # Merge missing nodes into the main tables list for node creation
    # We don't add them to 'tables' input to avoid side effects, just iterate for node creation
    all_nodes_data = {**tables, **missing_nodes}
    
    # Recalculate G for all nodes including ghosts
    G = nx.DiGraph()
    for edge in edges:
        G.add_edge(edge["source"], edge["target"])

    # ===== Compute Column Downstream Consumers =====
    # For each node, figure out which downstream models reference its columns
    # Result: column_consumers[node_id] = { "col_name": [{"node": consumer_id, "label": consumer_label}] }
    column_consumers = {}
    
    for consumer_id, consumer_data in all_nodes_data.items():
        col_refs = consumer_data.get("column_references", {})
        for source_ref, columns in col_refs.items():
            # Resolve source_ref to a node_id using lookup
            source_node_id = lookup.get(source_ref)
            if not source_node_id and "." in source_ref:
                source_node_id = lookup.get(source_ref.split(".")[-1])
            
            if source_node_id and source_node_id in all_nodes_data:
                # Skip self-references (a model shouldn't be its own consumer)
                if source_node_id == consumer_id:
                    continue
                if source_node_id not in column_consumers:
                    column_consumers[source_node_id] = {}
                for col in columns:
                    if col not in column_consumers[source_node_id]:
                        column_consumers[source_node_id][col] = []
                    column_consumers[source_node_id][col].append({
                        "node": consumer_id,
                        "label": consumer_data.get("label", consumer_id)
                    })

    # ===== Reachability counts (ancestors / descendants) =====
    # Compute for ALL nodes in two topological passes instead of running a
    # separate O(V+E) traversal per node (the old approach was O(V*(V+E))).
    # Each node reuses its successors'/predecessors' already-computed sets.
    # Falls back to per-node only when the graph has cycles (rare, capped later).
    ancestors_count = {}
    descendants_count = {}
    try:
        topo = list(nx.topological_sort(G))
        desc_sets = {}
        for n in reversed(topo):
            s = set()
            for succ in G.successors(n):
                s.add(succ)
                s |= desc_sets[succ]
            desc_sets[n] = s
        anc_sets = {}
        for n in topo:
            s = set()
            for pred in G.predecessors(n):
                s.add(pred)
                s |= anc_sets[pred]
            anc_sets[n] = s
        descendants_count = {n: len(desc_sets[n]) for n in G.nodes()}
        ancestors_count = {n: len(anc_sets[n]) for n in G.nodes()}
    except Exception:
        # Cyclic graph: topological_sort is undefined — fall back per node.
        for n in G.nodes():
            try:
                ancestors_count[n] = len(nx.ancestors(G, n))
                descendants_count[n] = len(nx.descendants(G, n))
            except Exception:
                ancestors_count[n] = 0
                descendants_count[n] = 0

    for table_name, data in all_nodes_data.items():
        # Nested = all upstream ancestors; downstream = all descendants.
        nested_count = ancestors_count.get(table_name, 0)
        downstream_count = descendants_count.get(table_name, 0)

        nodes.append({
            "id": table_name,
            "data": {
                "label": data["label"], 
                "layer": data["layer"],
                "details": {
                    **data,
                    "column_consumers": column_consumers.get(table_name, {})
                },
                "incomingCount": incoming_edges_count.get(table_name, 0),
                "nestedCount": nested_count,
                "downstreamCount": downstream_count
            },
            "position": {"x": 0, "y": 0}, 
            "type": "custom", 
        })

    # ===== Cycle Detection =====
    cycles = []
    try:
        # Check if DAG first, as simple_cycles can take exponential time on large graphs
        if not nx.is_directed_acyclic_graph(G):
            cycle_iter = nx.simple_cycles(G)
            for i, cycle in enumerate(cycle_iter):
                if i >= 20:  # Cap at 20 cycles to prevent UI freezes & Memory/CPU overload
                    break
                cycle_labels = []
                for nid in cycle:
                    label = all_nodes_data.get(nid, {}).get("label", nid)
                    cycle_labels.append({"id": nid, "label": label})
                cycles.append(cycle_labels)
    except Exception:
        pass

    return nodes, edges, cycles
