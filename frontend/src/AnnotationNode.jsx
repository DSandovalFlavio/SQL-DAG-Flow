import React, { memo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';

const AnnotationNode = ({ id, data, selected }) => {
    const [hovered, setHovered] = useState(false);

    return (
        <>
            <NodeResizer
                minWidth={150}
                minHeight={50}
                isVisible={selected}
                lineStyle={{ border: '1px solid #777' }}
                handleStyle={{ width: 8, height: 8 }}
            />
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    padding: '15px',
                    height: '100%',
                    width: '100%',
                    boxSizing: 'border-box', // Ensure padding doesn't affect dimensions negatively
                    display: 'flex',
                    flexDirection: 'column',
                    // Auto-resize logic handled by React Flow if dimensions not set, but NodeResizer interaction implies manual sizing too.
                    // For "auto" resize based on text, we rely on the container scaling or manual resize. 
                    // Let's ensure content flows well.
                    justifyContent: 'flex-start',
                    background: data.isGroup ? 'rgba(255, 255, 255, 0.05)' : (data.transparent ? 'transparent' : (data.theme === 'dark' ? '#222' : '#fff')),
                    border: data.isGroup ? '2px dashed rgba(128,128,128,0.5)' : (data.transparent ? '1px dashed rgba(128,128,128,0.3)' : '1px solid #777'),
                    borderRadius: '8px',
                    color: data.theme === 'dark' ? '#fff' : '#000',
                    zIndex: data.isGroup ? -1 : 10,
                    boxShadow: (data.isGroup || data.transparent) ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                    textAlign: data.isGroup ? 'left' : 'left', // Markdown usually looks better left-aligned
                    fontSize: (data.fontSize || (data.isGroup ? 14 : 14)) + 'px',
                    position: 'relative',
                    overflow: 'hidden' // Clip content if it exceeds resized box
                }}
            >
                {/* Three Dots Menu Button - Refined Design */}
                {(hovered || selected) && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            // Inject id for consistency with CustomNode
                            data.id = id;
                            data.type = 'annotation'; // Helper
                            if (data.onEdit) data.onEdit(data);
                        }}
                        className="nodrag"
                        title="Settings"
                        style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: data.theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                            color: data.theme === 'dark' ? '#fff' : '#333',
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: '10px',
                            fontWeight: 'bold',
                            opacity: 0.7,
                            transition: 'opacity 0.2s',
                            zIndex: 20
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                        <div style={{ marginTop: '-4px' }}>...</div>
                    </div>
                )}

                {data.isGroup && <div style={{ fontWeight: 'bold', opacity: 0.7, marginBottom: '5px', pointerEvents: 'none' }}>{data.label}</div>}

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
