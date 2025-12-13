import { GameMode } from './GameMode';
import type { ScoreData } from './GameMode';
import { Game } from '../../engine/Game';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const MallowState = {
    MAP_SELECT: 0,
    SHOPPING: 1,
    SETUP: 2,
    LAUNCHING: 3,
    OBSERVING: 4,
    VICTORY: 5,
    DEFEAT: 6
} as const;

export type MallowState = typeof MallowState[keyof typeof MallowState];

export class MallowMightGameMode extends GameMode {
    public currentState: MallowState = MallowState.MAP_SELECT;
    
    // Core Gamemode Data
    // private currentStage: number = 1; // Unused
    public gold: number = 0;
    // private playerHealth: number = 3; // Unused
    
    // Inventory
    public inventory: string[] = ['cowboy', 'viking', 'viking']; // Start with some hats for testing
    public getInventory(): string[] { return this.inventory; }
    
    private mallows: import('../entities/MallowUnit').MallowUnit[] = [];
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    
    public registerGoo(mesh: THREE.Object3D): void {
        this.gooObjects.push(mesh);
    }
    
    // Map System
    private map: import('../map/MallowMap').MallowMap | null = null;
    
    // Shop System
    private shop: import('../systems/MallowShop').MallowShop | null = null;
    
    // UI
    private hud: import('../ui/MallowHUD').MallowHUD | null = null;
    
    private selectedMallow: import('../entities/MallowUnit').MallowUnit | null = null;
    private dragStartPos: THREE.Vector2 = new THREE.Vector2();
    private isDragging: boolean = false;

    constructor(game: Game) {
        super(game);
    }

    public init(): void {
        console.log("Initializing Mallow Might Game Mode");
        
        // Disable auto-lock for point-and-click interaction
        this.game.input.autoLock = false; 
        
        // Disable Default FPS Player immediately (synchronous check)
        if (this.game.player) {
            this.game.player.isSpectating = true;
            if (this.game.player.mesh) {
                this.game.player.mesh.visible = false;
            }
            // Clear physics layers
            if (this.game.player.body) {
                this.game.player.body.collisionFilterGroup = 0;
                this.game.player.body.collisionFilterMask = 0;
            }
        }

        // Wait for all systems to load
        Promise.all([
            import('../map/MallowMap'),
            import('../systems/MallowShop'),
            import('../ui/MallowHUD'),
            import('../entities/MallowClasses') // Pre-load entities too
        ]).then(([{ MallowMap }, { MallowShop }, { MallowHUD }, _Entities]) => {
            // 1. Init Map
            this.map = new MallowMap();
            
            // 2. Init Shop
            this.shop = new MallowShop();
            
            // 3. Init HUD
            this.hud = new MallowHUD();
            this.updateHUD();
            
            // Inventory Button
            this.inventoryBtn = document.createElement('button');
            this.inventoryBtn.textContent = "🎒 Inventory";
            this.inventoryBtn.style.position = 'absolute';
            this.inventoryBtn.style.bottom = '20px';
            this.inventoryBtn.style.right = '20px';
            this.inventoryBtn.style.fontSize = '20px';
            this.inventoryBtn.style.padding = '10px';
            this.inventoryBtn.style.pointerEvents = 'auto'; // Clickable
            this.inventoryBtn.onclick = () => {
                if (this.hud) {
                    const unitData = this.mallows
                        .filter(m => m.team === 'Player')
                        .map(m => ({ 
                            id: m.uuid, 
                            name: m.constructor.name.replace('Mallow', ''), 
                            role: m.role,
                            equipped: undefined 
                        }));
                        
                    this.hud.toggleInventory(this.inventory, unitData, (uId, item) => this.equipItem(uId, item));
                }
            };
            document.body.appendChild(this.inventoryBtn);

            // 4. Start Game Loop
            this.setupLighting();
            this.createSlingshotVisuals();
            this.transitionToState(MallowState.MAP_SELECT);
            
        }).catch(err => {
            console.error("Failed to initialize Mallow Might resources:", err);
        });
    }

    // Helper to visualize clicks
    private debugArrow: THREE.ArrowHelper | null = null;
    private showClickRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
        if (!this.debugArrow) {
            this.debugArrow = new THREE.ArrowHelper(direction, origin, 100, 0xff00ff);
            this.game.scene.add(this.debugArrow);
        } else {
            this.debugArrow.setDirection(direction);
            this.debugArrow.position.copy(origin);
        }
    }

    private inventoryBtn: HTMLButtonElement | null = null;
    private lights: THREE.Light[] = [];

    private gooObjects: THREE.Object3D[] = [];

    public dispose(): void {
        // Cleanup UI
        if (this.inventoryBtn) {
            this.inventoryBtn.remove();
            this.inventoryBtn = null;
        }
        if (this.hud) {
            this.hud.dispose();
            this.hud = null;
        }
        
        // Cleanup Scene Objects
        if (this.slingshotBase) {
            this.game.scene.remove(this.slingshotBase);
        }
        if (this.slingshotBand) {
             this.game.scene.remove(this.slingshotBand);
        }
        if (this.debugArrow) {
            this.game.scene.remove(this.debugArrow);
        }
        
        // Cleanup Goo
        this.gooObjects.forEach(g => this.game.scene.remove(g));
        this.gooObjects = [];
        
        // Cleanup Lights
        this.lights.forEach(l => this.game.scene.remove(l));
        this.lights = [];
        
        // Restore defaults usually handled by next mode or game reset
        if (this.game.player) {
            this.game.player.isSpectating = false;
            
            if (this.game.player.mesh) {
                this.game.player.mesh.visible = true;
            }
            
            if (this.game.player.body) {
                this.game.player.body.collisionFilterGroup = 1;
                this.game.player.body.collisionFilterMask = -1; // All
                this.game.player.body.wakeUp();
            }
        }
    }
    
    private updateHUD(): void {
        if (!this.hud) return;
        // Manual mapping for display since const object doesn't have reverse mapping
        const stateNames = ['MAP_SELECT', 'SHOPPING', 'SETUP', 'LAUNCHING', 'OBSERVING', 'VICTORY', 'DEFEAT'];
        this.hud.updateState(stateNames[this.currentState]);
        this.hud.updateStats(this.gold, this.level, this.xp, this.maxXp);
    }
    
    private prepareUnitsForLaunch(isBoss: boolean = false): void {
        import('../entities/MallowClasses').then(({ TankMallow, ArcherMallow, BossMallow }) => {
            // 1. Ensure Player Team Exists
            if (this.mallows.filter(m => m.team === 'Player').length === 0) {
                 const t1 = new TankMallow(this.game, new THREE.Vector3(-8, 2, 0), 'Player');
                 const a1 = new ArcherMallow(this.game, new THREE.Vector3(-8, 2, 2), 'Player');
                 this.mallows.push(t1, a1);
                 this.game.addGameObject(t1);
                 this.game.addGameObject(a1);
            }
            
            // 2. Reset Player Positions for Launch (Force all players to queue)
            const playerMallows = this.mallows.filter(m => m.team === 'Player');
            playerMallows.forEach((m, i) => {
                // Reset Physics
                if (m.body) {
                    m.body.velocity.set(0, 0, 0);
                    m.body.angularVelocity.set(0, 0, 0);
                    m.body.position.set(-8, 2, i * 2); // Line up
                    m.body.quaternion.set(0, 0, 0, 1);
                    // Force update visuals immediate
                    if (m.mesh) {
                        m.mesh.position.copy(m.body.position as any);
                        m.mesh.quaternion.copy(m.body.quaternion as any);
                        m.mesh.updateMatrixWorld(true);
                    }
                }
                m.onLand(); // Reset state
            });
            
            // 3. Setup Enemy Team
            // ALWAYS Clear old enemies
            const oldEnemies = this.mallows.filter(m => m.team === 'Enemy');
            oldEnemies.forEach(e => {
                this.game.removeGameObject(e);
            });
            this.mallows = this.mallows.filter(m => m.team === 'Player'); // Keep only players

            // Spawn new enemies
            if (isBoss) {
                const boss = new BossMallow(this.game, new THREE.Vector3(5, 2, 0), 'Enemy');
                this.mallows.push(boss);
                this.game.addGameObject(boss);
            } else {
                const t2 = new TankMallow(this.game, new THREE.Vector3(5, 2, 0), 'Enemy');
                this.mallows.push(t2);
                this.game.addGameObject(t2);
            }
        });
    }

    public update(dt: number): void {
        switch (this.currentState) {
            case MallowState.MAP_SELECT:
                // No update loop needed for 2D map
                break;
            case MallowState.LAUNCHING:
                this.updateLaunchPhase(dt);
                break;
            case MallowState.OBSERVING:
                this.updateCombatPhase(dt);
                break;
            case MallowState.SHOPPING:
                // No update loop needed for 2D shop
                break;
        }
    }

    private transitionToState(newState: MallowState): void {
        console.log(`Transitioning to State ${newState}`);
        this.currentState = newState;
        this.updateHUD();

        switch (newState) {
            case MallowState.MAP_SELECT:
                if (this.slingshotBase) this.slingshotBase.visible = false;
                if (this.slingshotBand) this.slingshotBand.visible = false;
                
                this.setupCameraForMap();
                if (this.hud && this.map) {
                    import('../map/MallowMap').then(({ NodeType }) => {
                        const nodes = this.map!.nodes.map(n => {
                            let status = 'locked';
                            const current = this.map!.getNode(this.map!.currentNodeId);
                            if (n.id === this.map!.currentNodeId) status = 'current';
                            else if (current?.next.includes(n.id)) status = 'available';
                            else if (n.layer < (current?.layer || 0)) status = 'past';
                            
                            return {
                                id: n.id,
                                type: n.type,
                                layer: n.layer,
                                next: n.next,
                                status: status
                            };
                        });
                        
                        this.hud!.showMapSelection(nodes, (nodeId) => this.onMapNodeSelected(nodeId));
                    });
                }
                break;
            case MallowState.SETUP:
                this.setupCameraForLaunch();
                
                // Toggle Slingshot
                if (this.slingshotBase) this.slingshotBase.visible = true;
                if (this.slingshotBand) this.slingshotBand.visible = true;
                
                // CLEANUP: Remove old goo
                this.gooObjects.forEach(g => this.game.scene.remove(g));
                this.gooObjects = [];
                
                // Spawn units for this node
                import('../map/MallowMap').then(({ NodeType }) => {
                     // Check if map is loaded
                     if (!this.map) return;
                     const currentNode = this.map.getNode(this.map.currentNodeId);
                     const isBoss = currentNode?.type === NodeType.BOSS;
                     this.prepareUnitsForLaunch(isBoss); 
                });
                
                this.combatEnded = false; // Reset combat flag
                // Auto-transition to Launch for now
                setTimeout(() => this.transitionToState(MallowState.LAUNCHING), 1000);
                break;
            case MallowState.LAUNCHING:
                this.setupCameraForLaunch();
                // Check slingshot vis
                if (this.slingshotBase) this.slingshotBase.visible = true;
                if (this.slingshotBand) this.slingshotBand.visible = true;
                
                // Make sure cursor is unlocked
                this.game.input.unlockCursor();
                break;
            case MallowState.OBSERVING:
                // Hide Slingshot
                if (this.slingshotBase) this.slingshotBase.visible = false;
                if (this.slingshotBand) this.slingshotBand.visible = false;
                
                this.setupCameraForCombat();
                // Enable AI
                break;
            case MallowState.VICTORY:
                if (this.hud) {
                    this.hud.showMessage("VICTORY!", "gold", 4000);
                }
                setTimeout(() => this.transitionToState(MallowState.MAP_SELECT), 4000);
                break;
            case MallowState.DEFEAT:
                if (this.hud) {
                    this.hud.showMessage("DEFEAT...", "red", 4000);
                }
                setTimeout(() => this.transitionToState(MallowState.MAP_SELECT), 4000);
                break;
            case MallowState.SHOPPING:
                this.setupCameraForShop();
                if (this.hud && this.shop) {
                    const items = this.shop.inventory.map(i => ({
                        id: i.id,
                        name: i.name,
                        cost: i.cost,
                        type: i.type
                    }));
                    this.hud.showShopInterface(
                        items, 
                        this.gold, 
                        (itemId) => this.onShopItemBuy(itemId),
                        () => this.onShopExit()
                    );
                }
                break;
        }
    }
    
    private setupCameraForMap(): void {
        // Just a nice background view, no interaction
        this.game.camera.position.set(0, 10, 20);
        this.game.camera.lookAt(0, 0, 0);
        this.game.input.unlockCursor();
    }
    
    private onMapNodeSelected(nodeId: number): void {
        if (!this.map) return;
        const target = this.map.getNode(nodeId);
        if (target) {
            this.map.advanceTo(target.id);
            console.log("Advanced to Node:", target);
            
             // Transition based on Type
             import('../map/MallowMap').then(({ NodeType }) => {
                 this.hud?.hideMap(); // Close UI
                 
                 if (target.type === NodeType.COMBAT || target.type === NodeType.ELITE || target.type === NodeType.BOSS) {
                     this.transitionToState(MallowState.SETUP);
                 } else if (target.type === NodeType.SHOP) {
                     this.transitionToState(MallowState.SHOPPING);
                 } else {
                     this.transitionToState(MallowState.MAP_SELECT); // Skip rest for now
                 }
             });
        }
    }
    


    private setupLighting(): void {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.game.scene.add(ambient);
        this.lights.push(ambient);
        
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(-10, 20, 10);
        dir.castShadow = true;
        // Optimize shadow map for the arena
        dir.shadow.camera.left = -30;
        dir.shadow.camera.right = 30;
        dir.shadow.camera.top = 30;
        dir.shadow.camera.bottom = -30;
        this.game.scene.add(dir);
        this.lights.push(dir);
    }

    private activeFollowTarget: import('../entities/MallowUnit').MallowUnit | null = null;

    private setupCameraForLaunch(): void {
        // POV View: Behind the slingshot, looking out
        // Slingshot is at -12, 1.5, 0. Units are at -8.
        // Camera should be roughly -16, 4, 0
        this.game.camera.position.set(-16, 4, 0); 
        this.game.camera.lookAt(5, 2, 0); // Look at enemy side
        this.game.input.unlockCursor();
    }

    private setupCameraForCombat(): void {
        // Isometric View: High angle, centered (Initial)
        this.game.camera.position.set(-5, 15, 15);
        this.game.camera.lookAt(0, 0, 0);
    }

    private setupCameraForShop(): void {
        this.game.camera.position.set(0, 8, 12);
        this.game.camera.lookAt(0, 0, 0);
        this.game.input.unlockCursor();
    }
    
    private onShopItemBuy(itemId: string): void {
        if (!this.shop) return;
        const item = this.shop.buyItem(itemId, this.gold);
         if (item) {
             this.gold -= item.cost;
             item.effect(this);
             
             // Refresh Shop UI
             if (this.hud) {
                  const items = this.shop.inventory.map(i => ({
                     id: i.id,
                     name: i.name,
                     cost: i.cost,
                     type: i.type
                 }));
                 this.hud.showShopInterface(items, this.gold, (id) => this.onShopItemBuy(id), () => this.onShopExit());
                 this.hud.showMessage(`Bought ${item.name}!`, '#00ff00');
             }
             this.updateHUD(); // Refresh Gold
         } else {
             if (this.hud) this.hud.showMessage(`Too Expensive!`, '#ff0000');
         }
    }
    
    private onShopExit(): void {
        this.hud?.hideShop();
        this.transitionToState(MallowState.MAP_SELECT);
    }
    
    private updateLaunchPhase(_dt: number): void {
        // 1. Raycast for selection
        if (this.game.input.getMouseButtonDown(0)) { // Left Click
            this.handleSelection();
        }
        
        // 2. Handle Dragging
        if (this.isDragging && this.selectedMallow) {
            if (this.game.input.getMouseButton(0)) {
                // Still holding
                if (this.selectedMallow.mesh) {
                    this.updateSlingshotVisuals(this.selectedMallow.mesh.position);
                }
            } else {
                // Released
                this.handleLaunch();
            }
        }
    }

    private handleSelection(): void {
        const mouse = this.game.input.mousePosition;
        console.log(`[Launch] Mouse: ${mouse.x.toFixed(2)}, ${mouse.y.toFixed(2)}`);
        
        // Ensure camera matrix is up to date
        this.game.camera.updateMatrixWorld(true);
        this.raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), this.game.camera);
        this.showClickRay(this.raycaster.ray.origin, this.raycaster.ray.direction);
        
        console.log(`[Launch] Ray Origin: ${this.raycaster.ray.origin.toArray().map(v => v.toFixed(2))}`);
        console.log(`[Launch] Ray Dir: ${this.raycaster.ray.direction.toArray().map(v => v.toFixed(2))}`);

        // Intersect with Mallow meshes
        const meshes = this.mallows
            .filter(m => m.team === 'Player') // Only pick player units
            .map(m => m.mesh)
            .filter(m => m !== undefined) as THREE.Mesh[];

        // Force update matrices for all targets
        meshes.forEach(m => {
            if (m) m.updateMatrixWorld(true);
            console.log(`[Launch] Checking Mesh at: ${m.position.toArray().map(v => v.toFixed(2))} (Visible: ${m.visible})`);
        });
            
        // Recursive true to hit children (hats, eyes, etc)
        const intersects = this.raycaster.intersectObjects(meshes, true);
        
        if (intersects.length > 0) {
            const hitObj = intersects[0].object;
            console.log("Raycast Hit:", hitObj.name || hitObj.type);
            
            // Find which unit owns this mesh (or is parent of it)
            const unit = this.mallows.find(m => {
                let current: THREE.Object3D | null = hitObj;
                while (current) {
                    if (m.mesh === current) return true;
                    current = current.parent;
                }
                return false;
            });
            
            if (unit) {
                this.selectedMallow = unit;
                this.isDragging = true;
                this.dragStartPos.set(this.game.input.mousePosition.x, this.game.input.mousePosition.y);
                console.log("Selected Mallow:", unit.role);
                
                if (this.hud) {
                    this.hud.showMessage("Drag to Launch!", "yellow", 1000);
                }
            }
        } else {
             console.log("Raycast Missed. Checked " + meshes.length + " units.");
        }
    }
    
    private handleLaunch(): void {
        if (!this.selectedMallow) return;
        
        const currentMouse = this.game.input.mousePosition;
        const dx = this.dragStartPos.x - currentMouse.x;
        const dy = this.dragStartPos.y - currentMouse.y;
        
        // Multiplier for force
        const power = 20; 
        
        // Drag BACK = Launch FORWARD/RIGHT
        const force = new THREE.Vector3(dx * power * 50, 10, dy * power * 50);
        
        console.log("Launching with force:", force);
        
        // Apply Impulse
        const cannonForce = new CANNON.Vec3(force.x, force.y, force.z);
        if (this.selectedMallow.body) {
            this.selectedMallow.body.wakeUp();
            this.selectedMallow.body.applyImpulse(cannonForce);
            this.selectedMallow.onLaunch();
        }
        
        this.activeFollowTarget = this.selectedMallow; // Start following
        
        this.isDragging = false;
        this.selectedMallow = null;
        this.updateSlingshotVisuals(null);
        
        // Transition to Combat after brief delay (for testing single launch)
        setTimeout(() => this.transitionToState(MallowState.OBSERVING), 500); // Faster transition to follow cam works
    }

    private level: number = 1;
    private xp: number = 0;
    private maxXp: number = 100;

    private cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private cameraOffset: THREE.Vector3 = new THREE.Vector3(-10, 10, 10); // Spherical-ish offset

    private updateCameraControls(): void {
        const input = this.game.input;
        
        // 1. Determine Target
        if (this.activeFollowTarget && this.activeFollowTarget.mesh) {
            this.cameraTarget.copy(this.activeFollowTarget.mesh.position);
        }

        // 2. ORBIT (Right Click) - Rotate Camera around Target
        if (input.getMouseButton(2)) {
            const sensitivity = 0.005;
            // Rotate offset vector
            // Yaw (around Y)
            this.cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -input.mouseDelta.x * sensitivity);
            // Pitch (around local lateral) - stricter limits?
            // Simple approach: standard orbit math often tricky with vectors alone.
            // Let's just do Yaw for now as it's safest for "rotating around".
            
            // Optional: Pitch
             const right = new THREE.Vector3().crossVectors(this.cameraOffset, new THREE.Vector3(0, 1, 0)).normalize();
             this.cameraOffset.applyAxisAngle(right, -input.mouseDelta.y * sensitivity);
        }

        // 3. PAN (Middle Click) - Move Target (Breaks Follow)
        if (input.getMouseButton(1)) {
            this.activeFollowTarget = null; // Break follow
            const sensitivity = 0.05;
            // Move target relative to camera view
            const forward = new THREE.Vector3(); 
            this.game.camera.getWorldDirection(forward);
            forward.y = 0; forward.normalize();
            
            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
            
            this.cameraTarget.add(right.multiplyScalar(-input.mouseDelta.x * sensitivity));
            this.cameraTarget.add(forward.multiplyScalar(input.mouseDelta.y * sensitivity)); // Drag up = move forward
        }

        // 4. ZOOM (W/S) - Change Offset Magnitude
        if (input.getKey('KeyW')) {
            this.cameraOffset.multiplyScalar(0.95); // Zoom In
        }
        if (input.getKey('KeyS')) {
            this.cameraOffset.multiplyScalar(1.05); // Zoom Out
        }
        
        // Clamp Zoom
        if (this.cameraOffset.length() < 2) this.cameraOffset.setLength(2);
        if (this.cameraOffset.length() > 50) this.cameraOffset.setLength(50);
        
        // 5. Apply Position
        this.game.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
        this.game.camera.lookAt(this.cameraTarget);
    }

    private combatEnded: boolean = false;

    private updateCombatPhase(dt: number): void {
        this.updateCameraControls();
        const activeUnits = this.mallows.filter(m => m.health > 0);
        
        // Check for deaths since last frame
        const deadUnits = this.mallows.filter(m => m.health <= 0);
        for (const dead of deadUnits) {
            if (dead.team === 'Enemy') {
                this.gainRewards(50, 20); // 50 XP, 20 Gold
            }
        }
        
        // Update valid list
        this.mallows = activeUnits;
        
        // Update AI for all units & HUD
        const width = window.innerWidth;
        const height = window.innerHeight;
        const widthHalf = width / 2;
        const heightHalf = height / 2;

        activeUnits.forEach(unit => {
            if (unit.ai) {
                 unit.ai.update(dt, activeUnits);
            }
            
            // Update Health Bar logic
            if (this.hud && unit.mesh) {
                // Get screen position (offset y slightly)
                const pos = unit.mesh.position.clone();
                pos.y += 1.0; // Above head
                pos.project(this.game.camera);
                
                // Screen coords
                const x = (pos.x * widthHalf) + widthHalf;
                const y = -(pos.y * heightHalf) + heightHalf;
                
                // Only show if in front of camera (z < 1)
                if (pos.z < 1) {
                    this.hud.updateHealthBar(
                        unit.uuid, 
                        x, 
                        y, 
                        unit.health / unit.maxHealth, 
                        unit.team
                    );
                } else {
                     // Behind camera, maybe hide?
                     // hud.removeHealthBar(unit.uuid); -> expensive to re-add every frame.
                     // Better: hud.hideHealthBar(unit.uuid);
                }
            }
        });
        
        // Remove bars for dead units
        if (this.hud) {
            for (const dead of deadUnits) {
                this.hud.removeHealthBar(dead.uuid);
            }
        }
        
        // Win Condition
        if (this.combatEnded) return;

        const playerAlive = activeUnits.some(m => m.team === 'Player');
        const enemyAlive = activeUnits.some(m => m.team === 'Enemy');
        
        if (!playerAlive && !enemyAlive) {
            console.log("Draw!");
            this.combatEnded = true;
            setTimeout(() => this.transitionToState(MallowState.MAP_SELECT), 3000);
        } else if (!playerAlive) {
            console.log("Defeat!");
            this.combatEnded = true;
            setTimeout(() => this.transitionToState(MallowState.DEFEAT), 3000);
        } else if (!enemyAlive) {
            console.log("Victory!");
            this.combatEnded = true;
            setTimeout(() => this.transitionToState(MallowState.VICTORY), 3000);
        }
    }
    
    private gainRewards(xp: number, gold: number): void {
        this.xp += xp;
        this.gold += gold;
        console.log(`Gained ${xp} XP, ${gold} Gold`);
        
        if (this.hud) {
             this.hud.showMessage(`+${xp} XP | +${gold} Gold`, '#00ffaa');
        }
        
        if (this.xp >= this.maxXp) {
            this.levelUp();
        }
        
        this.updateHUD();
    }
    
    private levelUp(): void {
        this.level++;
        this.xp -= this.maxXp;
        this.maxXp = Math.floor(this.maxXp * 1.5);
        console.log(`Level Up! Level ${this.level}`);
        
        if (this.hud) {
             this.hud.showMessage(`LEVEL UP! ${this.level}`, 'gold', 3000);
        }
        this.updateHUD();
        
        // Grant stats to existing player mallows?
        // Or just abstract power level.
    }
    
    private equipItem(unitId: string, item: string): void {
        const unit = this.mallows.find(m => m.uuid === unitId);
        if (unit) {
            // Remove from inventory
            const idx = this.inventory.indexOf(item);
            if (idx > -1) {
                this.inventory.splice(idx, 1);
                
                // Visual Equip (Hat)
                if (item === 'cowboy' || item === 'viking') {
                    unit.equipHat(item);
                }
                
                console.log(`Equipped ${item} to ${unitId}`);
                // Refresh UI if needed (handled by optimistic update in HUD mostly)
            }
        }
    }
    
    // Slingshot Visuals
    private slingshotBase!: THREE.Mesh;
    private slingshotBand!: THREE.Line;
    
    private createSlingshotVisuals(): void {
        // Base (Fork) - Move to near X=-12, Z=0
        const baseGeo = new THREE.CylinderGeometry(0.5, 0.5, 3);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        this.slingshotBase = new THREE.Mesh(baseGeo, baseMat);
        this.slingshotBase.position.set(-12, 1.5, 0); // "Launch Pad" position
        this.game.scene.add(this.slingshotBase);
        
        // Elastic Band
        const points = [new THREE.Vector3(-12, 3, -1), new THREE.Vector3(-12, 3, 1)];
        const bandGeo = new THREE.BufferGeometry().setFromPoints(points);
        const bandMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
        this.slingshotBand = new THREE.Line(bandGeo, bandMat);
        this.game.scene.add(this.slingshotBand);
    }
    
    private updateSlingshotVisuals(dragPos: THREE.Vector3 | null): void {
        if (!this.slingshotBand) return;
        
        let target = new THREE.Vector3(-12, 3, 0); // Rest position
        if (dragPos) {
            target.copy(dragPos); // Stretch to mallow
        }
        
        const anchors = [
             new THREE.Vector3(-12, 3, -1.5), // Left Fork
             target,
             new THREE.Vector3(-12, 3, 1.5)   // Right Fork
        ];
        
        this.slingshotBand.geometry.setFromPoints(anchors);
    }

    // Overrides
    public canPlayerMove(): boolean {
        return false;
    }

    public getScoreboardData(): ScoreData[] {
        return [
            {
                name: "Player",
                team: "Mallows",
                score: this.gold,
                status: `Lvl ${this.level} (${this.xp}/${this.maxXp})`
            }
        ];
    }
}
