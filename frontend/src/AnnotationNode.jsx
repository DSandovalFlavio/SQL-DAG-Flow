import React, { memo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';

const AnnotationNode = ({ id, data, selected }) => {
    const [hovered, setHovered] = useState(false);
    const isDark = data.theme === 'dark';
    const customColor = data.customColor;

    // Compute background and border based on customColor
    const getBackground = () => {
        if (data.isGroup) {
            if (customColor) {
                return `${customColor}0A`; // Very subtle tint
            }
            return 'rgba(255, 255, 255, 0.03)';
        }
        if (data.transparent) return 'transparent';
        if (customColor) {
            return isDark ? `${customColor}15` : `${customColor}12`;
        }
        return 'var(--surface-elevated)';
    };

    const getBorder = () => {
        if (data.borderless) return 'none';
        if (data.isGroup) {
            return `2px dashed ${customColor || 'var(--border-emphasis)'}`;
        }
        if (data.transparent) {
            return `1px dashed ${customColor || 'var(--border-default)'}`;
        }
        if (customColor) {
            return `1px solid ${customColor}60`;
        }
        return '1px solid var(--border-default)';
    };

    const getAccentBar = () => {
        if (!customColor || data.isGroup) return null;
        return (
            <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '3px',
                background: customColor,
                borderRadius: '10px 0 0 10px',
            }} />
        );
    };

    return (
        <>
            <NodeResizer
                minWidth={150}
                minHeight={50}
                isVisible={selected}
                lineStyle={{ border: `1px solid ${customColor || 'var(--border-strong)'}` }}
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
                    background: getBackground(),
                    border: getBorder(),
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
                {/* Color accent bar for notes */}
                {getAccentBar()}

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

                {data.isGroup && (
                    <div style={{
                        fontWeight: '600',
                        opacity: 0.6,
                        marginBottom: '5px',
                        pointerEvents: 'none',
                        letterSpacing: '-0.01em',
                        color: customColor || 'var(--text-primary)'
                    }}>
                        {data.label}
                    </div>
                )}

                {!data.isGroup && (
                    <div style={{ pointerEvents: 'none', width: '100%', height: '100%', overflowY: 'auto', paddingLeft: customColor ? '8px' : '0' }} className="markdown-content">
                        <ReactMarkdown>{data.label || "*Double click or use menu to edit*"}</ReactMarkdown>
                    </div>
                )}
            </div>
        </>
    );
};

export default memo(AnnotationNode);
