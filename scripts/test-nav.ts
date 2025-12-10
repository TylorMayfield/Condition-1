
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

// Mock Browser API for NavigationSystem deserialization (Request/Fetch)
// We will manually load the file and call init/deserialize.

import { NavigationSystem, NavNode } from '../src/game/ai/NavigationSystem';

const args = process.argv.slice(2);
const MAP_NAME = args[0] || 'cs_office_d';
const FILE_PATH = path.join(process.cwd(), 'public', `${MAP_NAME}.navmesh.json`);

async function testNav() {
    console.log(`[TEST] Verifying Navmesh for: ${MAP_NAME}`);
    
    if (!fs.existsSync(FILE_PATH)) {
        console.error(`[FAIL] Navmesh file not found: ${FILE_PATH}`);
        process.exit(1);
    }
    
    // Load JSON
    const jsonStr = fs.readFileSync(FILE_PATH, 'utf-8');
    const data = JSON.parse(jsonStr);
    
    if (!Array.isArray(data)) {
        console.error(`[FAIL] Navmesh JSON is not an array!`);
        process.exit(1);
    }

    console.log(`[INFO] File loaded. Nodes: ${data.length}`);
    
    if (data.length === 0) {
        console.error(`[FAIL] Navmesh is empty!`);
        process.exit(1);
    }
    
    // Mock Game
    const mockGame: any = {
        world: { raycastAll: () => {} }, // Mock physics
        scene: new THREE.Scene(),
        // Add minimal mocks required by NavigationSystem
    };
    
    const nav = new NavigationSystem(mockGame);
    nav.deserialize(jsonStr);
    
    // Test Pathfinding
    // Pick two random nodes
    const nodes = (nav as any).nodes; // Access private property
    
    if (!nodes || nodes.length === 0) {
        console.error("No nodes in navigation system!");
        process.exit(1);
    }

    const nodeA = nodes[0];
    const nodeB = nodes[Math.floor(nodes.length / 2)];
    
    console.log(`[TEST] Pathfinding from ${vecStr(nodeA.position)} to ${vecStr(nodeB.position)}`);
    
    const path = nav.findPath(nodeA.position, nodeB.position);
    
    if (path && path.length > 0) {
        console.log(`[PASS] Path found with ${path.length} waypoints.`);
        // console.log(path.map(p => vecStr(p)).join(' -> '));
    } else {
        console.error(`[FAIL] No path found (Graph connectivity issue?)`);
        // Try finding nearest nodes
        const startNode = nav.getClosestNode(nodeA.position);
        const endNode = nav.getClosestNode(nodeB.position);
        
        // Safety check if getClosestNode returns null
        const startPos = startNode ? vecStr(startNode.position) : 'null';
        const endPos = endNode ? vecStr(endNode.position) : 'null';
        
        console.log(`Nearest Start: ${startPos}, Nearest End: ${endPos}`);
    }

    // Check Graph Connectivity (Isolate Islands)
    // Simple BFS/Flood count from Node 0
    const visited = new Set<number>(); // ID is number
    const queue = [nodes[0]];
    visited.add(nodes[0].id);
    
    let count = 0;
    while (queue.length > 0) {
        const current = queue.shift()!;
        count++;
        
        // Neighbors are direct properties of NavNode
        const neighbors = current.neighbors;
        for (const n of neighbors) {
            if (!visited.has(n.id)) {
                visited.add(n.id);
                queue.push(n);
            }
        }
    }
    
    console.log(`[INFO] Reachable nodes from Node 0: ${count} / ${nodes.length}`);
    if (count < nodes.length * 0.1) {
         console.warn(`[WARN] Large fragmentation detected! Only ${count} nodes connected to start.`);
    }
}

function vecStr(v: any) {
    if (!v) return 'null';
    return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
}

testNav().catch(console.error);
