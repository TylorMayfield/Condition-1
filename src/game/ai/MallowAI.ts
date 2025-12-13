
import { MallowUnit } from '../entities/MallowUnit';

import * as CANNON from 'cannon-es';

export class MallowAI {
    private unit: MallowUnit;
    private target: MallowUnit | null = null;
    
    // Config
    private perceptionRange: number = 20;
    private attackRange: number = 2;
    private moveSpeed: number = 5;
    
    constructor(unit: MallowUnit) {
        this.unit = unit;
    }
    
    public update(dt: number, allUnits: MallowUnit[]): void {
        if (!this.unit.body) return;
        
        // 1. Find Target if needed
        if (!this.target || this.target.health <= 0) {
            this.target = this.findNearestEnemy(allUnits);
        }
        
        if (!this.target || !this.target.body) {
            // No targets, idle
            this.unit.setExpression('neutral');
            return;
        }
        
        // 2. Move / Attack Logic
        const myPos = this.unit.body.position;
        const targetPos = this.target.body.position;
        const dist = myPos.distanceTo(targetPos);
        
        if (dist > this.perceptionRange) {
            // Too far, chill
            this.unit.setExpression('neutral');
            return;
        }
        
        // Behavior based on Role
        if (this.unit.role === 'ranged') {
            this.updateRanged(dist, targetPos, dt);
        } else {
            this.updateMelee(dist, targetPos, dt);
        }
    }

    private updateMelee(dist: number, targetPos: CANNON.Vec3, dt: number): void {
        // Move towards
        if (dist > this.attackRange) {
            this.unit.setExpression('angry');
            this.moveTo(targetPos, dt);
        } else {
            this.unit.setExpression('angry');
            this.attack(dt);
        }
    }

    private updateRanged(dist: number, targetPos: CANNON.Vec3, dt: number): void {
        const kitingDistance = this.attackRange * 2; // Keep some distance (e.g. 4-6 units)
        
        this.unit.setExpression('angry');
        
        if (dist > kitingDistance + 2) {
            // Too far, move closer
            this.moveTo(targetPos, dt);
        } else if (dist < kitingDistance - 1) {
            // Too close! Kite back!
            this.moveAway(targetPos, dt);
        } else {
            // Sweet spot, attack!
            // Ranged attack = Shoot? Or just hop aggressively?
            // For now, hop in place/at enemy slightly
            this.attack(dt);
        }
    }
    
    private moveAway(targetPos: CANNON.Vec3, _dt: number): void {
        if (!this.unit.body) return;
        
        // Force AWAY from target
        const dir = this.unit.body.position.vsub(targetPos);
        dir.y = 0; 
        if (dir.length() > 0) dir.normalize();
        
        const force = dir.scale(this.moveSpeed * 10);
        this.unit.body.applyForce(force, this.unit.body.position);
    }
    
    private findNearestEnemy(units: MallowUnit[]): MallowUnit | null {
        let nearest: MallowUnit | null = null;
        let minDist = Infinity;
        
        if (!this.unit.body) return null;
        const myPos = this.unit.body.position;
        
        for (const other of units) {
            if (other.team !== this.unit.team && other.health > 0 && other.body) {
                const d = myPos.distanceTo(other.body.position);
                if (d < minDist) {
                    minDist = d;
                    nearest = other;
                }
            }
        }
        return nearest;
    }
    
    private moveTo(targetPos: CANNON.Vec3, _dt: number): void {
        if (!this.unit.body) return;
        
        // Simple force towards target
        const dir = targetPos.vsub(this.unit.body.position);
        dir.y = 0; // Don't fly
        if (dir.length() > 0) dir.normalize();
        
        const force = dir.scale(this.moveSpeed * 10); // Mass is ~5
        this.unit.body.applyForce(force, this.unit.body.position);
        
        // Look at target (Torque)
        // ... handled by Main MallowUnit logic mostly, but we could assist here
    }
    
    private attack(_dt: number): void {
        // Physical attack: Spin or lunge
        // For now, simple "Jump/Lunge" if close
        if (this.unit.body) {
             // Random hop
             if (Math.random() < 0.05) {
                 this.unit.body.velocity.y += 5;
                 // Push forward
                 // this.unit.body.velocity.vadd(this.unit.body.quaternion.vmult(new CANNON.Vec3(0,0,5)));
             }
        }
    }
}
