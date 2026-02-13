import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, MiniMap, useReactFlow, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { toPng, toSvg } from 'html-to-image';
import { fetchGraph, saveGraph, loadGraphState, setPath, getPath, scanFolders, fetchFilteredGraph } from './api';
import './index.css';
import CustomNode from './CustomNode';
import AnnotationNode from './AnnotationNode';
import Sidebar from './Sidebar';
import FolderSelectorModal from './FolderSelectorModal';
import { Menu, Layout } from 'lucide-react';

// Layout function using Dagre
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 250;
  const nodeHeight = 100;

  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: 'left',
      sourcePosition: 'right',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const Flow = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [theme, setTheme] = useState('dark');
  const [nodeStyle, setNodeStyle] = useState('full');
  const [palette, setPalette] = useState('standard');
  const [selectedNode, setSelectedNode] = useState(null);
  const [title, setTitle] = useState("SQL DAG Flow");
  const [subtitle, setSubtitle] = useState("Medallion Architecture Visualizer");
  const [currentPath, setCurrentPath] = useState('');
  const [rfInstance, setRfInstance] = useState(null);

  const edgesRef = useRef([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // New Features State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hiddenNodeIds, setHiddenNodeIds] = useState([]); // List of manually hidden node IDs
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [subfolderOptions, setSubfolderOptions] = useState([]);
  const [pendingPath, setPendingPath] = useState(null);

  const nodeTypes = useMemo(() => ({ custom: CustomNode, annotation: AnnotationNode }), []);

  const onNodeContextMenu = useCallback((event, nodeData) => {
    event.preventDefault(); // Prevent native context menu
    setSelectedNode(nodeData);
  }, []);

  const onEdit = useCallback((nodeData) => {
    setSelectedNode(nodeData);
  }, []);

  // Node Hiding Logic
  const handleHideNode = useCallback((nodeId, mode) => {
    if (mode === 'single') {
      setHiddenNodeIds(prev => [...new Set([...prev, nodeId])]);
    } else if (mode === 'tree') {
      // Hide node and all manual dependencies (upstream)
      // Actually, usually "Hide Tree" implies hiding what feeds into it? Or what it feeds?
      // "Dependencies" usually means parents.
      const ancestors = new Set();
      const queue = [nodeId];
      // Build graph map for faster lookup if needed, but edges list is fine for small graphs
      // We need to traverse edges where target is current node

      while (queue.length > 0) {
        const curr = queue.shift();
        ancestors.add(curr);
        const incoming = edgesRef.current.filter(e => e.target === curr);
        incoming.forEach(e => {
          if (!ancestors.has(e.source)) queue.push(e.source);
        });
      }
      setHiddenNodeIds(prev => [...new Set([...prev, ...ancestors])]);
    }
  }, []); // using edgesRef to avoid dependency loop

  const toggleNodeVisibility = useCallback((nodeId) => {
    setHiddenNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
  }, []);

  const [visibleLayers, setVisibleLayers] = useState({ bronze: true, silver: true, gold: true, other: true });
  const [showCounts, setShowCounts] = useState(true);

  // Update nodes when theme, nodeStyle, palette, or visibleLayers OR hiddenNodeIds changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const isLayerVisible = visibleLayers[node.data.layer || 'other'];
        const isManuallyHidden = hiddenNodeIds.includes(node.id);
        const isHidden = !isLayerVisible || isManuallyHidden;

        let updatedNode = {
          ...node,
          hidden: isHidden
        };

        if (node.type === 'custom') {
          updatedNode.data = {
            ...node.data,
            theme,
            styleMode: nodeStyle,
            palette,
            showCounts,
            onContextMenu: onNodeContextMenu,
            onHide: handleHideNode // Pass hide handler
          };
        } else if (node.type === 'annotation') {
          updatedNode.data = {
            ...node.data,
            theme,
            onEdit: onEdit
          };
        }
        return updatedNode;
      })
    );

    setEdges((eds) =>
      eds.map(edge => {
        const isIncoming = selectedNode && edge.target === selectedNode.id;
        const isOutgoing = selectedNode && edge.source === selectedNode.id;

        let stroke = '#b1b1b7'; // Default gray
        let strokeWidth = 1;
        let opacity = 1;
        let animated = false;

        if (selectedNode) {
          if (isIncoming) {
            // Incoming (dependency)
            stroke = theme === 'dark' ? '#00b4d8' : '#0077b6'; // Cyan-Blue / Dark Blue
            strokeWidth = 3;
            opacity = 1;
            animated = true;
          } else if (isOutgoing) {
            // Outgoing (impact)
            stroke = theme === 'dark' ? '#ff4d6d' : '#c9184a'; // Soft Pink / Deep Red
            strokeWidth = 3;
            opacity = 1;
            animated = true;
          } else {
            opacity = 0.1; // Dim unrelated
            stroke = '#555';
            animated = false;
          }
        } else {
          // Default state (no selection) - keep edges subtle but visible
          stroke = theme === 'dark' ? '#555' : '#b1b1b7';
          opacity = theme === 'dark' ? 0.6 : 0.8;
          animated = false;
        }

        return {
          ...edge,
          animated,
          zIndex: (isIncoming || isOutgoing) ? 10 : 0,
          style: {
            ...edge.style,
            stroke,
            strokeWidth,
            opacity
          }
        };
      })
    );

  }, [theme, nodeStyle, palette, visibleLayers, showCounts, hiddenNodeIds, setNodes, onNodeContextMenu, onEdit, handleHideNode, setEdges, selectedNode]);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const pathData = await getPath();
      if (pathData.path) setCurrentPath(pathData.path);

      const savedState = await loadGraphState();
      if (savedState && savedState.nodes && savedState.nodes.length > 0) {
        setNodes(savedState.nodes.map(n => ({
          ...n,
          hidden: !visibleLayers[n.data.layer || 'other'] || (savedState.metadata?.hiddenNodeIds || []).includes(n.id),
          data: {
            ...n.data,
            onContextMenu: n.type === 'custom' ? onNodeContextMenu : undefined,
            onEdit: n.type === 'annotation' ? onEdit : undefined,
            onHide: n.type === 'custom' ? handleHideNode : undefined,
            theme, styleMode: nodeStyle, palette, showCounts
          }
        })));
        setEdges(savedState.edges || []);
        if (savedState.metadata) {
          setTheme(savedState.metadata.theme || 'dark');
          setNodeStyle(savedState.metadata.nodeStyle || 'full');
          setPalette(savedState.metadata.palette || 'standard');
          setTitle(savedState.metadata.title || "SQL DAG Flow");
          setSubtitle(savedState.metadata.subtitle || "Medallion Architecture Visualizer");
          if (savedState.metadata.hiddenNodeIds) setHiddenNodeIds(savedState.metadata.hiddenNodeIds);
        }
      } else {
        await refreshGraphData();
      }
    };
    init();
    // eslint-disable-next-line
  }, []);

  const refreshGraphData = async (subfolders = null) => {
    // If subfolders is null, it typically means fetch all or standard behavior
    // For now we use the filtered endpoint if subfolders is passed, or standard if not?
    // Actually standard fetchGraph doesn't support subfolders argument in my previous implementation?
    // Let's use fetchFilteredGraph if subfolders is an array, else fetchGraph

    let data;
    if (subfolders) {
      data = await fetchFilteredGraph(subfolders);
    } else {
      data = await fetchGraph();
    }

    if (data.error) return;

    const styledNodes = data.nodes.map(node => ({
      ...node,
      type: 'custom',
      data: {
        ...node.data,
        layer: node.data.layer || 'other',
        theme,
        styleMode: nodeStyle,
        palette
      }
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      styledNodes,
      data.edges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };

  const handleSave = async () => {
    if (rfInstance) {
      const flow = rfInstance.toObject();
      const stateToSave = {
        nodes: nodes,
        edges: edges,
        viewport: flow.viewport,
        metadata: {
          theme,
          nodeStyle,
          palette,
          title,
          subtitle,
          path: currentPath,
          hiddenNodeIds // Save hidden state
        }
      };
      await saveGraph(stateToSave);
      alert("Diagram saved to sql_diagram.json!");
    }
  };

  const addAnnotation = (type) => {
    const id = `annotation-${Date.now()}`;
    const newNode = {
      id,
      type: 'annotation',
      position: { x: 100, y: 100 },
      zIndex: type === 'group' ? -1 : 10,
      data: {
        label: type === 'group' ? 'Group Name' : 'Comment...',
        isGroup: type === 'group',
        theme,
        transparent: false,
        onEdit: onEdit
      },
      style: type === 'group' ? { width: 300, height: 200 } : undefined
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef(null);

  const downloadImage = () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    setTimeout(() => {
      toPng(exportRef.current, {
        backgroundColor: theme === 'dark' ? '#111' : '#f5f5f5',
        width: exportRef.current.offsetWidth,
        height: exportRef.current.offsetHeight,
        style: { width: '100%', height: '100%' },
        pixelRatio: 3 // High Resolution
      })
        .then((dataUrl) => {
          const a = document.createElement('a');
          a.setAttribute('download', 'sql-architecture.png');
          a.setAttribute('href', dataUrl);
          a.click();
        })
        .catch(console.error)
        .finally(() => setIsExporting(false));
    }, 100);
  };

  const downloadSVG = () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    setTimeout(() => {
      toSvg(exportRef.current, {
        backgroundColor: theme === 'dark' ? '#111' : '#f5f5f5',
        width: exportRef.current.offsetWidth,
        height: exportRef.current.offsetHeight,
        style: { width: '100%', height: '100%' }
      })
        .then((dataUrl) => {
          const a = document.createElement('a');
          a.setAttribute('download', 'sql-architecture.svg');
          a.setAttribute('href', dataUrl);
          a.click();
        })
        .catch(console.error)
        .finally(() => setIsExporting(false));
    }, 100);
  };

  const handleChangePath = async () => {
    const newPath = prompt("Enter full path to SQL project folder:", currentPath);
    if (newPath && newPath !== currentPath) {
      // 1. Scan folders first
      const folderData = await scanFolders(newPath);
      if (folderData.folders && folderData.folders.length > 0) {
        setSubfolderOptions(folderData.folders);
        setPendingPath(newPath);
        setFolderModalOpen(true);
      } else {
        // No subfolders, just set path and refresh
        await executeSetPath(newPath, null);
      }
    }
  };

  const executeSetPath = async (path, subfolders) => {
    const res = await setPath(path);
    if (res.path) {
      setCurrentPath(res.path);
      setNodes([]);
      setEdges([]);
      setHiddenNodeIds([]);
      // Try to load state or refresh
      await refreshGraphData(subfolders);
    } else {
      alert("Error setting path");
    }
  };

  const handleModalConfirm = async (selectedFolders) => {
    setFolderModalOpen(false);
    if (pendingPath) {
      await executeSetPath(pendingPath, selectedFolders);
      setPendingPath(null);
    }
  };

  const bg = theme === 'dark' ? '#111' : '#f5f5f5';
  const dots = theme === 'dark' ? '#333' : '#ddd';
  const panelBg = theme === 'dark' ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)';
  const textColor = theme === 'dark' ? '#fff' : '#000';
  const borderColor = theme === 'dark' ? '#444' : '#ddd';

  return (
    <div ref={exportRef} style={{ width: '100vw', height: '100vh', background: bg, transition: 'background 0.3s', position: 'relative', overflow: 'hidden' }}>
      <style>
        {`
            .react-flow__controls-button {
                background: ${theme === 'dark' ? '#222' : '#fff'} !important;
                border-bottom: 1px solid ${theme === 'dark' ? '#333' : '#ddd'} !important;
                fill: ${theme === 'dark' ? '#fff' : '#000'} !important;
                color: ${theme === 'dark' ? '#fff' : '#000'} !important;
            }
            .react-flow__controls-button svg {
                fill: ${theme === 'dark' ? '#fff' : '#000'} !important;
            }
            .react-flow__controls-button:hover {
                 background: ${theme === 'dark' ? '#333' : '#f0f0f0'} !important;
            }
            `}
      </style>

      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          nodes={nodes}
          hiddenNodeIds={hiddenNodeIds}
          toggleNodeVisibility={toggleNodeVisibility}
          onClose={() => setSidebarOpen(false)}
          theme={theme}
        />
      )}

      {/* Folder Selection Modal */}
      <FolderSelectorModal
        isOpen={folderModalOpen}
        currentPath={pendingPath}
        subfolders={subfolderOptions}
        onConfirm={handleModalConfirm}
        onCancel={() => { setFolderModalOpen(false); executeSetPath(pendingPath, null); }} // If interactions canceled, just load all? Or standardload? Let's assume standard load
        theme={theme}
      />

      {/* Editable Title */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start'
      }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            background: 'transparent', border: 'none', color: textColor,
            fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px', width: '400px', outline: 'none', marginBottom: '4px'
          }}
        />
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          style={{
            background: 'transparent', border: 'none', color: textColor,
            opacity: 0.6, fontSize: '14px', width: '400px', outline: 'none'
          }}
        />
      </div>

      {/* Floating Ribbon */}
      {!isExporting && (
        <div style={{
          position: 'absolute',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: panelBg,
          backdropFilter: 'blur(10px)',
          padding: '10px 20px',
          borderRadius: '50px',
          border: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            title="Open Node Sidebar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: textColor
            }}
          >
            <Menu size={20} />
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Toggle Theme"
            style={{
              padding: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: theme === 'dark' ? '#444' : '#eee', color: textColor,
              transition: 'all 0.2s', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          <button
            onClick={() => setNodeStyle(s => s === 'full' ? 'border' : 'full')}
            title="Toggle Node Style"
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              background: theme === 'dark' ? '#444' : '#eee', color: textColor, fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '12px'
            }}
          >
            {nodeStyle === 'full' ? '🎨 Full' : '⭕ Minimal'}
          </button>

          <button
            onClick={() => {
              const next = palette === 'standard' ? 'vivid' : (palette === 'vivid' ? 'pastel' : 'standard');
              setPalette(next);
            }}
            title="Change Color Palette"
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              background: theme === 'dark' ? '#444' : '#eee', color: textColor, fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap', fontSize: '12px'
            }}
          >
            🖌️ {palette.charAt(0).toUpperCase() + palette.slice(1)}
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          <button
            onClick={() => setShowCounts(prev => !prev)}
            title="Toggle Dependency Counts"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px',
              opacity: showCounts ? 1 : 0.5, transition: 'opacity 0.2s',
              display: 'flex', alignItems: 'center', gap: '4px', color: textColor
            }}
          >
            🔢
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          {/* Layer Filters */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { key: 'bronze', color: '#A65D29', label: 'B' },
              { key: 'silver', color: '#BCC6D9', label: 'S' },
              { key: 'gold', color: '#FFD700', label: 'G' }
            ].map(layer => (
              <button
                key={layer.key}
                onClick={() => setVisibleLayers(prev => ({ ...prev, [layer.key]: !prev[layer.key] }))}
                title={`Toggle ${layer.key} layer`}
                style={{
                  width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: visibleLayers[layer.key] ? layer.color : (theme === 'dark' ? '#333' : '#ddd'),
                  color: visibleLayers[layer.key] ? '#000' : (theme === 'dark' ? '#777' : '#999'),
                  fontWeight: 'bold', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: visibleLayers[layer.key] ? 1 : 0.5,
                  transition: 'all 0.2s'
                }}
              >
                {layer.label}
              </button>
            ))}
          </div>

          <button onClick={() => addAnnotation('comment')} title="Add Comment" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>📝</button>
          <button onClick={() => addAnnotation('group')} title="Add Group" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>🔲</button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          <button onClick={handleChangePath} title="Change Folder Path" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>📂</button>
          <button onClick={handleSave} title="Save Diagram" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>💾</button>
          <button onClick={downloadImage} title="Export PNG (HD)" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>📷</button>
          <button onClick={downloadSVG} title="Export SVG" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>📐</button>
        </div>
      )}

      {/* Side Panel for Node Details */}
      {selectedNode && !isExporting && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '400px', height: '100%',
          background: theme === 'dark' ? '#1a1a1a' : '#fff', borderLeft: `1px solid ${borderColor}`,
          zIndex: 20, padding: '20px', boxSizing: 'border-box', overflowY: 'auto',
          boxShadow: '-5px 0 30px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: textColor, fontSize: '18px' }}>
              {selectedNode.type === 'annotation' ? (selectedNode.data.isGroup ? 'Group Settings' : 'Note Settings') : 'Node Details'}
            </h2>
            <button onClick={() => setSelectedNode(null)} style={{ background: 'transparent', border: 'none', color: textColor, fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>

          {selectedNode.type === 'annotation' ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, color: textColor, marginBottom: '8px' }}>Content</label>
                <textarea
                  value={selectedNode.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: val } } : n));
                    setSelectedNode(curr => ({ ...curr, label: val }));
                  }}
                  style={{ width: '100%', height: '100px', background: theme === 'dark' ? '#333' : '#eee', border: 'none', color: textColor, padding: '10px', borderRadius: '8px', resize: 'vertical' }}
                />
              </div>
              {!selectedNode.isGroup && (
                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={selectedNode.transparent}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, transparent: checked } } : n));
                      setSelectedNode(curr => ({ ...curr, transparent: checked }));
                    }}
                  />
                  <label style={{ color: textColor, fontSize: '14px' }}>Transparent Background</label>
                </div>
              )}
              <button
                onClick={() => {
                  setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
                  setSelectedNode(null);
                }}
                style={{ padding: '10px 20px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', width: '100%' }}
              >
                🗑️ Delete {selectedNode.isGroup ? 'Group' : 'Note'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Node Name</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: textColor }}>{selectedNode.label}</div>
              </div>

              <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Layer</div>
                  <div style={{ fontSize: '14px', color: textColor, textTransform: 'capitalize' }}>{selectedNode.layer}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Type</div>
                  <div style={{ fontSize: '14px', color: textColor, textTransform: 'capitalize' }}>{selectedNode.details?.type || 'Table'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Project</div>
                  <div style={{ fontSize: '14px', color: textColor }}>{selectedNode.details?.project || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.6, color: textColor }}>Dataset</div>
                  <div style={{ fontSize: '14px', color: textColor }}>{selectedNode.details?.dataset || '-'}</div>
                </div>
              </div>

              <div style={{ marginBottom: '10px', fontSize: '12px', opacity: 0.6, color: textColor }}>SQL Content</div>
              <div style={{
                background: theme === 'dark' ? '#111' : '#f9f9f9',
                padding: '15px', borderRadius: '8px', overflowX: 'auto',
                border: `1px solid ${borderColor}`, fontSize: '12px', fontFamily: 'monospace',
                whiteSpace: 'pre-wrap', color: textColor, lineHeight: 1.5
              }}>
                {selectedNode.details?.content || 'No content found.'}
              </div>
            </>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(event, node) => setSelectedNode(prev => (prev && prev.id === node.id) ? null : node.data)} // Toggle selection
        nodeTypes={nodeTypes}
        fitView
        colorMode={theme}
        onInit={setRfInstance}
      >
        {!isExporting && <Controls />}
        {!isExporting && <Background variant="dots" gap={20} size={1} color={dots} />}
        {!isExporting && (
          <MiniMap
            pannable
            zoomable
            style={{ background: theme === 'dark' ? '#222' : '#fff' }}
            nodeColor={(n) => {
              if (n.data.layer === 'bronze') return '#A65D29';
              if (n.data.layer === 'silver') return '#BCC6D9';
              if (n.data.layer === 'gold') return '#FFD700';
              return '#555';
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
};

export default Flow;
