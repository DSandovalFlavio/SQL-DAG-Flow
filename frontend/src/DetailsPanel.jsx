import React, { useState, useEffect, useCallback } from 'react';
import { Globe, FilePlus, X } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

const DetailsPanel = ({
    node,
    onClose,
    onUpdateNode,
    onCreateFile,
    theme,
    onDelete
}) => {
    const [width, setWidth] = useState(450);
    const [isDragging, setIsDragging] = useState(false);

    // Theme-based styles
    const isDark = theme === 'dark';
    const bg = isDark ? '#1a1a1a' : '#fff';
    const textColor = isDark ? '#fff' : '#000';
    const borderColor = isDark ? '#444' : '#ddd';
    const highlightStyle = isDark ? vscDarkPlus : vs;

    const startResizing = useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        setIsDragging(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsDragging(false);
    }, []);

    const resize = useCallback((mouseMoveEvent) => {
        if (isDragging) {
            // Calculate new width based on mouse position from right edge of screen
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            const maxWidth = window.innerWidth * 0.75; // Max 3/4 of screen width

            if (newWidth > 300 && newWidth < maxWidth) {
                setWidth(newWidth);
            }
        }
    }, [isDragging]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isDragging, resize, stopResizing]);

    if (!node) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            right: 0,
            width: `${width}px`,
            height: 'calc(100% - 60px)',
            background: bg,
            borderLeft: `1px solid ${borderColor}`,
            zIndex: 1000,
            boxSizing: 'border-box',
            boxShadow: '-5px 0 30px rgba(0,0,0,0.3)',
            display: 'flex'
        }}>
            {/* Drag Handle */}
            <div
                onMouseDown={startResizing}
                style={{
                    width: '5px',
                    height: '100%',
                    cursor: 'col-resize',
                    background: isDragging ? (isDark ? '#4a90e2' : '#2196f3') : 'transparent',
                    transition: 'background 0.2s',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    zIndex: 1001
                }}
                title="Drag to resize"
            />

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, color: textColor, fontSize: '18px' }}>
                        {node.type === 'annotation' ? (node.isGroup ? 'Group Settings' : 'Note Settings') : 'Node Details'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: textColor, fontSize: '24px', cursor: 'pointer' }}>×</button>
                </div>

                {node.type === 'annotation' ? (
                    <div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, color: textColor, marginBottom: '8px' }}>Content</label>
                            <textarea
                                value={node.label}
                                onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
                                style={{ width: '100%', height: '100px', background: isDark ? '#333' : '#eee', border: 'none', color: textColor, padding: '10px', borderRadius: '8px', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, color: textColor, marginBottom: '8px' }}>Font Size (px)</label>
                            <input
                                type="number"
                                min="10"
                                max="100"
                                value={node.fontSize || 14}
                                onChange={(e) => onUpdateNode(node.id, { fontSize: parseInt(e.target.value, 10) })}
                                style={{ width: '100%', background: isDark ? '#333' : '#eee', border: 'none', color: textColor, padding: '10px', borderRadius: '8px' }}
                            />
                        </div>
                        {!node.isGroup && (
                            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={node.transparent}
                                    onChange={(e) => onUpdateNode(node.id, { transparent: e.target.checked })}
                                />
                                <label style={{ color: textColor, fontSize: '14px' }}>Transparent Background</label>
                            </div>
                        )}
                        <button
                            onClick={() => onDelete(node.id)}
                            style={{ padding: '10px 20px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', width: '100%' }}
                        >
                            🗑️ Delete {node.isGroup ? 'Group' : 'Note'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Node Name</div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: textColor }}>{node.label}</div>
                        </div>

                        {node.layer === 'external' ? (
                            <div style={{
                                padding: '16px',
                                background: 'rgba(255, 159, 28, 0.1)',
                                border: '1px solid rgba(255, 159, 28, 0.3)',
                                borderRadius: '8px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <Globe size={18} color="#ff9f1c" />
                                    <span style={{ fontWeight: '600', color: isDark ? '#ff9f1c' : '#e67e22' }}>Ghost Node</span>
                                </div>
                                <p style={{ fontSize: '12px', opacity: 0.8, color: textColor, marginBottom: '16px', lineHeight: 1.4 }}>
                                    This node is referenced in your project but the corresponding SQL file was not found.
                                </p>
                                <button
                                    onClick={() => onCreateFile(node)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: '#ff9f1c',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                    }}
                                >
                                    <FilePlus size={16} /> Create SQL File
                                </button>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div>
                                        <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Layer</div>
                                        <div style={{ fontSize: '14px', color: textColor, textTransform: 'capitalize' }}>{node.layer}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Type</div>
                                        <div style={{ fontSize: '14px', color: textColor, textTransform: 'capitalize' }}>{node.details?.type || 'Table'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Project</div>
                                        <div style={{ fontSize: '14px', color: textColor }}>{node.details?.project || '-'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Dataset</div>
                                        <div style={{ fontSize: '14px', color: textColor }}>{node.details?.dataset || '-'}</div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '10px', fontSize: '12px', opacity: 0.6, color: textColor }}>SQL Content</div>
                                <div style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: '8px',
                                    overflow: 'hidden'
                                }}>
                                    <SyntaxHighlighter
                                        language="sql"
                                        style={highlightStyle}
                                        customStyle={{
                                            margin: 0,
                                            padding: '15px',
                                            fontSize: '12px',
                                            lineHeight: 1.5,
                                            background: isDark ? '#111' : '#f9f9f9',
                                        }}
                                        wrapLongLines={true}
                                    >
                                        {node.details?.content || '-- No content found.'}
                                    </SyntaxHighlighter>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DetailsPanel;
