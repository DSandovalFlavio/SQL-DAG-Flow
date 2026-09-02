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

```bash
python -m pytest tests -q          # whole suite (fast, no server needed)
python -m pytest tests/test_identity.py -q
python -m pytest tests -q -k phantom          # single case by name
```

`tests/` is the real suite (pytest). `conftest.py` exposes a `project` fixture that writes `{relpath: sql}` into a fresh `tmp_path` and returns the root, so each test parses an isolated project and the on-disk `.sqldagflow` cache never leaks between tests.

The suite exists mainly to pin **lineage correctness** — `test_identity.py` covers the two failure modes that matter most (a model silently dropped by a colliding filename, and a fabricated edge from loose name matching). Treat those as regression guards; they encode the contract, not implementation detail. `test_consistency.py` pins that graph-wide aggregates don't change with the viewport.

Beyond the suite, verify UI-facing changes by running the app against `sql_examples/`.

## Architecture

### Backend (`src/sql_dag_flow/`)

- **`parser.py`** — all SQL intelligence. Two entry points:
  - `parse_sql_files(directory, allowed_subfolders, dialect, visible_node_ids)` walks the tree, parses each `.sql` into a metadata dict keyed by filename-without-extension. Extracts dependencies (FROM/JOIN/CTE), output schema, business rules (WHERE/CASE/HAVING/aggregations), a weighted complexity score, column references, and SQL header-comment metadata (`-- @description:`, `-- @author:`, etc.).
  - `build_graph(tables, discovery_mode, expanded_nodes, discovery_filter)` turns that dict into React Flow `nodes`/`edges` plus detected `cycles` **and `warnings`** — it returns a 4-tuple `(nodes, edges, cycles, warnings)`.
- **`main.py`** — FastAPI app + CLI `start()` entrypoint (declared in `pyproject.toml` `[project.scripts]`). Holds server-global mutable state `CURRENT_DIRECTORY` (the project being analyzed) that endpoints mutate via `POST /config/path`. Finds a free port starting at 8000, opens the browser, mounts `static/` as an SPA with a catch-all route and no-cache headers. The three graph routes (`/graph`, `/graph/filtered`, `/graph/scoped`) are thin adapters over one `_graph_response()` helper — they differ only in how the request arrives, so put shared behavior there, not in the routes.

Two known limits worth keeping in mind before adding features: the `/graph` payload ships each node's full SQL `content`, so topology and detail are not yet separated (the scaling ceiling on big projects); and saved configs serialize whole nodes, so they embed a snapshot of that SQL. Splitting `/graph` (light) from a per-node detail fetch is the intended fix and touches `DetailsPanel`, `ComparisonPanel`, `Sidebar`'s SQL search, and App's diff detection.

Key parser concepts to preserve when editing:
- **Layer detection** is substring-based on the full lowercased path (`bronze`/`bronce`, `silver`, `gold`, else `other`) — folder name drives node color/grouping.
- **CTE handling is dual-mode.** CTEs are parsed as pseudo-dependencies keyed `cte:<file>:<name>`. In normal mode `build_graph` *flattens* a CTE's internal deps into direct edges to the parent; in discovery/expanded mode it materializes the CTE as its own pink ghost node with incoming edges. Both paths must stay consistent.
- **"Ghost"/external nodes** are dependencies with no matching `.sql` file, only surfaced in discovery mode or for explicitly expanded nodes; `discovery_filter` (`all`/`external`/`cte`) gates which kinds appear.
- **Node identity** is decided *before* parsing, by `_build_id_map` over a cheap filesystem-only walk of the whole project (`_collect_sql_files`). A file keeps its plain basename as its id when that name is unique project-wide; colliding names fall back to their relative path (`bronze/customers`, `gold/customers`). This must run over the whole project even for a scoped parse, or ids would shift with the scope. Each node also carries `fqn`, the fully-qualified name the SQL declares.
- **Name resolution is strict and never guesses** (`_resolve` inside `build_graph`). Three tiers, most specific first: `project.dataset.table` → `dataset.table` → bare `table`. Two rules make it trustworthy, and both are pinned by tests:
  - A reference that names a dataset will **not** match a model declaring a *different* dataset (only one declaring none), so `proj.sales.orders` can't resolve to `proj.finance.orders`.
  - More than one candidate means **ambiguous**: no edge is drawn and a warning is emitted, rather than picking one.
  Anything unresolved or ambiguous appends to `warnings` (`unresolved_reference`, `ambiguous_reference`, `duplicate_name`), which the frontend surfaces in a banner. **Do not reintroduce a last-dotted-segment fallback** — that is exactly the bug that fabricated lineage edges.
- **Two column-reference fields, on purpose.** `_extract_column_references` is shared by both passes. `column_references` (plain pass, computed for every node) is the authoritative field and the only one `column_consumers` aggregates from — keeping graph-wide answers independent of the viewport. `column_references_qualified` holds the more precise `qualify_columns` result, which only runs for visible nodes, and is for that node's own detail panel. Never feed the qualified field back into the aggregate.

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
