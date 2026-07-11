import { describe, expect, it } from 'vitest';
import { CampaignService } from './CampaignService';
describe('CampaignService', () => {
    it('unlocks the next match only after a win', () => {
        const values = new Map<string, string>(); const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
        const service = new CampaignService(storage); let profile = service.load(); profile = service.recordMatch(profile, 'dust2', false, 7, 9); expect(profile.unlockedMatchIds).toEqual(['dust2']);
        profile = service.recordMatch(profile, 'dust2', true, 9, 4); expect(profile.unlockedMatchIds).toContain('inferno'); expect(service.load().bestResults.dust2.scoreFor).toBe(9);
    });
});
