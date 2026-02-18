import React from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, X } from 'lucide-react';

const SelectionToolbar = ({ selectedCount, onAlign, onClearSelection, theme }) => {
    if (selectedCount < 2) return null;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#333' : '#fff';
    const textColor = isDark ? '#fff' : '#333';
    const borderColor = isDark ? '#555' : '#ccc';

    const buttonStyle = {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: textColor,
        transition: 'background 0.2s',
    };

    return (
        <div style={{
            position: 'absolute',
            bottom: '80px', // Above the main toolbar
            left: '50%',
            transform: 'translateX(-50%)',
            background: bgColor,
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            border: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 50,
            fontFamily: "'Inter', sans-serif",
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: textColor }}>
                {selectedCount} Selected
            </div>

            <div style={{ width: '1px', height: '20px', background: borderColor }} />

            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => onAlign('horizontal')}
                    title="Align Horizontal"
                    style={buttonStyle}
                    onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <AlignCenterHorizontal size={18} />
                </button>
                <button
                    onClick={() => onAlign('vertical')}
                    title="Align Vertical"
                    style={buttonStyle}
                    onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <AlignCenterVertical size={18} />
                </button>
            </div>

            <div style={{ width: '1px', height: '20px', background: borderColor }} />

            <button
                onClick={onClearSelection}
                title="Clear Selection"
                style={buttonStyle}
                onMouseEnter={(e) => e.currentTarget.style.background = isDark ? '#444' : '#eee'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <X size={18} />
            </button>
        </div>
    );
};

export default SelectionToolbar;
