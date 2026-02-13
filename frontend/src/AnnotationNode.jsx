import React, { memo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

const AnnotationNode = ({ id, data, selected }) => {
    const [hovered, setHovered] = useState(false);

    return (
        <>
            <NodeResizer minWidth={100} minHeight={30} isVisible={selected} />
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    padding: '10px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    background: data.isGroup ? 'rgba(255, 255, 255, 0.05)' : (data.transparent ? 'transparent' : (data.theme === 'dark' ? '#222' : '#fff')),
                    border: data.isGroup ? '2px dashed rgba(128,128,128,0.5)' : (data.transparent ? '1px dashed rgba(128,128,128,0.3)' : '1px solid #777'),
                    borderRadius: '8px',
                    color: data.theme === 'dark' ? '#fff' : '#000',
                    zIndex: data.isGroup ? -1 : 10,
                    boxShadow: (data.isGroup || data.transparent) ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                    textAlign: data.isGroup ? 'left' : 'center',
                    fontSize: data.isGroup ? '14px' : '12px',
                    position: 'relative'
                }}
            >
                {/* Three Dots Menu Button - Refined Design */}
                {(hovered || selected) && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            // FIX: Pass the correct structure { id, type, data: {...} }
                            if (data.onEdit) data.onEdit({ id, type: 'annotation', data });
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

                {data.isGroup && <div style={{ fontWeight: 'bold', opacity: 0.7, marginBottom: 'auto', pointerEvents: 'none' }}>{data.label}</div>}
                {!data.isGroup && <div style={{ pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>{data.label}</div>}
            </div>
        </>
    );
};

export default memo(AnnotationNode);
