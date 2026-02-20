
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Layout options for clean DAG visualization
const defaultOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.spacing.nodeNode': '80', // Horizontal spacing
    'elk.layered.spacing.nodeNodeBetweenLayers': '100', // Vertical spacing between ranks
    'elk.edgeRouting': 'SPLINES', // Smooth curves
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', // Balanced placement
    'elk.spacing.edgeNode': '30',
    'elk.layered.mergeEdges': 'true', // Merge edges going to same target
};

export const getLayoutedElements = async (nodes, edges, direction = 'LR') => {
    const isHorizontal = direction === 'LR';

    const graph = {
        id: 'root',
        layoutOptions: {
            ...defaultOptions,
            'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
        },
        children: nodes.map((node) => ({
            id: node.id,
            width: node.width || 250,
            height: node.height || 100,
            // Essential for React Flow to map back correctly
            // We don't pass extensive node data, just ID and dimensions
        })),
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.source],
            targets: [edge.target],
        })),
    };

    try {
        const layoutedGraph = await elk.layout(graph);

        const layoutedNodes = nodes.map((node) => {
            const layoutedNode = layoutedGraph.children?.find((ns) => ns.id === node.id);

            if (!layoutedNode) return node;

            return {
                ...node,
                position: {
                    x: layoutedNode.x,
                    y: layoutedNode.y,
                },
                // We could also use layoutedNode.width/height if ELK resized them
            };
        });

        return { nodes: layoutedNodes, edges };
    } catch (error) {
        console.error('ELK Layout Error:', error);
        return { nodes, edges }; // Fallback to original positions
    }
};
