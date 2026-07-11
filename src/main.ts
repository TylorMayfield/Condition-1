import './style.css';
import { Game } from './engine/Game';
import { Player } from './game/Player';
import { LevelGenerator } from './game/LevelGenerator';
import { MenuSystem } from './game/ui/MenuSystem';
import { DEFAULT_MENU_MAP } from '@config/maps';
import { createGameMode, registerBuiltinGameModes } from '@game/gamemodes/registerBuiltinGameModes';
import { GameModeId } from '@game/gamemodes/GameModeId';
import hudHtml from './hud.html?raw';

async function bootstrap() {
    console.log('Condition-1 Starting...');

    await registerBuiltinGameModes();

    const game = new Game();
    (window as any).game = game;

    const player = new Player(game);
    game.player = player;
    game.addGameObject(player);

    const levelGen = new LevelGenerator(game);
    game.levelGenerator = levelGen;
    game.gameMode = createGameMode(game, GameModeId.TDM);

    const menuSystem = new MenuSystem(game, game.settingsManager);
    menuSystem.setLevelGenerator(levelGen);

    levelGen.loadMap(DEFAULT_MENU_MAP).catch(() => {
        console.warn('Failed to load map, using random generation');
        levelGen.generate();
    });

    const hudContainer = document.createElement('div');
    hudContainer.id = 'game-hud';
    hudContainer.innerHTML = hudHtml;
    document.body.appendChild(hudContainer);

    game.start();

    window.addEventListener('keydown', (e) => {
        const pauseKey = game.settingsManager.getControl('Pause') || 'Escape';

        if (e.code === pauseKey) {
            menuSystem.toggle();
        }
    });
}

bootstrap().catch((err) => {
    console.error('Failed to start Condition-1', err);
});
