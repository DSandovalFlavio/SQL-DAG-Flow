// In production, frontend is served by FastAPI so origin works.
// In development (Vite on 5173), we need to point to the backend port.
const isDev = typeof window !== 'undefined' && window.location.port === '5173';
export const API_URL = isDev ? 'http://localhost:8000' : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

// config can be an object { dialect: '...', discovery: true/false, visible_node_ids: '...' }
export const fetchGraph = async (config = {}) => {
    try {
        const queryParams = new URLSearchParams({ ...config, t: Date.now() }).toString();
        const response = await fetch(`${API_URL}/graph?${queryParams}`);
        if (!response.ok) throw new Error("Failed to fetch graph");
        return await response.json();
    } catch (error) {
        console.error(error);
        return { nodes: [], edges: [] };
    }
};

export const saveGraph = async (data) => {
    try {
        const response = await fetch(`${API_URL}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return await response.json();
    } catch (error) {
        console.error(error);
        return { error: error.message };
    }
};

export const loadGraphState = async (path = ".", filename = "sql_diagram.json") => {
    try {
        const response = await fetch(`${API_URL}/load?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`);
        if (!response.ok) return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
        return await response.json();
    } catch (error) {
        console.error(error);
        return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    }
};

export const fetchConfigFiles = async (path = ".") => {
    try {
        const response = await fetch(`${API_URL}/config_files?path=${encodeURIComponent(path)}`);
        if (!response.ok) return { files: [] };
        return await response.json();
    } catch (error) {
        console.error(error);
        return { files: [] };
    }
};



export const setPath = async (path) => {
    try {
        const response = await fetch(`${API_URL}/config/path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        if (!response.ok) throw new Error("Failed to set path");
        return await response.json();
    } catch (error) {
        console.error(error);
        return { error: error.message };
    }
};

export const getPath = async () => {
    try {
        const response = await fetch(`${API_URL}/config/path`);
        return await response.json();
    } catch (error) {
        return { path: '' };
    }
};

export const scanFolders = async (path) => {
    try {
        const response = await fetch(`${API_URL}/scan/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        return await response.json();
    } catch (error) {
        console.error("Error scanning folders:", error);
        return { folders: [] };
    }
};

// subfolders is array, dialect is string
export const fetchFilteredGraph = async (subfolders, dialect = 'bigquery', discovery = false, expanded_nodes = {}, visible_node_ids = null, discovery_filter = 'all') => {
    try {
        const response = await fetch(`${API_URL}/graph/filtered`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify({ subfolders, dialect, discovery, expanded_nodes, visible_node_ids, discovery_filter }),
        });
        return await response.json();
    } catch (error) {
        console.error("Error fetching filtered graph:", error);
        return { nodes: [], edges: [], error: "Failed to fetch graph" };
    }
};

// Parse + build only the given node ids (a saved/curated view). Fast path that
// never re-parses the whole project nor pulls in newly-added files.
export const fetchScopedGraph = async (nodeIds, dialect = 'bigquery', discovery = false, expanded_nodes = {}, discovery_filter = 'all') => {
    try {
        const response = await fetch(`${API_URL}/graph/scoped`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            body: JSON.stringify({ node_ids: nodeIds, dialect, discovery, expanded_nodes, discovery_filter }),
        });
        return await response.json();
    } catch (error) {
        console.error("Error fetching scoped graph:", error);
        return { nodes: [], edges: [], error: "Failed to fetch scoped graph" };
    }
};

// Fast filesystem-only diff: which .sql models exist on disk but aren't known yet.
export const scanNewModels = async (knownIds = []) => {
    try {
        const response = await fetch(`${API_URL}/scan/new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ known_ids: knownIds }),
        });
        if (!response.ok) return { new: [] };
        return await response.json();
    } catch (error) {
        console.error("Error scanning for new models:", error);
        return { new: [] };
    }
};

// Which .sql models changed in git (working tree, plus vs a base branch if given).
export const fetchGitChanges = async (base = "") => {
    try {
        const q = base ? `?base=${encodeURIComponent(base)}` : "";
        const response = await fetch(`${API_URL}/git/changes${q}`);
        if (!response.ok) return { is_git: false, changed: [] };
        return await response.json();
    } catch (error) {
        console.error("Error fetching git changes:", error);
        return { is_git: false, changed: [] };
    }
};

export const fetchGitBranches = async () => {
    try {
        const response = await fetch(`${API_URL}/git/branches`);
        if (!response.ok) return { is_git: false, branches: [] };
        return await response.json();
    } catch (error) {
        console.error("Error fetching git branches:", error);
        return { is_git: false, branches: [] };
    }
};

export const moveFile = async (currentPath, targetLayer) => {
    try {
        const response = await fetch(`${API_URL}/files/move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ current_path: currentPath, target_layer: targetLayer }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to move file");
        return data;
    } catch (error) {
        console.error("Error moving file:", error);
        throw error;
    }
};

export const exportDataDictionary = async (dialect = 'bigquery', visibleNodeIds = null) => {
    try {
        const response = await fetch(`${API_URL}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dialect, visible_node_ids: visibleNodeIds }),
        });
        if (!response.ok) throw new Error("Failed to export");
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data_dictionary.md';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return { success: true };
    } catch (error) {
        console.error("Error exporting:", error);
        return { error: error.message };
    }
};
