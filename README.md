# SQL DAG Flow

> **"Static Data Lineage for Modern Data Engineers. No databases, just code."**

**SQL DAG Flow** is a lightweight, open-source Python library designed to transform your SQL code into visual architecture.

Unlike traditional lineage tools that require active database connections or query log access, **SQL DAG Flow** performs **static analysis (parsing)** of your local `.sql` files. This allows for instant, secure dependency visualization, bottleneck identification, and Data Lineage documentation without leaving your development environment.

Specially optimized for the **Medallion Architecture** (Bronze, Silver, Gold) and modern stacks (DuckDB, BigQuery, Snowflake), it bridges the gap between the code you write and the architecture you design.

## 💡 Philosophy: Why this exists

*   **Local-First & Zero-Config**: You don't need to configure servers, cloud credentials, or Docker containers. If you have SQL files, you have a diagram.
*   **Security by Design**: By relying on static analysis, your code never leaves your machine and no access to sensitive production data is required.
*   **Living Documentation**: The diagram is generated *from* the code. If the code changes, the documentation updates, eliminating obsolete manually-drawn diagrams.

---

## 🎯 Objectives & Use Cases

*   **1. Legacy Code Audit & Refactoring**:
    *   *The Problem*: You join a new project with 200+ undocumented SQL scripts. Nobody knows what breaks what.
    *   *The Solution*: Run `sql-dag-flow` to instantly map the "spaghetti" dependencies. Identify orphan tables, circular dependencies, and the impact of changing a Silver layer table.
    *   *The Solution*: Generate interactive pipeline visualizations (ETL/ELT) to include in your Pull Requests, Wikis, or client deliverables.
*   **3. Medallion Architecture Validation**:
    *   *The Problem*: It's hard to verify if the logical separation of layers (Bronze → Silver → Gold) is being respected.
    *   *The Solution*: The tool visually groups your scripts by folder structure, allowing you to validate that data flows correctly between quality layers without improper "jumps".
*   **4. Accelerated Onboarding**:
    *   *The Problem*: Explaining data flow to new engineers takes hours of whiteboard drawing.
    *   *The Solution*: Deliver an interactive map where new team members can explore where data comes from, view associated SQL code, and understand business logic without reading thousands of lines of code.

## 🚀 Key Features

### 🔍 Visualization & Analysis
*   **Automatic Parsing**: Recursively scans `.sql` files to detect dependencies (`FROM`, `JOIN`, `CTE`s) using `sqlglot`.
*   **Trustworthy Lineage (New in v0.8.0 🎯)**: Every `.sql` file appears exactly once, even when two folders hold the same filename (`staging/customers.sql` and `marts/customers.sql` no longer overwrite each other — they're addressed by path). Dependency resolution is strict: a reference naming a dataset will never be matched to a model in a *different* dataset, and an ambiguous name draws no edge at all. Anything unresolved, ambiguous or duplicated is reported in a warnings banner instead of failing silently — a missing edge you can see beats a wrong edge you can't.
*   **Persistent File Cache (New in v0.6.0 ⚡)**: Avoids re-parsing unchanged SQL files across application restarts. Instantly loads your DAG on consecutive days.
*   **Selective Processing (New in v0.6.0 🚀)**: Dramatically improves performance on large projects (10x-20x) by only analyzing visible nodes for complex features like Qualify Columns and Column-Level Lineage.
*   **Scoped Views (New in v0.7.0 🎯)**: A saved diagram is now a *scope*. Reopening or refreshing it only re-parses the models actually on your canvas, so parsing stays proportional to your view instead of your whole project — and newly added `.sql` files never flood a curated architecture.
*   **Scan New Models (New in v0.7.0 🔎)**: A pure filesystem diff (zero SQL parsing, instant on huge projects) that surfaces `.sql` files not yet on your canvas, so you pull them in on demand instead of re-indexing everything.
*   **Stored Procedures (New in v0.9.0 ⚙️)**: Full support for `CREATE PROCEDURE` files. The body between `BEGIN ... END` is parsed statement by statement, so a procedure shows both what it **reads** (`FROM`/`JOIN`) and what it **writes** (`INSERT`, `MERGE`, `UPDATE`, `DELETE`) — writes become outgoing edges, placing the procedure between its inputs and the tables it produces. `CALL` between procedures is tracked too. Multi-statement scripts benefit as well: every statement is inspected, not just the first. Procedures are also **visually distinct**: their own violet colour, a gear icon and a `(PROC)` badge, so they never read as a table — while still keeping their medallion layer for grouping and stats.
*   **Real BigQuery Procedure Signatures (New in v0.9.1 🔧)**: `OUT` / `INOUT` parameter modes are rejected by the SQL parser and used to fail the *entire* file - a valid procedure showed a bogus `Expecting )` error and lost all of its lineage. Signatures are now normalised before parsing, so procedures with output parameters, backtick-quoted names and dashed project ids work as expected. **v0.9.2** makes procedures resilient to BigQuery *scripting*: `DECLARE`, `SET`, `IF ... END IF`, `RAISE` and `SELECT ... INTO variables` are constructs the SQL parser cannot model, and a single one of them used to discard the entire procedure body along with all its lineage. The body is now parsed statement by statement, so the `INSERT`s and `DELETE`s that carry the lineage survive whatever sits between them. Parse failures are also no longer written to the disk cache, so a project scanned by an older version picks up parser improvements automatically instead of replaying a stale error.
*   **20x Faster Column Analysis (New in v0.9.0 ⚡)**: The `qualify_columns` and column-lineage passes used to receive the *entire* project's schema for every model, and re-parse a model once per column. They now get only the tables a model actually reads, and reuse a single parsed AST. On a 300-model project the visible-node analysis went from **457 ms to 23 ms per model** — a full-project run that never finished within two minutes now takes under 7 seconds. The same fix repaired a silent bug: computed columns stored an expression in the type slot, which made `qualify_columns` raise and discard its own work on **every** model. It now runs successfully across the board.
*   **Medallion Architecture Support**: Automatically categorizes and colors nodes based on folder structure (Bronze, Silver, Gold).
*   **Advanced Discovery Mode (Improved in v0.6.0 👻)**: Visualize "Ghost Nodes" (missing files or external tables). Includes specific filters to show **Both**, **Only External**, or **Only CTEs**.
*   **CTE Visualization**: Detects internal Common Table Expressions and displays them as distinct Pink nodes.
*   **Smart Layout (New 🧠)**:
    *   Powered by **ELK (Eclipse Layout Kernel)**.
    *   Minimizes edge crossings and optimizes flow direction.
    *   Intelligent "Port" handling for cleaner connections.
*   **Startup Configuration Selector**: Instantly resume previous sessions by selecting any `.json` configuration file found in your project directory upon launching the app.

### 🎮 Interactive Graph
*   **Smart Context Menu**:
    *   **Focus Tree**: Isolate a node and its lineage (ancestors + descendants) to declutter the view.
    *   **Select Tree**: One-click selection of an entire dependency chain for easy movement.
    *   **Hide/Show**: Toggle visibility of individual nodes or full branches.
*   **Advanced Navigation**:
    *   **Sidebar**: Grouped list of nodes with toggle between **By Layer** and **By Project/Dataset** views.
    *   **Command Palette (Cmd+P)**: Instantly search and navigate to nodes across large projects.
    *   **Keyboard Arrow Navigation**: Rapidly explore lineage by moving ← (upstream) and → (downstream) between connected nodes.
    *   **Breadcrumb Trail**: Maintain context while drilling down with a visual history of visited nodes.
    *   **SQL Content Search**: Search inside SQL file content across all nodes — find WHERE clauses, JOINs, or any keyword.
    *   **Details Panel**: View formatted SQL code, schema preview (DDL, CTAS, Views), node configuration, and add **custom descriptions** to document models.

### 📝 Notes & Annotations
*   **Center Placement**: New notes spawn exactly in the center of your view.
*   **Rich Styling**:
    *   **Markdown Support**: Write rich text notes.
    *   **Transparent & Borderless**:Create clean, floating text labels without boxes.
    *   **Groups**: Create visual containers to group related nodes.

### 📊 Discovery & Analysis Tools
*   **Impact Analysis**: Visualize blast radius before making changes. Highlights downstream models, column usage, and risk levels.
*   **Git Blast Radius (New in v0.7.0 🌿)**: Highlights the models changed in your git working tree — or versus a base branch — together with every downstream model they affect. The "what does this PR break?" view, rendered directly on the canvas.
*   **Diff View on Refresh**: Automatically summarizes added, removed, and modified nodes/edges after code changes.
*   **Column Usage Tracking (Improved in v0.4.9 🔧)**: Schema Preview shows which specific columns are used by downstream consumers. Uses `sqlglot.optimizer.qualify_columns` for precise resolution of unqualified column references.
*   **Staleness Detection**: Automatically flags inactive models (`Last Modified > 90d` = Stale) to help clean up legacy pipelines.
*   **Business Rule Extraction**: Automatically detects and displays WHERE filters, CASE logic, HAVING clauses, and aggregations from each SQL model.
*   **Complexity Scoring**: Weighted metric per node (JOINs×3, CTEs×2, Subqueries×3, Filters×1, CASE×2, Aggregations×1, UNIONs×2) with color-coded badges (🟢 Low, 🟡 Medium, 🟠 High, 🔴 Very High). Toggleable via ⚡ button.
*   **Node Comparison**: Select exactly 2 nodes and compare them side-by-side. Highlights differences across metadata, schema columns (shared vs unique), dependencies (Venn-style), complexity scores (with delta indicators), business rules, and SQL content (synced scroll).
*   **Statistics Panel**: Centered popup with layer distribution bars, edge/source/sink/orphan counts, project/dataset tree, and architecture health validation (now detects **circular dependencies**).
*   **Schema Extraction**: Backend AST-based extraction via `sqlglot` handles DDL, CTAS, `CREATE VIEW AS`, CTEs, window functions, CASE expressions, and `SELECT *`.
*   **Column-Level Lineage (New in v0.4.9 🆕)**: Traces how each output column derives from source columns. Shows transformation chain (e.g., `order_timestamp ← orders_raw.order_date via CAST(... AS DATETIME)`).
*   **SQL Syntax Validation (New in v0.4.9 🆕)**: Detects SQL parse errors and displays structured warnings with line/column references. Shows ⚠️ badge on nodes with syntax issues.
*   **Large DAG Support & Safe Cycle Detection (New in v0.5.1 🚀)**: Optimized cycle detection algorithm prevents backend hanging and "Failed to fetch" browser errors when analyzing massive projects (50+ nodes). Employs quick DAG verifications and bounded iterator loops.
*   **Performance Optimizations (v0.6.0 ⚡)**: Combines a new `.sqldagflow` persistent disk cache with visibility-based selective processing to make large DAG refreshes virtually instantaneous.
*   **Performance Overhaul (New in v0.7.0 ⚡)**: Scoped parsing keeps the heavy `sqlglot` work proportional to your view; the Data Dictionary export no longer parses the entire project just to export a handful of models; upstream/downstream counts are computed in a single topological pass instead of one graph traversal per node; and the canvas virtualizes off-screen nodes and stops re-rendering every node on each refresh.
*   **Batch Hide from Toolbar**: Select multiple nodes → click "Hide" in the selection toolbar to hide them all at once.
*   **Discovery Mode Fix**: Ghost nodes from Discovery Mode are now hidden when their connected source nodes are hidden, preventing orphan ghost nodes.

### 🎨 Linear-Inspired UI (New in v0.4.6 ✨)
*   **Design Token System**: ~80 CSS custom properties for consistent theming across all components.
*   **Premium Dark Theme**: Deep `#0d0d0d` canvas with warm white text (`#e8e8e6`), never pure white.
*   **Refined Light Theme**: Warm off-white `#f7f6f3` backgrounds — never harsh pure white.
*   **Glassmorphism Toolbars**: `backdrop-filter: blur(16px)` on all floating panels.
*   **Violet-Indigo Accent**: Premium `#7c6aef` accent color replacing generic blues/greens.
*   **Smooth Animations**: `fadeIn` and `slideUp` micro-animations on popovers and modals.
*   **Custom Scrollbars**: Subtle, styled scrollbars matching the theme.
*   **Focus Rings**: Accessible focus indicators using the accent color.

### ⚙️ Customization & Export
*   **Premium UI**:
    *   **Themes**: Toggle between Light and Dark modes.
    *   **Palettes**: Choose from **Standard**, **Vivid**, **Pastel**, or **Linear** (LCH-inspired tones) color schemes.
    *   **Styles**: Switch between "Full" (colored body) and "Minimal" (colored border) node styles.
*   **Export Dictionary**: Generate and download a comprehensive Markdown Data Dictionary report of your entire DAG.
*   **Export Graph**: Save high-resolution **PNG** or vector **SVG** diagrams for documentation.

---

## 🎨 Visual Legend & Color Palettes

SQL DAG Flow uses distinct colors to identify node types. You can switch between these palettes in the Settings.

| Node Type | Layer / Meaning | Standard | Vivid | Pastel | Linear |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bronze** | Raw Ingestion | 🟤 Brown (`#8B4513`) | 🟠 Warm (`#E8734A`) | 🟤 Sand (`#DCC1B0`) | 🟤 Muted (`#B08968`) |
| **Silver** | Cleaned / Conformed | ⚪ Gray (`#708090`) | 🔵 Ocean (`#5CA8D3`) | ⚪ Fog (`#B8C5D0`) | ⚪ Slate (`#8E99A4`) |
| **Gold** | Business Aggregates | 🟡 Gold (`#DAA520`) | 🟡 Amber (`#F0C75E`) | 🟡 Cream (`#F0E4B8`) | 🟡 Warm (`#D4A843`) |
| **External** | Missing / Ghost Node | 🟠 Rust (`#C06430`) | 🟠 Spice (`#E8943A`) | 🟠 Peach (`#E8D0A8`) | 🟠 Sand (`#CC8B5E`) |
| **Procedure** | Stored Procedure (executable logic) | 🟣 Violet (`#6A4C93`) | 🟣 Iris (`#8B5CF6`) | 🟣 Lilac (`#CBBCE8`) | 🟣 Muted (`#8A7CA8`) |
| **CTE** | Internal Common Table Expression | 💖 Pink (`#E91E63`) | 💜 Rose (`#D45B8C`) | 🌸 Blush (`#DAAFC0`) | 💜 Mauve (`#C77092`) |
| **Other** | Uncategorized | 🔵 Teal (`#4CA1AF`) | 💠 Aqua (`#4AABB8`) | 🧊 Mist (`#A8D0D8`) | 🔵 Ocean (`#6B9DAD`) |

---

## 📦 Installation

Install easily via `pip`:

```bash
pip install sql-dag-flow
```

To update to the latest version (**v0.9.2**):

```bash
pip install --upgrade sql-dag-flow
```

---

## ▶️ Usage

### 1. Command Line Interface (CLI)

Run directly from your terminal:

```bash
# Analyze the current directory
sql-dag-flow

# Analyze a specific SQL project
sql-dag-flow /path/to/my/dbt_project
```

### 2. Check your version

```bash
sql-dag-flow --version      # -> sql-dag-flow 0.9.2
```

The version is also shown in the bottom-right corner of the app, so you can always tell which build you are looking at. It is read from the installed package metadata, so it can never drift from the release.

To force an upgrade to the newest published release:

```bash
pip install --upgrade --force-reinstall sql-dag-flow
```

If you installed from a local checkout (`pip install -e .`), re-run that command after pulling, or the reported version stays frozen at whatever was installed.

### 3. Python API

Integrate into your workflows:

```python
from sql_dag_flow import start

# Start the server and open the browser
start(directory="./my_sql_project")
```

---

## 📂 Project Structure Expectations

SQL DAG Flow looks for standard Medallion Architecture naming conventions:

*   **Bronze Layer**: Folders named `bronze`, `raw`, `landing`, or `staging`.
*   **Silver Layer**: Folders named `silver`, `intermediate`, or `conformed`.
*   **Gold Layer**: Folders named `gold`, `mart`, `serving`, or `presentation`.
*   **Other**: Any other folder is categorized as "Other" (Teal).

---

## 🤝 Contributing

Contributions are welcome!
1.  Fork the repository.
2.  Create a feature branch.
3.  Submit a Pull Request.

---
*Created by [Flavio Sandoval](https://github.com/dsandovalflavio)*
