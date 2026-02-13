import React, { useState, useEffect } from 'react';
import { Folder, Check, X } from 'lucide-react';

const FolderSelectorModal = ({ isOpen, currentPath, subfolders, onConfirm, onCancel, theme }) => {
    const [selectedFolders, setSelectedFolders] = useState([]);

    useEffect(() => {
        if (isOpen && subfolders.length > 0) {
            setSelectedFolders(subfolders); // Select all by default
        }
    }, [isOpen, subfolders]);

    if (!isOpen) return null;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1a1a1a' : '#ffffff';
    const textColor = isDark ? '#ffffff' : '#000000';
    const borderColor = isDark ? '#333' : '#ddd';

    const toggleFolder = (folder) => {
        setSelectedFolders(prev =>
            prev.includes(folder) ? prev.filter(f => f !== folder) : [...prev, folder]
        );
    };

    const toggleAll = () => {
        if (selectedFolders.length === subfolders.length) {
            setSelectedFolders([]);
        } else {
            setSelectedFolders(subfolders);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                background: bgColor,
                width: '500px',
                maxWidth: '90%',
                maxHeight: '80vh',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: `1px solid ${borderColor}`
            }}>
                <div style={{ padding: '20px', borderBottom: `1px solid ${borderColor}` }}>
                    <h3 style={{ margin: 0, color: textColor, fontSize: '18px' }}>Select Subfolders to Scan</h3>
                    <p style={{ margin: '5px 0 0 0', opacity: 0.6, fontSize: '12px', color: textColor }}>
                        Path: {currentPath}
                    </p>
                </div>

                <div style={{ padding: '10px 20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={toggleAll}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: isDark ? '#4dabf7' : '#007bff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600'
                        }}
                    >
                        {selectedFolders.length === subfolders.length ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                        {subfolders.map(folder => (
                            <div
                                key={folder}
                                onClick={() => toggleFolder(folder)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: `1px solid ${selectedFolders.includes(folder) ? (isDark ? '#4dabf7' : '#007bff') : borderColor}`,
                                    background: selectedFolders.includes(folder) ? (isDark ? 'rgba(77, 171, 247, 0.1)' : 'rgba(0, 123, 255, 0.05)') : 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s',
                                    opacity: selectedFolders.includes(folder) ? 1 : 0.7
                                }}
                            >
                                <div style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '4px',
                                    border: `1px solid ${selectedFolders.includes(folder) ? (isDark ? '#4dabf7' : '#007bff') : (isDark ? '#666' : '#ccc')}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: selectedFolders.includes(folder) ? (isDark ? '#4dabf7' : '#007bff') : 'transparent'
                                }}>
                                    {selectedFolders.includes(folder) && <Check size={12} color="white" />}
                                </div>
                                <Folder size={16} color={isDark ? '#ccc' : '#666'} />
                                <span style={{ fontSize: '13px', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ padding: '20px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? '#333' : '#eee',
                            color: textColor,
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Use All (Default)
                    </button>
                    <button
                        onClick={() => onConfirm(selectedFolders)}
                        style={{
                            padding: '10px 30px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? '#eeeeee' : '#111111',
                            color: isDark ? '#000000' : '#ffffff',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Confirm Selection
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FolderSelectorModal;
