// Episode Logger - Records experience tuples for RL training
// This file is designed for use ONLY in Node.js scripts (not browser)
// Usage: import from scripts that run via ts-node, not from game code

import * as fs from 'fs';
import * as path from 'path';
import type { Observation, Action } from '../src/game/rl/EnvWrapper';

export interface ExperienceTuple {
    observation: Observation;
    action: Action;
    reward: number;
    nextObservation: Observation;
    done: boolean;
    timestamp: number;
    episodeId: string;
    stepIndex: number;
}

export class EpisodeLogger {
    private logDir: string;
    private currentEpisodeId: string = '';
    private stepIndex: number = 0;
    private buffer: ExperienceTuple[] = [];
    private maxBufferSize: number = 1000;
    private fileStream: fs.WriteStream | null = null;

    constructor(logDir: string = 'data/rl/episodes') {
        this.logDir = logDir;
        this.ensureLogDir();
    }

    private ensureLogDir(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /** Start a new episode - generates a unique ID and opens a log file */
    startEpisode(): string {
        this.currentEpisodeId = `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.stepIndex = 0;
        this.buffer = [];

        const filePath = path.join(this.logDir, `${this.currentEpisodeId}.jsonl`);
        this.fileStream = fs.createWriteStream(filePath, { flags: 'a' });

        console.log(`[EpisodeLogger] Started episode: ${this.currentEpisodeId}`);
        return this.currentEpisodeId;
    }

    /** Log a single experience tuple */
    logStep(
        observation: Observation,
        action: Action,
        reward: number,
        nextObservation: Observation,
        done: boolean
    ): void {
        const tuple: ExperienceTuple = {
            observation,
            action,
            reward,
            nextObservation,
            done,
            timestamp: Date.now(),
            episodeId: this.currentEpisodeId,
            stepIndex: this.stepIndex++,
        };

        this.buffer.push(tuple);

        // Flush to disk when buffer is full
        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }
    }

    /** Flush buffer to disk */
    flush(): void {
        if (!this.fileStream || this.buffer.length === 0) return;

        for (const tuple of this.buffer) {
            this.fileStream.write(JSON.stringify(tuple) + '\n');
        }
        this.buffer = [];
    }

    /** End current episode and close file */
    endEpisode(): void {
        this.flush();
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
        }
        console.log(`[EpisodeLogger] Ended episode: ${this.currentEpisodeId} (${this.stepIndex} steps)`);
    }

    /** Get statistics about logged episodes */
    getStats(): { episodeCount: number; totalSteps: number } {
        const files = fs.readdirSync(this.logDir).filter((f: string) => f.endsWith('.jsonl'));
        let totalSteps = 0;

        for (const file of files) {
            const content = fs.readFileSync(path.join(this.logDir, file), 'utf-8');
            totalSteps += content.split('\n').filter((line: string) => line.trim()).length;
        }

        return { episodeCount: files.length, totalSteps };
    }

    /** Clean up old episodes beyond a certain count */
    pruneOldEpisodes(keepCount: number = 100): void {
        const files = fs.readdirSync(this.logDir)
            .filter((f: string) => f.endsWith('.jsonl'))
            .sort();

        if (files.length > keepCount) {
            const toDelete = files.slice(0, files.length - keepCount);
            for (const file of toDelete) {
                fs.unlinkSync(path.join(this.logDir, file));
            }
            console.log(`[EpisodeLogger] Pruned ${toDelete.length} old episodes`);
        }
    }
}
