export const API_URL = 'http://localhost:8000';

// config can be an object { dialect: '...', discovery: true/false }
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
export const fetchFilteredGraph = async (subfolders, dialect = 'bigquery', discovery = false) => {
    try {
        const response = await fetch(`${API_URL}/graph/filtered`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify({ subfolders, dialect, discovery }),
        });
        return await response.json();
    } catch (error) {
        console.error("Error fetching filtered graph:", error);
        return { nodes: [], edges: [], error: "Failed to fetch graph" };
    }
};
