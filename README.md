# SQL DAG Flow

**SQL DAG Flow** is a powerful, open-source visualization tool designed to automatically map and visualize the lineage of your SQL data pipelines.

Built specifically for modern data stacks using the **Medallion Architecture** (Bronze, Silver, Gold), it parses your SQL files to generate an interactive, dependency-aware Directed Acyclic Graph (DAG).

Created by **@dsandovalflavio**.

![SQL DAG Flow Screenshot](/images/sql-architecture-logo.png)

## 🚀 Key Features

*   **Automatic Parsing & Visualization**: Recursively scans your project folders to find `.sql` files and detect dependencies (`FROM`, `JOIN`, `CTE`s) using `sqlglot`.
*   **Medallion Architecture Support**: Automatically categories and colors nodes based on folder structure (Bronze 🟤, Silver ⚪, Gold 🟡).
*   **Smart Folder Selection**:
    *   **Selective Exploration**: Choose specific subfolders to scan using an interactive tree view.
    *   **Deep Filtering**: Include/exclude nested folders to focus only on relevant parts of your pipeline.
*   **Advanced Graph Controls**:
    *   **Node Hiding**: Hide specific nodes or entire trees to declutter the view.
    *   **Auto Layout**: Automatically arrange nodes for optimal readability with one click.
    *   **Interactive Sidebar**: Search, filter, and manage visibility of all nodes from a dedicated panel.
*   **Configuration Management**:
    *   **Save & Load**: Save your current layout, hidden nodes, and viewport state to JSON files.
    *   **Workspaces**: Switch between different project configurations easily.
*   **Rich Metadata & Annotations**:
    *   **Details Panel**: View full SQL content, schema details, and dependency statistics.
    *   **Annotations**: Add sticky notes and visual groups to document your architecture directly on the canvas.
*   **Premium UI/UX**:
    *   **Theme Support**: Toggle between Light ☀️ and Dark 🌙 modes.
    *   **Customizable Views**: Switch between "Full" and "Minimal" node styles.
    *   **HD Export**: Export your diagram as high-resolution **PNG** or vector **SVG** for presentations.

## 🌍 Supported Dialects

**SQL DAG Flow** uses the robust `sqlglot` library, supporting a wide range of SQL dialects:

*   **BigQuery** (Default)
*   **Snowflake**
*   **PostgreSQL**
*   **Spark / Databricks**
*   **Amazon Redshift**
*   **DuckDB**
*   **MySQL**
*   ...and many more!

## 📋 Prerequisites

*   **Python**: 3.8+
*   **Node.js**: 16+ (Only required for *development* of the frontend)

## 🛠️ Project Structure

**SQL DAG Flow** is structured as a standard Python package:

```text
sql-dag-flow/
├── src/
│   └── sql_dag_flow/
│       ├── static/      # Compiled React Frontend
│       ├── main.py      # Entry point
│       └── parser.py    # SQL Parser
├── pyproject.toml       # Package Configuration
└── README.md
```

## 📦 Installation & Setup

### 🚀 User Installation (Recommended)

Install the tool directly via `pip`. This will command-line tool `sql-dag-flow` to your system.

```bash
# From source directory
pip install .
```

### 🛠️ Developer Setup

If you want to contribute to the codebase:

1.  **Clone the repository**.
2.  **Install in Editable Mode**:
    ```bash
    pip install -e .
    ```
3.  **Frontend Development** (Optional):
    If you need to modify the UI:
    ```bash
    cd frontend
    npm install
    npm run dev  # Starts dev server on port 5173
    ```

## ▶️ Usage

Once installed, use the CLI command from anywhere:

```bash
# Open the current directory
sql-dag-flow

# Open a specific project
sql-dag-flow /path/to/my/sql/project
```

### Features Review

*   **Interactive Graph**: Zoom, pan, and drag nodes.
*   **Filtering**: Select specific subfolders to analyze.
*   **Search**: Find tables quickly using the sidebar.
*   **Export**: Save your diagram as PNG or SVG.
*   **Config**: Save and load your layout configurations.

## 🤝 Contributing

Contributions are welcome! Please verify the `LICENSE` and submit a Pull Request.

---
*Developed with ❤️ by [@dsandovalflavio](https://github.com/dsandovalflavio)*
