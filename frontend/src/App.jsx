import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, MiniMap, useReactFlow, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// import dagre from 'dagre'; // Removed in favor of ELK
import { getLayoutedElements } from './algorithms/elk';
import { toPng, toSvg } from 'html-to-image';
import { fetchGraph, saveGraph, loadGraphState, setPath, getPath, scanFolders, fetchFilteredGraph, moveFile, exportDataDictionary, fetchConfigFiles, fetchScopedGraph, scanNewModels, fetchGitChanges, fetchVersion } from './api';
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
  Hand, MousePointer2, RefreshCw, Globe, BarChart3, Zap, Tag, Download, AlertTriangle as AlertTriangleIcon, Compass, Search, GitBranch
} from 'lucide-react';
import SelectionToolbar from './SelectionToolbar';
import LayerStats from './LayerStats';
import CommandPalette from './CommandPalette';
import ImpactAnalysis from './ImpactAnalysis';
import BreadcrumbTrail from './BreadcrumbTrail';
import TourMode from './TourMode';
import ComparisonPanel from './ComparisonPanel';

// Dagre layout function removed. Using ELK from ./algorithms/elk

const Flow = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [theme, setTheme] = useState('dark');
  const [nodeStyle, setNodeStyle] = useState('full');
  const [palette, setPalette] = useState('standard');
  const [dialect, setDialect] = useState('bigquery');
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryFilter, setDiscoveryFilter] = useState('all'); // 'all' | 'external' | 'cte'
  const [expandedNodes, setExpandedNodes] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [lineageNodes, setLineageNodes] = useState(null); // Set form to highlight full lineage edges
  const [detailsNode, setDetailsNode] = useState(null); // Separate state for side panel
  const [selectionMode, setSelectionMode] = useState('pan'); // 'pan' or 'select'
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [title, setTitle] = useState("SQL DAG Flow");
  const [subtitle, setSubtitle] = useState("Medallion Architecture Visualizer");
  const [currentPath, setCurrentPath] = useState('');
  const [rfInstance, setRfInstance] = useState(null);

  const edgesRef = useRef([]);
  const nodesRef = useRef([]);
  const rfInstanceRef = useRef(null);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { rfInstanceRef.current = rfInstance; }, [rfInstance]);

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
  const [showComplexity, setShowComplexity] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [impactNode, setImpactNode] = useState(null);
  const [cycles, setCycles] = useState([]);
  // References the parser refused to resolve (unknown, ambiguous, or duplicated
  // model names). Surfacing these is the point: a missing edge you can see beats
  // a wrong edge you can't.
  const [lineageWarnings, setLineageWarnings] = useState([]);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [navHistory, setNavHistory] = useState([]);
  const [refreshDiff, setRefreshDiff] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [comparisonNodes, setComparisonNodes] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showStartup, setShowStartup] = useState(false);
  const [startupConfigs, setStartupConfigs] = useState([]);
  // When a saved view is loaded, we work in "scoped" mode: refresh only rebuilds
  // the nodes already on the canvas (fast, no flood of newly-added files).
  // null = full-project mode (fresh load / folder filtering).
  const [scopedView, setScopedView] = useState(false);
  const [gitBase, setGitBase] = useState('');
  const [gitActive, setGitActive] = useState(false);
  // Version of the running backend, shown in the footer so it's obvious which
  // build is in use (the package reads it from its own install metadata).
  const [appVersion, setAppVersion] = useState(null);
  useEffect(() => { fetchVersion().then(r => setAppVersion(r.version)); }, []);

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
      setLineageNodes(null);
      setDetailsNode(nodeData);

      // Center the node in the LEFT half of the screen (details panel takes right half)
      const nodeId = nodeData.id || nodeData.details?.id;
      const targetNode = currentNodes.find(n => n.id === nodeId);
      const rf = rfInstanceRef.current;
      if (targetNode && rf) {
        const panelWidth = Math.round(window.innerWidth / 2);
        const leftHalfCenterX = (window.innerWidth - panelWidth) / 2;
        const leftHalfCenterY = window.innerHeight / 2;
        const nodeX = targetNode.position.x + (targetNode.measured?.width || 180) / 2;
        const nodeY = targetNode.position.y + (targetNode.measured?.height || 60) / 2;
        const currentZoom = rf.getViewport().zoom;
        const targetZoom = Math.min(Math.max(currentZoom, 0.6), 0.85);
        rf.setViewport({
          x: leftHalfCenterX - nodeX * targetZoom,
          y: leftHalfCenterY - nodeY * targetZoom,
          zoom: targetZoom
        }, { duration: 500 });
      }

      // Track breadcrumb history
      setNavHistory(prev => {
        const next = [...prev, { id: nodeData.id || nodeData.details?.id, label: nodeData.label, layer: nodeData.layer }];
        return next.slice(-10);
      });
      setContextMenu(null);
    }
  }, []); // Removed nodes dependency

  const onEdit = useCallback((nodeData) => {
    // For annotations, usually just select
    setSelectedNode(nodeData);
    setLineageNodes(null);
    setDetailsNode(nodeData); // Also open details panel for editing
    setContextMenu(null);
  }, []);

  const alignNodes = (direction) => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length < 2) return;

    let newNodes = [...nodes];

    if (direction === 'left') {
      const minX = Math.min(...selectedNodes.map(n => n.position.x));
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, x: minX } } : n);
    } else if (direction === 'right') {
      const maxX = Math.max(...selectedNodes.map(n => n.position.x));
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, x: maxX } } : n);
    } else if (direction === 'top') {
      const minY = Math.min(...selectedNodes.map(n => n.position.y));
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, y: minY } } : n);
    } else if (direction === 'bottom') {
      const maxY = Math.max(...selectedNodes.map(n => n.position.y));
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, y: maxY } } : n);
    } else if (direction === 'centerH' || direction === 'horizontal') {
      const avgX = selectedNodes.reduce((acc, n) => acc + n.position.x, 0) / selectedNodes.length;
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, x: avgX } } : n);
    } else if (direction === 'centerV' || direction === 'vertical') {
      const avgY = selectedNodes.reduce((acc, n) => acc + n.position.y, 0) / selectedNodes.length;
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, y: avgY } } : n);
    } else if (direction === 'distributeH') {
      const sorted = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
      const minX = sorted[0].position.x;
      const maxX = sorted[sorted.length - 1].position.x;
      const step = sorted.length > 1 ? (maxX - minX) / (sorted.length - 1) : 0;
      const posMap = {};
      sorted.forEach((n, i) => { posMap[n.id] = minX + step * i; });
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, x: posMap[n.id] } } : n);
    } else if (direction === 'distributeV') {
      const sorted = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
      const minY = sorted[0].position.y;
      const maxY = sorted[sorted.length - 1].position.y;
      const step = sorted.length > 1 ? (maxY - minY) / (sorted.length - 1) : 0;
      const posMap = {};
      sorted.forEach((n, i) => { posMap[n.id] = minY + step * i; });
      newNodes = newNodes.map(n => n.selected ? { ...n, position: { ...n.position, y: posMap[n.id] } } : n);
    } else if (direction === 'compactH') {
      const avgX = selectedNodes.reduce((a, n) => a + n.position.x, 0) / selectedNodes.length;
      newNodes = newNodes.map(n => {
        if (!n.selected) return n;
        const dx = n.position.x - avgX;
        return { ...n, position: { x: avgX + dx * 0.5, y: n.position.y } };
      });
    } else if (direction === 'compactV') {
      const avgY = selectedNodes.reduce((a, n) => a + n.position.y, 0) / selectedNodes.length;
      newNodes = newNodes.map(n => {
        if (!n.selected) return n;
        const dy = n.position.y - avgY;
        return { ...n, position: { x: n.position.x, y: avgY + dy * 0.5 } };
      });
    } else if (direction === 'compact') {
      const avgX = selectedNodes.reduce((a, n) => a + n.position.x, 0) / selectedNodes.length;
      const avgY = selectedNodes.reduce((a, n) => a + n.position.y, 0) / selectedNodes.length;
      newNodes = newNodes.map(n => {
        if (!n.selected) return n;
        return { ...n, position: { x: avgX + (n.position.x - avgX) * 0.5, y: avgY + (n.position.y - avgY) * 0.5 } };
      });
    }
    setNodes(newNodes);
    setContextMenu(null);
  };

  // Node Hiding Logic


  // Helper to get full lineage (ancestors + descendants)
  const getLineage = useCallback((nodeId) => {
    const lineage = new Set([nodeId]);
    const queue = [nodeId];

    // 1. Upstream (Ancestors)
    const ancestors = new Set();
    const upQueue = [nodeId];
    while (upQueue.length > 0) {
      const curr = upQueue.shift();
      ancestors.add(curr);
      const incoming = edgesRef.current.filter(e => e.target === curr);
      incoming.forEach(e => {
        if (!ancestors.has(e.source)) {
          ancestors.add(e.source);
          upQueue.push(e.source);
        }
      });
    }

    // 2. Downstream (Descendants)
    const descendants = new Set();
    const downQueue = [nodeId];
    while (downQueue.length > 0) {
      const curr = downQueue.shift();
      descendants.add(curr);
      const outgoing = edgesRef.current.filter(e => e.source === curr);
      outgoing.forEach(e => {
        if (!descendants.has(e.target)) {
          descendants.add(e.target);
          downQueue.push(e.target);
        }
      });
    }

    return new Set([...ancestors, ...descendants]);
  }, []);

  const handleApplyAction = useCallback((action, nodeId) => {
    switch (action) {
      case 'hide':
        setHiddenNodeIds(prev => [...new Set([...prev, nodeId])]);
        break;
      case 'hideTree': // Hides UPSTREAM tree (ancestors) per existing logic
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
        break;
      case 'onlyTree': // Show ONLY this node and its full lineage
        const lineage = getLineage(nodeId);
        const allNodeIds = nodesRef.current.map(n => n.id);
        const toHide = allNodeIds.filter(id => !lineage.has(id));
        setHiddenNodeIds(toHide);
        break;
      case 'selectTree': // Select full lineage
        const fullLineage = getLineage(nodeId);
        setNodes(nds => nds.map(n => ({
          ...n,
          selected: fullLineage.has(n.id)
        })));
        break;
      case 'expand':
        setExpandedNodes(prev => ({ ...prev, [nodeId]: 'all' }));
        break;
      case 'expandExternal':
        setExpandedNodes(prev => ({ ...prev, [nodeId]: 'external' }));
        break;
      case 'expandCte':
        setExpandedNodes(prev => ({ ...prev, [nodeId]: 'cte' }));
        break;
      case 'collapse':
        setExpandedNodes(prev => { const next = { ...prev }; delete next[nodeId]; return next; });
        break;
      default:
        break;
    }
  }, [getLineage, setNodes]);

  const toggleNodeVisibility = useCallback((nodeId) => {
    setHiddenNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
  }, []);

  // ... (Hide Node Logic - No Change) ...

  // Auto Layout Handler
  const onLayout = useCallback(async () => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = await getLayoutedElements(
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
          onAction: n.type === 'custom' ? handleApplyAction : undefined,
          theme, styleMode: nodeStyle, palette, showCounts, showComplexity
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
        if (data.metadata.expandedNodes) setExpandedNodes(data.metadata.expandedNodes);
        if (data.metadata.hiddenNodeIds) setHiddenNodeIds(data.metadata.hiddenNodeIds);
        if (data.metadata.discoveryFilter) setDiscoveryFilter(data.metadata.discoveryFilter);
      }
      setCurrentConfigFile(filename); // Update current config file
      // A loaded config is a curated view → refresh stays scoped to it.
      if (data.nodes.length > 0) setScopedView(true);
    }
  }, [setNodes, setEdges, rfInstance, visibleLayers, onNodeContextMenu, onEdit, handleApplyAction, theme, nodeStyle, palette, showCounts, showComplexity, dialect]);

  // Undo/Redo History
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), { nodes: nodesRef.current.map(n => ({ id: n.id, position: { ...n.position } })) }]);
    setRedoStack([]);
  }, []);

  const performUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r, { nodes: nodesRef.current.map(n => ({ id: n.id, position: { ...n.position } })) }]);
      setNodes(nds => nds.map(n => {
        const saved = last.nodes.find(s => s.id === n.id);
        return saved ? { ...n, position: saved.position } : n;
      }));
      return prev.slice(0, -1);
    });
  }, [setNodes]);

  const performRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack(u => [...u, { nodes: nodesRef.current.map(n => ({ id: n.id, position: { ...n.position } })) }]);
      setNodes(nds => nds.map(n => {
        const saved = next.nodes.find(s => s.id === n.id);
        return saved ? { ...n, position: saved.position } : n;
      }));
      return prev.slice(0, -1);
    });
  }, [setNodes]);

  // Effect hooks for global shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        performUndo();
        return;
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        performRedo();
        return;
      }
      // Ctrl+A / Cmd+A = Select All
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: !n.hidden })));
        return;
      }
      // Ctrl+F / Cmd+F = Open sidebar with search focus
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSidebarOpen(true);
        return;
      }
      // Ctrl+P / Cmd+P = Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // Delete/Backspace = Hide selected nodes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = nodesRef.current.filter(n => n.selected);
        if (selected.length > 0) {
          e.preventDefault();
          setHiddenNodeIds(prev => [...new Set([...prev, ...selected.map(n => n.id)])]);
        }
        return;
      }
      // Space = Toggle pan/select mode
      if (e.key === ' ') {
        e.preventDefault();
        setSelectionMode(prev => prev === 'pan' ? 'select' : 'pan');
        return;
      }
      // Escape = Deselect / Close panels
      if (e.key === 'Escape') {
        if (comparisonNodes) { setComparisonNodes(null); return; }
        setSelectedNode(null);
        setLineageNodes(null);
        setDetailsNode(null);
        setViewSettingsOpen(false);
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        return;
      }
      // F = Fit view
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        rfInstance?.fitView({ duration: 500 });
        return;
      }
      // Arrow Left = Navigate to upstream neighbor
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        const sel = nodesRef.current.find(n => n.selected);
        if (sel) {
          const inEdges = edgesRef.current.filter(ed => ed.target === sel.id);
          if (inEdges.length > 0) {
            e.preventDefault();
            const upId = inEdges[0].source;
            const upNode = nodesRef.current.find(n => n.id === upId);
            if (upNode) {
              setNodes(nds => nds.map(n => ({ ...n, selected: n.id === upId })));
              setSelectedNode(upNode.data);
              setDetailsNode(upNode.data);
              setNavHistory(prev => {
                const next = [...prev, { id: upNode.id, label: upNode.data.label, layer: upNode.data.layer }];
                return next.slice(-10);
              });
              rfInstance?.fitView({ nodes: [{ id: upId }], duration: 400, padding: 0.5 });
            }
          }
        }
        return;
      }
      // Arrow Right = Navigate to downstream neighbor
      if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        const sel = nodesRef.current.find(n => n.selected);
        if (sel) {
          const outEdges = edgesRef.current.filter(ed => ed.source === sel.id);
          if (outEdges.length > 0) {
            e.preventDefault();
            const downId = outEdges[0].target;
            const downNode = nodesRef.current.find(n => n.id === downId);
            if (downNode) {
              setNodes(nds => nds.map(n => ({ ...n, selected: n.id === downId })));
              setSelectedNode(downNode.data);
              setDetailsNode(downNode.data);
              setNavHistory(prev => {
                const next = [...prev, { id: downNode.id, label: downNode.data.label, layer: downNode.data.layer }];
                return next.slice(-10);
              });
              rfInstance?.fitView({ nodes: [{ id: downId }], duration: 400, padding: 0.5 });
            }
          }
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performUndo, performRedo, setNodes, rfInstance]);



  // Node Hiding Logic




  // 1. Update Nodes (Theme, Style, Palette, Layers, Hidden)
  useEffect(() => {
    setNodes((nds) => {
      // First pass: compute base visibility
      const updatedNodes = nds.map((node) => {
        const isLayerVisible = visibleLayers[node.data.layer || 'other'];
        const isManuallyHidden = hiddenNodeIds.includes(node.id);
        const isHidden = !isLayerVisible || isManuallyHidden;

        let newData = { ...node.data };
        let changed = false;

        if (newData.theme !== theme) { newData.theme = theme; changed = true; }
        if (newData.styleMode !== nodeStyle) { newData.styleMode = nodeStyle; changed = true; }
        if (newData.palette !== palette) { newData.palette = palette; changed = true; }
        if (newData.showCounts !== showCounts) { newData.showCounts = showCounts; changed = true; }
        if (newData.showComplexity !== showComplexity) { newData.showComplexity = showComplexity; changed = true; }
        if (newData.showTags !== showTags) { newData.showTags = showTags; changed = true; }
        newData.onContextMenu = onNodeContextMenu;
        newData.onAction = handleApplyAction;
        newData.onEdit = onEdit;

        let updatedNode = { ...node, hidden: isHidden };
        if (node.type === 'custom') {
          updatedNode.data = newData;
        } else if (node.type === 'annotation') {
          updatedNode.data = { ...node.data, theme, onEdit };
        }
        return updatedNode;
      });

      // Second pass: hide ghost nodes whose ALL connected nodes are hidden
      const hiddenSet = new Set(updatedNodes.filter(n => n.hidden).map(n => n.id));
      const ghostLayers = new Set(['external', 'cte']);
      const currentEdges = edgesRef.current;
      updatedNodes.forEach(node => {
        if (node.hidden) return;
        const layer = node.data?.layer || node.data?.details?.layer;
        if (!ghostLayers.has(layer)) return;
        const connectedIds = currentEdges
          .filter(e => e.source === node.id || e.target === node.id)
          .map(e => e.source === node.id ? e.target : e.source);
        if (connectedIds.length > 0 && connectedIds.every(id => hiddenSet.has(id))) {
          node.hidden = true;
        }
      });

      return updatedNodes;
    });
  }, [theme, nodeStyle, palette, visibleLayers, showCounts, showComplexity, showTags, hiddenNodeIds]);

  // 2. Update Edges (Selection Highlight)
  useEffect(() => {
    setEdges((eds) =>
      eds.map(edge => {
        const isIncoming = selectedNode && edge.target === selectedNode.id;
        const isOutgoing = selectedNode && edge.source === selectedNode.id;

        let stroke = 'var(--edge-default)';
        let strokeWidth = 1;
        let opacity = 1;
        let animated = false;
        let zIndex = 0;

        // If lineageNodes is set (Double click), check if edge is part of lineage graph
        let isInLineage = false;
        if (lineageNodes) {
          isInLineage = lineageNodes.has(edge.source) && lineageNodes.has(edge.target);
        }

        if (selectedNode && !lineageNodes) {
          if (isIncoming) {
            stroke = 'var(--edge-incoming)';
            strokeWidth = 3;
            opacity = 1;
            animated = true;
            zIndex = 10;
          } else if (isOutgoing) {
            stroke = 'var(--edge-outgoing)';
            strokeWidth = 3;
            opacity = 1;
            animated = true;
            zIndex = 10;
          } else {
            opacity = 0.1;
            stroke = 'var(--edge-dimmed)';
            animated = false;
          }
        } else if (lineageNodes) {
          if (isInLineage) {
            stroke = 'var(--edge-lineage)';
            strokeWidth = 3;
            opacity = 1;
            animated = true;
            zIndex = 10;
          } else {
            opacity = 0.1;
            stroke = 'var(--edge-dimmed)';
            animated = false;
          }
        } else {
          stroke = 'var(--edge-default)';
          strokeWidth = 2;
          opacity = 0.8;
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
          labelStyle: { fontSize: 9, fontWeight: 600, fill: stroke },
          labelBgStyle: {
            fill: 'var(--surface-elevated)',
            fillOpacity: 0.85,
            rx: 3, ry: 3
          },
          style: {
            ...edge.style,
            stroke,
            strokeWidth,
            opacity
          }
        };
      })
    );
  }, [theme, selectedNode, lineageNodes, setEdges]);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const pathData = await getPath();
      if (pathData.path) setCurrentPath(pathData.path);

      // Check for existing config files
      const configData = await fetchConfigFiles(pathData.path || '.');
      const configs = configData.files || [];

      if (configs.length > 0) {
        // Show startup selector if configs exist
        setStartupConfigs(configs);
        setShowStartup(true);
      } else {
        // No configs — go straight to fresh graph
        await refreshGraphData();
      }
    };
    init();
    // eslint-disable-next-line
  }, []);

  // Startup screen: select a config or start fresh
  const handleStartupSelect = async (configFile) => {
    setShowStartup(false);
    if (configFile) {
      // Load selected config
      setIsLoading(true);
      try {
        setCurrentConfigFile(configFile);
        const savedState = await loadGraphState(currentPath || '.', configFile);
        if (savedState && savedState.nodes && savedState.nodes.length > 0) {
          setNodes(savedState.nodes.map(n => ({
            ...n,
            hidden: !visibleLayers[n.data.layer || 'other'] || (savedState.metadata?.hiddenNodeIds || []).includes(n.id),
            data: {
              ...n.data,
              onContextMenu: n.type === 'custom' ? onNodeContextMenu : undefined,
              onEdit: n.type === 'annotation' ? onEdit : undefined,
              onAction: n.type === 'custom' ? handleApplyAction : undefined,
              theme, styleMode: nodeStyle, palette, showCounts, showComplexity, showTags
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
            if (savedState.metadata.showTags !== undefined) setShowTags(savedState.metadata.showTags);
            if (savedState.metadata.discoveryMode !== undefined) setDiscoveryMode(savedState.metadata.discoveryMode);
            if (savedState.metadata.expandedNodes) setExpandedNodes(savedState.metadata.expandedNodes);
            if (savedState.metadata.discoveryFilter) setDiscoveryFilter(savedState.metadata.discoveryFilter);
          }
          // Curated view loaded → keep refresh scoped to these nodes.
          setScopedView(true);
        } else {
          setScopedView(false);
          await refreshGraphData();
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Start fresh — full-project mode.
      setScopedView(false);
      await refreshGraphData();
    }
  };

  const _isRefreshing = useRef(false);
  const refreshGraphData = async (subfolders = null, modeOverride = null, clearAnnotations = false, expandedNodesOverride = null) => {
    // Prevent concurrent calls — skip if already refreshing
    if (_isRefreshing.current) return;
    _isRefreshing.current = true;

    setIsLoading(true);
    try {
      // Mode override allows immediate refresh with new state before re-render
      const currentMode = modeOverride !== null ? modeOverride : discoveryMode;
      const currentExpanded = expandedNodesOverride !== null ? expandedNodesOverride : expandedNodes;

      // Use provided subfolders, or fall back to state, or null (all)
      const foldersToUse = subfolders !== null ? subfolders : selectedSubfolders;

      // Compute visible node IDs for selective backend processing
      const visibleIds = nodes.filter(n => !n.hidden && n.type !== 'annotation').map(n => n.id);
      // Full set of model nodes currently on canvas = the scope of a curated view.
      const scopeIds = nodes.filter(n => n.type !== 'annotation').map(n => n.id);

      let data;
      if (scopedView && !foldersToUse && scopeIds.length > 0) {
        // Scoped refresh: only re-parse/rebuild the nodes already on the canvas.
        // Newly-added files on disk are intentionally NOT pulled in (use "Scan New").
        data = await fetchScopedGraph(scopeIds, dialect, currentMode, currentExpanded, discoveryFilter);
      } else if (foldersToUse) {
        data = await fetchFilteredGraph(foldersToUse, dialect, currentMode, currentExpanded, visibleIds.length > 0 ? visibleIds : null, discoveryFilter);
      } else {
        data = await fetchGraph({ dialect, discovery: currentMode, expanded_nodes: Object.entries(currentExpanded).map(([id, mode]) => `${id}:${mode}`).join(','), visible_node_ids: visibleIds.length > 0 ? visibleIds.join(',') : '', discovery_filter: discoveryFilter });
      }

      if (data.error) return;

      // Store cycle warnings
      if (data.cycles) setCycles(data.cycles);
      setLineageWarnings(data.warnings || []);

      // ===== Diff View: Compare old vs new graph =====
      const oldNodeIds = new Set(nodes.filter(n => n.type !== 'annotation').map(n => n.id));
      const newNodeIds = new Set(data.nodes.map(n => n.id));
      const addedIds = [...newNodeIds].filter(id => !oldNodeIds.has(id));
      const removedIds = [...oldNodeIds].filter(id => !newNodeIds.has(id));
      // Detect changed nodes (content hash changed)
      let changedCount = 0;
      if (oldNodeIds.size > 0) {
        data.nodes.forEach(newNode => {
          if (oldNodeIds.has(newNode.id)) {
            const oldNode = nodes.find(n => n.id === newNode.id);
            if (oldNode && oldNode.data?.details?.content !== newNode.data?.details?.content) {
              changedCount++;
            }
          }
        });
      }
      if (oldNodeIds.size > 0 && (addedIds.length > 0 || removedIds.length > 0 || changedCount > 0)) {
        setRefreshDiff({
          added: addedIds.map(id => {
            const n = data.nodes.find(x => x.id === id);
            return { id, label: n?.data?.label || id };
          }),
          removed: removedIds.map(id => {
            const n = nodes.find(x => x.id === id);
            return { id, label: n?.data?.label || id };
          }),
          changed: changedCount
        });
      }

      // Capture current positions AND tags to preserve across refresh
      const currentPositions = {};
      const currentTags = {};
      nodes.forEach(n => {
        currentPositions[n.id] = n.position;
        if (n.data?.tag) currentTags[n.id] = n.data.tag;
      });

      const styledNodes = data.nodes.map(node => {
        const isLayerVisible = visibleLayers[node.data.layer || 'other'];
        const isManuallyHidden = hiddenNodeIds.includes(node.id);
        return {
          ...node,
          type: 'custom',
          hidden: !isLayerVisible || isManuallyHidden,
          position: currentPositions[node.id] || { x: 0, y: 0 },
          data: {
            ...node.data,
            layer: node.data.layer || 'other',
            theme,
            styleMode: nodeStyle,
            palette,
            showTags,
            // Preserve user-assigned tags across refresh
            tag: currentTags[node.id] || node.data.tag || null,
            // Critical: Attach handlers here so they persist after refresh
            onContextMenu: onNodeContextMenu,
            onEdit: onEdit,
            onAction: handleApplyAction,
            expandedNodes: currentExpanded
          }
        };
      });

      // Hide ghost/discovered nodes whose connected parent nodes are ALL hidden
      // This prevents orphan ghost nodes in Discovery Mode when source nodes are hidden
      const hiddenSet = new Set(styledNodes.filter(n => n.hidden).map(n => n.id));
      const ghostLayers = new Set(['external', 'cte']);
      styledNodes.forEach(node => {
        if (node.hidden) return; // Already hidden
        const layer = node.data?.layer || node.data?.details?.layer;
        if (!ghostLayers.has(layer)) return; // Not a ghost node
        // Find all edges connected to this ghost node
        const connectedNodeIds = data.edges
          .filter(e => e.source === node.id || e.target === node.id)
          .map(e => e.source === node.id ? e.target : e.source);
        // Hide if ALL connected nodes are hidden
        if (connectedNodeIds.length > 0 && connectedNodeIds.every(id => hiddenSet.has(id))) {
          node.hidden = true;
        }
      });

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

      let finalNodes = clearAnnotations ? [...styledNodes] : [...styledNodes, ...nodes.filter(n => n.type === 'annotation')];
      let finalEdges = data.edges;

      // Only run auto-layout if we really strictly need it (empty start)
      // or if we decide new nodes need it. 
      // IF we are refreshing, we likely want to keep existing layout.
      if (nodes.length === 0) {
        const layouted = await getLayoutedElements(styledNodes, data.edges);
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
    } finally {
      _isRefreshing.current = false;
      setIsLoading(false);
    }
  };

  // Helper: Navigate to node from breadcrumb
  const navigateToNode = (item, index) => {
    const targetNode = nodes.find(n => n.id === item.id);
    if (targetNode && rfInstance) {
      rfInstance.fitView({ nodes: [{ id: item.id }], duration: 400, padding: 0.5, maxZoom: 0.85 });
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === item.id })));
      setSelectedNode(targetNode.data);
      setDetailsNode(targetNode.data);
      // Trim history to this point
      setNavHistory(prev => prev.slice(0, index + 1));
    }
  };

  const expandedNodesRef = useRef(expandedNodes);
  useEffect(() => {
    if (JSON.stringify(expandedNodesRef.current) !== JSON.stringify(expandedNodes)) {
      expandedNodesRef.current = expandedNodes;
      refreshGraphData(null, null, false, expandedNodes);
    }
  }, [expandedNodes]);

  // Refresh when discoveryFilter changes (but only if discovery is on and we have nodes)
  const discoveryFilterRef = useRef(discoveryFilter);
  useEffect(() => {
    if (discoveryFilterRef.current !== discoveryFilter) {
      discoveryFilterRef.current = discoveryFilter;
      if (discoveryMode && nodes.length > 0) {
        refreshGraphData(null, true);
      }
    }
  }, [discoveryFilter]);

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
        discoveryFilter,
        expandedNodes,
        title,
        subtitle,
        path: currentPath,
        hiddenNodeIds,
        showTags
      },
      filename: filename // Pass filename to backend
    };

    await saveGraph(stateToSave);
    setCurrentConfigFile(filename);
    alert(`Configuration saved to ${filename}!`);
  };

  // Load Config Handler
  const handleLoadConfig = async () => {
    const result = await fetchConfigFiles(currentPath);
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
      setScopedView(false);
      setCurrentConfigFile("new_config.json");
      // Trigger folder scan to start fresh, forcing update even if path is same
      handleChangePath(true);
    }
  };

  const addAnnotation = (type) => {
    const id = `annotation-${Date.now()}`;
    // Center the new note in the current view
    const position = rfInstance
      ? rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 100, y: 100 };

    const newNode = {
      id,
      type: 'annotation',
      position,
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

  // Scan the project for .sql files not yet on the canvas and let the user add
  // them on demand — instead of every refresh silently flooding the view.
  const handleScanNew = async () => {
    const known = nodes.filter(n => n.type !== 'annotation').map(n => n.id);
    setIsLoading(true);
    let res;
    try {
      res = await scanNewModels(known);
    } finally {
      setIsLoading(false);
    }
    const newModels = (res && res.new) || [];
    if (newModels.length === 0) {
      alert("No new models found. Your view is up to date.");
      return;
    }
    const preview = newModels.slice(0, 20).map(m => `• ${m.path}`).join('\n');
    const more = newModels.length > 20 ? `\n…and ${newModels.length - 20} more` : '';
    if (!confirm(`${newModels.length} new model(s) found:\n\n${preview}${more}\n\nAdd them to the canvas?`)) return;

    setIsLoading(true);
    try {
      const newIds = new Set(newModels.map(m => m.id));
      const scopeIds = [...known, ...newModels.map(m => m.id)];
      const data = await fetchScopedGraph(scopeIds, dialect, discoveryMode, expandedNodes, discoveryFilter);
      if (data.error) return;
      if (data.cycles) setCycles(data.cycles);
      setLineageWarnings(data.warnings || []);

      const existingIds = new Set(nodes.map(n => n.id));
      let i = 0;
      const styledNew = data.nodes
        .filter(n => newIds.has(n.id) && !existingIds.has(n.id))
        .map(node => {
          const pos = { x: 120 + (i % 5) * 280, y: 120 + Math.floor(i / 5) * 170 };
          i++;
          return {
            ...node,
            type: 'custom',
            hidden: !visibleLayers[node.data.layer || 'other'],
            position: pos,
            data: {
              ...node.data,
              layer: node.data.layer || 'other',
              theme, styleMode: nodeStyle, palette, showCounts, showComplexity, showTags,
              onContextMenu: onNodeContextMenu,
              onEdit,
              onAction: handleApplyAction,
              expandedNodes,
            }
          };
        });

      setNodes(prev => [...prev, ...styledNew]);
      setEdges(data.edges);
      setScopedView(true);
      alert(`Added ${styledNew.length} new model(s). Tip: use Auto Layout to reorganize.`);
    } finally {
      setIsLoading(false);
    }
  };


  // Highlight the models changed in git plus their downstream blast radius.
  // Answers "what does this change affect?" straight on the canvas.
  const handleGitChanges = async () => {
    const base = prompt("Compare against branch (leave blank for uncommitted working-tree changes):", gitBase || '');
    if (base === null) return; // cancelled
    const trimmed = base.trim();
    setGitBase(trimmed);
    setIsLoading(true);
    let res;
    try {
      res = await fetchGitChanges(trimmed);
    } finally {
      setIsLoading(false);
    }
    if (!res.is_git) {
      alert("This project folder is not a git repository.");
      return;
    }
    const changedSet = new Set(res.changed);
    const onCanvas = new Set(nodesRef.current.filter(n => n.type !== 'annotation').map(n => n.id));
    const changedOnCanvas = res.changed.filter(id => onCanvas.has(id));

    // Downstream descendants (blast radius) via a forward BFS over edges.
    const adj = {};
    edgesRef.current.forEach(e => { (adj[e.source] = adj[e.source] || []).push(e.target); });
    const downstream = new Set();
    const queue = [...changedOnCanvas];
    while (queue.length) {
      const cur = queue.shift();
      (adj[cur] || []).forEach(t => {
        if (!downstream.has(t) && !changedSet.has(t)) { downstream.add(t); queue.push(t); }
      });
    }

    setNodes(nds => nds.map(n => {
      if (n.type === 'annotation') return n;
      let status = null;
      if (changedSet.has(n.id)) status = 'changed';
      else if (downstream.has(n.id)) status = 'downstream';
      return { ...n, data: { ...n.data, gitStatus: status } };
    }));
    setGitActive(true);

    const affected = [...changedOnCanvas, ...downstream];
    if (affected.length > 0 && rfInstanceRef.current) {
      setTimeout(() => rfInstanceRef.current.fitView({ nodes: affected.map(id => ({ id })), padding: 0.25, duration: 600 }), 60);
    }

    const label = trimmed ? ` (vs ${trimmed})` : ' (working tree)';
    if (res.changed.length === 0) {
      alert("No changed SQL models found" + label + ".");
    } else if (changedOnCanvas.length === 0) {
      alert(`${res.changed.length} changed model(s) found${label}, but none are on the current canvas. Try "Scan New" or load the full project.`);
    } else {
      alert(`${changedOnCanvas.length} changed model(s) · ${downstream.size} downstream impacted${label}.`);
    }
  };

  const clearGitHighlight = () => {
    setNodes(nds => nds.map(n => (n.data && n.data.gitStatus) ? { ...n, data: { ...n.data, gitStatus: null } } : n));
    setGitActive(false);
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
      // Clean canvas on project switch — don't carry over annotations
      await refreshGraphData(subfolders, null, true);
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

  // All colors now flow from CSS variables via data-theme attribute
  const panelBg = 'var(--surface-tooltip)';
  const textColor = 'var(--text-primary)';
  const borderColor = 'var(--border-emphasis)';

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
    <div ref={exportRef} data-theme={theme} style={{ width: '100vw', height: '100vh', background: 'var(--canvas-bg)', transition: 'background 0.3s ease', position: 'relative', overflow: 'hidden' }}>
      <style>
        {`
            .react-flow__controls-button {
                background: var(--surface-elevated) !important;
                border-bottom: 1px solid var(--border-default) !important;
                fill: var(--text-primary) !important;
                color: var(--text-primary) !important;
            }
            .react-flow__controls-button svg {
                fill: var(--text-primary) !important;
            }
            .react-flow__controls-button:hover {
                 background: var(--interactive-hover) !important;
            }
            `}
      </style>

      {/* Top Navigation Bar */}
      {!isExporting && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '56px',
          background: panelBg, backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', zIndex: 100, boxSizing: 'border-box'
        }}>
          {/* Left: Branding & Title */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-primary)',
                fontSize: '17px', fontWeight: '700', letterSpacing: '-0.02em', width: '400px', outline: 'none', marginBottom: '2px',
                fontVariationSettings: "'opsz' 32"
              }}
            />
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
                fontSize: '11px', outline: 'none'
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
            <button
              onClick={handleScanNew}
              title="Scan project for new SQL models not on the canvas"
              style={topButtonStyle}
            >
              <Search size={16} /> Scan New
            </button>
            <button
              onClick={gitActive ? clearGitHighlight : handleGitChanges}
              title={gitActive ? "Clear git change highlight" : "Highlight git-changed models and their downstream impact"}
              style={{ ...topButtonStyle, ...(gitActive ? { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } : {}) }}
            >
              <GitBranch size={16} /> {gitActive ? 'Clear Git' : 'Git Changes'}
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)', margin: '0 4px' }}></div>

            <button onClick={handleNewConfig} title="New Configuration" style={topButtonStyle}>
              <FilePlus size={16} /> New
            </button>
            <button onClick={handleLoadConfig} title="Load Configuration" style={topButtonStyle}>
              <FolderOpen size={16} /> Load
            </button>
            <button onClick={handleSave} title="Save Configuration" style={topButtonStyle}>
              <Save size={16} /> Save
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)', margin: '0 4px' }}></div>

            <button onClick={downloadImage} title="Export PNG" style={topButtonStyle}>
              <Image size={16} /> Export PNG
            </button>
            <button onClick={downloadSVG} title="Export SVG" style={topButtonStyle}>
              <Ruler size={16} /> Export SVG
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)', margin: '0 4px' }}></div>

            <button
              onClick={() => window.open('https://github.com/dsandovalflavio/SQL-DAG-Flow', '_blank')}
              title="View on GitHub"
              style={topButtonStyle}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>i</div>
              Info
            </button>
          </div>
        </div>
      )}

      {/* Sidebar - zIndex increased to be above TopBar (100) */}
      {/* Sidebar - zIndex adjusted to be well above TopBar */}
      {sidebarOpen && (
        <div style={{ position: 'absolute', top: '56px', left: 0, height: 'calc(100% - 56px)', zIndex: 1000 }}>
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
                setLineageNodes(null);
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
          backdropFilter: 'blur(16px)',
          padding: '8px 16px',
          borderRadius: '14px',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideUp 0.25s ease-out'
        }}>
          {/* Sidebar Toggle */}
          <button onClick={() => setSidebarOpen(prev => !prev)} title="Nodes & Layers" style={bottomButtonStyle}>
            <Menu size={20} />
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }}></div>

          {/* View Settings */}
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Theme" style={bottomButtonStyle}>
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setViewSettingsOpen(!viewSettingsOpen)}
              title="View Settings"
              style={{ ...bottomButtonStyle, background: viewSettingsOpen ? 'var(--interactive-active)' : 'transparent' }}
            >
              <Settings size={20} />
            </button>

            {/* Settings Popover */}
            {viewSettingsOpen && (
              <div style={{
                position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                background: panelBg, backdropFilter: 'blur(16px)',
                padding: '16px', borderRadius: '16px', border: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 1000, animation: 'fadeIn 0.15s ease-out'
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                  VIEW SETTINGS
                </div>

                {/* Node Style */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Node Style</div>
                  <div style={{ display: 'flex', background: 'var(--interactive-hover)', borderRadius: '8px', padding: '2px' }}>
                    {['full', 'border'].map(style => (
                      <button
                        key={style}
                        onClick={() => setNodeStyle(style)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '6px',
                          border: 'none',
                          background: nodeStyle === style ? 'var(--interactive-active)' : 'transparent',
                          color: 'var(--text-primary)',
                          opacity: nodeStyle === style ? 1 : 0.6,
                          fontSize: '11px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          boxShadow: nodeStyle === style ? 'var(--shadow-sm)' : 'none',
                          transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
                        }}
                      >
                        {style === 'full' ? 'Full' : 'Minimal'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Palette */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Colors</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    {['standard', 'vivid', 'pastel', 'linear'].map(p => (
                      <button
                        key={p}
                        onClick={() => setPalette(p)}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: palette === p ? '1px solid var(--border-emphasis)' : '1px solid transparent',
                          background: palette === p ? 'var(--interactive-active)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: '10px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
                        }}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dialect */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Dialect</div>
                  <select
                    value={dialect}
                    onChange={(e) => {
                      setDialect(e.target.value);
                      setTimeout(() => refreshGraphData(), 0);
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--interactive-hover)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      padding: '8px',
                      fontSize: '12px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {['bigquery', 'snowflake', 'postgres', 'databricks', 'spark', 'redshift', 'duckdb'].map(d => (
                      <option key={d} value={d} style={{ background: 'var(--surface-elevated)' }}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ width: '100%', height: '1px', background: 'var(--border-default)', margin: '4px 0' }}></div>

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
                    background: discoveryMode ? 'var(--accent-muted)' : 'transparent',
                    border: discoveryMode ? '1px solid var(--accent-primary)' : '1px solid var(--border-emphasis)',
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Discovery Mode</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>Show missing files</span>
                  </div>

                  <div style={{
                    width: '32px', height: '18px',
                    background: discoveryMode ? 'var(--accent-primary)' : 'var(--interactive-active)',
                    borderRadius: '10px',
                    position: 'relative',
                    transition: 'background 0.2s'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '2px', left: discoveryMode ? '16px' : '2px',
                      width: '14px', height: '14px',
                      background: 'var(--surface-elevated)',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }}></div>
                  </div>
                </button>

                {/* Discovery Filter (shown when discovery is on) */}
                {discoveryMode && (
                  <div style={{
                    display: 'flex', gap: '4px', padding: '4px',
                    background: 'var(--surface-primary)',
                    borderRadius: '8px', border: '1px solid var(--border-default)'
                  }}>
                    {[['all', 'Both'], ['external', 'External'], ['cte', 'CTEs']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => {
                          setDiscoveryFilter(val);
                        }}
                        style={{
                          flex: 1, padding: '5px 8px',
                          fontSize: '10px', fontWeight: 600,
                          borderRadius: '6px', cursor: 'pointer',
                          border: 'none',
                          background: discoveryFilter === val ? 'var(--accent-primary)' : 'transparent',
                          color: discoveryFilter === val ? '#fff' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={onLayout} title="Auto Layout" style={bottomButtonStyle}>
            <Layout size={20} />
          </button>

          <button onClick={() => setShowCounts(!showCounts)} title="Toggle Dependency Counts" style={{ ...bottomButtonStyle, opacity: showCounts ? 1 : 0.5 }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>123</span>
          </button>

          <button onClick={() => setShowComplexity(!showComplexity)} title="Toggle Complexity Badges" style={{ ...bottomButtonStyle, opacity: showComplexity ? 1 : 0.5 }}>
            <Zap size={20} />
          </button>

          <button onClick={() => setShowTags(!showTags)} title="Toggle Tags" style={{ ...bottomButtonStyle, opacity: showTags ? 1 : 0.5 }}>
            <Tag size={20} />
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }}></div>

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
                  background: visibleLayers[layer.key] ? layer.color : 'var(--interactive-active)',
                  color: visibleLayers[layer.key] ? '#000' : 'var(--text-tertiary)',
                  fontWeight: 'bold', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: visibleLayers[layer.key] ? 1 : 0.5,
                  transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              >
                {layer.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }}></div>

          {/* Selection Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--interactive-active)', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setSelectionMode('pan')}
              title="Pan Mode (Hand)"
              style={{
                ...bottomButtonStyle,
                background: selectionMode === 'pan' ? 'var(--surface-elevated)' : 'transparent',
                boxShadow: selectionMode === 'pan' ? 'var(--shadow-sm)' : 'none',
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
                background: selectionMode === 'select' ? 'var(--surface-elevated)' : 'transparent',
                boxShadow: selectionMode === 'select' ? 'var(--shadow-sm)' : 'none',
                padding: '6px'
              }}
            >
              <MousePointer2 size={18} />
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }}></div>

          {/* Tools */}
          <button onClick={() => addAnnotation('comment')} title="Add Comment" style={bottomButtonStyle}>
            <MessageSquare size={20} />
          </button>
          <button onClick={() => addAnnotation('group')} title="Add Group" style={bottomButtonStyle}>
            <BoxSelect size={20} />
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border-emphasis)' }}></div>

          {/* Statistics Toggle */}
          <button
            onClick={() => setShowStats(prev => !prev)}
            title="Statistics"
            style={{ ...bottomButtonStyle, opacity: showStats ? 1 : 0.6, position: 'relative' }}
          >
            <BarChart3 size={20} />
          </button>

          {/* Export Data Dictionary */}
          <button
            onClick={() => exportDataDictionary(dialect, nodes.filter(n => !n.hidden).map(n => n.id))}
            title="Export Data Dictionary"
            style={bottomButtonStyle}
          >
            <Download size={20} />
          </button>

          {/* Tour Mode (Temporarily disabled) 
          <button
            onClick={() => setTourOpen(true)}
            title="Tour Mode"
            style={{ ...bottomButtonStyle, opacity: tourOpen ? 1 : 0.6 }}
          >
            <Compass size={20} />
          </button>
          */}
        </div>
      )
      }

      {/* Cycle Warning Banner */}
      {lineageWarnings.length > 0 && !isExporting && (
        <div style={{
          position: 'absolute', top: cycles.length > 0 ? '112px' : '70px', left: '50%',
          transform: 'translateX(-50%)', zIndex: 998,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.32)',
            borderRadius: '10px',
            backdropFilter: 'blur(8px)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <AlertTriangleIcon size={14} style={{ color: '#eab308', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#eab308' }}>
              {lineageWarnings.length} unresolved {lineageWarnings.length === 1 ? 'reference' : 'references'} — lineage may be incomplete
            </span>
            <button
              onClick={() => setShowWarningDetails(v => !v)}
              style={{
                fontSize: '10px', fontWeight: 600,
                background: 'rgba(234, 179, 8, 0.2)', color: '#eab308',
                border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
              }}
            >
              {showWarningDetails ? 'Hide' : 'Details'}
            </button>
            <button
              onClick={() => { setLineageWarnings([]); setShowWarningDetails(false); }}
              style={{
                background: 'transparent', border: 'none', color: '#eab308',
                cursor: 'pointer', padding: '2px', display: 'flex', opacity: 0.6,
              }}
            >
              ×
            </button>
          </div>

          {showWarningDetails && (
            <div style={{
              maxHeight: '240px', overflowY: 'auto', maxWidth: '620px',
              background: 'var(--surface-tooltip)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px', padding: '10px 14px',
              backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              {lineageWarnings.slice(0, 40).map((w, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.05em', color: '#eab308', marginRight: '6px',
                  }}>
                    {String(w.kind || '').replace(/_/g, ' ')}
                  </span>
                  {w.message}
                  {w.source && (
                    <span style={{ opacity: 0.6 }}> — in <code>{w.source}</code></span>
                  )}
                </div>
              ))}
              {lineageWarnings.length > 40 && (
                <div style={{ fontSize: '10px', opacity: 0.6 }}>
                  …and {lineageWarnings.length - 40} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {cycles.length > 0 && !isExporting && (
        <div style={{
          position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 998, display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 16px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-sm)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <AlertTriangleIcon size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444' }}>
            {cycles.length} circular {cycles.length === 1 ? 'dependency' : 'dependencies'} detected
          </span>
          <button
            onClick={() => {
              // Highlight cycle nodes
              const cycleNodeIds = new Set();
              cycles.forEach(c => c.forEach(n => cycleNodeIds.add(n.id)));
              setNodes(nds => nds.map(n => ({
                ...n,
                selected: cycleNodeIds.has(n.id) ? true : n.selected
              })));
            }}
            style={{
              fontSize: '10px', fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              border: 'none', borderRadius: '4px',
              padding: '2px 8px', cursor: 'pointer',
            }}
          >
            Show
          </button>
          <button
            onClick={() => setCycles([])}
            style={{
              background: 'transparent', border: 'none',
              color: '#ef4444', cursor: 'pointer',
              padding: '2px', display: 'flex',
              opacity: 0.6,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Breadcrumb Trail */}
      {navHistory.length > 0 && !isExporting && (
        <BreadcrumbTrail
          history={navHistory}
          onNavigate={navigateToNode}
          onClear={() => setNavHistory([])}
          theme={theme}
        />
      )}

      {/* Diff Summary Banner (after refresh) */}
      {refreshDiff && !isExporting && (
        <div style={{
          position: 'absolute', top: cycles.length > 0 ? '110px' : '70px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 997, display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 16px',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '10px',
          backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-sm)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>Refresh Summary:</span>
          {refreshDiff.added.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
              +{refreshDiff.added.length} added
            </span>
          )}
          {refreshDiff.removed.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
              -{refreshDiff.removed.length} removed
            </span>
          )}
          {refreshDiff.changed > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
              ~{refreshDiff.changed} modified
            </span>
          )}
          <button
            onClick={() => setRefreshDiff(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex', opacity: 0.6 }}
          >
            ×
          </button>
        </div>
      )}

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
            onLayerChange={async (node, newLayer) => {
              try {
                if (node.details?.path) {
                  let filePath = node.details.path;
                  if (currentPath && filePath.startsWith(currentPath)) {
                    filePath = filePath.substring(currentPath.length);
                    if (filePath.startsWith('/') || filePath.startsWith('\\')) {
                      filePath = filePath.substring(1);
                    }
                  }
                  filePath = filePath.replace(/\\/g, '/');
                  await moveFile(filePath, newLayer);
                  refreshGraphData();
                }
              } catch (error) {
                alert("Error moving file: " + error.message);
              }
            }}
            onImpactAnalysis={(node) => setImpactNode(node)}
          />
        )
      }

      {/* Node Comparison Panel */}
      {comparisonNodes && !isExporting && (
        <ComparisonPanel
          nodeA={comparisonNodes.nodeA}
          nodeB={comparisonNodes.nodeB}
          onClose={() => setComparisonNodes(null)}
          theme={theme}
        />
      )}

      <SelectionToolbar
        selectedCount={nodes.filter(n => n.selected).length}
        onAlign={(dir) => { pushUndo(); alignNodes(dir); }}
        onClearSelection={() => {
          setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        }}
        onBatchLayerChange={async (newLayer) => {
          const selectedNodes = nodes.filter(n => n.selected && n.data.layer !== 'external' && n.data.details?.path);
          if (selectedNodes.length === 0) return;
          if (!window.confirm(`Move ${selectedNodes.length} file(s) to the '${newLayer}' layer?`)) return;
          let successCount = 0;
          for (const node of selectedNodes) {
            try {
              let filePath = node.data.details.path;
              if (currentPath && filePath.startsWith(currentPath)) {
                filePath = filePath.substring(currentPath.length);
                if (filePath.startsWith('/') || filePath.startsWith('\\')) filePath = filePath.substring(1);
              }
              filePath = filePath.replace(/\\/g, '/');
              await moveFile(filePath, newLayer);
              successCount++;
            } catch (error) {
              console.error(`Error moving ${node.data.label}:`, error);
            }
          }
          if (successCount > 0) {
            refreshGraphData();
            alert(`${successCount} file(s) moved to ${newLayer}`);
          }
        }}
        theme={theme}
        onCompare={() => {
          const selected = nodes.filter(n => n.selected && n.type === 'custom');
          if (selected.length === 2) {
            setComparisonNodes({ nodeA: selected[0].data, nodeB: selected[1].data });
          }
        }}
        onHide={() => {
          const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
          setHiddenNodeIds(prev => [...new Set([...prev, ...selectedIds])]);
          setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        }}
      />

      {/* Layer Statistics Popover */}
      {!isExporting && (
        <LayerStats nodes={nodes} edges={edges} theme={theme} isOpen={showStats} onClose={() => setShowStats(false)} />
      )}

      {/* Command Palette (Cmd+P) */}
      <CommandPalette
        nodes={nodes}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        theme={theme}
        onSelectNode={(node) => {
          // Pan and zoom to the selected node
          if (rfInstance) {
            rfInstance.fitView({ nodes: [{ id: node.id }], duration: 500, padding: 0.5, maxZoom: 0.85 });
          }
          setSelectedNode(node.data);
          setDetailsNode(node.data);
        }}
      />

      {/* Impact Analysis Modal */}
      <ImpactAnalysis
        node={impactNode}
        allNodes={nodes}
        allEdges={edges}
        isOpen={!!impactNode}
        onClose={() => setImpactNode(null)}
        theme={theme}
        onFocusNode={(nodeId) => {
          const targetNode = nodes.find(n => n.id === nodeId);
          if (targetNode && rfInstance) {
            rfInstance.fitView({ nodes: [{ id: nodeId }], duration: 500, padding: 0.5 });
            setSelectedNode(targetNode.data);
          }
        }}
      />

      {/* Tour Mode (Temporarily disabled) 
      <TourMode
        nodes={nodes}
        edges={edges}
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        theme={theme}
        onFocusNode={(nodeIds, isGroup) => {
          if (rfInstance && nodeIds.length > 0) {
            const fitNodes = nodeIds.map(id => ({ id }));
            rfInstance.fitView({ nodes: fitNodes, duration: 500, padding: isGroup ? 0.3 : 0.5 });
            if (!isGroup && nodeIds.length === 1) {
              const targetNode = nodes.find(n => n.id === nodeIds[0]);
              if (targetNode) {
                setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeIds[0] })));
                setSelectedNode(targetNode.data);
              }
            }
          }
        }}
      />
      */}
      {/* Config List Modal */}
      {
        configListModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'var(--surface-overlay)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              background: 'var(--surface-elevated)',
              width: '400px', borderRadius: '16px', padding: '24px',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-xl)',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.02em' }}>Load Configuration</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {availableConfigs.length === 0 && <div style={{ opacity: 0.5, color: 'var(--text-secondary)' }}>No config files found.</div>}
                {availableConfigs.map(file => (
                  <button
                    key={file}
                    onClick={() => selectConfig(file)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)',
                      background: file === currentConfigFile ? 'var(--interactive-active)' : 'transparent',
                      color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                      fontWeight: file === currentConfigFile ? '600' : '400',
                      fontSize: '13px', transition: 'all 0.15s ease'
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
                  background: 'var(--interactive-active)', color: 'var(--text-primary)',
                  border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '13px',
                  transition: 'background 0.15s ease'
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
        minZoom={0.05}
        maxZoom={4}
        onNodeClick={(event, node) => {
          setSelectedNode(prev => (prev && prev.id === node.id && !lineageNodes) ? null : node.data);
          setLineageNodes(null);
          setDetailsNode(null); // Close details on left click
        }}
        onNodeDoubleClick={(event, node) => {
          if (node.type === 'annotation') {
            // Double-click on annotation opens the edit panel
            const nodeData = { ...node.data, id: node.id, type: 'annotation' };
            setSelectedNode(nodeData);
            setLineageNodes(null);
            setDetailsNode(nodeData);
          } else {
            const fullLineage = getLineage(node.id);
            setLineageNodes(fullLineage);
            setSelectedNode(node.data); // Also set as active focus
          }
        }}
        onNodeDragStop={() => pushUndo()}
        panOnDrag={selectionMode === 'pan'}
        selectionOnDrag={selectionMode === 'select'}
        panOnScroll={true}
        selectionMode={selectionMode === 'select' ? 'partial' : undefined}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements={!isExporting}
        fitView
        colorMode={theme}
        onInit={setRfInstance}
      >
        {!isExporting && <Controls />}
        {!isExporting && <Background variant="dots" gap={20} size={1} color={'var(--canvas-dots)'} />}
        {!isExporting && (
          <MiniMap
            pannable
            zoomable
            style={{ background: 'var(--minimap-bg)' }}
            nodeColor={(n) => {
              if (n.data.layer === 'bronze') return '#A65D29';
              if (n.data.layer === 'silver') return '#BCC6D9';
              if (n.data.layer === 'gold') return '#FFD700';
              return '#555';
            }}
          />
        )}
      </ReactFlow>
      {isLoading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: theme === 'dark' ? 'rgba(13,13,13,0.85)' : 'rgba(247,246,243,0.88)',
          zIndex: 1000, backdropFilter: 'blur(8px)', gap: '16px',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={20} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
              Analyzing SQL files...
            </span>
          </div>
          <div style={{
            width: '240px', height: '4px', borderRadius: '4px',
            background: 'var(--surface-elevated)', overflow: 'hidden'
          }}>
            <div style={{
              width: '40%', height: '100%', borderRadius: '4px',
              background: 'linear-gradient(90deg, var(--accent-primary), var(--sql-join))',
              animation: 'loading-slide 1.2s ease-in-out infinite'
            }} />
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>
            Parsing dependencies, schema & lineage
          </span>
        </div>
      )}
      {showStartup && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: theme === 'dark' ? 'rgba(13,13,13,0.92)' : 'rgba(247,246,243,0.92)',
          zIndex: 1001, backdropFilter: 'blur(12px)', gap: '0px',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex', flexDirection: 'column', gap: '20px'
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif", marginBottom: '6px' }}>
                SQL DAG Flow
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>
                {startupConfigs.length} saved configuration{startupConfigs.length !== 1 ? 's' : ''} found
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-default)' }} />

            {/* Config list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
              {startupConfigs.map(file => (
                <button
                  key={file}
                  onClick={() => handleStartupSelect(file)}
                  style={{
                    padding: '12px 14px', borderRadius: '10px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                    fontWeight: 500, fontSize: '13px',
                    fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.15s ease',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--interactive-hover)'; e.currentTarget.style.borderColor = 'var(--border-emphasis)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-primary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                >
                  <Save size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-default)' }} />

            {/* New project button */}
            <button
              onClick={() => handleStartupSelect(null)}
              style={{
                padding: '12px', borderRadius: '10px',
                background: 'var(--accent-primary)',
                color: 'var(--text-inverse)',
                border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '13px',
                fontFamily: "'Inter', sans-serif",
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-primary)'}
            >
              <FilePlus size={16} />
              Start New Project
            </button>
          </div>
        </div>
      )}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        zIndex: 5,
        pointerEvents: 'none',
        opacity: isExporting ? 1.0 : 0.3,
        fontSize: '10px',
        fontWeight: 'bold',
        color: 'var(--text-tertiary)',
        fontFamily: "'Inter', sans-serif"
      }}>
        {isExporting
          ? `Created by SQL DAG Flow${appVersion ? ` v${appVersion}` : ''}`
          : `Developed by @DSandovalflavio${appVersion ? ` · v${appVersion}` : ''}`}
      </div>
    </div >
  );
};

export default Flow;
