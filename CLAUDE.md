# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SQL DAG Flow is a pip-installable tool that does **static analysis** of local `.sql` files (via `sqlglot`) and serves an interactive React Flow lineage graph from a bundled FastAPI server. No database connections, no query logs — parsing only. Optimized for Medallion Architecture (Bronze/Silver/Gold), with BigQuery as the default SQL dialect.

The published package is a Python backend (`src/sql_dag_flow/`) with a **pre-built** React frontend baked into `src/sql_dag_flow/static/`. The `frontend/` directory is the source; `static/` is its build output.

## Build & run

The two halves have separate toolchains. The critical, non-obvious link between them: **Vite builds directly into the Python package's static dir** (`frontend/vite.config.js` sets `outDir: '../src/sql_dag_flow/static'` with `emptyOutDir: true`).

```bash
# Frontend dev (hot reload, talks to backend on :8000 — see api.js port detection)
cd frontend && npm install && npm run dev      # Vite dev server on :5173
npm run lint                                    # ESLint

# Rebuild the bundle the package actually ships (wipes & regenerates static/)
cd frontend && npm run build

# Run the backend against a SQL project
pip install -e .            # editable install exposes the `sql-dag-flow` CLI
sql-dag-flow /path/to/sql   # or just `sql-dag-flow` for cwd; --port/-p to override 8000
```

When shipping frontend changes you must `npm run build` — editing `frontend/src/` alone does nothing for installed users, since the server serves `static/`. After building, `static/assets/index-*.js` is regenerated with a new content hash and `static/index.html` is rewritten to reference it; commit both. The old hashed asset must be deleted (this is what `emptyOutDir` does).

Version lives in **three** places that should be kept in sync: `pyproject.toml`, `frontend/package.json`, and the README's version references.

## Testing

There is no formal test suite. `src/sql_dag_flow/test_parser.py`, `test_api_endpoints.py`, and `verify_counts.py` are ad-hoc `python`-run scripts with `print` output (not pytest), and some are stale — e.g. `test_parser.py` unpacks `build_graph()` as 2 values but it now returns 3 (`nodes, edges, cycles`). Verify changes by running the app against `sql_examples/` (referenced by the test scripts) rather than trusting these scripts.

## Architecture

### Backend (`src/sql_dag_flow/`)

- **`parser.py`** — all SQL intelligence. Two entry points:
  - `parse_sql_files(directory, allowed_subfolders, dialect, visible_node_ids)` walks the tree, parses each `.sql` into a metadata dict keyed by filename-without-extension. Extracts dependencies (FROM/JOIN/CTE), output schema, business rules (WHERE/CASE/HAVING/aggregations), a weighted complexity score, column references, and SQL header-comment metadata (`-- @description:`, `-- @author:`, etc.).
  - `build_graph(tables, discovery_mode, expanded_nodes, discovery_filter)` turns that dict into React Flow `nodes`/`edges` plus detected `cycles`, using `networkx` for ancestor/descendant counts and cycle detection.
- **`main.py`** — FastAPI app + CLI `start()` entrypoint (declared in `pyproject.toml` `[project.scripts]`). Holds server-global mutable state `CURRENT_DIRECTORY` (the project being analyzed) that endpoints mutate via `POST /config/path`. Finds a free port starting at 8000, opens the browser, mounts `static/` as an SPA with a catch-all route and no-cache headers.

Key parser concepts to preserve when editing:
- **Layer detection** is substring-based on the full lowercased path (`bronze`/`bronce`, `silver`, `gold`, else `other`) — folder name drives node color/grouping.
- **CTE handling is dual-mode.** CTEs are parsed as pseudo-dependencies keyed `cte:<file>:<name>`. In normal mode `build_graph` *flattens* a CTE's internal deps into direct edges to the parent; in discovery/expanded mode it materializes the CTE as its own pink ghost node with incoming edges. Both paths must stay consistent.
- **"Ghost"/external nodes** are dependencies with no matching `.sql` file, only surfaced in discovery mode or for explicitly expanded nodes; `discovery_filter` (`all`/`external`/`cte`) gates which kinds appear.
- **Name resolution** is fuzzy: `build_graph` builds a `lookup` mapping every alias form (`table`, `dataset.table`, `project.dataset.table`) to a node id, and falls back to matching the last dotted segment.

### Two layers of caching (both in `parser.py` / `main.py`)
1. **Persistent disk cache** — `.sqldagflow/cache.json` in the analyzed project, keyed per-file by `mtime_ns:size`. Skips re-parsing unchanged files across restarts. The `.sqldagflow` dir is skipped during the walk (hidden-dir filter). Cache stores JSON-safe copies (sets → lists).
2. **In-memory TTL cache** — `_parse_cache` in `main.py` (5s) dedupes rapid/concurrent requests. Invalidated on path change.

**Selective processing:** the expensive second passes — `qualify_columns` (precise column resolution) and column-level lineage — are gated on `visible_node_ids` passed from the frontend, so only on-screen nodes get the heavy treatment. This is the main large-project performance lever; keep these passes guarded by time budgets and the visibility filter.

**Scoped views (the primary perf model).** `parse_sql_files(target_ids=...)` limits parsing to a set of node ids (filename bases), skipping every other file in the walk — so the heavy sqlglot work stays O(scope). This powers "saved views": when the frontend loads a config it enters `scopedView` mode and Refresh calls `POST /graph/scoped` (parse + build only the on-canvas nodes) instead of `/graph`. Newly-added `.sql` files are therefore never auto-flooded onto the canvas — the user pulls them in explicitly via `POST /scan/new` (a pure filesystem diff, no parsing) → the "Scan New" toolbar button. `/export` is likewise scoped: it passes `visible_node_ids` as `target_ids` so it never re-parses the whole project.

Reachability counts (`nestedCount`/`downstreamCount`) in `build_graph` are computed with a single topological-order DP over all nodes (falling back to per-node networkx only on cyclic graphs), not N separate traversals.

**Git blast-radius.** `GET /git/changes?base=<ref>` shells out to `git` (via `_run_git`, which pins `-C CURRENT_DIRECTORY`) and maps changed `.sql` files to node ids: working-tree changes always, plus `base...HEAD` when a base ref is given (the PR view). The frontend's "Git Changes" button tags those nodes `data.gitStatus='changed'` and BFS-walks edges forward to tag downstream nodes `'downstream'`; `CustomNode` renders a glow + badge for each. A plain refresh clears the highlight (backend node data has no `gitStatus`).

### Frontend (`frontend/src/`)
- React 19 + `@xyflow/react` (React Flow v12). `App.jsx` is the monolithic container (~2100 lines) holding graph state, selection, and most feature logic.
- **`algorithms/elk.js`** — ELK (Eclipse Layout Kernel via `elkjs`) computes node positions; the backend always returns `position: {x:0,y:0}` and layout happens client-side.
- **`api.js`** — the single API boundary. Note `API_URL` auto-detection: port `5173` → dev mode targeting `http://localhost:8000`; otherwise same-origin (production, served by FastAPI).
- Feature components are siblings of `App.jsx` (`CustomNode`, `DetailsPanel`, `Sidebar`, `CommandPalette`, `ImpactAnalysis`, `ComparisonPanel`, `LayerStats`, etc.). UI theming is a design-token CSS-variable system (Linear-inspired).
- **Render perf:** `<ReactFlow onlyRenderVisibleElements>` virtualizes off-screen nodes (disabled while `isExporting` so snapshots are complete). `CustomNode` uses a custom `memo` comparator that ignores handler identity — the parent rebuilds every node's `data` (with fresh closures) each refresh, so without this every node re-renders. This is safe because the handlers (`onNodeContextMenu`, `onEdit`, `handleApplyAction`) are stable `useCallback`s that read live state from refs. If you add a new visually-relevant field to `data`, add it to the comparator's key list or the node won't repaint.

## Conventions & gotchas
- **Windows-first environment** (paths use backslashes; `os.sep` normalization to `/` is done deliberately throughout `parser.py`/`main.py` — preserve it).
- Dependency data structures accept both **dict (`name -> type`)** and **legacy list** forms; new code should emit dicts but tolerate lists (see the `isinstance` guards).
- Node ids are filenames-without-extension. Filenames like `project.dataset.table.sql` are parsed into project/dataset/table when the SQL itself doesn't specify a target.
- Endpoints that write files (`/files/create`, `/files/move`) do a loose `".." not in path` check confined to `CURRENT_DIRECTORY` — keep that guard when touching them.
