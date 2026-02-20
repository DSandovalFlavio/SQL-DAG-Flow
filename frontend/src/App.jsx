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
import DetailsPanel from './DetailsPanel';
import FolderSelectorModal from './FolderSelectorModal';
import FileCreationModal from './FileCreationModal';
// 1. Update Imports
import {
  Menu, Layout,
  FolderOpen, FilePlus, Save, Image, Ruler,
  Moon, Sun, Eye, EyeOff, Grid, MessageSquare, BoxSelect, Settings,
  Hand, MousePointer2, RefreshCw, Globe
} from 'lucide-react';
import SelectionToolbar from './SelectionToolbar';

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
  const [dialect, setDialect] = useState('bigquery');
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailsNode, setDetailsNode] = useState(null); // Separate state for side panel
  const [selectionMode, setSelectionMode] = useState('pan'); // 'pan' or 'select'
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [title, setTitle] = useState("SQL DAG Flow");
  const [subtitle, setSubtitle] = useState("Medallion Architecture Visualizer");
  const [currentPath, setCurrentPath] = useState('');
  const [rfInstance, setRfInstance] = useState(null);

  const edgesRef = useRef([]);
  const nodesRef = useRef([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // New Features State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hiddenNodeIds, setHiddenNodeIds] = useState([]); // List of manually hidden node IDs
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [subfolderOptions, setSubfolderOptions] = useState([]);
  const [selectedSubfolders, setSelectedSubfolders] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);

  const [fileCreationModalOpen, setFileCreationModalOpen] = useState(false);
  const [ghostNodeData, setGhostNodeData] = useState(null);

  // Config Management State
  const [currentConfigFile, setCurrentConfigFile] = useState("sql_diagram.json");
  const [configListModalOpen, setConfigListModalOpen] = useState(false);
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);

  const [visibleLayers, setVisibleLayers] = useState({ bronze: true, silver: true, gold: true, external: true, cte: true, other: true });
  const [showCounts, setShowCounts] = useState(true);

  const nodeTypes = useMemo(() => ({ custom: CustomNode, annotation: AnnotationNode }), []);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu(null); // Close if clicking on empty pane
  }, []);

  const onNodeContextMenu = useCallback((event, nodeData) => {
    event.preventDefault(); // Prevent native context menu

    // Check if multiple nodes are selected using Ref to avoid dependency loop
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);

    if (selectedNodes.length > 1 && selectedNodes.some(n => n.id === nodeData.id)) {
      // Do nothing, let the toolbar handle it
      setContextMenu(null);
    } else {
      // Single node context menu -> Open details
      setSelectedNode(nodeData);
      setDetailsNode(nodeData);
      // setSidebarOpen(true); // User wants details panel (right), not node list sidebar (left)
      setContextMenu(null);
    }
  }, []); // Removed nodes dependency

  const onEdit = useCallback((nodeData) => {
    // For annotations, usually just select
    setSelectedNode(nodeData);
    setDetailsNode(nodeData); // Also open details panel for editing
    setContextMenu(null);
  }, []);

  const alignNodes = (direction) => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length < 2) return;

    let newNodes = [...nodes];

    if (direction === 'horizontal') {
      const avgX = selectedNodes.reduce((acc, n) => acc + n.position.x, 0) / selectedNodes.length;
      newNodes = newNodes.map((n) => {
        if (n.selected) return { ...n, position: { ...n.position, x: avgX } };
        return n;
      });
    } else if (direction === 'vertical') {
      const avgY = selectedNodes.reduce((acc, n) => acc + n.position.y, 0) / selectedNodes.length;
      newNodes = newNodes.map((n) => {
        if (n.selected) return { ...n, position: { ...n.position, y: avgY } };
        return n;
      });
    }
    setNodes(newNodes);
    setContextMenu(null);
  };

  // Node Hiding Logic
  const handleHideNode = useCallback((nodeId, mode) => {
    if (mode === 'single') {
      setHiddenNodeIds(prev => [...new Set([...prev, nodeId])]);
    } else if (mode === 'tree') {
      const ancestors = new Set();
      const queue = [nodeId];
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
  }, [edgesRef]); // using edgesRef to avoid dependency loop

  const toggleNodeVisibility = useCallback((nodeId) => {
    setHiddenNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
  }, []);

  // ... (Hide Node Logic - No Change) ...

  // Auto Layout Handler
  const onLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges
    );
    setNodes([...layoutedNodes]);
    setEdges([...layoutedEdges]);
    setTimeout(() => window.requestAnimationFrame(() => rfInstance?.fitView()), 10);
  }, [nodes, edges, setNodes, setEdges, rfInstance]);

  // Load Graph Data
  const loadGraphData = useCallback(async (path, filename) => {
    const data = await loadGraphState(path, filename);
    if (data.nodes) {
      setNodes(data.nodes.map(n => ({
        ...n,
        hidden: !visibleLayers[n.data.layer || 'other'] || (data.metadata?.hiddenNodeIds || []).includes(n.id),
        data: {
          ...n.data,
          onContextMenu: n.type === 'custom' ? onNodeContextMenu : undefined,
          onEdit: n.type === 'annotation' ? onEdit : undefined,
          onHide: n.type === 'custom' ? handleHideNode : undefined,
          theme, styleMode: nodeStyle, palette, showCounts
        }
      })));
      setEdges(data.edges);
      if (data.viewport) {
        rfInstance?.setViewport(data.viewport);
      }
      if (data.metadata) {
        if (data.metadata.theme) setTheme(data.metadata.theme);
        if (data.metadata.title) setTitle(data.metadata.title);
        if (data.metadata.subtitle) setSubtitle(data.metadata.subtitle);
        if (data.metadata.nodeStyle) setNodeStyle(data.metadata.nodeStyle);
        if (data.metadata.palette) setPalette(data.metadata.palette);
        if (data.metadata.dialect) setDialect(data.metadata.dialect);
        if (data.metadata.discoveryMode !== undefined) setDiscoveryMode(data.metadata.discoveryMode);
        if (data.metadata.hiddenNodeIds) setHiddenNodeIds(data.metadata.hiddenNodeIds);
      }
      setCurrentConfigFile(filename); // Update current config file
    }
  }, [setNodes, setEdges, rfInstance, visibleLayers, onNodeContextMenu, onEdit, handleHideNode, theme, nodeStyle, palette, showCounts, dialect]);

  // ... (Effect hooks) ...

  // Update onNodeClick in ReactFlow component to close details
  // ...



  // Node Hiding Logic




  // 1. Update Nodes (Theme, Style, Palette, Layers, Hidden)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const isLayerVisible = visibleLayers[node.data.layer || 'other'];
        const isManuallyHidden = hiddenNodeIds.includes(node.id);
        const isHidden = !isLayerVisible || isManuallyHidden;

        // Check if data actually needs update to avoid unnecessary re-renders (optimization)
        let newData = { ...node.data };
        let changed = false;

        if (newData.theme !== theme) { newData.theme = theme; changed = true; }
        if (newData.styleMode !== nodeStyle) { newData.styleMode = nodeStyle; changed = true; }
        if (newData.palette !== palette) { newData.palette = palette; changed = true; }
        if (newData.showCounts !== showCounts) { newData.showCounts = showCounts; changed = true; }
        // functions usually stable but good to ensure
        newData.onContextMenu = onNodeContextMenu;
        newData.onHide = handleHideNode;
        newData.onEdit = onEdit;

        if (node.hidden === isHidden && !changed) return node;

        let updatedNode = {
          ...node,
          hidden: isHidden
        };

        if (node.type === 'custom') {
          updatedNode.data = newData;
        } else if (node.type === 'annotation') {
          updatedNode.data = { ...node.data, theme, onEdit };
        }
        return updatedNode;
      })
    );
  }, [theme, nodeStyle, palette, visibleLayers, showCounts, hiddenNodeIds]);

  // 2. Update Edges (Selection Highlight)
  useEffect(() => {
    setEdges((eds) =>
      eds.map(edge => {
        const isIncoming = selectedNode && edge.target === selectedNode.id;
        const isOutgoing = selectedNode && edge.source === selectedNode.id;

        let stroke = '#b1b1b7'; // Default gray
        let strokeWidth = 1;
        let opacity = 1;
        let animated = false;
        let zIndex = 0;

        if (selectedNode) {
          if (isIncoming) {
            stroke = theme === 'dark' ? '#00b4d8' : '#0077b6';
            strokeWidth = 3;
            opacity = 1;
            animated = true;
            zIndex = 10;
          } else if (isOutgoing) {
            stroke = theme === 'dark' ? '#ff4d6d' : '#c9184a';
            strokeWidth = 3;
            opacity = 1;
            animated = true;
            zIndex = 10;
          } else {
            opacity = 0.1;
            stroke = '#555';
            animated = false;
          }
        } else {
          stroke = theme === 'dark' ? '#666' : '#999';
          strokeWidth = 2;
          opacity = theme === 'dark' ? 0.8 : 0.8;
          animated = false;
        }

        // Only update if changed
        if (
          edge.style?.stroke === stroke &&
          edge.style?.strokeWidth === strokeWidth &&
          edge.style?.opacity === opacity &&
          edge.animated === animated &&
          edge.zIndex === zIndex
        ) {
          return edge;
        }

        return {
          ...edge,
          animated,
          zIndex,
          style: {
            ...edge.style,
            stroke,
            strokeWidth,
            opacity
          }
        };
      })
    );
  }, [theme, selectedNode, setEdges]);

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

  const refreshGraphData = async (subfolders = null, modeOverride = null) => {
    // Mode override allows immediate refresh with new state before re-render
    const currentMode = modeOverride !== null ? modeOverride : discoveryMode;

    // Use provided subfolders, or fall back to state, or null (all)
    const foldersToUse = subfolders !== null ? subfolders : selectedSubfolders;

    let data;
    if (foldersToUse) {
      data = await fetchFilteredGraph(foldersToUse, dialect, currentMode);
    } else {
      data = await fetchGraph({ dialect, discovery: currentMode });
    }

    if (data.error) return;

    // Capture current positions to preserve layout
    const currentPositions = {};
    nodes.forEach(n => {
      currentPositions[n.id] = n.position;
    });

    const styledNodes = data.nodes.map(node => ({
      ...node,
      type: 'custom',
      position: currentPositions[node.id] || { x: 0, y: 0 }, // Preserve or default
      data: {
        ...node.data,
        layer: node.data.layer || 'other',
        theme,
        styleMode: nodeStyle,
        palette,
        // Critical: Attach handlers here so they persist after refresh
        onContextMenu: onNodeContextMenu,
        onEdit: onEdit,
        onHide: handleHideNode
      }
    }));

    // If we have existing nodes and just refreshing data, we might want to avoid full auto-layout
    // But if new nodes appear, we need layout.
    // Strategy: 
    // 1. If it's a "soft refresh" (same nodes), keep positions.
    // 2. If new nodes, run layout ONLY if positions are 0,0 (default).
    // However, getLayoutedElements forces layout on everything usually.
    // Let's rely on standard layout BUT if we want to preserve manual moves, we shouldn't call getLayoutedElements 
    // unless it's an initial load or explicit layout request.

    // For now, to solve "resetting view", we will ONLY run auto-layout if it's a fresh load (no existing nodes)
    // OR if the user explicitly asks for it (which calls onLayout separately).
    // BUT looking at the code, typical flow is fetch -> setNodes. 

    // Improved Logic:
    // If we have current nodes, use their positions. For new nodes, use valid default (or run partial layout? hard).
    // Simple approach for "Refresh": Don't run getLayoutedElements if enough nodes already have positions.

    // Actually, the user complaint is "ignora todo y vuelve al inicio". 
    // So avoiding getLayoutedElements on refresh is key if we want to keep manual moves.

    let finalNodes = styledNodes;
    let finalEdges = data.edges;

    // Only run auto-layout if we really strictly need it (empty start)
    // or if we decide new nodes need it. 
    // IF we are refreshing, we likely want to keep existing layout.
    if (nodes.length === 0) {
      const layouted = getLayoutedElements(styledNodes, data.edges);
      finalNodes = layouted.nodes;
      finalEdges = layouted.edges;
    } else {
      // We preserve positions from `currentPositions` applied above.
      // But what about NEW nodes? They are at 0,0.
      // We can run a layout calculation but only apply it to nodes that are (0,0) and seemingly new?
      // Dagre layout is global.

      // Compromise: If user hits refresh, we assume they want data updates, not layout resets.
      // We simply set the nodes. New nodes will stack at 0,0. 
      // User can hit "Auto Layout" button if they want to re-organize.
      // This is standard UX for graph tools.
    }

    setNodes(finalNodes);
    setEdges(finalEdges);
  };

  // Save Handler (Save As)
  const handleSave = async () => {
    if (!rfInstance) return;

    let filename = prompt("Enter filename to save configuration:", currentConfigFile);
    if (!filename) return;
    if (!filename.endsWith(".json")) filename += ".json";

    const flow = rfInstance.toObject();
    const stateToSave = {
      nodes: nodes,
      edges: edges,
      viewport: flow.viewport,
      metadata: {
        theme,
        nodeStyle,
        palette,
        dialect,
        discoveryMode,
        title,
        subtitle,
        path: currentPath,
        hiddenNodeIds
      },
      filename: filename // Pass filename to backend
    };

    await saveGraph(stateToSave);
    setCurrentConfigFile(filename);
    alert(`Configuration saved to ${filename}!`);
  };

  // Load Config Handler
  const handleLoadConfig = async () => {
    const result = await import('./api').then(m => m.fetchConfigFiles(currentPath));
    setAvailableConfigs(result.files || []);
    setConfigListModalOpen(true);
  };

  const selectConfig = async (filename) => {
    await loadGraphData(currentPath, filename);
    setConfigListModalOpen(false);
  };

  // New Config Handler
  const handleNewConfig = () => {
    if (confirm("Create new configuration? Unsaved changes will be lost.")) {
      setNodes([]);
      setEdges([]);
      setHiddenNodeIds([]);
      setCurrentConfigFile("new_config.json");
      // Trigger folder scan to start fresh, forcing update even if path is same
      handleChangePath(true);
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

  const handleChangePath = async (force = false) => {
    const newPath = prompt("Enter full path to SQL project folder:", currentPath);
    if (newPath && (force || newPath !== currentPath)) {
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
      // Update state for future refreshes
      setSelectedSubfolders(subfolders);

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

  const topButtonStyle = {
    background: 'transparent',
    border: 'none',
    color: textColor,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: '500',
    padding: '6px 10px',
    borderRadius: '6px',
    transition: 'background 0.2s',
  };

  const bottomButtonStyle = {
    background: 'transparent',
    border: 'none',
    color: textColor,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    borderRadius: '8px',
    transition: 'background 0.2s',
  };

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

      {/* Top Navigation Bar */}
      {!isExporting && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '60px',
          background: panelBg, backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', zIndex: 100, boxSizing: 'border-box'
        }}>
          {/* Left: Branding & Title */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: textColor,
                fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px', width: '400px', outline: 'none', marginBottom: '4px'
              }}
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: textColor,
                opacity: 0.6, fontSize: '11px', outline: 'none'
              }}
            />
          </div>

          {/* Right: Project Actions */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleChangePath} title="Open Project Folder" style={topButtonStyle}>
              <FolderOpen size={16} /> Open
            </button>
            <button
              onClick={() => refreshGraphData()}
              title="Refresh Graph"
              style={topButtonStyle}
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <div style={{ width: 1, height: 20, background: borderColor, margin: '0 4px' }}></div>

            <button onClick={handleNewConfig} title="New Configuration" style={topButtonStyle}>
              <FilePlus size={16} /> New
            </button>
            <button onClick={handleLoadConfig} title="Load Configuration" style={topButtonStyle}>
              <FolderOpen size={16} /> Load
            </button>
            <button onClick={handleSave} title="Save Configuration" style={topButtonStyle}>
              <Save size={16} /> Save
            </button>

            <div style={{ width: 1, height: 20, background: borderColor, margin: '0 4px' }}></div>

            <button onClick={downloadImage} title="Export PNG" style={topButtonStyle}>
              <Image size={16} /> Export PNG
            </button>
            <button onClick={downloadSVG} title="Export SVG" style={topButtonStyle}>
              <Ruler size={16} /> Export SVG
            </button>

            <div style={{ width: 1, height: 20, background: borderColor, margin: '0 4px' }}></div>

            <button
              onClick={() => window.open('https://github.com/dsandovalflavio/SQL-DAG-Flow', '_blank')}
              title="View on GitHub"
              style={topButtonStyle}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${textColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>i</div>
              Info
            </button>
          </div>
        </div>
      )}

      {/* Sidebar - zIndex increased to be above TopBar (100) */}
      {/* Sidebar - zIndex adjusted to be well above TopBar */}
      {sidebarOpen && (
        <div style={{ position: 'absolute', top: '60px', left: 0, height: 'calc(100% - 60px)', zIndex: 1000 }}>
          <Sidebar
            nodes={nodes}
            hiddenNodeIds={hiddenNodeIds}
            toggleNodeVisibility={toggleNodeVisibility}
            onClose={() => setSidebarOpen(false)}
            theme={theme}
            onNodeClick={(node) => {
              if (rfInstance) {
                // Determine target zoom based on current or default
                // We want to zoom in a bit if it's too far out, or keep current if close enough
                const currentZoom = rfInstance.getViewport().zoom;
                const targetZoom = currentZoom < 1 ? 1 : currentZoom;

                rfInstance.setCenter(node.position.x, node.position.y, { zoom: targetZoom, duration: 800 });

                // Also select the node
                setSelectedNode(node);
                // setDetailsNode(node); // Optional: open details panel too? User just said "move interface to find it easier"
                // Let's just select and highlight it
                setNodes(nds => nds.map(n => ({
                  ...n,
                  selected: n.id === node.id
                })));
              }
            }}
          />
        </div>
      )}

      {/* Folder Selection Modal */}
      <FolderSelectorModal
        isOpen={folderModalOpen}
        currentPath={pendingPath}
        subfolders={subfolderOptions}
        onConfirm={handleModalConfirm}
        onCancel={() => { setFolderModalOpen(false); executeSetPath(pendingPath, null); }}
        theme={theme}
      />

      <FileCreationModal
        isOpen={fileCreationModalOpen}
        nodeData={ghostNodeData}
        basePath={currentPath}
        onClose={() => setFileCreationModalOpen(false)}
        onFileCreated={(path) => {
          // File created, refresh graph to see new node as real node
          refreshGraphData();
          alert(`File created: ${path}`);
        }}
        theme={theme}
      />




      {/* Bottom Floating Toolbar */}
      {!isExporting && (
        <div style={{
          position: 'absolute',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: panelBg,
          backdropFilter: 'blur(10px)',
          padding: '8px 16px',
          borderRadius: '12px',
          border: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}>
          {/* Sidebar Toggle */}
          <button onClick={() => setSidebarOpen(prev => !prev)} title="Nodes & Layers" style={bottomButtonStyle}>
            <Menu size={20} />
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          {/* View Settings */}
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Theme" style={bottomButtonStyle}>
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setViewSettingsOpen(!viewSettingsOpen)}
              title="View Settings"
              style={{ ...bottomButtonStyle, background: viewSettingsOpen ? (theme === 'dark' ? '#333' : '#ddd') : 'transparent' }}
            >
              <Settings size={20} />
            </button>

            {/* Settings Popover */}
            {viewSettingsOpen && (
              <div style={{
                position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                background: panelBg, backdropFilter: 'blur(16px)',
                padding: '16px', borderRadius: '16px', border: `1px solid ${borderColor}`,
                display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                zIndex: 1000
              }}>
                <div style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1px', color: textColor, opacity: 0.5, marginBottom: '4px' }}>
                  VIEW SETTINGS
                </div>

                {/* Node Style */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: textColor, opacity: 0.8 }}>Node Style</div>
                  <div style={{ display: 'flex', background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '2px' }}>
                    {['full', 'border'].map(style => (
                      <button
                        key={style}
                        onClick={() => setNodeStyle(style)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '6px',
                          border: 'none',
                          background: nodeStyle === style ? (theme === 'dark' ? '#333' : '#fff') : 'transparent',
                          color: textColor,
                          opacity: nodeStyle === style ? 1 : 0.6,
                          fontSize: '11px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          boxShadow: nodeStyle === style ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        {style === 'full' ? 'Full' : 'Minimal'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Palette */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: textColor, opacity: 0.8 }}>Colors</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                    {['standard', 'vivid', 'pastel'].map(p => (
                      <button
                        key={p}
                        onClick={() => setPalette(p)}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: `1px solid ${palette === p ? borderColor : 'transparent'}`,
                          background: palette === p ? (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent',
                          color: textColor,
                          fontSize: '10px',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dialect */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: textColor, opacity: 0.8 }}>Dialect</div>
                  <select
                    value={dialect}
                    onChange={(e) => {
                      setDialect(e.target.value);
                      setTimeout(() => refreshGraphData(), 0);
                    }}
                    style={{
                      width: '100%',
                      background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      border: 'none',
                      borderRadius: '8px',
                      color: textColor,
                      padding: '8px',
                      fontSize: '12px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {['bigquery', 'snowflake', 'postgres', 'databricks', 'spark', 'redshift', 'duckdb'].map(d => (
                      <option key={d} value={d} style={{ background: theme === 'dark' ? '#222' : '#fff' }}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ width: '100%', height: '1px', background: borderColor, margin: '4px 0', opacity: 0.5 }}></div>

                {/* Discovery Mode */}
                <button
                  onClick={() => {
                    const newMode = !discoveryMode;
                    setDiscoveryMode(newMode);
                    refreshGraphData(null, newMode);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: discoveryMode ? (theme === 'dark' ? 'rgba(50, 200, 100, 0.1)' : 'rgba(50, 200, 100, 0.1)') : 'transparent',
                    border: discoveryMode ? '1px solid rgba(50, 200, 100, 0.3)' : `1px solid ${borderColor}`,
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: textColor }}>Discovery Mode</span>
                    <span style={{ fontSize: '9px', color: textColor, opacity: 0.6 }}>Show missing files</span>
                  </div>

                  <div style={{
                    width: '32px', height: '18px',
                    background: discoveryMode ? '#2ecc71' : (theme === 'dark' ? '#444' : '#ccc'),
                    borderRadius: '10px',
                    position: 'relative',
                    transition: 'background 0.2s'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '2px', left: discoveryMode ? '16px' : '2px',
                      width: '14px', height: '14px',
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }}></div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button onClick={onLayout} title="Auto Layout" style={bottomButtonStyle}>
            <Layout size={20} />
          </button>

          <button onClick={() => setShowCounts(!showCounts)} title="Toggle Dependency Counts" style={{ ...bottomButtonStyle, opacity: showCounts ? 1 : 0.5 }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>123</span>
          </button>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          {/* Quick Filters (Layers) - Compact */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { key: 'bronze', color: '#A65D29', label: 'B' },
              { key: 'silver', color: '#BCC6D9', label: 'S' },
              { key: 'gold', color: '#FFD700', label: 'G' },
              { key: 'external', color: '#ff9f1c', label: 'E' },
              { key: 'cte', color: '#E91E63', label: 'CTE' }
            ].map(layer => (
              <button
                key={layer.key}
                onClick={() => setVisibleLayers(prev => ({ ...prev, [layer.key]: !prev[layer.key] }))}
                title={`Toggle ${layer.key} layer`}
                style={{
                  width: 24, height: 24, borderRadius: '6px', border: 'none', cursor: 'pointer',
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

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          {/* Selection Mode Toggle */}
          <div style={{ display: 'flex', background: theme === 'dark' ? '#333' : '#ddd', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setSelectionMode('pan')}
              title="Pan Mode (Hand)"
              style={{
                ...bottomButtonStyle,
                background: selectionMode === 'pan' ? (theme === 'dark' ? '#555' : '#fff') : 'transparent',
                boxShadow: selectionMode === 'pan' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none',
                padding: '6px'
              }}
            >
              <Hand size={18} />
            </button>
            <button
              onClick={() => setSelectionMode('select')}
              title="Select Mode (Box)"
              style={{
                ...bottomButtonStyle,
                background: selectionMode === 'select' ? (theme === 'dark' ? '#555' : '#fff') : 'transparent',
                boxShadow: selectionMode === 'select' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none',
                padding: '6px'
              }}
            >
              <MousePointer2 size={18} />
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: borderColor }}></div>

          {/* Tools */}
          <button onClick={() => addAnnotation('comment')} title="Add Comment" style={bottomButtonStyle}>
            <MessageSquare size={20} />
          </button>
          <button onClick={() => addAnnotation('group')} title="Add Group" style={bottomButtonStyle}>
            <BoxSelect size={20} />
          </button>
        </div>
      )
      }

      {/* Side Panel for Node Details */}
      {
        detailsNode && !isExporting && (
          <DetailsPanel
            node={detailsNode}
            onClose={() => setDetailsNode(null)}
            theme={theme}
            onUpdateNode={(id, updates) => {
              setNodes(nds => nds.map(n => n.id === id ? {
                ...n,
                data: { ...n.data, ...updates }
              } : n));
              // Also update local copy if needed for immediate feedback
              setDetailsNode(curr => ({ ...curr, ...updates }));
            }}
            onDelete={(id) => {
              setNodes(nds => nds.filter(n => n.id !== id));
              setDetailsNode(null);
              setSelectedNode(null);
            }}
            onCreateFile={(node) => {
              setGhostNodeData(node);
              setFileCreationModalOpen(true);
            }}
          />
        )
      }

      <SelectionToolbar
        selectedCount={nodes.filter(n => n.selected).length}
        onAlign={alignNodes}
        onClearSelection={() => {
          setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        }}
        theme={theme}
      />

      {/* Config List Modal */}
      {
        configListModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(5px)'
          }}>
            <div style={{
              background: theme === 'dark' ? '#1a1a1a' : '#fff',
              width: '400px', borderRadius: '12px', padding: '20px',
              border: `1px solid ${borderColor}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: textColor }}>Load Configuration</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableConfigs.length === 0 && <div style={{ opacity: 0.5, color: textColor }}>No config files found.</div>}
                {availableConfigs.map(file => (
                  <button
                    key={file}
                    onClick={() => selectConfig(file)}
                    style={{
                      padding: '10px', borderRadius: '6px', border: `1px solid ${borderColor}`,
                      background: 'transparent', color: textColor, cursor: 'pointer', textAlign: 'left',
                      fontWeight: file === currentConfigFile ? 'bold' : 'normal',
                      backgroundColor: file === currentConfigFile ? (theme === 'dark' ? '#333' : '#eee') : 'transparent'
                    }}
                  >
                    {file}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setConfigListModalOpen(false)}
                style={{
                  marginTop: '20px', width: '100%', padding: '10px',
                  background: theme === 'dark' ? '#333' : '#eee', color: textColor,
                  border: 'none', borderRadius: '6px', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      }

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(event, node) => {
          setSelectedNode(prev => (prev && prev.id === node.id) ? null : node.data);
          setDetailsNode(null); // Close details on left click
        }}
        panOnDrag={selectionMode === 'pan'}
        selectionOnDrag={selectionMode === 'select'}
        panOnScroll={true}
        selectionMode={selectionMode === 'select' ? 'partial' : undefined}
        onPaneContextMenu={onPaneContextMenu}
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
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        zIndex: 5,
        pointerEvents: 'none',
        opacity: isExporting ? 1.0 : 0.3,
        fontSize: '10px',
        fontWeight: 'bold',
        color: textColor,
        fontFamily: "'Inter', sans-serif"
      }}>
        {isExporting ? 'Created by SQL DAG Flow' : 'Developed by @DSandovalflavio'}
      </div>
    </div >
  );
};

export default Flow;
