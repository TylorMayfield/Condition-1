import './style.css'
import { Game } from './engine/Game';

console.log('Condition-1 POC Starting...');

const game = new Game();
(window as any).game = game; // Expose for debugging

// Simple ambient light
import * as THREE from 'three';
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
game.scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(10, 10, 10);
game.scene.add(directionalLight);

import { Player } from './game/Player';
import { LevelGenerator } from './game/LevelGenerator';

const player = new Player(game);
game.player = player;
game.addGameObject(player);

const levelGen = new LevelGenerator(game);
levelGen.generate();

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
    <button id="restart-btn" style="padding: 10px 20px; font-size: 18px; cursor: pointer;">Restart</button>
</div>
`;
const pauseContainer = document.createElement('div');
pauseContainer.innerHTML = pauseMenuHtml;
document.body.appendChild(pauseContainer);

document.getElementById('resume-btn')?.addEventListener('click', () => {
    game.togglePause();
});

document.getElementById('restart-btn')?.addEventListener('click', () => {
    window.location.reload();
});

game.start();
