import os
import re
import time
import json
import hashlib
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.qualify_columns import qualify_columns as sqlglot_qualify_columns
import logging

import networkx as nx

# sqlglot logs a warning every time it meets procedural syntax it can't model
# (BEGIN ... END bodies, CALL). We handle those cases explicitly by re-parsing
# the body, so the warnings are just noise in the user's terminal.
logging.getLogger("sqlglot").setLevel(logging.ERROR)


# ===== Persistent File Cache =====
CACHE_DIR = ".sqldagflow"
CACHE_FILENAME = "cache.json"
# Bumped whenever the shape of a cached entry changes, so stale caches from an
# older version are ignored instead of feeding wrong data into the graph.
CACHE_VERSION = 2


# ===== Node identity =====

def _collect_sql_files(directory):
    """Walk the tree once, filesystem only, returning [(filepath, relpath)].

    No parsing happens here, so this stays instant even on huge projects. It
    runs before parsing because node ids must be decided against the *whole*
    project, not just the subset a scoped parse touches.
    """
    found = []
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith(".sql"):
                filepath = os.path.join(root, f)
                rel = os.path.relpath(filepath, directory).replace(os.sep, '/')
                found.append((filepath, rel))
    return found


def _build_id_map(sql_files):
    """Assign a stable, unique node id to every .sql file.

    A file keeps its plain basename when that name is unique project-wide, so
    existing saved views keep resolving. Only when two files share a basename
    do they fall back to their relative path — which is unique by construction.
    Previously the basename was used unconditionally as a dict key, so
    `bronze/customers.sql` and `gold/customers.sql` silently overwrote each
    other and one model vanished from the graph.

    Returns (id_map: filepath -> node_id, duplicates: basename -> [relpaths]).
    """
    by_base = {}
    for filepath, rel in sql_files:
        base = os.path.splitext(os.path.basename(rel))[0]
        by_base.setdefault(base, []).append((filepath, rel))

    id_map = {}
    duplicates = {}
    for base, entries in by_base.items():
        if len(entries) == 1:
            id_map[entries[0][0]] = base
        else:
            duplicates[base] = sorted(rel for _, rel in entries)
            for filepath, rel in entries:
                id_map[filepath] = os.path.splitext(rel)[0]
    return id_map, duplicates


def _normalize_part(value):
    """Treat the parser's placeholder values as 'not declared'."""
    if not value or value in ("default", "n/a"):
        return None
    return value


def _build_fqn(project, dataset, table):
    """The fully-qualified name the SQL actually declares, as far as it does."""
    parts = [p for p in (_normalize_part(project), _normalize_part(dataset), table) if p]
    return ".".join(parts)


# ===== Stored procedures / multi-statement scripts =====

# sqlglot does not parse a procedural BEGIN ... END body: it falls back to a
# generic Command node, so every INSERT/MERGE inside would be invisible. We
# lift the body out and parse it as its own script instead.
_PROC_BODY_RE = re.compile(r"\bBEGIN\b(.*)\bEND\b", re.IGNORECASE | re.DOTALL)
_CALL_RE = re.compile(r"\bCALL\s+([A-Za-z0-9_.`]+)\s*\(", re.IGNORECASE)


def _qualified_table_name(table_exp):
    """'catalog.db.name' for a sqlglot Table, as far as it is qualified."""
    if not isinstance(table_exp, exp.Table):
        return None
    name = table_exp.name
    if not name:
        return None
    if table_exp.db:
        if table_exp.catalog:
            return f"{table_exp.catalog}.{table_exp.db}.{name}"
        return f"{table_exp.db}.{name}"
    return name


def _extract_procedure_body(sql_text):
    """Text between the outermost BEGIN and END, or None."""
    match = _PROC_BODY_RE.search(sql_text or "")
    return match.group(1) if match else None


def _extract_calls(sql_text):
    """Procedure names invoked with CALL (sqlglot leaves these unparsed)."""
    return [c.strip("`") for c in _CALL_RE.findall(sql_text or "")]


def _statement_write_target(statement):
    """The table a statement writes to, with the operation that writes it."""
    target, op = None, None
    if isinstance(statement, exp.Insert):
        target, op = statement.this, "INSERT"
    elif isinstance(statement, exp.Merge):
        target, op = statement.this, "MERGE"
    elif isinstance(statement, exp.Update):
        target, op = statement.this, "UPDATE"
    elif isinstance(statement, exp.Delete):
        target, op = statement.this, "DELETE"
    elif isinstance(statement, exp.Create) and statement.kind in ("TABLE", "VIEW"):
        target, op = statement.this, "CREATE"
    if target is None:
        return None, None
    # INSERT INTO t (cols) wraps the table in a Schema; MERGE aliases it.
    if isinstance(target, exp.Schema):
        target = target.this
    if isinstance(target, exp.Alias):
        target = target.this
    return _qualified_table_name(target), op


def _collect_statements(sql_content, dialect):
    """Every statement worth inspecting: the top-level ones plus, for a stored
    procedure, the statements inside its body."""
    statements = []
    try:
        statements = [s for s in sqlglot.parse(sql_content, read=dialect) if s is not None]
    except Exception:
        statements = []

    body = _extract_procedure_body(sql_content)
    if body:
        try:
            statements += [s for s in sqlglot.parse(body, read=dialect) if s is not None]
        except Exception:
            pass
    return statements


# extract_output_columns stores an expression's SQL text in the "type" slot for
# computed columns ("column", "expression", or raw SQL). Those are not data
# types, and sqlglot raises while trying to parse them as one — which silently
# threw away the entire qualify_columns pass. Anything we can't vouch for is
# reported as UNKNOWN, which sqlglot accepts.
_KNOWN_SQL_TYPES = {
    "INT", "INTEGER", "SMALLINT", "TINYINT", "BIGINT", "INT64",
    "FLOAT", "FLOAT64", "DOUBLE", "REAL", "DECIMAL", "NUMERIC", "BIGNUMERIC",
    "VARCHAR", "CHAR", "STRING", "TEXT", "BYTES", "BINARY", "VARBINARY",
    "BOOLEAN", "BOOL", "DATE", "DATETIME", "TIME", "TIMESTAMP", "TIMESTAMPTZ",
    "INTERVAL", "JSON", "ARRAY", "STRUCT", "RECORD", "GEOGRAPHY", "UUID",
    "UNKNOWN",
}


def _sql_type_or_fallback(raw_type):
    """Keep a real SQL type, otherwise fall back to UNKNOWN."""
    if not raw_type:
        return "UNKNOWN"
    base = str(raw_type).split("(")[0].strip().upper()
    return base if base in _KNOWN_SQL_TYPES else "UNKNOWN"


def _extract_column_references(ast, target_name):
    """Map each source table referenced by the query to the columns used from it.

    Both the plain pass and the qualify_columns pass run this, so the two can
    never drift apart (they used to be two hand-maintained copies of the same
    algorithm).
    """
    defined_ctes = set()
    for cte in ast.find_all(exp.CTE):
        name = cte.alias_or_name
        if name:
            defined_ctes.add(name)

    alias_map = {}
    for t in ast.find_all(exp.Table):
        t_name = t.name
        t_full = t_name
        if t.db:
            t_full = f"{t.db}.{t_name}"
            if t.catalog:
                t_full = f"{t.catalog}.{t.db}.{t_name}"
        if t.alias:
            alias_map[t.alias] = t_full
        alias_map[t_name] = t_full

    references = {}
    unqualified = set()
    for col in ast.find_all(exp.Column):
        col_table = col.table  # alias or table name qualifying the column
        if col_table and col_table in alias_map:
            references.setdefault(alias_map[col_table], set()).add(col.name)
        elif not col_table:
            unqualified.add(col.name)

    # Unqualified columns can't be attributed precisely; assign them to every
    # real source (best effort — showing a column as used beats missing it).
    if unqualified:
        sources = {
            v for v in alias_map.values()
            if v != target_name
            and v.split('.')[-1] != target_name
            and v not in defined_ctes
            and v.split('.')[-1] not in defined_ctes
        }
        for src in sources:
            references.setdefault(src, set()).update(unqualified)

    return {k: sorted(v) for k, v in references.items()}

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

    # Decide node ids up front against the whole project so they stay stable
    # regardless of subfolder filtering or scoped parsing.
    id_map, duplicate_names = _build_id_map(_collect_sql_files(directory))
    dup_by_base = {
        base: rels for base, rels in duplicate_names.items()
    }

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
                # Unique id decided by _build_id_map (basename, or relpath on collision)
                node_id = id_map.get(filepath, filename_base)

                # Scoped parse: skip any file not in the requested view. Legacy
                # saved views store bare basenames, so accept either form.
                if target_set is not None and node_id not in target_set and filename_base not in target_set:
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
                if (cached_entry
                        and cached_entry.get("v") == CACHE_VERSION
                        and cached_entry.get("cache_key") == file_key
                        and cached_entry.get("dialect") == dialect):
                    # Cache hit — use stored parse result. The id is re-stamped
                    # because collisions can change it without the file changing.
                    data = cached_entry["data"]
                    data["id"] = node_id
                    if filename_base in dup_by_base:
                        data["name_collision"] = dup_by_base[filename_base]
                    tables[node_id] = data
                    cache_hits += 1
                    continue
                
                cache_misses += 1
                
                with open(filepath, "r", encoding="utf-8") as f:
                    sql_content = f.read()
                
                try:
                    # Parse with BigQuery dialect to support CREATE OR REPLACE TABLE/VIEW
                    parsed = sqlglot.parse_one(sql_content, read=dialect)
                    
                    # Detect Node Type (table, view or stored procedure)
                    node_type = "table" # default
                    if isinstance(parsed, exp.Create):
                        if parsed.kind == "VIEW":
                            node_type = "view"
                        elif parsed.kind == "PROCEDURE":
                            node_type = "procedure"
                    
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
                        # A stored procedure's target is a UserDefinedFunction;
                        # its qualified name still sits in a Table node inside.
                        if not isinstance(target_exp, exp.Table):
                            inner_table = create_node.find(exp.Table)
                            if inner_table is not None:
                                target_exp = inner_table
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
                            dependencies[f"cte:{node_id}:{dep_name}"] = "CTE"
                            continue
                        
                        # Skip tables that belong inside a CTE definition
                        # These will be wired as CTE_node deps in build_graph
                        if dep_name in tables_inside_ctes:
                            continue

                        # Regular external dependency at the main query level
                        dep_type = "JOIN" if dep_name in join_tables else "FROM"
                        dependencies[full_name] = dep_type

                    # ===== Stored procedures / multi-statement scripts =====
                    # `parsed` is only the FIRST statement. A procedure body, or
                    # a script with several statements, carries the rest of the
                    # lineage: what it reads, and — unlike a plain model — the
                    # tables it writes to. Writes become outgoing edges later.
                    writes = {}
                    extra_statements = _collect_statements(sql_content, dialect)
                    if len(extra_statements) > 1 or node_type == "procedure":
                        own_names = {target_table_name}
                        own_fqn = _build_fqn(project, dataset, target_table_name)
                        if own_fqn:
                            own_names.add(own_fqn)

                        for statement in extra_statements:
                            written, operation = _statement_write_target(statement)
                            if written and written not in own_names:
                                writes[written] = operation

                        written_short = {w.split(".")[-1] for w in writes}
                        for statement in extra_statements:
                            for t in statement.find_all(exp.Table):
                                dep_name = t.name
                                if (not dep_name
                                        or dep_name in own_names
                                        or dep_name == target_table_name
                                        or dep_name in defined_ctes
                                        or dep_name in written_short):
                                    continue
                                full = _qualified_table_name(t)
                                if full and full not in writes and full not in dependencies:
                                    dependencies[full] = "FROM"

                        # CALL <proc>() — sqlglot leaves these as opaque Commands
                        for called in _extract_calls(sql_content):
                            if called and called not in own_names:
                                dependencies[called] = "CALL"

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
                    # Which columns this model uses from each source table.
                    # Shared helper, so this cannot drift from the qualified pass.
                    column_references = _extract_column_references(parsed, target_table_name)
                    
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
                             
                    tables[node_id] = {
                        "id": node_id,
                        "label": target_table_name,
                        "fqn": _build_fqn(project, dataset, target_table_name),
                        "layer": layer,
                        "type": node_type,
                        "project": project,
                        "dataset": dataset,
                        "path": filepath,
                        "dependencies": dependencies,
                        "writes": writes,
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
                    if filename_base in dup_by_base:
                        tables[node_id]["name_collision"] = dup_by_base[filename_base]
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
                    tables[node_id] = {
                        "id": node_id,
                        "label": filename_base,
                        "fqn": filename_base,
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
                    tables[node_id] = {
                        "id": node_id,
                        "label": filename_base,
                        "fqn": filename_base,
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
                if node_id in tables:
                    file_key = _file_cache_key(filepath)
                    if file_key:
                        # Store a cache-safe copy (no sets, convert to lists)
                        cache_data = {}
                        for k, v in tables[node_id].items():
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
                            "v": CACHE_VERSION,
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
    # These two sqlglot passes dominate runtime, and both scale with the size of
    # the schema handed to them. Feeding every model the whole project's schema
    # cost ~440 ms per model; giving each one only the tables it actually reads
    # brings that to ~19 ms. Hence a per-model schema instead of a global one.
    columns_by_label = {}   # label -> {column: sql type}
    dataset_by_label = {}   # label -> declared dataset
    for tid, tdata in tables.items():
        schema_cols = tdata.get("schema", [])
        if not schema_cols:
            continue
        label = tdata.get("label", tid)
        columns_by_label[label] = {
            c["name"]: _sql_type_or_fallback(c.get("type"))
            for c in schema_cols
        }
        dataset_by_label[label] = tdata.get("dataset", "default")

    def _schema_for(tdata, tid):
        """Schema limited to what this model reads, plus itself.

        sqlglot resolves columns against every table it is given, so a schema
        scoped to the model's own dependencies is both far cheaper and no less
        correct — a model can only reference what it depends on.
        """
        wanted = {tdata.get("label", tid)}
        deps = tdata.get("dependencies") or {}
        for dep in (deps.keys() if isinstance(deps, dict) else deps):
            if not dep.startswith("cte:"):
                wanted.add(dep.split(".")[-1])
        for written in (tdata.get("writes") or {}):
            wanted.add(written.split(".")[-1])

        scoped = {}
        for label in wanted:
            cols = columns_by_label.get(label)
            if not cols:
                continue
            ds = dataset_by_label.get(label, "default")
            scoped.setdefault(ds, {})[label] = cols
            scoped.setdefault("default", {})[label] = cols
        return scoped
    
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
            
            # Qualify against this model's own dependencies only (with 2s budget)
            try:
                qualified_ast = sqlglot_qualify_columns(parsed.copy(), schema=_schema_for(tdata, tid), dialect=dialect)
            except Exception:
                qualified_ast = parsed  # Fallback to unqualified
            
            # Check time budget
            if time.time() - table_start > 2.0:
                continue  # Skip extraction if qualification took too long
            
            # Re-extract from the qualified AST using the same helper.
            # Stored under a SEPARATE key on purpose: this pass only runs for
            # visible nodes, so feeding it back into `column_references` made
            # graph-wide aggregates (column_consumers) depend on what happened
            # to be on screen. The consistent field stays authoritative for
            # aggregation; this refined one is for the selected node's panel.
            target_name = tdata.get("label", tid)
            tdata["column_references_qualified"] = _extract_column_references(
                qualified_ast, target_name
            )
            
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

            # lineage() accepts an AST. Passing the raw string made it re-parse
            # the entire model once per column; parse once and reuse instead.
            try:
                lineage_ast = sqlglot.parse_one(sql_content, read=dialect)
            except Exception:
                continue
            lineage_schema = _schema_for(tdata, tid)

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
                        col_name, lineage_ast.copy(),
                        schema=lineage_schema,
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
    warnings = []

    # ===== Name resolution index =====
    # Three tiers, most specific first. Matching never falls back to "same last
    # segment" blindly: a reference that names a dataset must not resolve to a
    # model that declares a *different* dataset, or we invent dependencies that
    # do not exist (proj.sales.orders resolving to proj.finance.orders).
    by_full = {}      # "project.dataset.table" -> [node_id]
    by_dataset = {}   # "dataset.table"         -> [node_id]
    by_table = {}     # "table"                 -> [node_id]
    by_id = {}        # exact node id           -> node_id
    declared_dataset = {}  # node_id -> dataset it declares, or None

    for node_id, data in tables.items():
        by_id[node_id.lower()] = node_id
        table = (data.get("label") or "").lower()
        dataset = _normalize_part(data.get("dataset"))
        project = _normalize_part(data.get("project"))
        declared_dataset[node_id] = dataset.lower() if dataset else None

        if table:
            by_table.setdefault(table, []).append(node_id)
            if dataset:
                by_dataset.setdefault(f"{dataset.lower()}.{table}", []).append(node_id)
                if project:
                    by_full.setdefault(f"{project.lower()}.{dataset.lower()}.{table}", []).append(node_id)

        # Surface colliding basenames once each, so a user can tell why a model
        # is addressed by path instead of by name.
        for rel_paths in [data.get("name_collision")]:
            if rel_paths and not any(w.get("name") == data.get("label") and w["kind"] == "duplicate_name" for w in warnings):
                warnings.append({
                    "kind": "duplicate_name",
                    "name": data.get("label"),
                    "paths": rel_paths,
                    "message": f"Several .sql files share the name '{os.path.basename(rel_paths[0])}'; they are addressed by path.",
                })

    def _resolve(ref):
        """Resolve a dependency string to (node_id, status).

        status is 'ok', 'ambiguous' or 'unresolved'. Ambiguous never guesses.
        """
        r = (ref or "").lower()
        if r in by_id:
            return by_id[r], "ok"

        parts = r.split(".")
        table = parts[-1]
        dataset = parts[-2] if len(parts) >= 2 else None
        project = parts[-3] if len(parts) >= 3 else None

        def pick(candidates):
            unique = list(dict.fromkeys(candidates))
            if len(unique) == 1:
                return unique[0], "ok"
            return None, "ambiguous"

        if project and dataset:
            hit = by_full.get(f"{project}.{dataset}.{table}")
            if hit:
                return pick(hit)
        if dataset:
            hit = by_dataset.get(f"{dataset}.{table}")
            if hit:
                return pick(hit)

        hit = by_table.get(table)
        if hit:
            if dataset:
                # The reference names a dataset. Only models that declare no
                # dataset at all can still match — one that declares a
                # different dataset is a genuinely different table.
                hit = [nid for nid in hit if not declared_dataset.get(nid)]
                if not hit:
                    return None, "unresolved"
            return pick(hit)

        return None, "unresolved"

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
            if dep.startswith("cte:"):
                target_id, status = None, "unresolved"
            else:
                target_id, status = _resolve(dep)
                if status == "ambiguous":
                    warnings.append({
                        "kind": "ambiguous_reference",
                        "reference": dep,
                        "source": source_id,
                        "message": f"'{dep}' matches more than one model; no edge was drawn.",
                    })
                elif status == "unresolved":
                    warnings.append({
                        "kind": "unresolved_reference",
                        "reference": dep,
                        "source": source_id,
                        "message": f"'{dep}' does not match any model in scope.",
                    })

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
                                     inner_target, _ = _resolve(inner_dep)
                                     
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
                                 inner_target, _ = _resolve(inner_dep)
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


    # ===== Outgoing edges from writes =====
    # A stored procedure (or any script that INSERTs/MERGEs) produces tables
    # rather than being one. Those targets are edges OUT of the node, which is
    # what makes a procedure readable as a step between inputs and outputs.
    for source_id, data in tables.items():
        for written, operation in (data.get("writes") or {}).items():
            written_id, status = _resolve(written)
            if written_id and written_id != source_id:
                edge_id = f"{source_id}-{written_id}"
                if not any(e["id"] == edge_id for e in edges):
                    edges.append({
                        "id": edge_id,
                        "source": source_id,
                        "target": written_id,
                        "animated": True,
                        "label": operation or "WRITES",
                        "style": {"stroke": "#b1b1b7"}
                    })
                    incoming_edges_count[written_id] = incoming_edges_count.get(written_id, 0) + 1

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
            # Resolve source_ref to a node id with the same strict policy
            source_node_id, _ = _resolve(source_ref)
            
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

    return nodes, edges, cycles, warnings
