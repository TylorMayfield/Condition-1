import * as THREE from 'three';
import { init, NavMesh, NavMeshQuery, Crowd, CrowdAgent } from 'recast-navigation';
import { threeToSoloNavMesh, NavMeshHelper, CrowdHelper } from '@recast-navigation/three';
import { Game } from '../../engine/Game';

/**
 * Navigation system using the industry-standard Recast/Detour library
 * Provides: navmesh generation, pathfinding, and crowd simulation
 */
export class RecastNavigation {
    private game: Game;
    private navMesh: NavMesh | null = null;
    private navMeshQuery: NavMeshQuery | null = null;
    private crowd: Crowd | null = null;
    private agents: Map<number, CrowdAgent> = new Map(); // Entity ID -> CrowdAgent
    
    // Debug helpers
    private navMeshHelper: NavMeshHelper | null = null;
    private crowdHelper: CrowdHelper | null = null;
    private debugEnabled: boolean = false;

    private initialized: boolean = false;

    constructor(game: Game) {
        this.game = game;
    }

    /**
     * Initialize the Recast library (must be called before any other methods)
     */
    public async initialize(): Promise<void> {
        if (this.initialized) return;
        
        console.log('[RecastNav] Initializing...');
        await init();
        this.initialized = true;
        console.log('[RecastNav] Initialized successfully');
    }

    /**
     * Generate navmesh from scene meshes
     */
    public generateFromScene(): boolean {
        if (!this.initialized) {
            console.error('[RecastNav] Not initialized! Call initialize() first.');
            return false;
        }

        console.log('[RecastNav] Generating navmesh from scene...');
        
        // Collect all meshes from the scene
        const meshes: THREE.Mesh[] = [];
        this.game.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Skip small objects (likely not walkable surfaces)
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                if (size.x > 0.5 && size.z > 0.5) {
                    meshes.push(child);
                }
            }
        });

        if (meshes.length === 0) {
            console.error('[RecastNav] No meshes found in scene!');
            return false;
        }

        console.log(`[RecastNav] Found ${meshes.length} meshes`);

        // Generate the navmesh
        const result = threeToSoloNavMesh(meshes, {
            cs: 0.2, // Cell size (horizontal resolution)
            ch: 0.2, // Cell height (vertical resolution)
            walkableSlopeAngle: 45, // Max walkable slope angle
            walkableHeight: 2.0, // Agent height
            walkableClimb: 0.5, // Max step height
            walkableRadius: 0.6, // Agent radius
            maxEdgeLen: 12, // Max edge length
            maxSimplificationError: 1.0, // Simplification error
            minRegionArea: 8, // Min region area
            mergeRegionArea: 20, // Merge region area
            maxVertsPerPoly: 6, // Max verts per polygon
            detailSampleDist: 6, // Detail sample distance
            detailSampleMaxError: 1, // Detail sample max error
        });

        if (!result.success || !result.navMesh) {
            console.error('[RecastNav] Failed to generate navmesh!');
            return false;
        }

        this.navMesh = result.navMesh;
        this.navMeshQuery = new NavMeshQuery(this.navMesh);
        
        // Create crowd for agent management
        this.crowd = new Crowd(this.navMesh, {
            maxAgents: 50,
            maxAgentRadius: 0.6,
        });

        console.log(`[RecastNav] Navmesh generated successfully!`);
        
        return true;
    }

    /**
     * Add an agent to the crowd simulation
     */
    public addAgent(entityId: number, position: THREE.Vector3, radius: number = 0.5): CrowdAgent | null {
        if (!this.crowd || !this.navMeshQuery) return null;

        // Find nearest point on navmesh
        const nearestPoly = this.navMeshQuery.findNearestPoly(
            { x: position.x, y: position.y, z: position.z },
            { halfExtents: { x: 2, y: 4, z: 2 } }
        );

        if (!nearestPoly.success) {
            console.warn(`[RecastNav] Could not find navmesh near position for entity ${entityId}`);
            return null;
        }

        const agent = this.crowd.addAgent(nearestPoly.nearestPoint, {
            radius: radius,
            height: 2.0,
            maxAcceleration: 8.0,
            maxSpeed: 5.0,
            collisionQueryRange: 2.5, // How far to look for other agents
            pathOptimizationRange: 10.0,
            separationWeight: 2.0, // How strongly to separate from other agents
        });

        this.agents.set(entityId, agent);
        return agent;
    }

    /**
     * Remove an agent from the crowd
     */
    public removeAgent(entityId: number): void {
        const agent = this.agents.get(entityId);
        if (agent && this.crowd) {
            this.crowd.removeAgent(agent);
            this.agents.delete(entityId);
        }
    }

    /**
     * Set target position for an agent
     */
    public setAgentTarget(entityId: number, target: THREE.Vector3): boolean {
        const agent = this.agents.get(entityId);
        if (!agent || !this.navMeshQuery || !this.crowd) return false;

        // Find nearest point on navmesh to target
        const nearestPoly = this.navMeshQuery.findNearestPoly(
            { x: target.x, y: target.y, z: target.z },
            { halfExtents: { x: 5, y: 4, z: 5 } }
        );

        if (!nearestPoly.success) return false;

        agent.requestMoveTarget(nearestPoly.nearestPoint);
        return true;
    }

    /**
     * Get agent's current position
     */
    public getAgentPosition(entityId: number): THREE.Vector3 | null {
        const agent = this.agents.get(entityId);
        if (!agent) return null;
        
        const pos = agent.position();
        return new THREE.Vector3(pos.x, pos.y, pos.z);
    }

    /**
     * Get agent's current velocity
     */
    public getAgentVelocity(entityId: number): THREE.Vector3 | null {
        const agent = this.agents.get(entityId);
        if (!agent) return null;
        
        const vel = agent.velocity();
        return new THREE.Vector3(vel.x, vel.y, vel.z);
    }

    /**
     * Update the crowd simulation (call every frame)
     */
    public update(dt: number): void {
        if (this.crowd) {
            this.crowd.update(dt);
        }
        
        if (this.debugEnabled && this.crowdHelper) {
            this.crowdHelper.update();
        }
    }

    /**
     * Find a path between two points
     */
    public findPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
        if (!this.navMeshQuery) return [];

        const startPoly = this.navMeshQuery.findNearestPoly(
            { x: start.x, y: start.y, z: start.z },
            { halfExtents: { x: 2, y: 4, z: 2 } }
        );
        
        const endPoly = this.navMeshQuery.findNearestPoly(
            { x: end.x, y: end.y, z: end.z },
            { halfExtents: { x: 2, y: 4, z: 2 } }
        );

        if (!startPoly.success || !endPoly.success) return [];

        const path = this.navMeshQuery.computePath(startPoly.nearestPoint, endPoly.nearestPoint);
        
        if (!path.success || !path.path) return [];

        return path.path.map(p => new THREE.Vector3(p.x, p.y, p.z));
    }

    /**
     * Enable/disable debug visualization
     */
    public setDebugDraw(enabled: boolean): void {
        this.debugEnabled = enabled;

        if (enabled && this.navMesh && !this.navMeshHelper) {
            this.navMeshHelper = new NavMeshHelper(this.navMesh);
            this.game.scene.add(this.navMeshHelper);
        }

        if (enabled && this.crowd && !this.crowdHelper) {
            this.crowdHelper = new CrowdHelper(this.crowd);
            this.game.scene.add(this.crowdHelper);
        }

        if (!enabled) {
            if (this.navMeshHelper) {
                this.game.scene.remove(this.navMeshHelper);
                this.navMeshHelper = null;
            }
            if (this.crowdHelper) {
                this.game.scene.remove(this.crowdHelper);
                this.crowdHelper = null;
            }
        }
    }

    /**
     * Check if a position is on the navmesh
     */
    public isOnNavMesh(position: THREE.Vector3): boolean {
        if (!this.navMeshQuery) return false;
        
        const result = this.navMeshQuery.findNearestPoly(
            { x: position.x, y: position.y, z: position.z },
            { halfExtents: { x: 1, y: 2, z: 1 } }
        );
        
        return result.success;
    }

    /**
     * Get the navmesh for direct access
     */
    public getNavMesh(): NavMesh | null {
        return this.navMesh;
    }

    /**
     * Get the crowd for direct access
     */
    public getCrowd(): Crowd | null {
        return this.crowd;
    }

    public dispose(): void {
        if (this.navMeshHelper) {
            this.game.scene.remove(this.navMeshHelper);
        }
        if (this.crowdHelper) {
            this.game.scene.remove(this.crowdHelper);
        }
        this.agents.clear();
        this.crowd = null;
        this.navMesh = null;
        this.navMeshQuery = null;
    }
}
