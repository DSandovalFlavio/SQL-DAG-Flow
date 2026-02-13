const API_URL = 'http://localhost:8000';

export const fetchGraph = async () => {
    try {
        const response = await fetch(`${API_URL}/graph`);
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

export const loadGraphState = async () => {
    try {
        const response = await fetch(`${API_URL}/load`);
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.error(error);
        return {};
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

export const fetchFilteredGraph = async (subfolders) => {
    try {
        const response = await fetch(`${API_URL}/graph/filtered`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subfolders }),
        });
        return await response.json();
    } catch (error) {
        console.error("Error fetching filtered graph:", error);
        return { nodes: [], edges: [], error: "Failed to fetch graph" };
    }
};
