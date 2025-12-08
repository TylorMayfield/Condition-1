import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Game } from '../../engine/Game';
import { GameObject } from '../../engine/GameObject';
import { DestructibleWall } from '../components/DestructibleWall';

export interface MapGeometry {
    type: 'box' | 'ramp' | 'stairs' | 'cylinder' | 'plane';
    position: [number, number, number];
    size: [number, number, number];
    rotation?: [number, number, number]; // Euler angles in degrees
    color?: number;
    material?: {
        friction?: number;
        restitution?: number;
    };
    // For ramps
    rampDirection?: 'x' | 'z'; // Which axis the ramp slopes along
    // For stairs
    stepCount?: number;
    stepHeight?: number;
    stepDepth?: number;
}

export interface MapSpawnPoint {
    position: [number, number, number];
    team?: 'ct' | 't' | 'neutral';
    type?: 'player' | 'enemy' | 'squad';
}

export interface MapDefinition {
    name: string;
    version: string;
    bounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
    floor?: {
        position: [number, number, number];
        size: [number, number, number];
        color?: number;
    };
    geometry: MapGeometry[];
    spawnPoints?: MapSpawnPoint[];
    destructibleWalls?: Array<{
        position: [number, number, number];
        width: number;
        height: number;
    }>;
}

export class MapLoader {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    public async loadMap(mapData: MapDefinition): Promise<void> {
        // Load floor
        if (mapData.floor) {
            this.createFloor(
                new THREE.Vector3(...mapData.floor.position),
                new THREE.Vector3(...mapData.floor.size),
                mapData.floor.color || 0x888888
            );
        }

        // Load geometry
        for (const geom of mapData.geometry) {
            this.createGeometry(geom);
        }

        // Load destructible walls
        if (mapData.destructibleWalls) {
            for (const wall of mapData.destructibleWalls) {
                new DestructibleWall(
                    this.game,
                    new THREE.Vector3(...wall.position),
                    wall.width,
                    wall.height
                );
            }
        }
    }

    private createFloor(pos: THREE.Vector3, size: THREE.Vector3, color: number) {
        const go = new GameObject(this.game);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape,
            material: new CANNON.Material({ friction: 0.8, restitution: 0 })
        });

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    private createGeometry(geom: MapGeometry) {
        switch (geom.type) {
            case 'box':
                this.createBox(geom);
                break;
            case 'ramp':
                this.createRamp(geom);
                break;
            case 'stairs':
                this.createStairs(geom);
                break;
            case 'cylinder':
                this.createCylinder(geom);
                break;
            case 'plane':
                this.createPlane(geom);
                break;
        }
    }

    private createBox(geom: MapGeometry) {
        const go = new GameObject(this.game);
        const pos = new THREE.Vector3(...geom.position);
        const size = new THREE.Vector3(...geom.size);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        if (geom.rotation) {
            const euler = new THREE.Euler(
                THREE.MathUtils.degToRad(geom.rotation[0]),
                THREE.MathUtils.degToRad(geom.rotation[1]),
                THREE.MathUtils.degToRad(geom.rotation[2])
            );
            go.body.quaternion.setFromEuler(euler.x, euler.y, euler.z);
        }

        if (geom.material) {
            go.body.material = new CANNON.Material({
                friction: geom.material.friction ?? 0.8,
                restitution: geom.material.restitution ?? 0
            });
        }

        // Visuals
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ 
            color: geom.color || 0xcccccc 
        });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        if (geom.rotation) {
            go.mesh.rotation.set(
                THREE.MathUtils.degToRad(geom.rotation[0]),
                THREE.MathUtils.degToRad(geom.rotation[1]),
                THREE.MathUtils.degToRad(geom.rotation[2])
            );
        }
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    private createRamp(geom: MapGeometry) {
        const pos = new THREE.Vector3(...geom.position);
        const size = new THREE.Vector3(...geom.size);
        const direction = geom.rampDirection || 'z';
        const slopeAngle = Math.atan2(size.y, direction === 'z' ? size.z : size.x);

        // Create ramp using a rotated box for physics
        const go = new GameObject(this.game);

        // Physics - use a box rotated to create the slope
        const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
        const shape = new CANNON.Box(halfExtents);
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        // Rotate around X axis for Z-direction ramp, or Z axis for X-direction ramp
        const rotationAxis = direction === 'z' ? new CANNON.Vec3(1, 0, 0) : new CANNON.Vec3(0, 0, 1);
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(rotationAxis, slopeAngle);
        go.body.quaternion = quaternion;

        if (geom.material) {
            go.body.material = new CANNON.Material({
                friction: geom.material.friction ?? 0.8,
                restitution: geom.material.restitution ?? 0
            });
        }

        // Visuals - create a sloped plane
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshStandardMaterial({ 
            color: geom.color || 0xaaaaaa 
        });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        
        if (direction === 'z') {
            go.mesh.rotation.x = slopeAngle;
        } else {
            go.mesh.rotation.z = -slopeAngle;
        }
        
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    private createStairs(geom: MapGeometry) {
        const pos = new THREE.Vector3(...geom.position);
        const size = new THREE.Vector3(...geom.size);
        const stepCount = geom.stepCount || 10;
        const stepHeight = geom.stepHeight || (size.y / stepCount);
        const stepDepth = geom.stepDepth || (size.z / stepCount);
        const stepWidth = size.x;

        const startY = pos.y - size.y / 2;
        const startZ = pos.z - size.z / 2;

        for (let i = 0; i < stepCount; i++) {
            const stepY = startY + (i + 0.5) * stepHeight;
            const stepZ = startZ + (i + 0.5) * stepDepth;

            const stepGo = new GameObject(this.game);

            // Physics
            const stepShape = new CANNON.Box(new CANNON.Vec3(stepWidth / 2, stepHeight / 2, stepDepth / 2));
            stepGo.body = new CANNON.Body({
                mass: 0,
                position: new CANNON.Vec3(pos.x, stepY, stepZ),
                shape: stepShape
            });

            if (geom.material) {
                stepGo.body.material = new CANNON.Material({
                    friction: geom.material.friction ?? 0.8,
                    restitution: geom.material.restitution ?? 0
                });
            }

            // Visuals
            const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const stepMat = new THREE.MeshStandardMaterial({ 
                color: geom.color || 0xbbbbbb 
            });
            stepGo.mesh = new THREE.Mesh(stepGeo, stepMat);
            stepGo.mesh.position.set(pos.x, stepY, stepZ);
            stepGo.mesh.castShadow = true;
            stepGo.mesh.receiveShadow = true;

            this.game.addGameObject(stepGo);
        }
    }

    private createCylinder(geom: MapGeometry) {
        const go = new GameObject(this.game);
        const pos = new THREE.Vector3(...geom.position);
        const size = new THREE.Vector3(...geom.size);
        const radius = Math.max(size.x, size.z) / 2;
        const height = size.y;

        // Physics - CANNON cylinders are along Y axis by default (upright)
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        if (geom.material) {
            go.body.material = new CANNON.Material({
                friction: geom.material.friction ?? 0.8,
                restitution: geom.material.restitution ?? 0
            });
        }

        // Visuals
        const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
        const mat = new THREE.MeshStandardMaterial({ 
            color: geom.color || 0xcccccc 
        });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        go.mesh.rotation.x = Math.PI / 2;
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    private createPlane(geom: MapGeometry) {
        const go = new GameObject(this.game);
        const pos = new THREE.Vector3(...geom.position);
        const size = new THREE.Vector3(...geom.size);

        // Physics - use a thin box
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, 0.1, size.z / 2));
        go.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            shape: shape
        });

        if (geom.rotation) {
            const euler = new THREE.Euler(
                THREE.MathUtils.degToRad(geom.rotation[0]),
                THREE.MathUtils.degToRad(geom.rotation[1]),
                THREE.MathUtils.degToRad(geom.rotation[2])
            );
            go.body.quaternion.setFromEuler(euler.x, euler.y, euler.z);
        }

        if (geom.material) {
            go.body.material = new CANNON.Material({
                friction: geom.material.friction ?? 0.8,
                restitution: geom.material.restitution ?? 0
            });
        }

        // Visuals
        const geo = new THREE.PlaneGeometry(size.x, size.z);
        const mat = new THREE.MeshStandardMaterial({ 
            color: geom.color || 0x888888,
            side: THREE.DoubleSide
        });
        go.mesh = new THREE.Mesh(geo, mat);
        go.mesh.position.copy(pos);
        if (geom.rotation) {
            go.mesh.rotation.set(
                THREE.MathUtils.degToRad(geom.rotation[0]),
                THREE.MathUtils.degToRad(geom.rotation[1]),
                THREE.MathUtils.degToRad(geom.rotation[2])
            );
        }
        go.mesh.castShadow = true;
        go.mesh.receiveShadow = true;

        this.game.addGameObject(go);
    }

    public getSpawnPoints(mapData: MapDefinition, team?: 'ct' | 't' | 'neutral'): THREE.Vector3[] {
        if (!mapData.spawnPoints) return [];

        return mapData.spawnPoints
            .filter(spawn => !team || spawn.team === team || spawn.team === 'neutral')
            .map(spawn => new THREE.Vector3(...spawn.position));
    }
}

