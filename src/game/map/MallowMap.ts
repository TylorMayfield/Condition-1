
export const NodeType = {
    COMBAT: 0,
    ELITE: 1,
    REST: 2,
    SHOP: 3,
    MYSTERY: 4,
    BOSS: 5
} as const;

export type NodeType = typeof NodeType[keyof typeof NodeType];

export interface MapNode {
    id: number;
    type: NodeType;
    layer: number; // Depth in the map (0 = Start, N = Boss)
    next: number[]; // IDs of connected nodes in next layer
    position: { x: number, y: number }; // For visual rendering
    completed: boolean;
}

export class MallowMap {
    public nodes: MapNode[] = [];
    public currentNodeId: number = 0;
    private mapDepth: number = 10;
    
    constructor() {
        this.generateMap();
    }
    
    private generateMap(): void {
        this.nodes = [];
        let nodeIdCounter = 0;
        
        const layers: MapNode[][] = [];
        
        // 1. Generate Layers
        for (let i = 0; i < this.mapDepth; i++) {
            const layerNodes: MapNode[] = [];
            
            // Determine number of nodes in this layer (simple random for now)
            // Start and End are usually 1 node.
            const nodeCount = (i === 0 || i === this.mapDepth - 1) ? 1 : Math.floor(Math.random() * 2) + 2; // 2-3 nodes
            
            const stepX = 100 / (nodeCount + 1);
            
            for (let j = 0; j < nodeCount; j++) {
                const node: MapNode = {
                    id: nodeIdCounter++,
                    type: this.getRandomType(i),
                    layer: i,
                    next: [],
                    position: { x: (j + 1) * stepX, y: i * 50 },
                    completed: false
                };
                layerNodes.push(node);
                this.nodes.push(node);
            }
            layers.push(layerNodes);
        }
        
        // 2. Connect Layers
        for (let i = 0; i < this.mapDepth - 1; i++) {
            const currentLayer = layers[i];
            const nextLayer = layers[i+1];
            
            // Ensure every node in current layer has at least one path forward
            for (const node of currentLayer) {
                // Pick random node(s) from next layer
                // Ideally picking nodes that are "close" horizontally
                const target = nextLayer[Math.floor(Math.random() * nextLayer.length)];
                node.next.push(target.id);
            }
            
            // Ensure every node in next layer is reachable? 
            // Slay the Spire generation is more complex, but this ensures forward progression.
            // Let's do a simple full fill: ensure every next-layer node has a parent.
            for (const nextNode of nextLayer) {
                 const hasParent = currentLayer.some(n => n.next.includes(nextNode.id));
                 if (!hasParent) {
                     // Connect random node from previous layer to this orphan
                     const parent = currentLayer[Math.floor(Math.random() * currentLayer.length)];
                     parent.next.push(nextNode.id);
                 }
            }
        }
        
        // Set Start Node
        this.currentNodeId = layers[0][0].id;
        this.nodes[0].completed = true; // Start is "done", player is AT start
    }
    
    private getRandomType(layer: number): NodeType {
        if (layer === 0) return NodeType.COMBAT; // Start is always combat (tutorial/easy)
        if (layer === this.mapDepth - 1) return NodeType.BOSS;
        
        const rand = Math.random();
        // Simple weights
        if (rand < 0.5) return NodeType.COMBAT;
        if (rand < 0.7) return NodeType.MYSTERY;
        if (rand < 0.85) return NodeType.SHOP;
        if (rand < 0.95) return NodeType.ELITE;
        return NodeType.REST;
    }
    
    public getAvailableNodes(): MapNode[] {
        const current = this.getNode(this.currentNodeId);
        if (!current) return [];
        
        return current.next.map(id => this.getNode(id)!).filter(n => n !== undefined);
    }
    
    public getNode(id: number): MapNode | undefined {
        return this.nodes.find(n => n.id === id);
    }
    
    public advanceTo(nodeId: number): void {
        // Validate connectivity
        const current = this.getNode(this.currentNodeId);
        if (current && current.next.includes(nodeId)) {
            this.currentNodeId = nodeId;
            const nextNode = this.getNode(nodeId);
            if (nextNode) nextNode.completed = true;
        }
    }
}
