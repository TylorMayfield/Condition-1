import './style.css'
import { Game } from './engine/Game';

console.log('Condition-1 POC Starting...');

const game = new Game();
(window as any).game = game; // Expose for debugging

// Lighting is handled in Game.setupLighting() - no need for duplicate lights here

import { Player } from './game/Player';
import { LevelGenerator } from './game/LevelGenerator';
import { MapMenuManager } from './game/MapMenuManager';

const player = new Player(game);
game.player = player;
game.addGameObject(player);

const levelGen = new LevelGenerator(game);
const mapMenu = new MapMenuManager(game, levelGen);

// Load default map
const defaultMap = 'killhouse';
levelGen.loadMap(defaultMap).catch(() => {
    console.warn('Failed to load map, using random generation');
    levelGen.generate();
});

// Inject HUD
import hudHtml from './hud.html?raw';
const hudContainer = document.createElement('div');
hudContainer.innerHTML = hudHtml;
document.body.appendChild(hudContainer);

// Inject Pause Menu
const pauseMenuHtml = `
<div id="pause-menu" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 1000; display: none;">
    <h1 style="color: white; font-family: sans-serif; margin-bottom: 20px;">PAUSED</h1>
    <button id="resume-btn" style="padding: 10px 20px; font-size: 18px; cursor: pointer; margin-bottom: 10px;">Resume</button>
    <button id="map-select-btn" style="padding: 10px 20px; font-size: 18px; cursor: pointer; margin-bottom: 10px; background: #4a90e2; color: white; border: 2px solid #6ab0f3; border-radius: 5px;">Select Map</button>
    <button id="restart-btn" style="padding: 10px 20px; font-size: 18px; cursor: pointer;">Restart</button>
</div>
`;
const pauseContainer = document.createElement('div');
pauseContainer.innerHTML = pauseMenuHtml;
document.body.appendChild(pauseContainer);

// Inject Map Picker Menu
const mapPickerMenu = mapMenu.createMapPickerMenu();
document.body.appendChild(mapPickerMenu);

document.getElementById('resume-btn')?.addEventListener('click', () => {
    game.togglePause();
});

document.getElementById('map-select-btn')?.addEventListener('click', () => {
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.style.display = 'none';
    mapMenu.show();
});

document.getElementById('restart-btn')?.addEventListener('click', () => {
    window.location.reload();
});

game.start();
