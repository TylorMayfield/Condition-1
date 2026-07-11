import type { Game } from '../../engine/Game';
import type { EntitySpawner } from '../EntitySpawner';
import { VmfMapLoader } from '../loaders/VmfMapLoader';
import { BrushMapLoader } from '../loaders/BrushMapLoader';
import { TextMapLoader } from '../loaders/TextMapLoader';

export interface MapLoadContext {
    game: Game;
    entitySpawner: EntitySpawner;
    initNavmesh(mapName: string): void;
}

/** Unified map loader — register new formats without editing LevelGenerator. */
export interface IMapLoader {
    readonly id: string;
    readonly label: string;
    /** Lower priority is tried first. */
    readonly priority: number;
    canLoad(mapName: string): Promise<boolean>;
    load(ctx: MapLoadContext, mapName: string): Promise<void>;
}

/** @deprecated Use IMapLoader */
export type MapFormatLoader = IMapLoader;

export function registerMapLoader(loaders: IMapLoader[], loader: IMapLoader): IMapLoader[] {
    return [...loaders, loader].sort((a, b) => a.priority - b.priority);
}

export async function loadMapFromRegistry(
    loaders: IMapLoader[],
    ctx: MapLoadContext,
    mapName: string,
): Promise<void> {
    const sorted = [...loaders].sort((a, b) => a.priority - b.priority);

    for (const loader of sorted) {
        if (await loader.canLoad(mapName)) {
            console.log(`Loading as ${loader.label} (${loader.id}): ${mapName}`);
            await loader.load(ctx, mapName);
            return;
        }
    }
    throw new Error(`Map not found in any supported format: ${mapName}`);
}

export function createDefaultMapLoaders(game: Game): IMapLoader[] {
    const vmfLoader = new VmfMapLoader(game);
    const brushMapLoader = new BrushMapLoader(game);
    const textMapLoader = new TextMapLoader(game);

    return [
        {
            id: 'vmf',
            label: 'VMF',
            priority: 0,
            canLoad: (mapName) => VmfMapLoader.check(mapName),
            load: async (ctx, mapName) => {
                await vmfLoader.load(mapName);
                ctx.initNavmesh(mapName);
            },
        },
        {
            id: 'brushmap',
            label: 'BrushMap',
            priority: 10,
            canLoad: (mapName) => BrushMapLoader.check(mapName),
            load: async (ctx, mapName) => {
                const brushMap = await brushMapLoader.load(mapName);
                ctx.entitySpawner.spawnFromBrushMap(brushMap);
            },
        },
        {
            id: 'textmap',
            label: 'TextMap',
            priority: 20,
            canLoad: (mapName) => TextMapLoader.check(mapName),
            load: async (ctx, mapName) => {
                const textMap = await textMapLoader.load(mapName);
                ctx.entitySpawner.spawnFromTextMap(textMap);
            },
        },
    ];
}

/** Back-compat alias */
export const createDefaultMapFormatLoaders = createDefaultMapLoaders;
