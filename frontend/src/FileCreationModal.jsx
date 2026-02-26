
import React, { useState, useEffect } from 'react';
import { X, Save, FileCode } from 'lucide-react';
import { API_URL } from './api';

const FileCreationModal = ({ isOpen, nodeData, onClose, onFileCreated, theme, basePath }) => {
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && nodeData) {
            const parts = nodeData.id.split('.');
            let suggestedPath = '';
            let tableName = '';
            if (parts.length > 1) {
                suggestedPath = `${parts[0]}/${parts[1]}.sql`;
                tableName = nodeData.id;
            } else {
                suggestedPath = `${parts[0]}.sql`;
                tableName = parts[0];
            }
            setPath(suggestedPath);
            setContent(`-- Created automatically for ${nodeData.id}\n\nCREATE OR REPLACE TABLE \`${tableName}\` AS\nSELECT\n    -- Add columns here\n    1 as id\n`);
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
            if (!response.ok) throw new Error(data.detail || 'Failed to create file');
            if (onFileCreated) onFileCreated(data.path);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                backgroundColor: 'var(--surface-overlay)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                zIndex: 2000, backdropFilter: 'blur(8px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'var(--surface-elevated)',
                    borderRadius: '16px', width: '700px', maxWidth: '95vw', maxHeight: '90vh',
                    boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border-default)',
                    display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
                    animation: 'fadeIn 0.2s ease-out'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid var(--border-default)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--surface-secondary)', flexShrink: 0,
                    borderTopLeftRadius: '16px', borderTopRightRadius: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '6px', background: 'var(--accent-muted)', borderRadius: '8px' }}>
                            <FileCode size={20} color="var(--accent-primary)" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.02em' }}>Create SQL File</h3>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                For ghost node: {nodeData?.id}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, minHeight: '0' }}>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>FILE PATH</label>
                        <input
                            value={path}
                            onChange={e => setPath(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: '8px',
                                border: '1px solid var(--border-default)', background: 'var(--surface-primary)',
                                color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                                fontFamily: "'SF Mono', 'Fira Code', Consolas, Monaco, monospace",
                                boxSizing: 'border-box', transition: 'border-color 0.15s ease'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border-default)'}
                            placeholder="models/example.sql"
                        />
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            Relative to: {basePath || 'Project Root'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>INITIAL CONTENT</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '8px',
                                border: '1px solid var(--border-default)', background: 'var(--surface-primary)',
                                color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                                fontFamily: "'SF Mono', 'Fira Code', Consolas, Monaco, monospace",
                                boxSizing: 'border-box', lineHeight: '1.5', resize: 'none',
                                height: 'auto', minHeight: '200px', flex: 1,
                                transition: 'border-color 0.15s ease'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border-default)'}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '10px 12px', borderRadius: '8px',
                            background: 'rgba(248, 113, 113, 0.08)',
                            borderLeft: '3px solid var(--status-error)',
                            color: 'var(--status-error)', fontSize: '13px'
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 20px', borderTop: '1px solid var(--border-default)',
                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                    background: 'var(--surface-secondary)', flexShrink: 0,
                    borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px', borderRadius: '8px', border: 'none',
                            background: 'transparent', color: 'var(--text-secondary)',
                            fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                            transition: 'background 0.15s ease'
                        }}
                    >Cancel</button>
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        style={{
                            padding: '10px 20px', borderRadius: '8px', border: 'none',
                            background: 'var(--accent-primary)', color: 'white',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            opacity: loading ? 0.7 : 1,
                            boxShadow: 'var(--shadow-sm)',
                            transition: 'opacity 0.15s ease'
                        }}
                    >
                        {loading ? 'Creating...' : (<><Save size={16} /> Create File</>)}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FileCreationModal;
