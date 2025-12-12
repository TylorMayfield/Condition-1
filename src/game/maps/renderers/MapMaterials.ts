import * as THREE from 'three';
import type { TileMap } from '../TileMap';

export class MapMaterials {
    public readonly floor: THREE.MeshStandardMaterial;
    public readonly wall: THREE.MeshStandardMaterial;
    public readonly indoorFloor: THREE.MeshStandardMaterial;
    public readonly indoorWall: THREE.MeshStandardMaterial;
    public readonly roof: THREE.MeshStandardMaterial;
    public readonly door: THREE.MeshStandardMaterial;
    public readonly window: THREE.MeshStandardMaterial;

    constructor(tileMap: TileMap) {
        const mapData = (tileMap as any).mapData;
        const matColors = mapData.materials || {};
        
        this.floor = new THREE.MeshStandardMaterial({ color: matColors.floor || 0x888888 });
        this.wall = new THREE.MeshStandardMaterial({ color: matColors.wall || 0x666666 });
        this.indoorFloor = new THREE.MeshStandardMaterial({ color: matColors.indoorFloor || 0xaaaaaa });
        this.indoorWall = new THREE.MeshStandardMaterial({ color: matColors.indoorWall || 0x777777 });
        this.roof = new THREE.MeshStandardMaterial({ color: matColors.roof || 0x444444 });
        this.door = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        this.window = new THREE.MeshStandardMaterial({ 
            color: 0x87CEEB,
            transparent: true,
            opacity: 0.7
        });
    }
}



