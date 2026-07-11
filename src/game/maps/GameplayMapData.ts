import * as THREE from 'three';
import type { VmfEntity } from './VmfParser';

export interface GameplayZone { id: string; kind: 'bomb-site' | 'buy-zone' | 'hostage-rescue'; team?: 'TaskForce' | 'OpFor'; center: THREE.Vector3; halfExtents: THREE.Vector3; contains(point: THREE.Vector3): boolean; }
export interface GameplayMapData { bombSites: GameplayZone[]; buyZones: GameplayZone[]; hostageSpawns: THREE.Vector3[]; rescueZones: GameplayZone[]; }

const sourceToWorld = (p: THREE.Vector3) => new THREE.Vector3(p.x * 0.02, p.z * 0.02, -p.y * 0.02);
function entityZone(entity: VmfEntity, kind: GameplayZone['kind'], index: number): GameplayZone | null {
    const points = entity.solids?.flatMap(s => s.sides.flatMap(side => side.planePoints.map(sourceToWorld))) ?? [];
    if (!points.length) return null;
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const halfExtents = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const team = entity.properties.TeamNum === '2' ? 'OpFor' : entity.properties.TeamNum === '3' ? 'TaskForce' : undefined;
    return { id: kind === 'bomb-site' ? String.fromCharCode(65 + index) : `${kind}-${index}`, kind, team, center, halfExtents, contains: p => Math.abs(p.x - center.x) <= halfExtents.x && Math.abs(p.y - center.y) <= halfExtents.y + 1.5 && Math.abs(p.z - center.z) <= halfExtents.z };
}

export function extractGameplayMapData(entities: VmfEntity[]): GameplayMapData {
    const bombEntities = entities.filter(e => e.classname === 'func_bomb_target');
    const buyEntities = entities.filter(e => e.classname === 'func_buyzone');
    const rescueEntities = entities.filter(e => e.classname === 'func_hostage_rescue');
    const parseOrigin = (value?: string) => {
        if (!value) return null; const n = value.split(/\s+/).map(Number); return n.length === 3 ? sourceToWorld(new THREE.Vector3(n[0], n[1], n[2])) : null;
    };
    return {
        bombSites: bombEntities.map((e, i) => entityZone(e, 'bomb-site', i)).filter((z): z is GameplayZone => !!z),
        buyZones: buyEntities.map((e, i) => entityZone(e, 'buy-zone', i)).filter((z): z is GameplayZone => !!z),
        hostageSpawns: entities.filter(e => e.classname === 'hostage_entity').map(e => parseOrigin(e.properties.origin)).filter((p): p is THREE.Vector3 => !!p),
        rescueZones: rescueEntities.map((e, i) => entityZone(e, 'hostage-rescue', i)).filter((z): z is GameplayZone => !!z),
    };
}

export function validateDefusalMap(data: GameplayMapData, tSpawns: number, ctSpawns: number): string[] {
    const errors: string[] = [];
    if (tSpawns < 1) errors.push('Missing OpFor spawn group');
    if (ctSpawns < 1) errors.push('Missing TaskForce spawn group');
    if (data.bombSites.length !== 2) errors.push(`Expected 2 bomb sites, found ${data.bombSites.length}`);
    if (data.buyZones.length < 2) errors.push(`Expected at least 2 buy zones, found ${data.buyZones.length}`);
    return errors;
}
