import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';

/**
 * Generates a simple 3-lane MOBA map
 */
export class MOBAMapGenerator {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public generate(): void {
        console.log("[MOBA] Generating 3-lane map...");

        // Setup lighting first
        this.setupLighting();

        // Create ground plane
        this.createGround();

        // Create lane boundaries (visual guides)
        this.createLaneMarkings();

        // Create base structures
        this.createBases();

        // Set spawn points for teams
        this.setSpawnPoints();
    }

    private setupLighting(): void {
        // Hemisphere light for ambient illumination (sky to ground)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        hemiLight.position.set(0, 50, 0);
        this.game.scene.add(hemiLight);

        // Directional sun light (main light source)
        const gameWithLights = this.game as any;
        let sunLight = gameWithLights.mainDirectionalLight;
        
        if (!sunLight) {
            sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
            gameWithLights.mainDirectionalLight = sunLight;
        }

        // Ensure light is in scene
        if (sunLight.parent !== this.game.scene) {
            this.game.scene.add(sunLight);
        }

        // Configure sun for MOBA map (larger area)
        sunLight.intensity = 2.0;
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;

        // Shadow camera bounds (larger for MOBA map)
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.bias = -0.0005;
        sunLight.shadow.normalBias = 0.05;

        // Set scene background and fog
        this.game.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.game.scene.fog = new THREE.Fog(0x87CEEB, 50, 200); // Extended fog for larger map
    }

    private createGround(): void {
        // Large ground plane
        const groundSize = 120;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0x4a5d23, // Dark green grass
            roughness: 0.8
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.game.scene.add(ground);

        // Physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.game.world.addBody(groundBody);
    }

    private createLaneMarkings(): void {
        // Create visual lane dividers
        const laneLength = 100;
        const laneWidth = 8;

        // Top lane
        this.createLaneMarker(-laneLength / 2, laneLength / 2, 20, laneWidth, 0x0066ff);
        
        // Mid lane
        this.createLaneMarker(-laneLength / 2, laneLength / 2, 0, laneWidth, 0xffff00);
        
        // Bot lane
        this.createLaneMarker(-laneLength / 2, laneLength / 2, -20, laneWidth, 0xff0066);
    }

    private createLaneMarker(xStart: number, xEnd: number, z: number, width: number, color: number): void {
        // Create lane floor marker
        const markerGeo = new THREE.PlaneGeometry(xEnd - xStart, width);
        const markerMat = new THREE.MeshStandardMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.3,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set((xStart + xEnd) / 2, 0.01, z);
        marker.receiveShadow = true;
        this.game.scene.add(marker);
    }

    private createBases(): void {
        // Blue base (left)
        this.createBase(-50, 0, 0x0066ff, 'Blue');
        
        // Red base (right)
        this.createBase(50, 0, 0xff0000, 'Red');
    }

    private createBase(x: number, z: number, color: number, team: string): void {
        // Base platform
        const platformGeo = new THREE.CylinderGeometry(8, 8, 1, 16);
        const platformMat = new THREE.MeshStandardMaterial({ 
            color: color,
            metalness: 0.5,
            roughness: 0.3
        });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.set(x, 0.5, z);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.game.scene.add(platform);

        // Physics for platform
        const platformShape = new CANNON.Cylinder(8, 8, 1, 16);
        const platformBody = new CANNON.Body({ mass: 0 });
        platformBody.addShape(platformShape);
        platformBody.position.set(x, 0.5, z);
        this.game.world.addBody(platformBody);
    }

    private setSpawnPoints(): void {
        // Blue team spawns (left side)
        this.game.availableSpawns.CT = [
            new THREE.Vector3(-50, 2, 20),  // Top lane
            new THREE.Vector3(-50, 2, 0),  // Mid lane
            new THREE.Vector3(-50, 2, -20) // Bot lane
        ];

        // Red team spawns (right side)
        this.game.availableSpawns.T = [
            new THREE.Vector3(50, 2, 20),  // Top lane
            new THREE.Vector3(50, 2, 0),   // Mid lane
            new THREE.Vector3(50, 2, -20)  // Bot lane
        ];
    }
}

