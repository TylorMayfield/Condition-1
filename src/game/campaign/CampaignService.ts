export type CampaignTeam = 'TaskForce' | 'OpFor';
export type CampaignDifficulty = 'recruit' | 'veteran' | 'elite';
export interface TourMatch { id: string; map: string; displayName: string; }
export const DEFUSAL_TOUR: readonly TourMatch[] = [
    { id: 'dust2', map: 'de_dust2_d', displayName: 'Dust II' },
    { id: 'inferno', map: 'de_inferno_d', displayName: 'Inferno' },
    { id: 'train', map: 'de_train_d', displayName: 'Train' },
    { id: 'chateau', map: 'de_chateau_d', displayName: 'Chateau' },
];
export interface CampaignProfile { version: 1; unlockedMatchIds: string[]; completedMatchIds: string[]; selectedTeam: CampaignTeam; difficulty: CampaignDifficulty; rosterLevel: number; bestResults: Record<string, { scoreFor: number; scoreAgainst: number; team: CampaignTeam }>; }
const DEFAULT_PROFILE: CampaignProfile = { version: 1, unlockedMatchIds: [DEFUSAL_TOUR[0].id], completedMatchIds: [], selectedTeam: 'TaskForce', difficulty: 'recruit', rosterLevel: 1, bestResults: {} };

export class CampaignService {
    static readonly storageKey = 'condition1_campaign_v1';
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
    constructor(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) { this.storage = storage; }
    load(): CampaignProfile {
        try { const raw = this.storage.getItem(CampaignService.storageKey); if (!raw) return structuredClone(DEFAULT_PROFILE); const value = JSON.parse(raw) as CampaignProfile; return value.version === 1 ? value : structuredClone(DEFAULT_PROFILE); }
        catch { return structuredClone(DEFAULT_PROFILE); }
    }
    save(profile: CampaignProfile): void { this.storage.setItem(CampaignService.storageKey, JSON.stringify(profile)); }
    recordMatch(profile: CampaignProfile, matchId: string, won: boolean, scoreFor: number, scoreAgainst: number): CampaignProfile {
        const next = structuredClone(profile); const index = DEFUSAL_TOUR.findIndex(m => m.id === matchId); if (index < 0) return next;
        const old = next.bestResults[matchId]; if (!old || scoreFor - scoreAgainst > old.scoreFor - old.scoreAgainst) next.bestResults[matchId] = { scoreFor, scoreAgainst, team: next.selectedTeam };
        if (won) { if (!next.completedMatchIds.includes(matchId)) next.completedMatchIds.push(matchId); const following = DEFUSAL_TOUR[index + 1]; if (following && !next.unlockedMatchIds.includes(following.id)) next.unlockedMatchIds.push(following.id); next.rosterLevel = Math.min(10, next.rosterLevel + 1); }
        this.save(next); return next;
    }
}
