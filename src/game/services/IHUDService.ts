/** Typed HUD API for game modes — avoids casting hudManager. */
export interface TrainingStatsPayload {
    round: number;
    maxRounds: number;
    avgReward: number;
    trainingSteps: number;
    experienceCount: number;
    bufferSize: number;
    simTimeLeft: number;
}

export interface IHUDService {
    update(dt: number): void;
    render(dt: number): void;

    showRoundResult(winner: string | null, reason: string): void;
    showCountdown(seconds: number): void;
    hideCountdown(): void;
    showRoundTimer(timeString: string): void;
    hideRoundTimer(): void;
    showTrainingStats(stats: TrainingStatsPayload): void;
    hideTrainingStats(): void;
    showMoney(amount: number): void;
    showObjectiveStatus(text: string, urgent?: boolean): void;
    hideObjectiveStatus(): void;
    showInteractionProgress(label: string, progress: number): void;
    hideInteractionProgress(): void;
    showHalftime(): void;
    showCampaignResult(title: string, nextUnlock?: string): void;
    showBuyMenu(items: ReadonlyArray<{ id: string; name: string; price: number; enabled: boolean }>, onPurchase: (id: string) => void): void;
    hideBuyMenu(): void;
}
