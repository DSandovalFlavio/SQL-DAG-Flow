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
*   **2. Automated Architecture Documentation**:
    *   *The Problem*: Architecture diagrams in Lucidchart or Visio are always outdated.
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

### 🎮 Interactive Graph
*   **Smart Context Menu**:
    *   **Focus Tree**: Isolate a node and its lineage (ancestors + descendants) to declutter the view.
    *   **Select Tree**: One-click selection of an entire dependency chain for easy movement.
    *   **Hide/Show**: Toggle visibility of individual nodes or full branches.
*   **Advanced Navigation**:
    *   **Sidebar**: Grouped list of nodes with usage counts and click-to-center navigation.
    *   **Details Panel**: View formatted SQL code, schema info, and configure node settings.

### 📝 Notes & Annotations
*   **Center Placement**: New notes spawn exactly in the center of your view.
*   **Rich Styling**:
    *   **Markdown Support**: Write rich text notes.
    *   **Transparent & Borderless**:Create clean, floating text labels without boxes.
    *   **Groups**: Create visual containers to group related nodes.

### ⚙️ Customization
*   **Premium UI**:
    *   **Themes**: Toggle between Light and Dark modes.
    *   **Palettes**: Choose from Standard, Vivid, or Pastel color schemes to match your presentation style.
    *   **Styles**: Switch between "Full" (colored body) and "Minimal" (colored border) node styles.
*   **Export**: Save high-resolution **PNG** or vector **SVG** diagrams for documentation.

---

## 🎨 Visual Legend & Color Palettes

SQL DAG Flow uses distinct colors to identify node types. You can switch between these palettes in the Settings.

| Node Type | Layer / Meaning | Standard | Vivid | Pastel |
| :--- | :--- | :--- | :--- | :--- |
| **Bronze** | Raw Ingestion | 🟤 Brown (`#8B4513`) | 🟠 Orange (`#FF5722`) | 🟤 Pale Brown (`#D7CCC8`) |
| **Silver** | Cleaned / Conformed | ⚪ Gray (`#708090`) | 🔵 Blue (`#29B6F6`) | ⚪ Blue Grey (`#CFD8DC`) |
| **Gold** | Business Aggregates | 🟡 Gold (`#DAA520`) | 🟡 Yellow (`#FFEB3B`) | 🟡 Pale Yellow (`#FFF9C4`) |
| **External** | Missing / Ghost Node | 🟠 Dark Orange (`#D35400`) | 🟠 Neon Orange (`#FF9800`) | 🟠 Peach (`#FFE0B2`) |
| **CTE** | Internal Common Table Expression | 💖 Pink (`#E91E63`) | 💗 Deep Pink (`#F50057`) | 🌸 Light Pink (`#F8BBD0`) |
| **Other** | Uncategorized | 🔵 Teal (`#4CA1AF`) | 💠 Cyan (`#00BCD4`) | 🧊 Pale Cyan (`#B2EBF2`) |

---

## 📦 Installation

Install easily via `pip`:

```bash
pip install sql-dag-flow
```

To update to the latest version (**v0.2.0**):

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
