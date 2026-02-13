# SQL DAG Flow

**SQL DAG Flow** is a powerful, open-source visualization tool designed to automatically map and visualize the lineage of your SQL data pipelines.

Built specifically for modern data stacks using the **Medallion Architecture** (Bronze, Silver, Gold), it parses your SQL files to generate an interactive, dependency-aware Directed Acyclic Graph (DAG).

Created by **@dsandovalflavio**.

![SQL DAG Flow Screenshot](/images/sql-architecture-logo.png)

## 🚀 Key Features

*   **Automatic Parsing**: Recursively scans your project folders to find `.sql` files and detect dependencies (`FROM`, `JOIN`, `CTE`s).
*   **Medallion Architecture Support**: Automatically categorizes nodes into **Bronze**, **Silver**, and **Gold** layers based on folder structure.
*   **Interactive Visualization**:
    *   **Drag & Drop**: Organize your layout intuitively.
    *   **MiniMap**: Navigate large pipelines with ease.
    *   **Layer Filtering**: Toggle Bronze/Silver/Gold layers on the fly.
*   **Metadata Rich**: View full SQL content, schema details, and nested dependency counts for every node.
*   **Annotations**: Add sticky notes and groups to document your architecture directly on the canvas.
*   **Export Ready**: One-click PNG export with a clean, professional look (hides UI controls automatically).

## 🌍 Supported Dialects

**SQL DAG Flow** uses the robust `sqlglot` library for parsing.

*   **Current Default**: `BigQuery` (GoogleSQL)
*   **Extensible Support**: The parser can be easily configured to support any of the following dialects:
    *   ❄️ **Snowflake**
    *   🐘 **PostgreSQL**
    *   ✨ **Spark / Databricks**
    *   🔴 **Amazon Redshift**
    *   🦆 **DuckDB**
    *   🐬 **MySQL**
    *   🐘 **Trino / Presto**
    *   🗄️ **Oracle**
    *   ...and many more!

## 📋 Prerequisites

*   **Python**: 3.8+ (for the backend parser)
*   **Node.js**: 16+ (for the frontend visualization)

## 🛠️ Project Structure

**SQL DAG Flow** expects your SQL project to follow a standard structure (though it is flexible). Ideally:

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

The tool will scan all subfolders. It uses the folder names to assign colors and layers:
*   `bronze` → 🟤 Bronze Layer
*   `silver` → ⚪ Silver Layer
*   `gold` → 🟡 Gold Layer

## 📦 Installation & Setup

### 1. Backend Setup

Navigate to the `backend` folder and install Python dependencies.

```bash
cd backend
pip install -r requirements.txt
```

*(Ensure you have `flask`, `sqlglot`, and `networkx` installed)*

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

1.  **Backend**: `python backend/app.py` (Runs on port 5000)
2.  **Frontend**: `npm run dev` (Runs on port 5173)

## 🎮 Usage

1.  Open your browser at `http://localhost:5173`.
2.  Click the **Folder Icon** (📂) in the bottom ribbon.
3.  Enter the absolute path to your SQL project folder.
4.  **SQL DAG Flow** will scan, parse, and visualize your entire pipeline!

## 🤝 Contributing

Contributions are welcome! Please feel free to verify the `LICENSE` and submit a Pull Request.

---
*Developed with ❤️ by [@dsandovalflavio](https://github.com/dsandovalflavio)*
