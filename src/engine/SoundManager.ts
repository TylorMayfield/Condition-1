import * as THREE from 'three';
import type { EnemyAI } from '../game/components/EnemyAI';

/**
 * 3D Spatial Audio System
 * - Procedurally generated sound effects (no external files needed)
 * - Positional audio relative to camera/listener
 * - Sound types: footsteps, gunshots, impacts, deaths
 */
export class SoundManager {
    private listeners: EnemyAI[] = [];
    private audioContext: AudioContext | null = null;
    private listener: THREE.AudioListener | null = null;
    private camera: THREE.Camera | null = null;
    private initialized: boolean = false;
    private masterVolume: number = 0.5;

    // Audio pools for reuse
    private audioPool: THREE.PositionalAudio[] = [];
    private poolIndex: number = 0;
    private readonly poolSize: number = 32;

    // External Audio
    private audioLoader: THREE.AudioLoader | null = null;
    private globalAudio: THREE.Audio | null = null;
    private audioCache: Map<string, AudioBuffer> = new Map();

    constructor() {
        // Audio context will be created on first user interaction
    }

    /**
     * Initialize audio system (call after user interaction due to autoplay policy)
     */
    public init(camera: THREE.Camera): void {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.listener = new THREE.AudioListener();
            this.camera = camera;
            camera.add(this.listener);

            // Audio Loader
            this.audioLoader = new THREE.AudioLoader();
            this.globalAudio = new THREE.Audio(this.listener);

            // Pre-create audio pool
            for (let i = 0; i < this.poolSize; i++) {
                const audio = new THREE.PositionalAudio(this.listener);
                audio.setRefDistance(5);
                audio.setRolloffFactor(1);
                audio.setDistanceModel('exponential');
                audio.setMaxDistance(100);
                this.audioPool.push(audio);
            }

            this.initialized = true;
            console.log('[SoundManager] Initialized with 3D positional audio');
        } catch (e) {
            console.warn('[SoundManager] Failed to initialize audio:', e);
        }
    }

    /**
     * Resume audio context (needed after user interaction)
     */
    public resume(): void {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // === AI Hearing System (existing functionality) ===

    public registerListener(listener: EnemyAI) {
        this.listeners.push(listener);
    }

    public unregisterListener(listener: EnemyAI) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    public emitSound(position: THREE.Vector3, radius: number) {
        this.listeners.forEach(listener => {
            if (listener.getOwnerPosition()) {
                const dist = listener.getOwnerPosition()!.distanceTo(position);
                if (dist <= radius) {
                    listener.onHearSound(position);
                }
            }
        });
    }

    // === 3D Positional Audio Playback ===

    /**
     * Play a gunshot sound at a 3D position
     */
    public playGunshot(position: THREE.Vector3, volume: number = 1.0): void {
        if (!this.initialized || !this.audioContext) return;

        const buffer = this.generateGunshotBuffer();
        this.playPositionalSound(position, buffer, volume * 0.7);

        // Also emit for AI hearing
        this.emitSound(position, 50);
    }

    /**
     * Play a footstep sound at a 3D position
     */
    public playFootstep(position: THREE.Vector3, volume: number = 0.3): void {
        if (!this.initialized || !this.audioContext) return;

        const buffer = this.generateFootstepBuffer();
        this.playPositionalSound(position, buffer, volume * this.masterVolume);

        // Emit for AI hearing (shorter range)
        this.emitSound(position, 15);
    }

    /**
     * Play an impact/hit sound at a 3D position
     */
    public playImpact(position: THREE.Vector3, volume: number = 0.5): void {
        if (!this.initialized || !this.audioContext) return;

        const buffer = this.generateImpactBuffer();
        this.playPositionalSound(position, buffer, volume * this.masterVolume);
    }

    /**
     * Play a death/grunt sound at a 3D position
     */
    public playDeath(position: THREE.Vector3, volume: number = 0.6): void {
        if (!this.initialized || !this.audioContext) return;

        const buffer = this.generateDeathBuffer();
        this.playPositionalSound(position, buffer, volume * this.masterVolume);

        // Emit for AI hearing
        this.emitSound(position, 30);
    }

    /**
     * Play a bullet whiz sound (for near-misses)
     */
    public playBulletWhiz(position: THREE.Vector3, volume: number = 0.4): void {
        if (!this.initialized || !this.audioContext) return;

        const buffer = this.generateWhizBuffer();
        this.playPositionalSound(position, buffer, volume * this.masterVolume);
    }

    /**
     * Play a global (non-positional) sound from a file
     */
    public playGlobalSound(path: string, volume: number = 1.0): void {
        if (!this.initialized || !this.globalAudio || !this.audioLoader) return;

        // Auto-resume if suspended (browser policy)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Check cache
        if (this.audioCache.has(path)) {
            const buffer = this.audioCache.get(path)!;
            this.playSoundBuffer(buffer, volume);
            return;
        }

        // Load file
        this.audioLoader.load(path, (buffer) => {
            this.audioCache.set(path, buffer);
            this.playSoundBuffer(buffer, volume);
        }, undefined, (err) => {
            console.warn(`[SoundManager] Failed to load sound: ${path}`, err);
        });
    }

    private playSoundBuffer(buffer: AudioBuffer, volume: number) {
        if (!this.globalAudio) return;

        // Stop if playing to avoid overlapping same channel (optional, but good for announcer)
        if (this.globalAudio.isPlaying) {
            this.globalAudio.stop();
        }

        this.globalAudio.setBuffer(buffer);
        this.globalAudio.setVolume(volume * this.masterVolume); // Use master volume
        this.globalAudio.setLoop(false);
        this.globalAudio.play();
    }

    // === Sound Generation (Procedural) ===

    private generateGunshotBuffer(): AudioBuffer {
        const ctx = this.audioContext!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.15;
        const samples = sampleRate * duration;
        const buffer = ctx.createBuffer(1, samples, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Sharp attack with noise
            const attack = Math.exp(-t * 50);
            // Low frequency thump
            const thump = Math.sin(t * 200) * Math.exp(-t * 30);
            // High frequency crack
            const crack = (Math.random() * 2 - 1) * Math.exp(-t * 80);

            data[i] = (attack * crack * 0.5 + thump * 0.5) * 0.8;
        }

        return buffer;
    }

    private generateFootstepBuffer(): AudioBuffer {
        const ctx = this.audioContext!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.12;
        const samples = sampleRate * duration;
        const buffer = ctx.createBuffer(1, samples, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Low thud
            const thud = Math.sin(t * 80 * Math.PI) * Math.exp(-t * 25);
            // Subtle crunch
            const crunch = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.2;

            data[i] = (thud * 0.7 + crunch) * 0.5;
        }

        return buffer;
    }

    private generateImpactBuffer(): AudioBuffer {
        const ctx = this.audioContext!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.1;
        const samples = sampleRate * duration;
        const buffer = ctx.createBuffer(1, samples, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Sharp hit
            const hit = Math.sin(t * 300) * Math.exp(-t * 60);
            // Debris noise
            const debris = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 0.3;

            data[i] = (hit * 0.6 + debris) * 0.7;
        }

        return buffer;
    }

    private generateDeathBuffer(): AudioBuffer {
        const ctx = this.audioContext!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.4;
        const samples = sampleRate * duration;
        const buffer = ctx.createBuffer(1, samples, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Low grunt
            const grunt = Math.sin(t * 150 + Math.sin(t * 8) * 30) * Math.exp(-t * 8);
            // Body fall thud at end
            const fallTime = t - 0.2;
            const fall = fallTime > 0 ? Math.sin(fallTime * 50) * Math.exp(-fallTime * 20) * 0.5 : 0;

            data[i] = (grunt * 0.6 + fall) * 0.6;
        }

        return buffer;
    }

    private generateWhizBuffer(): AudioBuffer {
        const ctx = this.audioContext!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.08;
        const samples = sampleRate * duration;
        const buffer = ctx.createBuffer(1, samples, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            // Doppler-like frequency sweep
            const freq = 2000 + (1 - t / duration) * 1500;
            const whiz = Math.sin(t * freq * Math.PI * 2) * Math.exp(-t * 20);

            data[i] = whiz * 0.4;
        }

        return buffer;
    }

    // === Positional Audio Playback ===

    private playPositionalSound(position: THREE.Vector3, buffer: AudioBuffer, volume: number): void {
        if (!this.listener || !this.camera) return;

        // Get audio from pool
        const audio = this.audioPool[this.poolIndex];
        this.poolIndex = (this.poolIndex + 1) % this.poolSize;

        // Stop if already playing
        if (audio.isPlaying) {
            audio.stop();
        }

        // Remove from previous parent if any
        if (audio.parent) {
            audio.parent.remove(audio);
        }

        // Position the audio in world space
        // Create a temporary object at the position
        const tempObj = new THREE.Object3D();
        tempObj.position.copy(position);

        // Add audio to scene at position
        if (this.camera.parent) {
            this.camera.parent.add(tempObj);
            tempObj.add(audio);
        }

        // Configure and play
        audio.setBuffer(buffer);
        audio.setVolume(volume);
        audio.setLoop(false);
        audio.play();

        // Clean up temp object after sound finishes
        setTimeout(() => {
            if (tempObj.parent) {
                tempObj.parent.remove(tempObj);
            }
        }, buffer.duration * 1000 + 100);
    }

    /**
     * Set master volume (0.0 to 1.0)
     */
    public setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        // Update loaded audio if possible. Global audio:
        if (this.globalAudio) {
            this.globalAudio.setVolume(this.masterVolume);
        }
    }

    /**
     * Check if audio is initialized
     */
    public isReady(): boolean {
        return this.initialized;
    }

    /**
     * Play announcer voice using Text-to-Speech (Fallback)
     */
    public playAnnouncer(text: string): void {
        console.log(`[Announcer] "${text}"`);
        // TTS removed by user request
    }

    /**
     * Play specific announcer file from public/sounds/announcer/
     */
    public playAnnouncerFile(filename: string): void {
        const path = `/sounds/announcer/${filename}`;
        this.playGlobalSound(path, 1.0);
    }

    /**
     * Play random hurt sound at position
     */
    public playHurtSound(position: THREE.Vector3): void {
        const index = Math.floor(Math.random() * 4) + 1; // 1 to 4
        const path = `/sounds/hurt/hurt${index}.mp3`;
        
        // Use Positional Audio
        if (!this.initialized || !this.audioLoader || !this.camera) return;

        // Check cache or load
        // Note: Positional audio needs buffer to be loaded first
        this.audioLoader.load(path, (buffer) => {
            this.playPositionalSound(position, buffer, 0.8);
        });
    }
}
