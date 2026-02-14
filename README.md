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

*   **Python**: 3.8+ (for the backend parser)
*   **Node.js**: 16+ (for the frontend visualization)

## 🛠️ Project Structure

**SQL DAG Flow** is optimized for the Medallion structure but flexible enough for any layout:

```text
my-data-project/
├── bronze/
│   ├── raw_users.sql
│   └── ...
├── silver/
│   ├── cleaned_users.sql
│   └── ...
└── gold/
    ├── user_stats.sql
    └── ...
```

## 📦 Installation & Setup

### 1. Backend Setup

Navigate to the `backend` folder and install Python dependencies.

```bash
cd backend
pip install -r requirements.txt
```

### 2. Frontend Setup

Navigate to the `frontend` folder and install Node dependencies.

```bash
cd frontend
npm install
```

## ▶️ Running the Application

 We have provided a handy script to start both services at once.

**Windows (PowerShell):**
```powershell
.\start_app.ps1
```

Or manually:

1.  **Backend**: `python backend/main.py` (Runs on port 8000)
2.  **Frontend**: `npm run dev` (Runs on port 5173)

## 🎮 Usage

1.  Open your browser at `http://localhost:5173`.
2.  **Open Project**: Click **Open** in the top bar and enter your SQL project path.
3.  **Select Folders**: Choose which subfolders to include in your visualization.
4.  **Explore**:
    *   **Left Sidebar**: Manage node visibility and search.
    *   **Right Panel**: Click a node to view SQL code and details.
    *   **Bottom Toolbar**: Change themes, layouts, and add annotations.
5.  **Save/Export**: Save your configuration or export the image via the top bar.

## 🤝 Contributing

Contributions are welcome! Please feel free to verify the `LICENSE` and submit a Pull Request.

---
*Developed with ❤️ by [@dsandovalflavio](https://github.com/dsandovalflavio)*
