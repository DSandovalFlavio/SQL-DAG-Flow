import React, { memo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';

const AnnotationNode = ({ id, data, selected }) => {
    const [hovered, setHovered] = useState(false);
    const isDark = data.theme === 'dark';

    return (
        <>
            <NodeResizer
                minWidth={150}
                minHeight={50}
                isVisible={selected}
                lineStyle={{ border: '1px solid var(--border-strong)' }}
                handleStyle={{ width: 8, height: 8 }}
            />
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    padding: '15px',
                    height: '100%',
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    background: data.isGroup ? 'rgba(255, 255, 255, 0.03)' : (data.transparent ? 'transparent' : 'var(--surface-elevated)'),
                    border: data.borderless ? 'none' : (data.isGroup ? '2px dashed var(--border-emphasis)' : (data.transparent ? '1px dashed var(--border-default)' : '1px solid var(--border-default)')),
                    borderRadius: '10px',
                    color: 'var(--text-primary)',
                    zIndex: data.isGroup ? -1 : 10,
                    boxShadow: (data.isGroup || data.transparent) ? 'none' : 'var(--shadow-sm)',
                    textAlign: 'left',
                    fontSize: (data.fontSize || 14) + 'px',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s ease'
                }}
            >
                {/* Three Dots Menu Button */}
                {(hovered || selected) && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            data.id = id;
                            data.type = 'annotation';
                            if (data.onEdit) data.onEdit(data);
                        }}
                        className="nodrag"
                        title="Settings"
                        style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: 'var(--surface-tooltip)',
                            backdropFilter: 'blur(8px)',
                            color: 'var(--text-secondary)',
                            width: '22px',
                            height: '22px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: '10px',
                            fontWeight: 'bold',
                            opacity: 0.8,
                            transition: 'opacity 0.15s ease, background 0.15s ease',
                            zIndex: 20,
                            border: '1px solid var(--border-default)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--interactive-active)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.background = 'var(--surface-tooltip)'; }}
                    >
                        <div style={{ marginTop: '-4px' }}>...</div>
                    </div>
                )}

                {data.isGroup && <div style={{ fontWeight: '600', opacity: 0.6, marginBottom: '5px', pointerEvents: 'none', letterSpacing: '-0.01em' }}>{data.label}</div>}

                {!data.isGroup && (
                    <div style={{ pointerEvents: 'none', width: '100%', height: '100%', overflowY: 'auto' }} className="markdown-content">
                        <ReactMarkdown>{data.label || "*Double click or use menu to edit*"}</ReactMarkdown>
                    </div>
                )}
            </div>
        </>
    );
};

export default memo(AnnotationNode);
