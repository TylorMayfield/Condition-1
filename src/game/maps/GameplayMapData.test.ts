/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VmfParser } from './VmfParser';
import { extractGameplayMapData, validateDefusalMap } from './GameplayMapData';

describe('bundled defusal maps', () => {
    for (const map of ['de_dust2_d', 'de_inferno_d', 'de_train_d', 'de_chateau_d']) {
        it(`${map} exposes two bomb sites and buy zones`, () => {
            const vmf = VmfParser.parse(readFileSync(join(process.cwd(), 'src/game/maps', `${map}.vmf`), 'utf8'));
            const data = extractGameplayMapData(vmf.entities);
            const t = vmf.entities.filter(e => e.classname === 'info_player_terrorist').length;
            const ct = vmf.entities.filter(e => e.classname === 'info_player_counterterrorist').length;
            expect(validateDefusalMap(data, t, ct)).toEqual([]);
            expect(data.bombSites.map(site => site.id)).toEqual(['A', 'B']);
        });
    }
});
