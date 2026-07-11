import { describe, expect, it } from 'vitest';
import { registerMapLoader } from './MapFormatRegistry';
import type { IMapLoader, MapLoadContext } from './MapFormatRegistry';

function stubLoader(id: string, priority: number, matches: boolean): IMapLoader {
    return {
        id,
        label: id,
        priority,
        canLoad: async () => matches,
        load: async () => {},
    };
}

describe('MapFormatRegistry', () => {
    it('sorts loaders by priority', () => {
        const loaders = registerMapLoader(
            [stubLoader('textmap', 20, false)],
            stubLoader('vmf', 0, false),
        );

        expect(loaders.map((l) => l.id)).toEqual(['vmf', 'textmap']);
    });

    it('tries lower priority first when loading', async () => {
        const order: string[] = [];
        const loaders: IMapLoader[] = [
            {
                id: 'brushmap',
                label: 'BrushMap',
                priority: 10,
                canLoad: async () => true,
                load: async () => { order.push('brushmap'); },
            },
            {
                id: 'vmf',
                label: 'VMF',
                priority: 0,
                canLoad: async () => true,
                load: async () => { order.push('vmf'); },
            },
        ];

        const { loadMapFromRegistry } = await import('./MapFormatRegistry');
        const ctx = {} as MapLoadContext;
        await loadMapFromRegistry(loaders, ctx, 'test_map');

        expect(order).toEqual(['vmf']);
    });
});
