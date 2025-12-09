import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../engine/Game';
import { GameObject } from '../engine/GameObject';
import { Enemy } from './Enemy';
import { DestructibleWall } from './components/DestructibleWall';
import { TileMap } from './maps/TileMap';
import type { TileMapDefinition } from './maps/TileMap';
import { MapRenderer } from './maps/MapRenderer';
import { SquadMember } from './SquadMember';
import { TextMap } from './maps/TextMap';
import { TextMapParser } from './maps/TextMapParser';
import { TextMapRenderer } from './maps/TextMapRenderer';
import { BrushMap } from './maps/BrushMap';
import { BrushMapParser } from './maps/BrushMapParser';
import { BrushMapRenderer } from './maps/BrushMapRenderer';
import { VmfParser } from './maps/VmfParser';
import { VmfGeometryBuilder } from './maps/VmfGeometryBuilder';
import { VmfWorldBuilder } from './maps/VmfWorldBuilder';

export class LevelGenerator {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async loadMap(mapName: string): Promise<void> {
        try {
            // Priority 1: BrushMap (.brushmap)
            if (mapName.endsWith('.brushmap') || await this.isBrushMap(mapName)) {
                await this.loadBrushMap(mapName);
                return;
            }

            // Priority 2: VMF (.vmf) - Valve Map Format (New Standard)
            if (mapName.endsWith('.vmf') || await this.isVmfMap(mapName)) {
                await this.loadVmfMap(mapName);
                return;
            }

            // Priority 3: TextMap (.textmap)
            if (mapName.endsWith('.textmap') || await this.isTextMap(mapName)) {
                await this.loadTextMap(mapName);
                return;
            }

            // Priority 4: Legacy JSON Maps (Voxel or Tile)
            // Load map JSON file using dynamic import
            const mapModule = await import(`./maps/${mapName}.json`);
            const mapData = mapModule.default || mapModule;

            // Determine map type
            if ('blocks' in mapData) {
                // Voxel Map
                const { VoxelMap } = await import('./maps/VoxelMap');
                const { VoxelMapRenderer } = await import('./maps/VoxelMapRenderer');

                const voxelMap = new VoxelMap(this.game, mapData);
                const renderer = new VoxelMapRenderer(this.game, voxelMap);
                renderer.render();

                this.spawnFromVoxelMap(voxelMap);
            } else {
                // Tile Map (Legacy)
                const mapDataTyped: TileMapDefinition = mapData;
                const tileMap = new TileMap(this.game, mapDataTyped);
                const renderer = new MapRenderer(this.game, tileMap);
                renderer.render();

                this.spawnFromTileMap(tileMap);
            }
        } catch (error) {
            console.error(`Failed to load map ${mapName}:`, error);
            // Fallback to random generation
            this.generate();
        }
    }

    /**
     * Check if a map is a BrushMap by trying to load the .brushmap file.
     */
    private async isBrushMap(mapName: string): Promise<boolean> {
        try {
            await import(`./maps/${mapName}.brushmap?raw`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a map is a VMF file by trying to load the .vmf file.
     */
    private async isVmfMap(mapName: string): Promise<boolean> {
        try {
            await import(`./maps/${mapName}.vmf?raw`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load and render a VMF file.
     */
    private async loadVmfMap(mapName: string): Promise<void> {
        const fileName = mapName.endsWith('.vmf') ? mapName : `${mapName}.vmf`;
        const nameWithoutExt = fileName.replace('.vmf', '');

        try {
            // Import the text file as raw string
            const vmfModule = await import(`./maps/${nameWithoutExt}.vmf?raw`);
            const content = vmfModule.default || vmfModule;

            // Parse the VMF
            const mapData = VmfParser.parse(content);
            // Render Solids (World)
            // Add Atmospheric Lighting
            // Replace AmbientLight with HemisphereLight for better depth
            const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xE6CFA1, 1.2); // Increased intensity
            this.game.scene.add(hemiLight);

            const sunLight = new THREE.DirectionalLight(0xffffff, 2.0); // Increased intensity
            sunLight.position.set(50, 100, 50);
            sunLight.castShadow = true;

            // Configure shadow camera for proper coverage
            sunLight.shadow.camera.left = -100;
            sunLight.shadow.camera.right = 100;
            sunLight.shadow.camera.top = 100;
            sunLight.shadow.camera.bottom = -100;
            sunLight.shadow.camera.near = 0.5;
            sunLight.shadow.camera.far = 500;
            sunLight.shadow.mapSize.width = 2048;
            sunLight.shadow.mapSize.height = 2048;
            sunLight.shadow.bias = -0.0001;

            this.game.scene.add(sunLight);

            // Add Distance Fog (Sand color) to blend skybox
            const fogColor = new THREE.Color(0xE6CFA1);
            this.game.scene.fog = new THREE.FogExp2(fogColor, 0.002);
            this.game.scene.background = fogColor; // Match background to fog

            // Init default skybox (reset to ensure it's visible)
            this.game.skyboxManager.reset();

            console.log(`Loaded VMF Map: ${fileName} v${mapData.version}`);
            // Material creation moved to VmfWorldBuilder

            // Delegate world building (Visuals & Physics) to Builder
            const builder = new VmfWorldBuilder(this.game.scene, this.game.world);
            builder.build(mapData);

            // 1. World Solids (Handled by VmfWorldBuilder)
            if (false && mapData.world && mapData.world.solids) {
                console.log(`Processing ${mapData.world.solids.length} world solids.`);
                for (const solid of mapData.world.solids) {
                    // Check for displacement
                    const hasDisp = solid.sides.some(s => s.dispinfo);

                    // 1. Physics (Filtered: Keep Clip/Nodraw but ignore Skip/Hint)
                    // We WANT invisible walls to be solid, but we don't want optimization brushes to be solid.
                    const PHYSICS_IGNORED = [
                        'TOOLS/TOOLSTRIGGER',
                        'TOOLS/TOOLSSKIP',
                        'TOOLS/TOOLSHINT',
                        'TOOLS/TOOLSORIGIN', // Origin brushes are just points
                        'TOOLS/TOOLSFOG',
                        'TOOLS/TOOLSLIGHT',
                        'TOOLS/TOOLSAREAPORTAL', // Open portals shouldn't block, usually.
                        'TOOLS/TOOLSOCCLUDER'
                    ];

                    const physicsGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, PHYSICS_IGNORED);
                    if (physicsGeo.attributes.position && physicsGeo.attributes.position.count > 0) {
                        // Apply Scale
                        physicsGeo.scale(0.02, 0.02, 0.02);

                        // Create ConvexPolyhedron for accurate physics (Slopes/Rotated walls)
                        // Physics Geo is already scaled

                        // Convert THREE latice to CANNON points/faces
                        const geo = physicsGeo;
                        const posAttr = geo.attributes.position;
                        const points: CANNON.Vec3[] = [];
                        const faces: number[][] = [];

                        // We need to merge vertices to create a valid hull for Cannon
                        // Since buffer geometry has duplicated vertices for flat shading (triangle soup),
                        // we need to find unique vertices and rebuild faces.

                        // Simple approach: Use vertices as is? No, Cannon needs shared vertices for faces.
                        // Better approach: Use a map to find unique vertices.
                        const vertsMap = new Map<string, number>();

                        for (let i = 0; i < posAttr.count; i++) {
                            const x = posAttr.getX(i);
                            const y = posAttr.getY(i);
                            const z = posAttr.getZ(i);
                            const key = `${x.toFixed(4)}_${y.toFixed(4)}_${z.toFixed(4)}`;

                            if (!vertsMap.has(key)) {
                                vertsMap.set(key, points.length);
                                points.push(new CANNON.Vec3(x, y, z));
                            }
                        }

                        // Reconstruct faces (Triangles)
                        // BufferGeometry is a list of triangles.
                        for (let i = 0; i < posAttr.count; i += 3) {
                            const a = vertsMap.get(`${posAttr.getX(i).toFixed(4)}_${posAttr.getY(i).toFixed(4)}_${posAttr.getZ(i).toFixed(4)}`)!;
                            const b = vertsMap.get(`${posAttr.getX(i + 1).toFixed(4)}_${posAttr.getY(i + 1).toFixed(4)}_${posAttr.getZ(i + 1).toFixed(4)}`)!;
                            const c = vertsMap.get(`${posAttr.getX(i + 2).toFixed(4)}_${posAttr.getY(i + 2).toFixed(4)}_${posAttr.getZ(i + 2).toFixed(4)}`)!;
                            faces.push([a, b, c]);
                        }

                        if (points.length > 3) {
                            const shape = new CANNON.ConvexPolyhedron({ vertices: points, faces: faces });
                            const body = new CANNON.Body({
                                mass: 0, // static
                                shape: shape
                            });
                            // ConvexPolyhedron is centered at local 0,0,0 relative to vertices?
                            // No, vertices are world space (from VmfGeometryBuilder).
                            // A Body position 0 with World Space vertices works.
                            body.position.set(0, 0, 0);
                            this.game.world.addBody(body);
                        } else if (hasDisp) {
                            console.warn("Skipping physics for displacement solid.");
                        }
                    } else if (hasDisp) {
                        console.warn("Displacement solid produced no physics vertices.");
                    }

                    // 2. Visuals (Filtered)
                    const VISUAL_IGNORED = [
                        'TOOLS/TOOLSCLIP',
                        'TOOLS/TOOLSTRIGGER',
                        'TOOLS/TOOLSSKIP',
                        'TOOLS/TOOLSHINT',
                        'TOOLS/TOOLSORIGIN',
                        'TOOLS/TOOLSFOG',
                        'TOOLS/TOOLSLIGHT',
                        'TOOLS/TOOLSAREAPORTAL',
                        'TOOLS/TOOLSOCCLUDER',
                        'TOOLS/TOOLSNODRAW',
                        'TOOLS/TOOLSSKYBOX'
                    ];

                    const visualGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, VISUAL_IGNORED);
                    if (visualGeo.attributes.position && visualGeo.attributes.position.count > 0) {
                        visualGeo.scale(0.02, 0.02, 0.02);
                        const mesh = new THREE.Mesh(visualGeo, material);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        this.game.scene.add(mesh);
                    }
                }
            }

            // Render Entities
            // 2. Entities (Handled by VmfWorldBuilder)
            // 2. Entities (Logic)
            for (const entity of mapData.entities) {
                this.spawnVmfEntity(entity);
            }

            // Legacy Physics (Disabled)
            if (false) { // was entity loop
                // Func_detail (Solids)
                if (entity.solids && entity.solids.length > 0) {
                    // Filter non-solid entities
                    const isIllusionary = entity.classname === 'func_illusionary';
                    const isNonSolidBrush = entity.classname === 'func_brush' && entity.properties['solidity'] === '1'; // 1 = Never Solid
                    const shouldCreatePhysics = !isIllusionary && !isNonSolidBrush;

                    for (const solid of entity.solids) {
                        // 1. Physics
                        const PHYSICS_IGNORED = [
                            'TOOLS/TOOLSTRIGGER',
                            'TOOLS/TOOLSSKIP',
                            'TOOLS/TOOLSHINT',
                            'TOOLS/TOOLSORIGIN',
                            'TOOLS/TOOLSFOG',
                            'TOOLS/TOOLSLIGHT',
                            'TOOLS/TOOLSAREAPORTAL',
                            'TOOLS/TOOLSOCCLUDER'
                        ];

                        if (shouldCreatePhysics) {
                            const physicsGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, PHYSICS_IGNORED);
                            if (physicsGeo.attributes.position && physicsGeo.attributes.position.count > 0) {
                                physicsGeo.scale(0.02, 0.02, 0.02);
                                physicsGeo.computeBoundingBox();
                                const box = physicsGeo.boundingBox!;
                                const size = new THREE.Vector3();
                                box.getSize(size);
                                const center = new THREE.Vector3();
                                box.getCenter(center);

                                if (size.x > 0.01 && size.y > 0.01 && size.z > 0.01) {
                                    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
                                    const body = new CANNON.Body({
                                        mass: 0,
                                        position: new CANNON.Vec3(center.x, center.y, center.z), // Center is already scaled
                                        shape: shape
                                    });
                                    this.game.world.addBody(body);
                                }
                            }
                        }

                        // 2. Visuals (Filtered)
                        const VISUAL_IGNORED = [
                            'TOOLS/TOOLSCLIP',
                            'TOOLS/TOOLSTRIGGER',
                            'TOOLS/TOOLSSKIP',
                            'TOOLS/TOOLSHINT',
                            'TOOLS/TOOLSORIGIN',
                            'TOOLS/TOOLSFOG',
                            'TOOLS/TOOLSLIGHT',
                            'TOOLS/TOOLSAREAPORTAL',
                            'TOOLS/TOOLSOCCLUDER',
                            'TOOLS/TOOLSNODRAW',
                            'TOOLS/TOOLSSKYBOX'
                        ];

                        const visualGeo = VmfGeometryBuilder.buildSolidGeometry(solid, true, VISUAL_IGNORED);
                        if (visualGeo.attributes.position && visualGeo.attributes.position.count > 0) {
                            visualGeo.scale(0.02, 0.02, 0.02);
                            const mesh = new THREE.Mesh(visualGeo, material);
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            this.game.scene.add(mesh);
                        }
                    }
                }

                this.spawnVmfEntity(entity);
            }

        } catch (error) {
            console.error(`Failed to load VMF map ${mapName}:`, error);
            throw error;
        }
    }

    private createDevTexture(): THREE.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#CCCCCC';
        ctx.font = '10px Arial';
        ctx.fillText('DEV', 5, 20);
        ctx.fillText('TEX', 20, 40);
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 64, 64);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    private spawnVmfEntity(entity: any) {
        if (!entity.classname) return;

        const origin = entity.origin as THREE.Vector3;
        if (!origin) return;

        // Coords: Source (x, y, z) -> Three (x*S, z*S, -y*S)
        const scale = 0.02;
        const pos = new THREE.Vector3(origin.x * scale, origin.z * scale, -origin.y * scale);

        console.log(`Spawning ${entity.classname} at VMF(${origin.x}, ${origin.y}, ${origin.z}) -> World(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);

        if (entity.classname === 'info_player_start' || entity.classname === 'info_player_counterterrorist') {
            if (this.game.player && this.game.player.body) {
                const player = this.game.player;
                // Reset player pos
                // Increased spawn height to 50 (approx 1.5m) to ensure not stuck in floor
                player.body!.position.set(pos.x, pos.y + 5, pos.z);
                player.body!.velocity.set(0, 0, 0);
            }
        } else if (entity.classname === 'info_player_terrorist') {
            if (this.game.player) {
                // Spawn enemy here
                const enemy = new Enemy(this.game, pos);
                this.game.addGameObject(enemy);
            }
        }
    }

    /**
     * Load and render a BrushMap file.
     */
    private async loadBrushMap(mapName: string): Promise<void> {
        const fileName = mapName.endsWith('.brushmap') ? mapName : `${mapName}.brushmap`;
        const nameWithoutExt = fileName.replace('.brushmap', '');

        try {
            // Import the text file as raw string
            const brushModule = await import(`./maps/${nameWithoutExt}.brushmap?raw`);
            const content = brushModule.default || brushModule;

            // Parse the BrushMap
            const mapData = BrushMapParser.parse(content);
            const brushMap = new BrushMap(this.game, mapData);

            // Render the map
            const renderer = new BrushMapRenderer(this.game, brushMap);
            renderer.render();

            // Spawn entities
            this.spawnFromBrushMap(brushMap);

            console.log(`Loaded BrushMap: ${mapData.name} v${mapData.version} (${mapData.brushes.length} brushes)`);
        } catch (error) {
            console.error(`Failed to load BrushMap ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Spawn entities from a BrushMap.
     */
    private spawnFromBrushMap(brushMap: BrushMap): void {
        const spawnPoints = brushMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: { position: THREE.Vector3; name?: string }[] = [];

        for (const spawn of spawnPoints) {
            // Calculate body center height
            const spawnPos = spawn.position.clone();
            spawnPos.y += 0.8;

            switch (spawn.type) {
                case 'player_spawn':
                    if (this.game.player && this.game.player.body) {
                        this.game.player.body.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                        console.log(`Player spawned at: ${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z}`);
                    }
                    break;
                case 'enemy_spawn':
                    const enemy = new Enemy(this.game, spawnPos);
                    this.game.addGameObject(enemy);
                    break;
                case 'squad_spawn':
                    squadSpawns.push({ position: spawnPos, name: spawn.name });
                    break;
            }
        }

        // Spawn squad members
        if (squadSpawns.length > 0 && this.game.squadManager) {
            // Clear existing squad members
            this.game.squadManager.members.forEach(member => {
                member.dispose();
            });
            this.game.squadManager.members = [];

            // Spawn new squad members
            squadSpawns.forEach((spawn, index) => {
                const name = spawn.name || `Squad-${index + 1}`;
                const member = new SquadMember(this.game, spawn.position, name);
                this.game.addGameObject(member);
                this.game.squadManager.members.push(member);
            });
        }
    }

    /**
     * Check if a map is a TextMap by trying to load the .textmap file.
     */
    private async isTextMap(mapName: string): Promise<boolean> {
        try {
            // Try to import the textmap file
            await import(`./maps/${mapName}.textmap?raw`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load and render a TextMap file.
     */
    private async loadTextMap(mapName: string): Promise<void> {
        const fileName = mapName.endsWith('.textmap') ? mapName : `${mapName}.textmap`;
        const nameWithoutExt = fileName.replace('.textmap', '');

        try {
            // Import the text file as raw string (Vite handles this)
            const textModule = await import(`./maps/${nameWithoutExt}.textmap?raw`);
            const content = textModule.default || textModule;

            // Parse the TextMap
            const mapData = TextMapParser.parse(content);
            const textMap = new TextMap(this.game, mapData);

            // Render the map
            const renderer = new TextMapRenderer(this.game, textMap);
            renderer.render();

            // Spawn entities
            this.spawnFromTextMap(textMap);

            console.log(`Loaded TextMap: ${mapData.name} v${mapData.version}`);
        } catch (error) {
            console.error(`Failed to load TextMap ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Spawn entities from a TextMap.
     */
    private spawnFromTextMap(textMap: TextMap): void {
        const spawnPoints = textMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: { position: THREE.Vector3; name?: string }[] = [];

        for (const spawn of spawnPoints) {
            // Calculate body center height (0.8m above floor)
            const spawnPos = spawn.position.clone();
            spawnPos.y += 0.8; // Body center offset for 1.6m tall entity

            switch (spawn.type) {
                case 'player_spawn':
                    if (this.game.player && this.game.player.body) {
                        this.game.player.body.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                        console.log(`Player spawned at: ${spawnPos.x}, ${spawnPos.y}, ${spawnPos.z}`);
                    }
                    break;
                case 'enemy_spawn':
                    const enemy = new Enemy(this.game, spawnPos);
                    this.game.addGameObject(enemy);
                    break;
                case 'squad_spawn':
                    squadSpawns.push({ position: spawnPos, name: spawn.name });
                    break;
            }
        }

        // Spawn squad members
        if (squadSpawns.length > 0 && this.game.squadManager) {
            // Clear existing squad members
            this.game.squadManager.members.forEach(member => {
                member.dispose();
            });
            this.game.squadManager.members = [];

            // Spawn new squad members
            squadSpawns.forEach((spawn, index) => {
                const name = spawn.name || `Squad-${index + 1}`;
                const member = new SquadMember(this.game, spawn.position, name);
                this.game.addGameObject(member);
                this.game.squadManager.members.push(member);
            });
        }
    }

    private spawnFromVoxelMap(voxelMap: any) {
        const spawnPoints = voxelMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const scale = voxelMap.scale;

        for (const spawn of spawnPoints) {
            // Spawn point y is in grid coords, convert to world: floor surface + body center offset
            const worldPos = new THREE.Vector3(
                spawn.x * scale,
                (spawn.y + 1) * scale + 0.8, // +1 to stand ON the block, +0.8 for body center
                spawn.z * scale
            );

            switch (spawn.type) {
                case 'player':
                    if (this.game.player && this.game.player.body) {
                        this.game.player.body.position.set(worldPos.x, worldPos.y, worldPos.z);
                    }
                    break;
                case 'enemy':
                    const enemy = new Enemy(this.game, worldPos);
                    this.game.addGameObject(enemy);
                    break;
                // Add squad handling if needed
            }
        }
    }

    private spawnFromTileMap(tileMap: TileMap) {
        const spawnPoints = tileMap.getSpawnPoints();
        if (spawnPoints.length === 0) return;

        const squadSpawns: THREE.Vector3[] = [];

        for (const spawn of spawnPoints) {
            switch (spawn.type) {
                case 'player':
                    if (this.game.player && this.game.player.body) {
                        // Player body is a sphere with radius 0.5
                        // Spawn position includes body offset (0.8), but player sphere should be at floor + 0.5
                        // So adjust: floor + 0.8 - 0.3 = floor + 0.5
                        const playerY = spawn.position.y - 0.3;
                        this.game.player.body.position.set(
                            spawn.position.x,
                            Math.max(0.5, playerY), // Ensure minimum height so player doesn't fall through
                            spawn.position.z
                        );
                    }
                    break;
                case 'squad':
                    squadSpawns.push(spawn.position);
                    break;
                case 'enemy':
                    const enemy = new Enemy(this.game, spawn.position);
                    this.game.addGameObject(enemy);
                    break;
            }
        }

        // Spawn squad members at their spawn points
        if (squadSpawns.length > 0 && this.game.squadManager) {
            // Clear existing squad members
            this.game.squadManager.members.forEach(member => {
                member.dispose();
            });
            this.game.squadManager.members = [];

            // Spawn new squad members
            squadSpawns.forEach((pos, index) => {
                const member = new SquadMember(this.game, pos, `Squad-${index + 1}`);
                this.game.addGameObject(member);
                this.game.squadManager.members.push(member);
            });
        }
    }

    public generate(playerTarget?: GameObject) {
        // Floor
        this.createBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(50, 1, 50), 0);

        // Random Walls
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = (Math.random() - 0.5) * 40;
            // Don't spawn on spawn point
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

            // 30% chance of Destructible Wall
            if (Math.random() < 0.3) {
                const w = 2 + Math.random() * 2;
                const h = 2 + Math.random() * 2;
                new DestructibleWall(this.game, new THREE.Vector3(x, 0, z), w, h);
            } else {
                const w = 1 + Math.random() * 5;
                const h = 2 + Math.random() * 3;
                const d = 1 + Math.random() * 5;
                this.createBox(new THREE.Vector3(x, h / 2, z), new THREE.Vector3(w, h, d), 0);
            }
        }

        // Random Enemies
        if (playerTarget) {
            for (let i = 0; i < 5; i++) {
                const x = (Math.random() - 0.5) * 30;
                const z = (Math.random() - 0.5) * 30;
                // Avoid spawn
                if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

                const enemy = new Enemy(this.game, new THREE.Vector3(x, 1, z));
                // AI automatically targets player via Game.player
                this.game.addGameObject(enemy);
            }
        }
    }

    private createBox(pos: THREE.Vector3, size: THREE.Vector3, mass: number = 0) {
        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: mass,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }
}
