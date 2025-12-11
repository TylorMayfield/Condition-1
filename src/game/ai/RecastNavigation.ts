import * as THREE from 'three';
import { init, NavMesh, NavMeshQuery, Crowd, CrowdAgent, importNavMesh } from 'recast-navigation';
import { threeToSoloNavMesh, NavMeshHelper, CrowdHelper } from '@recast-navigation/three';
import { Game } from '../../engine/Game';

// Strategic point types (matching baking script output)
export interface PatrolPoint {
    position: [number, number, number];
    score: number;
}

export interface CoverSpot {
    position: [number, number, number];
    coverDirection: [number, number, number];
    quality: number;
}

export interface ChokePoint {
    position: [number, number, number];
    width: number;
    connections: [number, number, number][];
}

export interface VantagePoint {
    position: [number, number, number];
    visibilityScore: number;
    elevation: number;
}

export interface StrategicPoints {
    patrolPoints: PatrolPoint[];
    coverSpots: CoverSpot[];
    chokePoints: ChokePoint[];
    vantagePoints: VantagePoint[];
}

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

    // Strategic tactical data
    public strategicPoints: StrategicPoints | null = null;

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
                // Include slightly smaller objects to ensure we catch stairs/platforms, but skip tiny props
                if (size.x > 0.3 && size.z > 0.3) {
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
        // Tuned for human-sized agents (Radius ~0.4m, Height ~1.8m)
        const cs = 0.2;
        const ch = 0.2;
        const result = threeToSoloNavMesh(meshes, {
            cs,
            ch,
            walkableSlopeAngle: 45,
            walkableHeight: Math.ceil(2.0 / ch), // ~10 voxels
            walkableClimb: Math.ceil(0.6 / ch), // ~3 voxels
            // Increase radius to prevent corner snagging.
            // Physics Radius 0.4m. Old Walkable 0.6m (3 voxels). Gap 0.2m.
            // New Walkable 1.0m (5 voxels). Gap 0.6m for better clearance.
            walkableRadius: Math.ceil(1.0 / cs),
            maxEdgeLen: 12,
            maxSimplificationError: 1.1, // Reduced from 1.3 to tighten mesh to walls
            minRegionArea: 8,
            mergeRegionArea: 20,
            maxVertsPerPoly: 6,
            detailSampleDist: 6,
            detailSampleMaxError: 1,
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
            maxAgentRadius: 0.4,
        });

        console.log(`[RecastNav] Navmesh generated successfully!`);

        // Auto-enable debug if in dev mode (optional, but good for now)
        // this.setDebugDraw(true);

        return true;
    }

    public reset(): void {
        this.agents.clear();
        if (this.crowd) {
            // Crowd doesn't have a clear/dispose method in all bindings, 
            // but we can just null it out and let GC handle it, or create new one.
            // If we keep navMesh, we can just recreate crowd?
            // Best to just clear everything if we are resetting level.
            this.crowd = null;
        }
        if (this.crowdHelper) {
            this.game.scene.remove(this.crowdHelper);
            this.crowdHelper = null;
        }
        if (this.navMeshHelper) {
            this.game.scene.remove(this.navMeshHelper);
            this.navMeshHelper = null;
        }
        // Keep NavMesh? Usually reset implies clearing level, so clear NavMesh too.
        this.navMesh = null;
        this.navMeshQuery = null;
    }

    /**
     * Generate navmesh from scene meshes
     */

    /**
     * Load a pre-baked navmesh from a URL/File
     */
    public async loadFromFile(url: string): Promise<boolean> {
        if (!this.initialized) await this.initialize();

        console.log(`[RecastNav] Loading navmesh from: ${url}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[RecastNav] Failed to load navmesh: ${response.statusText}`);
                return false;
            }

            const buffer = await response.arrayBuffer();
            const data = new Uint8Array(buffer);

            const result = importNavMesh(data);
            if (!result.navMesh) {
                console.error('[RecastNav] Failed to import navmesh data!');
                return false;
            }

            // Clean up old
            if (this.navMesh) this.dispose();

            this.navMesh = result.navMesh;
            this.navMeshQuery = new NavMeshQuery(this.navMesh);
            this.crowd = new Crowd(this.navMesh, {
                maxAgents: 50,
                maxAgentRadius: 0.6,
            });

            console.log(`[RecastNav] Navmesh loaded successfully!`);

            // Also try to load tactical data
            await this.loadTacticalData(url.replace('.bin', '.tactical.json'));

            return true;
        } catch (e) {
            console.error('[RecastNav] Error loading navmesh:', e);
            return false;
        }
    }

    /**
     * Load tactical/strategic point data
     */
    private async loadTacticalData(url: string): Promise<void> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[RecastNav] No tactical data found (optional): ${url}`);
                return;
            }
            this.strategicPoints = await response.json();
            console.log(`[RecastNav] Tactical data loaded: ${this.strategicPoints?.patrolPoints.length} patrol, ${this.strategicPoints?.coverSpots.length} cover, ${this.strategicPoints?.chokePoints.length} choke, ${this.strategicPoints?.vantagePoints.length} vantage`);
        } catch (e) {
            console.warn('[RecastNav] Could not load tactical data (optional):', e);
        }
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
            collisionQueryRange: radius * 12.0, // Look ahead ~4.8m
            pathOptimizationRange: radius * 30.0, // Predict path ~12m ahead
            separationWeight: 3.0, // Increased separation
            updateFlags: 7, // ANTICIPATE_TURNS | OBSTACLE_AVOIDANCE | SEPARATION
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
        if (!agent || !this.navMeshQuery || !this.crowd) {
            console.warn(`[RecastNav] setAgentTarget failed: Agent/Query/Crowd missing for ${entityId}`);
            return false;
        }

        // Find nearest point on navmesh to target
        const nearestPoly = this.navMeshQuery.findNearestPoly(
            { x: target.x, y: target.y, z: target.z },
            { halfExtents: { x: 5, y: 4, z: 5 } }
        );

        if (!nearestPoly.success) {
            console.warn(`[RecastNav] setAgentTarget failed: Target ${target.toArray()} not on NavMesh`);
            return false;
        }

        agent.requestMoveTarget(nearestPoly.nearestPoint);
        // console.log(`[RecastNav] Agent ${entityId} moving to ${target.toArray()}`);
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
     * Get the number of agents actually registered (not max capacity)
     */
    public getRegisteredAgentCount(): number {
        return this.agents.size;
    }

    /**
     * Update agent's position to match physics body
     * This prevents the agent from "ghosting" ahead of the physics body.
     */
    public updateAgentPosition(entityId: number, position: THREE.Vector3): void {
        const agent = this.agents.get(entityId);
        if (!agent || !this.crowd) return;

        // Reset agent position to match physics
        // Note: Recast agents are simulated. If we force position, we might reset velocity?
        // Usually we want to just keep them in sync.
        // CrowdAgent.teleport(pos) is the correct way.
        agent.teleport({ x: position.x, y: position.y, z: position.z });
    }

    public setAgentMaxSpeed(entityId: number, speed: number): void {
        const agent = this.agents.get(entityId);
        if (!agent || !this.crowd) return;
        agent.maxSpeed = speed;
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
     * Find a random point on the navmesh within radius of center
     */
    public getRandomPointAround(center: THREE.Vector3, radius: number): THREE.Vector3 | null {
        if (!this.navMeshQuery) return null;

        const centerPoly = this.navMeshQuery.findNearestPoly(
            { x: center.x, y: center.y, z: center.z },
            { halfExtents: { x: 4, y: 4, z: 4 } }
        );

        if (!centerPoly.success) {
            console.warn(`[RecastNav] Failed to find nearest poly to ${center.toArray()}`);
            return null;
        }

        const randomPt = this.navMeshQuery.findRandomPointAroundCircle(
            { x: center.x, y: center.y, z: center.z },
            radius,
            { startRef: centerPoly.nearestRef }
        );

        if (randomPt.success) {
            return new THREE.Vector3(randomPt.randomPoint.x, randomPt.randomPoint.y, randomPt.randomPoint.z);
        } else {
            console.warn(`[RecastNav] findRandomPointAroundCircle failed for center ${center.toArray()} radius ${radius}`);
        }

        return null;
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

        return path.path.map((p: any) => new THREE.Vector3(p.x, p.y, p.z));
    }

    /**
     * Enable/disable debug visualization
     */
    public setDebugDraw(navMeshEnabled: boolean, agentsEnabled: boolean = false): void {
        this.debugEnabled = navMeshEnabled || agentsEnabled;

        // NavMesh
        if (navMeshEnabled && this.navMesh && !this.navMeshHelper) {
            this.navMeshHelper = new NavMeshHelper(this.navMesh);
            this.game.scene.add(this.navMeshHelper);
        } else if (!navMeshEnabled && this.navMeshHelper) {
            this.game.scene.remove(this.navMeshHelper);
            this.navMeshHelper = null;
        }

        // Crowd Agents
        if (agentsEnabled && this.crowd && !this.crowdHelper) {
            this.crowdHelper = new CrowdHelper(this.crowd);
            this.game.scene.add(this.crowdHelper);
        } else if (!agentsEnabled && this.crowdHelper) {
            this.game.scene.remove(this.crowdHelper);
            this.crowdHelper = null;
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
