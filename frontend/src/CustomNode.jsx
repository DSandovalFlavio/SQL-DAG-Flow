import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, Table, FileText, Layers, Eye, Globe } from 'lucide-react';

const CustomNode = ({ id, data }) => {
    const { label, layer, details, theme = 'dark', styleMode = 'full', onContextMenu } = data;
    // Inject id into data for easier access if needed, or just use id prop
    data.id = id;
    const isDark = theme === 'dark';
    const isView = details?.type === 'view';

    const getLayerColor = (layer) => {
        switch (layer) {
            case 'bronze': return '#cd7f32';
            case 'silver': return '#A0A0A0';
            case 'gold': return '#FFD700';
            case 'external': return '#ff9f1c'; // distinct orange-ish for external
            default: return '#4CA1AF';
        }
    };

    const getGradient = (layer) => {
        const palette = data.palette || 'standard';

        const colors = {
            standard: { bronze: '#8B4513', silver: '#708090', gold: '#DAA520', external: '#e67e22', default: '#2F4F4F' },
            vivid: { bronze: '#D35400', silver: '#3498DB', gold: '#F1C40F', external: '#ff9f1c', default: '#8E44AD' },
            pastel: { bronze: '#E6B0AA', silver: '#AED6F1', gold: '#F9E79F', external: '#fad7a0', default: '#D7BDE2' }
        };

        const selectedPalette = colors[palette] || colors.standard;

        switch (layer) {
            case 'bronze': return selectedPalette.bronze;
            case 'silver': return selectedPalette.silver;
            case 'gold': return selectedPalette.gold;
            case 'external': return selectedPalette.external;
            default: return selectedPalette.default;
        }
    };

    const color = getGradient(layer); // Returns solid color from palette

    // Determine Text Color: Dark for Pastel+Full, White otherwise (unless minimal)
    let textColor = 'white';
    if (styleMode === 'full' && data.palette === 'pastel') {
        textColor = '#333';
    } else if (styleMode === 'border') {
        textColor = theme === 'dark' ? '#e0e0e0' : '#333';
    }

    const { project = '', dataset = '' } = details || {};

    const getIcon = (layer, iconColor) => {
        if (details?.type === 'view') {
            return <Eye size={16} color={iconColor} />;
        }
        switch (layer) {
            case 'bronze': return <Database size={16} color={iconColor} />;
            case 'silver': return <Table size={16} color={iconColor} />;
            case 'gold': return <Layers size={16} color={iconColor} />;
            case 'external': return <Globe size={16} color={iconColor} />;
            default: return <FileText size={16} color={iconColor} />;
        }
    }

    // Dynamic Styles
    const containerStyle = styleMode === 'full' ? {
        background: color,
        border: isView ? '1px dashed rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
        color: textColor
    } : {
        background: isDark ? '#1e1e1e' : '#ffffff',
        border: isView ? `2px dashed ${color}` : `2px solid ${color}`,
        color: textColor
    };

    const iconColor = styleMode === 'full' ? textColor : color;

    // Debugging
    // console.log('Node', label, 'showCounts:', data.showCounts);

    return (
        <div
            onContextMenu={(e) => {
                e.preventDefault();
                if (onContextMenu) onContextMenu(e, data);
            }}
            style={{
                ...containerStyle,
                padding: '12px 20px',
                borderRadius: isView ? '20px' : '12px',
                minWidth: '220px',
                boxShadow: isDark ? '0 4px 15px rgba(0,0,0,0.3)' : '0 4px 15px rgba(0,0,0,0.1)',
                fontFamily: "'Inter', sans-serif",
                position: 'relative',
                cursor: 'context-menu'
            }}>
            <Handle type="target" position={Position.Left} style={{ background: isDark ? '#fff' : '#555' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getIcon(layer, iconColor)}
                <div style={{
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    opacity: 0.8,
                    color: styleMode === 'border' ? color : 'inherit'
                }}>
                    {layer.toUpperCase()} {isView ? '(VIEW)' : ''}
                </div>
            </div>

            <div style={{ fontSize: '14px', fontWeight: '600', textShadow: (styleMode === 'full' && data.palette !== 'pastel') ? '0 1px 2px rgba(0,0,0,0.2)' : 'none', marginBottom: '4px' }}>
                {label}
            </div>

            {/* Project & Dataset Metadata */}
            {(details?.project !== 'default' || details?.dataset !== 'default') && (
                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '6px', fontStyle: 'italic' }}>
                    {details?.project !== 'default' ? `${details?.project}.` : ''}{details?.dataset !== 'default' ? details?.dataset : ''}
                </div>
            )}

            {/* Dependency Count / Source Label */}
            {data.showCounts !== false && (
                data.incomingCount > 0 ? (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.7, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>Direct: {data.incomingCount}</span>
                        <span>Nested: {data.nestedCount !== undefined ? data.nestedCount : '-'}</span>
                    </div>
                ) : (
                    <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.6 }}>Source</div>
                )
            )}

            {/* Hover Toolbar */}
            {onContextMenu && ( // Only show if interactive
                <div style={{
                    position: 'absolute',
                    bottom: '100%', // Position above the node
                    left: '50%',
                    transform: 'translateX(-50%)',
                    paddingBottom: '10px', // Invisible bridge area to prevent mouseleave
                    display: 'flex', // Hidden by default, shown on hover via CSS
                    flexDirection: 'column', // Stack bridge and content vertically (though bridge is padding)
                    alignItems: 'center',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'opacity 0.2s',
                    zIndex: 100,
                }} className="node-toolbar">
                    <div style={{
                        background: isDark ? '#333' : '#fff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        display: 'flex',
                        gap: '4px',
                    }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); data.onHide(data.id, 'single'); }}
                            title="Hide Node"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isDark ? '#fff' : '#000', fontSize: '10px' }}
                        >
                            👁️‍🗨️ Hide
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); data.onHide(data.id, 'tree'); }}
                            title="Hide Node + Dependencies"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isDark ? '#fff' : '#000', fontSize: '10px' }}
                        >
                            🌳 Hide Tree
                        </button>
                    </div>
                </div>
            )}

            <style>
                {`
                .react-flow__node-custom:hover .node-toolbar {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }
                `}
            </style>

            <Handle type="source" position={Position.Right} style={{ background: isDark ? '#fff' : '#555' }} />
        </div>
    );
};

export default CustomNode; // Removed memo for immediate update reliability
