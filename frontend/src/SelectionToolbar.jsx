import React, { useState } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Minimize2, X, FolderInput } from 'lucide-react';

const SelectionToolbar = ({ selectedCount, onAlign, onClearSelection, onBatchLayerChange, theme }) => {
    const [showLayerPicker, setShowLayerPicker] = useState(false);
    if (selectedCount < 2) return null;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#333' : '#fff';
    const textColor = isDark ? '#fff' : '#333';
    const borderColor = isDark ? '#555' : '#ccc';

    const buttonStyle = {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '6px 8px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        color: textColor,
        fontSize: '10px',
        fontWeight: 500,
        transition: 'background 0.2s',
        whiteSpace: 'nowrap',
    };

    const ToolButton = ({ icon, label, action }) => (
        <button
            onClick={() => onAlign(action)}
            title={label}
            style={buttonStyle}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            {icon}
            <span>{label}</span>
        </button>
    );

    return (
        <div style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: bgColor,
            padding: '8px 12px',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            border: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 50,
            fontFamily: "'Inter', sans-serif",
            animation: 'fadeIn 0.2s ease-out',
            backdropFilter: 'blur(10px)',
        }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: textColor, padding: '0 4px' }}>
                {selectedCount} Selected
            </div>

            <div style={{ width: '1px', height: '24px', background: borderColor }} />

            {/* Align Section */}
            <div style={{ display: 'flex', gap: '2px' }}>
                <ToolButton
                    icon={<AlignCenterHorizontal size={16} />}
                    label="Align H"
                    action="horizontal"
                />
                <ToolButton
                    icon={<AlignCenterVertical size={16} />}
                    label="Align V"
                    action="vertical"
                />
            </div>

            <div style={{ width: '1px', height: '24px', background: borderColor }} />

            {/* Distribute Section */}
            <div style={{ display: 'flex', gap: '2px' }}>
                <ToolButton
                    icon={<AlignHorizontalSpaceAround size={16} />}
                    label="Distribute H"
                    action="distributeH"
                />
                <ToolButton
                    icon={<AlignVerticalSpaceAround size={16} />}
                    label="Distribute V"
                    action="distributeV"
                />
            </div>

            <div style={{ width: '1px', height: '24px', background: borderColor }} />

            {/* Compact */}
            <ToolButton
                icon={<Minimize2 size={16} />}
                label="Compact"
                action="compact"
            />

            <div style={{ width: '1px', height: '24px', background: borderColor }} />

            {/* Batch Layer Assignment */}
            {onBatchLayerChange && (
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowLayerPicker(!showLayerPicker)}
                        title="Move to Layer"
                        style={{
                            ...buttonStyle,
                            background: showLayerPicker ? (isDark ? '#444' : '#eee') : 'transparent'
                        }}
                        onMouseEnter={(e) => { if (!showLayerPicker) e.currentTarget.style.background = isDark ? '#444' : '#eee'; }}
                        onMouseLeave={(e) => { if (!showLayerPicker) e.currentTarget.style.background = 'transparent'; }}
                    >
                        <FolderInput size={16} />
                        <span>Move</span>
                    </button>
                    {showLayerPicker && (
                        <div style={{
                            position: 'absolute',
                            bottom: '130%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: isDark ? '#2a2a2a' : '#fff',
                            border: `1px solid ${borderColor}`,
                            borderRadius: '8px',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            minWidth: '100px',
                            zIndex: 100
                        }}>
                            {[
                                { key: 'bronze', color: '#cd7f32' },
                                { key: 'silver', color: '#708090' },
                                { key: 'gold', color: '#FFD700' },
                            ].map(layer => (
                                <button
                                    key={layer.key}
                                    onClick={() => { onBatchLayerChange(layer.key); setShowLayerPicker(false); }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '6px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        color: textColor,
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        textAlign: 'left',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: layer.color }} />
                                    {layer.key.charAt(0).toUpperCase() + layer.key.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div style={{ width: '1px', height: '24px', background: borderColor }} />

            <button
                onClick={onClearSelection}
                title="Clear Selection"
                style={buttonStyle}
                onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <X size={16} />
            </button>
        </div>
    );
};

export default SelectionToolbar;
