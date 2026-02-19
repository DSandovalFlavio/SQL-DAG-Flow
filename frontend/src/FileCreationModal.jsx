
import React, { useState, useEffect } from 'react';
import { X, Save, FileCode } from 'lucide-react';
import { API_URL } from './api';

const FileCreationModal = ({ isOpen, nodeData, onClose, onFileCreated, theme, basePath }) => {
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isDark = theme === 'dark';

    // Initialize state when modal opens
    useEffect(() => {
        if (isOpen && nodeData) {
            // Predict path based on node ID (schema.table)
            const parts = nodeData.id.split('.');
            let suggestedPath = '';
            let tableName = '';

            if (parts.length > 1) {
                // schema.table -> schema/table.sql
                suggestedPath = `${parts[0]}/${parts[1]}.sql`;
                tableName = nodeData.id;
            } else {
                // table -> table.sql
                suggestedPath = `${parts[0]}.sql`;
                tableName = parts[0];
            }

            setPath(suggestedPath);
            setContent(`-- Created automatically for ${nodeData.id}

CREATE OR REPLACE TABLE \`${tableName}\` AS
SELECT
    -- Add columns here
    1 as id
`);
            setError(null);
        }
    }, [isOpen, nodeData]);

    if (!isOpen) return null;

    const handleCreate = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/files/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to create file');
            }

            if (onFileCreated) onFileCreated(data.path);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(5px)'
    };

    const modalStyle = {
        backgroundColor: isDark ? '#1e1e1e' : '#fff',
        borderRadius: '12px',
        width: '700px', // Wider
        maxWidth: '95vw',
        maxHeight: '90vh', // use viewport height
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        border: isDark ? '1px solid #333' : '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box' // Ensure padding doesn't affect width
    };

    const headerStyle = {
        padding: '16px 20px',
        borderBottom: isDark ? '1px solid #333' : '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: isDark ? '#252525' : '#f9f9f9',
        flexShrink: 0 // Don't shrink
    };

    const bodyStyle = {
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto', // Scroll content only
        flex: 1, // Take remaining space
        minHeight: '0' // Fix flex scrolling issue
    };

    const labelStyle = {
        fontSize: '12px',
        fontWeight: '600',
        color: isDark ? '#aaa' : '#666',
        marginBottom: '4px',
        display: 'block'
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '6px',
        border: isDark ? '1px solid #444' : '1px solid #ddd',
        background: isDark ? '#333' : '#fff',
        color: isDark ? '#fff' : '#000',
        fontSize: '14px',
        outline: 'none',
        fontFamily: "'Consolas', 'Monaco', monospace",
        boxSizing: 'border-box' // Critical for width: 100%
    };

    const footerStyle = {
        padding: '16px 20px',
        borderTop: isDark ? '1px solid #333' : '1px solid #eee',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        background: isDark ? '#252525' : '#f9f9f9',
        flexShrink: 0, // Don't shrink
        borderBottomLeftRadius: '12px',
        borderBottomRightRadius: '12px'
    };

    const buttonStyle = {
        padding: '8px 16px',
        borderRadius: '6px',
        border: 'none',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'opacity 0.2s'
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '6px', background: 'rgba(52, 152, 219, 0.15)', borderRadius: '6px' }}>
                            <FileCode size={20} color="#3498db" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, color: isDark ? '#fff' : '#000', fontSize: '16px' }}>Create SQL File</h3>
                            <div style={{ fontSize: '11px', color: isDark ? '#888' : '#666', marginTop: '2px' }}>
                                For ghost node: {nodeData?.id}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: isDark ? '#aaa' : '#999', cursor: 'pointer' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={bodyStyle}>
                    <div>
                        <label style={labelStyle}>FILE PATH</label>
                        <input
                            value={path}
                            onChange={e => setPath(e.target.value)}
                            style={inputStyle}
                            placeholder="models/example.sql"
                        />
                        <div style={{ fontSize: '10px', color: isDark ? '#666' : '#999', marginTop: '4px' }}>
                            Relative to: {basePath || 'Project Root'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label style={labelStyle}>INITIAL CONTENT</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            style={{
                                ...inputStyle,
                                height: 'auto',
                                minHeight: '200px',
                                flex: 1, // Grow to fill space
                                resize: 'none',
                                fontFamily: "'Consolas', 'Monaco', monospace",
                                fontSize: '13px',
                                lineHeight: '1.5'
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '10px',
                            background: 'rgba(231, 76, 60, 0.1)',
                            borderLeft: '3px solid #e74c3c',
                            color: isDark ? '#ff6b6b' : '#c0392b',
                            fontSize: '13px'
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                <div style={footerStyle}>
                    <button
                        onClick={onClose}
                        style={{ ...buttonStyle, background: 'transparent', color: isDark ? '#aaa' : '#666' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        style={{
                            ...buttonStyle,
                            background: '#2ecc71',
                            color: '#fff',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'Creating...' : (
                            <>
                                <Save size={16} /> Create File
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FileCreationModal;
