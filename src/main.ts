import './style.css'
import { Game } from './engine/Game';
import { Player } from './game/Player';
import { LevelGenerator } from './game/LevelGenerator';
import { MenuSystem } from './game/ui/MenuSystem';

console.log('Condition-1 Starting...');

const game = new Game();
(window as any).game = game; // Expose for debugging

const player = new Player(game);
game.player = player;
game.addGameObject(player);

const levelGen = new LevelGenerator(game);

// Initialize Menu System
const menuSystem = new MenuSystem(game, game.settingsManager);
menuSystem.setLevelGenerator(levelGen);

// Load default map as background (optional, or wait for user to click New Game)
// We'll load it so there's something to see behind the transparent menu
const defaultMap = 'generated_test';
levelGen.loadMap(defaultMap).catch(() => {
    console.warn('Failed to load map, using random generation');
    levelGen.generate();
});

// Inject HUD
import hudHtml from './hud.html?raw';
const hudContainer = document.createElement('div');
hudContainer.id = 'game-hud';
hudContainer.innerHTML = hudHtml;
document.body.appendChild(hudContainer);

// Start Game Loop
game.start();

// Handle Global Input for Menu Toggle
window.addEventListener('keydown', (e) => {
    // Check for Pause Action
    // Since Input system handles mapping, we can check via game.input
    // BUT game.input updates in the loop.
    // However, for UI toggle, checking directly here or in menuSystem is fine.

    // Better: Update MenuSystem every frame?
    // Or just check if the key matches the configured Pause key
    const pauseKey = game.settingsManager.getControl('Pause') || 'Escape';

    if (e.code === pauseKey) {
        menuSystem.toggle();
    }
});
