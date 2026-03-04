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
*   **Medallion Architecture Support**: Automatically categorizes and colors nodes based on folder structure (Bronze, Silver, Gold).
*   **Discovery Mode**: Visualize "Ghost Nodes" (missing files or external tables) and create them with a click.
*   **CTE Visualization**: Detects internal Common Table Expressions and displays them as distinct Pink nodes.
*   **Smart Layout (New 🧠)**:
    *   Powered by **ELK (Eclipse Layout Kernel)**.
    *   Minimizes edge crossings and optimizes flow direction.
    *   Intelligent "Port" handling for cleaner connections.

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
| **CTE** | Internal Common Table Expression | 💖 Pink (`#E91E63`) | 💜 Rose (`#D45B8C`) | 🌸 Blush (`#DAAFC0`) | 💜 Mauve (`#C77092`) |
| **Other** | Uncategorized | 🔵 Teal (`#4CA1AF`) | 💠 Aqua (`#4AABB8`) | 🧊 Mist (`#A8D0D8`) | 🔵 Ocean (`#6B9DAD`) |

---

## 📦 Installation

Install easily via `pip`:

```bash
pip install sql-dag-flow
```

To update to the latest version (**v0.4.9**):

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

### 2. Python API

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
