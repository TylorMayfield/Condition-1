import type { GameObject } from '../../../engine/GameObject';

export interface TDMParticipant {
    id: string;
    name: string;
    team: string;
    status: 'Alive' | 'Dead';
    score: number;
    objectRef: GameObject | null;
}
