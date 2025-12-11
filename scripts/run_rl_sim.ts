#!/usr/bin/env npx ts-node
/**
 * RL Simulation Runner
 * 
 * This script runs headless TDM matches to collect training data for the RL agent.
 * It uses the EnvWrapper to step through episodes and logs experience tuples.
 * 
 * Usage:
 *   npx ts-node scripts/run_rl_sim.ts --episodes 100 --map de_dust2_d
 */

import { EnvWrapper, Action } from '../src/game/rl/EnvWrapper';
import { EpisodeLogger } from './EpisodeLogger';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name: string, defaultVal: string): string => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const NUM_EPISODES = parseInt(getArg('episodes', '10'), 10);
const MAP_NAME = getArg('map', 'de_dust2_d');
const MAX_STEPS_PER_EPISODE = parseInt(getArg('maxSteps', '3000'), 10);

console.log(`[RL Sim] Starting simulation`);
console.log(`  Episodes: ${NUM_EPISODES}`);
console.log(`  Map: ${MAP_NAME}`);
console.log(`  Max steps/episode: ${MAX_STEPS_PER_EPISODE}`);

async function runSimulation(): Promise<void> {
    const env = new EnvWrapper();
    const logger = new EpisodeLogger();

    let totalSteps = 0;
    let totalReward = 0;

    for (let ep = 0; ep < NUM_EPISODES; ep++) {
        console.log(`\n[RL Sim] Episode ${ep + 1}/${NUM_EPISODES}`);

        logger.startEpisode();
        let observation = env.reset();
        let episodeReward = 0;
        let steps = 0;

        while (steps < MAX_STEPS_PER_EPISODE) {
            // Random policy for data collection (replace with trained policy later)
            const action = sampleRandomAction();

            const result = env.step(action);

            logger.logStep(
                observation,
                action,
                result.reward,
                result.observation,
                result.done
            );

            episodeReward += result.reward;
            observation = result.observation;
            steps++;

            if (result.done) {
                break;
            }
        }

        logger.endEpisode();
        totalSteps += steps;
        totalReward += episodeReward;

        console.log(`  Steps: ${steps}, Reward: ${episodeReward.toFixed(2)}`);
    }

    // Print summary
    console.log(`\n[RL Sim] Simulation Complete`);
    console.log(`  Total episodes: ${NUM_EPISODES}`);
    console.log(`  Total steps: ${totalSteps}`);
    console.log(`  Average reward: ${(totalReward / NUM_EPISODES).toFixed(2)}`);

    const stats = logger.getStats();
    console.log(`  Logged episodes: ${stats.episodeCount}`);
    console.log(`  Logged steps: ${stats.totalSteps}`);
}

/** Sample a random action (for initial data collection) */
function sampleRandomAction(): Action {
    return {
        moveX: Math.random() * 2 - 1,      // -1 to 1
        moveZ: Math.random() * 2 - 1,      // -1 to 1
        yaw: Math.random() * Math.PI * 2 - Math.PI,  // -π to π
        pitch: Math.random() * Math.PI - Math.PI / 2, // -π/2 to π/2
        fire: Math.random() > 0.8 ? 1 : 0,  // 20% chance to fire
        crouchToggle: Math.random() > 0.95 ? 1 : 0,  // 5% chance to crouch
        throwGrenade: Math.random() > 0.99 ? 1 : 0,  // 1% chance to throw grenade
    };
}

// Run the simulation
runSimulation().catch(err => {
    console.error('[RL Sim] Error:', err);
    process.exit(1);
});
