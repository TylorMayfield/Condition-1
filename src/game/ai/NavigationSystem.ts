import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';

export interface NavNode {
    id: number;
    position: THREE.Vector3;
    neighbors: NavNode[];
    // A* properties
    g?: number;
    h?: number;
    f?: number;
    parent?: NavNode;
}

export class NavigationSystem {
    private game: Game;
    private nodes: NavNode[] = [];
    private nodeRadius: number = 1.5; // 1.5m steps for dense coverage
    private connectionDistance: number = 4.0; // Connect diagonals (1.5 * 1.414 = 2.1, so 4 is plenty)

    constructor(game: Game) {
        this.game = game;
    }

    public async init(mapName: string = 'de_dust2_d') {
        console.log(`[NavSystem] Initializing for map: ${mapName}...`);
        
        // Attempt to load
        const loaded = await this.loadGraph(mapName);
        if (!loaded) {
            console.log("[NavSystem] No navmesh found. Generating locally...");
            this.generateGraph();
        } else {
            console.log(`[NavSystem] Loaded ${this.nodes.length} nodes.`);
            
            // AUTO ENABLE DEBUG DRAW FOR NOW
            this.debugDraw(this.game.scene);
        }
    }

    /**
     * Generate the navigation graph using flood fill from spawn points
     */
    public generateGraph() {
        this.nodes = [];
        const openList: THREE.Vector3[] = [];
        const processedPositions = new Set<string>(); // "x,y,z"

        // 1. Seed with spawn points
        // Use all available spawns (T and CT)
        const seeds: THREE.Vector3[] = [
            ...(this.game.availableSpawns.T || []),
            ...(this.game.availableSpawns.CT || [])
        ];

        // If no map spawns, use player position or fallback
        if (seeds.length === 0) {
            seeds.push(new THREE.Vector3(0, 1, 0)); 
            if (this.game.player && this.game.player.body) {
                seeds.push(new THREE.Vector3(this.game.player.body.position.x, this.game.player.body.position.y, this.game.player.body.position.z));
            }
        }

        // Add seeds to open list
        for (const seed of seeds) {
            this.addPositionToProcess(seed, openList, processedPositions);
        }

        // 2. Flood Fill
        // Limit iterations to prevent hanging on huge maps
        let iterations = 0;
        const maxIterations = 20000; 

        while (openList.length > 0 && iterations < maxIterations) {
            iterations++;
            
            // Progress Log
            if (iterations % 1000 === 0) {
                console.log(`[NavGen] Iteration ${iterations}/${maxIterations} | Nodes: ${this.nodes.length} | OpenList: ${openList.length}`);
            }

            const currentPos = openList.shift()!;

            // Create Node
            const node: NavNode = {
                id: this.nodes.length,
                position: currentPos,
                neighbors: []
            };
            this.nodes.push(node);

            // Explore directions to find new valid positions
            const directions = [
                new THREE.Vector3(1, 0, 0),
                new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(0, 0, 1),
                new THREE.Vector3(0, 0, -1),
                // Diagonals
                new THREE.Vector3(0.707, 0, 0.707),
                new THREE.Vector3(-0.707, 0, 0.707),
                new THREE.Vector3(0.707, 0, -0.707),
                new THREE.Vector3(-0.707, 0, -0.707),
            ];

            for (const dir of directions) {
                // strict grid snapping to prevent drift/overlap
                const tentativePos = currentPos.clone().add(dir.multiplyScalar(this.nodeRadius));
                
                // Snap X and Z to nodeRadius grid
                tentativePos.x = Math.round(tentativePos.x / this.nodeRadius) * this.nodeRadius;
                tentativePos.z = Math.round(tentativePos.z / this.nodeRadius) * this.nodeRadius;

                // Validate position (Raycast down to check ground, Raycast from current to next to check walls)
                const snappedPos = this.getNavPoint(currentPos, tentativePos);
                if (snappedPos) {
                    this.addPositionToProcess(snappedPos, openList, processedPositions);
                }
            }
        }
        
        console.log(`Navigation Graph Generated: ${this.nodes.length} nodes created in ${iterations} iterations.`);

        // 3. Connect Nodes
        // Optimize: Build Spatial Grid FIRST to speed up connection
        this.buildSpatialGrid();
        this.connectNodes();
        
        // 4. Prune problematic nodes that may cause stuck situations
        this.pruneProblematicNodes();
    }

    private addPositionToProcess(pos: THREE.Vector3, list: THREE.Vector3[], set: Set<string>) {
        // Snap to grid-ish to detect duplicates easier? 
        // Or just use string key with some precision
        const key = `${Math.round(pos.x * 10) / 10},${Math.round(pos.y * 10) / 10},${Math.round(pos.z * 10) / 10}`;
        if (!set.has(key)) {
            set.add(key);
            list.push(pos);
        }
    }

    // Refactored to return the VALID SNAPPED position (or null if invalid)
    private getNavPoint(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 | null {
        // 1. Check if 'to' is on ground
        // Raycast down from slightly above 'to'
        // Increased range to handle slopes/stairs (start +2, check down 10 units)
        const startDown = new CANNON.Vec3(to.x, to.y + 2, to.z);
        const endDown = new CANNON.Vec3(to.x, to.y - 10, to.z);
        
        const resDown = new CANNON.RaycastResult();
        this.game.world.raycastAll(startDown, endDown, {}, (r) => {
             if (r.hasHit && r.hitNormalWorld.y > 0.5) {
                // Manually copy relevant data since copy() might not exist on type
                if (!resDown.hasHit || r.distance < resDown.distance) {
                     resDown.hasHit = true;
                     resDown.hitPointWorld.copy(r.hitPointWorld);
                     resDown.hitNormalWorld.copy(r.hitNormalWorld);
                     resDown.distance = r.distance;
                }
             }
        });

        if (!resDown.hasHit) return null; // Pit/Void

        // Use the ACTUAL ground position
        const groundPos = new THREE.Vector3(resDown.hitPointWorld.x, resDown.hitPointWorld.y, resDown.hitPointWorld.z);

        // 2. Check line of sight from 'from' to 'groundPos' (Wall check)
        // Lift check ray higher to avoid clipping rough ground with large steps
        const start = new CANNON.Vec3(from.x, from.y + 1.0, from.z);
        const end = new CANNON.Vec3(groundPos.x, groundPos.y + 1.0, groundPos.z);
        const ray = new CANNON.Ray(start, end);
        const res = new CANNON.RaycastResult();
        ray.intersectWorld(this.game.world, { skipBackfaces: true, result: res });

        if (res.hasHit) return null; // Wall between nodes

        return groundPos;
    }
    
    // Kept for backward compatibility if needed, but unused in generation now
    private isValidNavPoint(from: THREE.Vector3, to: THREE.Vector3): boolean {
         return this.getNavPoint(from, to) !== null;
    }

    private connectNodes() {
        console.log(`[NavGen] Connecting ${this.nodes.length} nodes (Brute Force)...`);
        let connectionCount = 0;
        
        // Brute force is safe now that we have reasonable node counts (<2000 usually)
        for (let i = 0; i < this.nodes.length; i++) {
            const nodeA = this.nodes[i];
            
            for (let j = i + 1; j < this.nodes.length; j++) {
                const nodeB = this.nodes[j];
                const dist = nodeA.position.distanceTo(nodeB.position);

                if (dist <= this.connectionDistance) {
                    // double check visibility
                    if (this.isValidNavPoint(nodeA.position, nodeB.position)) {
                        nodeA.neighbors.push(nodeB);
                        nodeB.neighbors.push(nodeA);
                        connectionCount++;
                    }
                }
            }
        }
        console.log(`[NavGen] Connections complete. Total edges: ${connectionCount}`);
        this.printAsciiMap();
    }

    /**
     * Remove nodes that are likely to cause AI to get stuck
     */
    private pruneProblematicNodes() {
        const startCount = this.nodes.length;
        console.log(`[NavGen] Pruning problematic nodes... (Starting with ${startCount})`);
        
        let removedDeadEnds = 0;
        let removedCornerTraps = 0;
        let removedIslands = 0;

        // Pass 1: Remove dead-ends (nodes with only 1 neighbor)
        // Repeat until stable - removing dead-ends can create new dead-ends
        let changed = true;
        while (changed) {
            changed = false;
            const toRemove: Set<NavNode> = new Set();
            
            for (const node of this.nodes) {
                if (node.neighbors.length <= 1) {
                    toRemove.add(node);
                    removedDeadEnds++;
                    changed = true;
                }
            }
            
            // Remove from graph
            for (const node of toRemove) {
                // Remove from neighbors' neighbor lists
                for (const neighbor of node.neighbors) {
                    neighbor.neighbors = neighbor.neighbors.filter(n => n !== node);
                }
            }
            this.nodes = this.nodes.filter(n => !toRemove.has(n));
        }

        // Pass 2: Remove corner trap nodes (walls on 2+ sides within 1.5m)
        const cardinalDirs = [
            new CANNON.Vec3(1, 0, 0),
            new CANNON.Vec3(-1, 0, 0),
            new CANNON.Vec3(0, 0, 1),
            new CANNON.Vec3(0, 0, -1)
        ];
        const trapCheckDist = 1.5;
        const toRemoveCorners: Set<NavNode> = new Set();
        
        for (const node of this.nodes) {
            let wallCount = 0;
            const start = new CANNON.Vec3(node.position.x, node.position.y + 0.5, node.position.z);
            
            for (const dir of cardinalDirs) {
                const end = new CANNON.Vec3(
                    start.x + dir.x * trapCheckDist,
                    start.y,
                    start.z + dir.z * trapCheckDist
                );
                const ray = new CANNON.Ray(start, end);
                const result = new CANNON.RaycastResult();
                ray.intersectWorld(this.game.world, { skipBackfaces: true, result });
                
                if (result.hasHit && result.hitNormalWorld && result.hitNormalWorld.y < 0.5) {
                    wallCount++;
                }
            }
            
            if (wallCount >= 3) { // Walls on 3+ sides = definite trap
                toRemoveCorners.add(node);
                removedCornerTraps++;
            }
        }
        
        for (const node of toRemoveCorners) {
            for (const neighbor of node.neighbors) {
                neighbor.neighbors = neighbor.neighbors.filter(n => n !== node);
            }
        }
        this.nodes = this.nodes.filter(n => !toRemoveCorners.has(n));

        // Pass 3: Remove small islands (clusters < 5 nodes)
        // BFS to find all connected components
        const visited = new Set<number>();
        const components: NavNode[][] = [];
        
        for (const node of this.nodes) {
            if (visited.has(node.id)) continue;
            
            const component: NavNode[] = [];
            const queue: NavNode[] = [node];
            visited.add(node.id);
            
            while (queue.length > 0) {
                const current = queue.shift()!;
                component.push(current);
                
                for (const neighbor of current.neighbors) {
                    if (!visited.has(neighbor.id)) {
                        visited.add(neighbor.id);
                        queue.push(neighbor);
                    }
                }
            }
            components.push(component);
        }
        
        // Keep only the largest component (or all components >= 5 nodes)
        if (components.length > 1) {
            // Find largest
            components.sort((a, b) => b.length - a.length);
            const mainComponent = new Set(components[0]);
            
            // Remove nodes not in main component IF they're in small islands
            for (let i = 1; i < components.length; i++) {
                if (components[i].length < 5) {
                    for (const node of components[i]) {
                        for (const neighbor of node.neighbors) {
                            neighbor.neighbors = neighbor.neighbors.filter(n => n !== node);
                        }
                        removedIslands++;
                    }
                    this.nodes = this.nodes.filter(n => !components[i].includes(n));
                }
            }
        }

        // Reassign IDs after pruning
        this.nodes.forEach((n, i) => n.id = i);
        
        console.log(`[NavGen] Pruning complete. Removed: ${removedDeadEnds} dead-ends, ${removedCornerTraps} corner traps, ${removedIslands} island nodes`);
        console.log(`[NavGen] Final node count: ${this.nodes.length} (was ${startCount})`);
    }

    private printAsciiMap() {
        if (this.nodes.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const n of this.nodes) {
            minX = Math.min(minX, n.position.x);
            maxX = Math.max(maxX, n.position.x);
            minZ = Math.min(minZ, n.position.z);
            maxZ = Math.max(maxZ, n.position.z);
        }

        const width = 60;
        const depth = 30;
        const stepX = (maxX - minX) / width;
        const stepZ = (maxZ - minZ) / depth;

        let mapStr = "\n[NavMesh Coverage]\n";
        mapStr += `Bounds: [${minX.toFixed(1)}, ${minZ.toFixed(1)}] to [${maxX.toFixed(1)}, ${maxZ.toFixed(1)}]\n`;
        mapStr += "-".repeat(width + 2) + "\n";

        const grid = new Array(depth).fill(0).map(() => new Array(width).fill(' '));

        for (const n of this.nodes) {
            const cx = Math.floor((n.position.x - minX) / stepX);
            const cz = Math.floor((n.position.z - minZ) / stepZ);
            if (cx >= 0 && cx < width && cz >= 0 && cz < depth) {
                grid[cz][cx] = '.';
            }
        }
        
        // Mark Spawn (0,0,0 usually or seeds)
        // Approximate 0,0
        const z0 = Math.floor((0 - minZ) / stepZ);
        const x0 = Math.floor((0 - minX) / stepX);
         if (z0 >= 0 && z0 < depth && x0 >= 0 && x0 < width) {
            grid[z0][x0] = 'S';
        }

        for (let z = 0; z < depth; z++) {
            mapStr += "|" + grid[z].join('') + "|\n";
        }
        mapStr += "-".repeat(width + 2) + "\n";
        console.log(mapStr);
    }

    /**
     * Find path using A*
     * @param noiseSeed - Unique seed per agent (0-1) to generate different paths
     */
    public findPath(startPos: THREE.Vector3, endPos: THREE.Vector3, excludeNodeIds: Set<number> = new Set(), noiseSeed: number = 0): THREE.Vector3[] {
        // Find closest nodes
        const startNode = this.getClosestNode(startPos);
        const endNode = this.getClosestNode(endPos);

        if (!startNode || !endNode) return [];

        // If start/end is excluded, we might be in trouble, but let's try regardless or find nearest non-excluded?
        // For now, A* will handle it if we just block the neighbors.

        if (startNode === endNode) {
            return [endPos];
        }

        // Initialize A*
        const openSet: NavNode[] = [startNode];
        const closedSet: Set<NavNode> = new Set();
        
        // Reset node data
        // Optimization: Use a "session ID" or similar to avoid full array iteration reset?
        // For now, full reset is safe.
        this.nodes.forEach(n => {
            n.g = Infinity;
            n.h = 0;
            n.f = Infinity;
            n.parent = undefined;
        });

        startNode.g = 0;
        startNode.h = startNode.position.distanceTo(endNode.position);
        startNode.f = startNode.h;

        while (openSet.length > 0) {
            // Get node with lowest f
            openSet.sort((a, b) => (a.f || 0) - (b.f || 0));
            const current = openSet.shift()!;

            if (current === endNode) {
                return this.reconstructPath(current, endPos);
            }

            closedSet.add(current);

            for (const neighbor of current.neighbors) {
                if (closedSet.has(neighbor)) continue;
                if (excludeNodeIds.has(neighbor.id)) continue; // Stuck avoidance

                // standard distance cost
                let cost = current.position.distanceTo(neighbor.position);
                
                // Add per-agent noise using noiseSeed
                // This makes different agents (with different seeds) prefer different routes
                if (noiseSeed > 0) {
                    // Hash: combine node IDs with the agent's unique seed
                    // Using sin() as a pseudo-random function
                    const hash = Math.sin((current.id * 12.9898 + neighbor.id * 78.233) * (1 + noiseSeed * 100)) * 43758.5453;
                    const noise = Math.abs(hash - Math.floor(hash)); // 0-1 range
                    cost *= (1.0 + noise * 0.8); // 0-80% variance (stronger effect)
                }

                const tentativeG = (current.g || 0) + cost;

                if (tentativeG < (neighbor.g || Infinity)) {
                    neighbor.parent = current;
                    neighbor.g = tentativeG;
                    neighbor.h = neighbor.position.distanceTo(endNode.position);
                    neighbor.f = neighbor.g + neighbor.h;

                    if (!openSet.includes(neighbor)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        // No path found
        return [];
    }

    private reconstructPath(endNode: NavNode, realEndPos: THREE.Vector3): THREE.Vector3[] {
        const path: THREE.Vector3[] = [];
        path.push(realEndPos); 
        const realEnd = new THREE.Vector3(realEndPos.x, realEndPos.y, realEndPos.z);

        let current: NavNode | undefined = endNode;
        while (current) {
            path.push(current.position);
            current = current.parent;
        }

        return path.reverse();
    }

    // Spatial Partitioning
    private spatialGrid: Map<string, NavNode[]> = new Map();
    private startScale: number = 0.125; // 8 units per cell

    private buildSpatialGrid() {
        this.spatialGrid.clear();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

        for (const node of this.nodes) {
            minX = Math.min(minX, node.position.x);
            maxX = Math.max(maxX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxY = Math.max(maxY, node.position.y);
            minZ = Math.min(minZ, node.position.z);
            maxZ = Math.max(maxZ, node.position.z);

            const key = this.getGridKey(node.position);
            if (!this.spatialGrid.has(key)) {
                this.spatialGrid.set(key, []);
            }
            this.spatialGrid.get(key)!.push(node);
        }
        console.log(`Spatial Grid Built: ${this.spatialGrid.size} cells.`);
        console.log(`Navmesh Bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}] Z[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);
        
        // Debug density
        if (this.nodes.length > 0) {
             console.log(`Avg Nodes/Cell: ${(this.nodes.length / this.spatialGrid.size).toFixed(1)}`);
        }
    }

    private getGridKey(pos: THREE.Vector3): string {
        const x = Math.floor(pos.x * this.startScale);
        const y = Math.floor(pos.y * this.startScale);
        const z = Math.floor(pos.z * this.startScale);
        return `${x},${y},${z}`;
    }

    public getClosestNode(pos: THREE.Vector3): NavNode | null {
        // Optimize: Use spatial grid if N is huge, but linear is fine for <2000 nodes
        // Fallback to linear for robustness and simplicity
        return this.getClosestNodeLinear(pos);
    }
    
    private getClosestNodeLinear(pos: THREE.Vector3): NavNode | null {
        let closest: NavNode | null = null;
        let minDist = Infinity;

        for (const node of this.nodes) {
            const dist = pos.distanceToSquared(node.position);
            if (dist < minDist) {
                minDist = dist;
                closest = node;
            }
        }
        return closest;
    }

    // --- Serialization ---

    public serialize(): string {
        const data = this.nodes.map(node => ({
            id: node.id,
            x: Number(node.position.x.toFixed(2)),
            y: Number(node.position.y.toFixed(2)),
            z: Number(node.position.z.toFixed(2)),
            neighbors: node.neighbors.map(n => n.id)
        }));
        return JSON.stringify(data);
    }

    public deserialize(json: string) {
        try {
            const data = JSON.parse(json);
            this.nodes = [];
            
            // 1. Create Nodes
            const nodeMap = new Map<number, NavNode>();
            
            for (const item of data) {
                const node: NavNode = {
                    id: item.id,
                    position: new THREE.Vector3(item.x, item.y, item.z),
                    neighbors: []
                };
                this.nodes.push(node);
                nodeMap.set(item.id, node);
            }

            // 2. Link Neighbors
            for (const item of data) {
                const node = nodeMap.get(item.id);
                if (node && item.neighbors) {
                    for (const neighborId of item.neighbors) {
                        const neighbor = nodeMap.get(neighborId);
                        if (neighbor) {
                            node.neighbors.push(neighbor);
                        }
                    }
                }
            }
            
            console.log(`Navigation Graph Loaded: ${this.nodes.length} nodes from file.`);
            
            // 3. Build Spatial Grid
            this.buildSpatialGrid();
            
        } catch (e) {
            console.error("Failed to load navmesh:", e);
            this.nodes = [];
        }
    }

    public async loadGraph(mapName: string = 'de_dust2_d') {
        try {
            const fileName = `/${mapName}.navmesh.json`;
            console.log(`Loading Navmesh from: ${fileName}`);
            const response = await fetch(fileName);
            if (response.ok) {
                const json = await response.text();
                this.deserialize(json);
                return true;
            } else {
                 console.warn(`Navmesh file not found: ${fileName} (${response.status})`);
            }
        } catch (e) {
            console.warn("Error loading navmesh:", e);
        }
        return false;
    }

    public debugDraw(scene: THREE.Scene) {
        if (this.nodes.length === 0) return;

        console.log(`[NavSystem] Debug Draw Start: ${this.nodes.length} nodes...`);

        // Create mesh
        // Use Box instead of Points for guaranteed visibility
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.InstancedMesh(geometry, material, this.nodes.length);
        
        const dummy = new THREE.Object3D();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            dummy.position.copy(node.position);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        
        scene.add(mesh);
        
        // Lines
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
        const points: THREE.Vector3[] = [];
        
        let connectionCount = 0;
        
        for (const node of this.nodes) {
            for (const neighbor of node.neighbors) {
                // Avoid duplicates by ID check?
                if (node.id < neighbor.id) {
                     points.push(node.position);
                     points.push(neighbor.position);
                     connectionCount++;
                }
            }
        }
        
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        scene.add(lines);
        
        console.log(`[NavSystem] Debug Draw: ${this.nodes.length} nodes (Boxes), ${connectionCount} connections.`);
    }

    public drawPath(path: THREE.Vector3[], color: number = 0x0000ff) {
        // Simple visual for a single path
        // This creates a Line object. Note: Calling this every frame is expensive if not managed.
        // Better to use a dedicated highly performant line manager, but for debug:
        
        const points = path.map(p => new THREE.Vector3(p.x, p.y + 0.5, p.z));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: color, linewidth: 3 });
        const line = new THREE.Line(geometry, material);
        
        // Add to scene with timeout? Or let caller handle?
        // Let's add and auto-remove after 1s (repath interval)
        this.game.scene.add(line);
        setTimeout(() => {
            this.game.scene.remove(line);
            geometry.dispose();
            material.dispose();
        }, 1000); // 1s visual
    }
}
