# SQL DAG Flow

**SQL DAG Flow** is a powerful, open-source visualization tool designed to automatically map and visualize the lineage of your SQL data pipelines.

Built specifically for modern data stacks using the **Medallion Architecture** (Bronze, Silver, Gold), it parses your SQL files to generate an interactive, dependency-aware Directed Acyclic Graph (DAG).

![SQL DAG Flow Screenshot](/images/sql-architecture-logo.png)

## 🚀 Key Features

*   **Automatic Parsing & Visualization**: Recursively scans your project folders to find `.sql` files and detect dependencies (`FROM`, `JOIN`, `CTE`s) using `sqlglot`.
*   **Medallion Architecture Support**: Automatically categorizes and colors nodes based on folder structure:
    *   🟤 **Bronze**: Raw ingestion layers.
    *   ⚪ **Silver**: Cleaned and conformed data.
    *   🟡 **Gold**: Business-level aggregates.
*   **Smart Folder Selection**:
    *   **Selective Exploration**: Choose specific subfolders to analyze using an interactive tree view.
    *   **Deep Filtering**: Focus only on relevant parts of your pipeline.
*   **Advanced Organization**:
    *   **Selection Toolbar**: Multi-select nodes and align them horizontally/vertically.
    *   **Node Hiding**: Hide specific nodes or entire trees to declutter the view.
    *   **Auto Layout**: Automatically arrange nodes using Dagre layout engine.
*   **Configuration Management**:
    *   **Save & Load**: Persist your layouts, hidden nodes, and viewport settings to JSON.
    *   **Workspaces**: manage multiple project configurations.
*   **Rich Metadata**:
    *   **Details Panel**: View full SQL content and schema details.
    *   **Annotations**: Add sticky notes with **Markdown support**, resize them, and create visual groups.
*   **Visual Cues**:
    *   **Solid Border**: Indicates a Table.
    *   **Dashed Border**: Indicates a View (auto-detected).
*   **Premium UI/UX**:
    *   **Dark/Light Modes**: Themed for your preference.
    *   **Export**: Save as high-resolution **PNG** or vector **SVG**.

## 🌍 Supported Dialects

Powered by `sqlglot`, supporting:
*   **BigQuery** (Default)
*   **Snowflake**
*   **PostgreSQL**
*   **Spark / Databricks**
*   **Amazon Redshift**
*   **DuckDB**
*   **MySQL**
*   ...and more.

## 📦 Installation

Install easily via `pip`:

```bash
pip install sql-dag-flow
```

## ▶️ Usage

### 1. Command Line Interface (CLI)

You can run the tool directly from your terminal:

```bash
# Analyze the current directory
sql-dag-flow

# Analyze a specific SQL project
sql-dag-flow /path/to/my/dbt_project
```

### 2. Python API

Integrate it into your Python scripts or notebooks:

```python
from sql_dag_flow import start

# Start the server and open the browser
start(directory="./my_sql_project")
```

## 📂 Project Structure Expectations

SQL DAG Flow is opinionated but flexible. It looks for standard Medallion Architecture naming conventions to assign colors:

*   **Bronze Layer**: Any folder named `bronze`, `raw`, `landing`, or `staging`.
*   **Silver Layer**: Any folder named `silver`, `intermediate`, or `conformed`.
*   **Gold Layer**: Any folder named `gold`, `mart`, `serving`, or `presentation`.
*   **Other**: Any other folder is categorized as "Other" (Gray).

## 🛠️ Configuration & Customization

### Settings
Click the **Settings (Gear)** icon in the bottom toolbar to:
*   **Change SQL Dialect**: Ensure your specific SQL syntax is parsed correctly.
*   **Toggle Node Style**: Switch between "Full" (colored body) and "Minimal" (colored border) styles.
*   **Change Palette**: Switch between Standard, Vivid, and Pastel color palettes.

### Saving Layouts
Your graph layout (positions, hidden nodes) is **not** permanent by default. To save your work:
1.  Click **Save** in the top bar.
2.  Choose a filename (e.g., `marketing_flow.json`).
3.  Next time, click **Load** to restore that exact view.

## 🤝 Contributing

Contributions are welcome!
1.  Fork the repository.
2.  Create a feature branch.
3.  Submit a Pull Request.

---
*Created by [Flavio Sandoval](https://github.com/dsandovalflavio)*
