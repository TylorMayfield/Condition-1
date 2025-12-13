
export class MallowHUD {
    private container: HTMLDivElement;
    
    // Health Bars
    private healthBars: Map<string, HTMLDivElement> = new Map();
    private healthContainer: HTMLDivElement;

    // Elements
    private stateDisplay: HTMLDivElement;
    private statsDisplay: HTMLDivElement;
    private messageDisplay: HTMLDivElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'mallow-hud';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none';
        this.container.style.fontFamily = "'Segoe UI', sans-serif";
        document.body.appendChild(this.container);
        
        // Health bar container (behind message, ahead of scene)
        this.healthContainer = document.createElement('div');
        this.healthContainer.style.position = 'absolute';
        this.healthContainer.style.width = '100%';
        this.healthContainer.style.height = '100%';
        this.container.appendChild(this.healthContainer);
        
        // State Display (Top Center)
        this.stateDisplay = document.createElement('div');
        this.stateDisplay.style.position = 'absolute';
        this.stateDisplay.style.top = '20px';
        this.stateDisplay.style.left = '50%';
        this.stateDisplay.style.transform = 'translateX(-50%)';
        this.stateDisplay.style.fontSize = '24px';
        this.stateDisplay.style.fontWeight = 'bold';
        this.stateDisplay.style.color = 'white';
        this.stateDisplay.style.textShadow = '0 0 10px black';
        this.container.appendChild(this.stateDisplay);
        
        // Stats Display (Top Right)
        this.statsDisplay = document.createElement('div');
        this.statsDisplay.style.position = 'absolute';
        this.statsDisplay.style.top = '20px';
        this.statsDisplay.style.right = '20px';
        this.statsDisplay.style.textAlign = 'right';
        this.statsDisplay.style.color = 'gold'; // Gold color!
        this.statsDisplay.style.textShadow = '0 0 5px black';
        this.statsDisplay.style.fontSize = '20px';
        this.container.appendChild(this.statsDisplay);
        
        // Message Display (Center - for "Level Up", "Victory")
        this.messageDisplay = document.createElement('div');
        this.messageDisplay.style.position = 'absolute';
        this.messageDisplay.style.top = '40%';
        this.messageDisplay.style.left = '50%';
        this.messageDisplay.style.transform = 'translate(-50%, -50%)';
        this.messageDisplay.style.fontSize = '48px';
        this.messageDisplay.style.fontWeight = 'bold';
        this.messageDisplay.style.textTransform = 'uppercase';
        this.messageDisplay.style.color = 'white';
        this.messageDisplay.style.textShadow = '0 0 20px rgba(0,0,0,0.8)';
        this.messageDisplay.style.opacity = '0';
        this.messageDisplay.style.transition = 'opacity 0.5s';
        this.container.appendChild(this.messageDisplay);
    }
    
    public updateHealthBar(id: string, x: number, y: number, healthPercent: number, team: string): void {
        let bar = this.healthBars.get(id);
        if (!bar) {
            bar = document.createElement('div');
            bar.style.position = 'absolute';
            bar.style.width = '40px';
            bar.style.height = '6px';
            bar.style.backgroundColor = 'rgba(0,0,0,0.5)';
            bar.style.border = '1px solid rgba(0,0,0,0.8)';
            bar.style.pointerEvents = 'none';
            
            const fill = document.createElement('div');
            fill.className = 'fill';
            fill.style.height = '100%';
            fill.style.width = '100%';
            fill.style.backgroundColor = team === 'Player' ? '#00ff00' : '#ff0000';
            bar.appendChild(fill);
            
            this.healthContainer.appendChild(bar);
            this.healthBars.set(id, bar);
        }
        
        // Update Position
        // Hide if off-screen (basic check)
        if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'block';
            bar.style.left = `${x - 20}px`; // Center horizontally
            bar.style.top = `${y - 10}px`; // Offset above head
        }
        
        // Update Fill
        const fill = bar.querySelector('.fill') as HTMLDivElement;
        if (fill) fill.style.width = `${Math.max(0, healthPercent * 100)}%`;
        
        // Cleanup check? We should explicitly remove bars if units die.
    }
    
    public removeHealthBar(id: string): void {
        const bar = this.healthBars.get(id);
        if (bar) {
            bar.remove();
            this.healthBars.delete(id);
        }
    }
    
    public updateState(stateName: string): void {
        this.stateDisplay.textContent = stateName.replace('_', ' ');
    }
    
    public updateStats(gold: number, level: number, xp: number, maxXp: number): void {
        this.statsDisplay.innerHTML = `
            <div>💰 ${gold}</div>
            <div style="color: #00ffaa; font-size: 16px;">Lvl ${level} (${xp}/${maxXp})</div>
        `;
    }
    
    public showMessage(text: string, color: string = 'white', duration: number = 2000): void {
        this.messageDisplay.textContent = text;
        this.messageDisplay.style.color = color;
        this.messageDisplay.style.opacity = '1';
        
        setTimeout(() => {
            this.messageDisplay.style.opacity = '0';
        }, duration);
    }
    
    public dispose(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
    
    // ==================== INVENTORY UI ====================
    private inventoryModal: HTMLDivElement | null = null;
    
    public toggleInventory(
        items: string[], 
        units: { id: string, name: string, role: string, equipped?: string }[],
        onEquip: (unitId: string, item: string) => void
    ): void {
        if (this.inventoryModal) {
            this.inventoryModal.remove();
            this.inventoryModal = null;
            return;
        }
        
        this.inventoryModal = document.createElement('div');
        this.inventoryModal.style.position = 'absolute';
        this.inventoryModal.style.top = '50%';
        this.inventoryModal.style.left = '50%';
        this.inventoryModal.style.transform = 'translate(-50%, -50%)';
        this.inventoryModal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        this.inventoryModal.style.border = '2px solid white';
        this.inventoryModal.style.padding = '20px';
        this.inventoryModal.style.width = '600px';
        this.inventoryModal.style.height = '400px';
        this.inventoryModal.style.display = 'flex'; // Column layout
        this.inventoryModal.style.flexDirection = 'row'; // Items | Units
        this.inventoryModal.style.gap = '20px';
        this.inventoryModal.style.pointerEvents = 'auto'; // Enable interaction
        
        // --- Left Panel: Items ---
        const itemPanel = document.createElement('div');
        itemPanel.style.flex = '1';
        itemPanel.style.borderRight = '1px solid grey';
        itemPanel.innerHTML = '<h3 style="color:white; margin-top:0;">Backpack</h3>';
        
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.textContent = item.toUpperCase();
            itemEl.style.color = '#ffffaa';
            itemEl.style.padding = '5px';
            itemEl.style.margin = '5px';
            itemEl.style.border = '1px solid #555';
            itemEl.style.cursor = 'grab';
            itemEl.draggable = true;
            
            itemEl.addEventListener('dragstart', (e) => {
                if(e.dataTransfer) e.dataTransfer.setData('text/plain', item);
            });
            
            itemPanel.appendChild(itemEl);
        });
        
        this.inventoryModal.appendChild(itemPanel);
        
        // --- Right Panel: Units ---
        const unitPanel = document.createElement('div');
        unitPanel.style.flex = '1';
        unitPanel.innerHTML = '<h3 style="color:white; margin-top:0;">Squad</h3>';
        
        units.forEach(unit => {
            const unitEl = document.createElement('div');
            unitEl.style.padding = '10px';
            unitEl.style.margin = '5px';
            unitEl.style.backgroundColor = '#333';
            unitEl.style.color = 'white';
            const equippedText = unit.equipped ? `(Has: ${unit.equipped})` : '(Empty)';
            unitEl.textContent = `${unit.name} [${unit.role}] ${equippedText}`;
            
            // Drop Zone
            unitEl.addEventListener('dragover', (e) => e.preventDefault()); // Allow drop
            unitEl.addEventListener('drop', (e) => {
                e.preventDefault();
                if(e.dataTransfer) {
                    const droppedItem = e.dataTransfer.getData('text/plain');
                    onEquip(unit.id, droppedItem);
                    // Refresh not handled here, assume game calls toggle again or updates state
                    this.toggleInventory(items.filter(i => i !== droppedItem), units, onEquip); // Optimistic visual update
                }
            });
            
            unitPanel.appendChild(unitEl);
        });
        
        this.inventoryModal.appendChild(unitPanel);
        
        // Close Button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'X';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '5px';
        closeBtn.style.right = '5px';
        closeBtn.onclick = () => this.toggleInventory([], [], onEquip);
        this.inventoryModal.appendChild(closeBtn);
        
        this.container.appendChild(this.inventoryModal);
    }
    // ==================== MAP UI ====================
    private mapModal: HTMLDivElement | null = null;
    
    public showMapSelection(
        nodes: { id: number, type: number, layer: number, next: number[], status: string }[], 
        onSelect: (nodeId: number) => void
    ): void {
        if (this.mapModal) this.mapModal.remove();
        
        this.mapModal = document.createElement('div');
        this.mapModal.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(20, 20, 30, 0.95); pointer-events: auto;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        `;
        
        const title = document.createElement('h2');
        title.textContent = "CHOOSE YOUR PATH";
        title.style.color = "white";
        this.mapModal.appendChild(title);
        
        const mapContainer = document.createElement('div');
        mapContainer.style.cssText = `
            width: 80%; height: 60%; 
            display: flex; flex-direction: column-reverse; /* Bottom to Top layers */
            gap: 20px; overflow-y: auto; padding: 20px;
            border: 2px solid #444; background: #111;
        `;
        
        // Group by layer
        const layers = new Map<number, typeof nodes>();
        nodes.forEach(n => {
            if (!layers.has(n.layer)) layers.set(n.layer, []);
            layers.get(n.layer)!.push(n);
        });
        
        // Sort layers ascending
        const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
        
        sortedLayers.forEach(layerIdx => {
            const layerRow = document.createElement('div');
            layerRow.style.cssText = `display: flex; justify-content: center; gap: 50px; position: relative;`;
            
            layers.get(layerIdx)?.forEach(node => {
                const nodeBtn = document.createElement('button');
                
                // Color by Type
                let color = "grey";
                let icon = "❓";
                // Node Types: 0=Combat, 1=Elite, 2=Rest, 3=Shop, 4=Mystery, 5=Boss
                if (node.type === 0) { color = "#ff4444"; icon = "⚔️"; } // Combat
                else if (node.type === 1) { color = "#aa0000"; icon = "☠️"; } // Elite
                else if (node.type === 2) { color = "#4444ff"; icon = "⛺"; } // Rest
                else if (node.type === 3) { color = "#44ff44"; icon = "🛒"; } // Shop
                else if (node.type === 4) { color = "#ffff00"; icon = "❓"; } // Mystery
                else if (node.type === 5) { color = "#880000"; icon = "👹"; } // Boss
                
                nodeBtn.style.cssText = `
                    width: 60px; height: 60px; border-radius: 50%;
                    background: ${color}; border: 3px solid ${node.status === 'available' ? 'white' : '#333'};
                    font-size: 24px; cursor: ${node.status === 'available' ? 'pointer' : 'default'};
                    opacity: ${node.status === 'locked' ? '0.3' : '1'};
                    transform: ${node.status === 'current' ? 'scale(1.2)' : 'scale(1)'};
                    transition: transform 0.2s;
                `;
                nodeBtn.textContent = icon;
                
                if (node.status === 'available') {
                    nodeBtn.onclick = () => {
                        onSelect(node.id);
                        this.mapModal?.remove();
                        this.mapModal = null;
                    };
                    nodeBtn.onmouseenter = () => nodeBtn.style.transform = 'scale(1.1)';
                    nodeBtn.onmouseleave = () => nodeBtn.style.transform = 'scale(1)';
                }
                
                layerRow.appendChild(nodeBtn);
            });
            mapContainer.appendChild(layerRow);
        });
        
        this.mapModal.appendChild(mapContainer);
        this.container.appendChild(this.mapModal);
    }
    
    public hideMap(): void {
        if (this.mapModal) {
            this.mapModal.remove();
            this.mapModal = null;
        }
    }

    // ==================== SHOP UI ====================
    private shopModal: HTMLDivElement | null = null;

    public showShopInterface(
        items: { id: string, name: string, cost: number, type: string }[], 
        gold: number,
        onBuy: (itemId: string) => void,
        onExit: () => void
    ): void {
        if (this.shopModal) this.shopModal.remove();
        
        this.shopModal = document.createElement('div');
        this.shopModal.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(10, 30, 20, 0.95); pointer-events: auto;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        `;
        
        const header = document.createElement('div');
        header.innerHTML = `<h2>MALLOW MART</h2><p>Gold: <span style="color:gold">${gold}</span></p>`;
        header.style.color = "white";
        getHeader(header); // Helper workaround if needed, or just append
        this.shopModal.appendChild(header);
        
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
            margin-top: 30px;
        `;
        
        items.forEach(item => {
            const card = document.createElement('div');
            card.style.cssText = `
                width: 200px; padding: 20px; background: #222; border: 2px solid #555;
                color: white; text-align: center; border-radius: 10px;
            `;
            
            card.innerHTML = `
                <div style="font-size: 32px; margin-bottom: 10px;">📦</div>
                <h3>${item.name}</h3>
                <p style="color: grey">${item.type}</p>
                <p style="color: gold; font-weight: bold;">${item.cost} G</p>
                <button class="buy-btn" style="padding: 8px 16px; cursor: pointer;">BUY</button>
            `;
            
            const btn = card.querySelector('.buy-btn') as HTMLButtonElement;
            btn.disabled = gold < item.cost;
            if (btn.disabled) btn.style.opacity = "0.5";
            
            btn.onclick = () => {
                onBuy(item.id);
                // HUD update expected by caller to refresh/close
            };
            
            grid.appendChild(card);
        });
        
        this.shopModal.appendChild(grid);
        
        const exitBtn = document.createElement('button');
        exitBtn.textContent = "LEAVE SHOP";
        exitBtn.style.cssText = `
            margin-top: 40px; padding: 15px 30px; font-size: 20px; 
            background: #d32f2f; color: white; border: none; cursor: pointer;
        `;
        exitBtn.onclick = () => {
            onExit();
            this.shopModal?.remove();
            this.shopModal = null;
        };
        this.shopModal.appendChild(exitBtn);
        
        this.container.appendChild(this.shopModal);
    }
    
    public hideShop(): void {
        if (this.shopModal) {
            this.shopModal.remove();
            this.shopModal = null;
        }
    }
}

function getHeader(el: HTMLElement) {} // Dummy specifically for the block above if needed? No, standard TS.

