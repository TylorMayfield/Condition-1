
const fs = require('fs');
const path = require('path');

// Tile Types
const EMPTY = 0;
const FLOOR = 1;
const WALL = 2;
const DOOR = 3;
const WINDOW = 4;
const INDOOR_FLOOR = 5;
const INDOOR_WALL = 6;
const STAIRS_UP = 7;
const STAIRS_DOWN = 8;
const RAMP_UP = 9;
const RAMP_DOWN = 10;
const BUILDING = 11;
const COVER = 12;

const width = 32;
const height = 32;
const tileSize = 2;

// Initialize Grid
const tiles = Array(height).fill(0).map(() => Array(width).fill(EMPTY));
const heights = Array(height).fill(0).map(() => Array(width).fill(0));
const indoor = Array(height).fill(0).map(() => Array(width).fill(false));
const roofs = Array(height).fill(0).map(() => Array(width).fill(false));
const spawnPoints = [];

function setRect(x, y, w, h, type, z = 0, isIndoor = false) {
    for (let iy = y; iy < y + h; iy++) {
        for (let ix = x; ix < x + w; ix++) {
            if (iy >= 0 && iy < height && ix >= 0 && ix < width) {
                tiles[iy][ix] = type;
                heights[iy][ix] = z;
                indoor[iy][ix] = isIndoor;
            }
        }
    }
}

function setTile(x, y, type, z = 0) {
    if (y >= 0 && y < height && x >= 0 && x < width) {
        tiles[y][x] = type;
        heights[y][x] = z;
    }
}

// === Map Generation Logic (32x32 Arena) ===

// 1. Base Floor
setRect(0, 0, width, height, FLOOR, 0);

// 2. Central Platform (King of the Hill)
// Center is 16,16
setRect(10, 10, 12, 12, FLOOR, 2);
// Ramps to center
setRect(14, 8, 4, 2, RAMP_UP, 0); // N ramp (0->1)
setRect(14, 9, 4, 2, RAMP_UP, 1); // N ramp (1->2) - Fix overlap logic in mind

setRect(14, 22, 4, 2, RAMP_UP, 1); // S ramp
setRect(14, 23, 4, 2, RAMP_UP, 0);

// 3. Corner Sniper Perches (Height 1)
setRect(2, 2, 6, 6, FLOOR, 1); // NW
setRect(24, 2, 6, 6, FLOOR, 1); // NE
setRect(2, 24, 6, 6, FLOOR, 1); // SW
setRect(24, 24, 6, 6, FLOOR, 1); // SE

// 4. Indoor Bunker (East Side)
setRect(24, 10, 6, 12, INDOOR_FLOOR, 0, true);
// Walls around bunker
setRect(24, 10, 6, 1, INDOOR_WALL, 0, true); // N
setRect(24, 21, 6, 1, INDOOR_WALL, 0, true); // S
setRect(23, 10, 1, 12, INDOOR_WALL, 0, true); // W
setRect(30, 10, 1, 12, INDOOR_WALL, 0, true); // E
// Door
setTile(23, 16, DOOR, 0);

// 5. Cover (Crates)
setRect(6, 14, 2, 4, COVER, 0); // W cover
setRect(12, 12, 1, 1, COVER, 2); // Center cover
setRect(19, 19, 1, 1, COVER, 2); // Center cover

// 6. Perimeter Wall
setRect(0, 0, width, 1, WALL, 0);
setRect(0, height - 1, width, 1, WALL, 0);
setRect(0, 0, 1, height, WALL, 0);
setRect(width - 1, 0, 1, height, WALL, 0);

// 7. Spawns
spawnPoints.push({ x: 16, y: 4, team: 'ct', type: 'player' }); // N (Low)
spawnPoints.push({ x: 16, y: 28, team: 't', type: 'enemy' }); // S (Low)
spawnPoints.push({ x: 4, y: 16, team: 'neutral', type: 'enemy' }); // W (Low)
spawnPoints.push({ x: 26, y: 16, team: 'neutral', type: 'enemy' }); // E (Inside/Near Bunker)

// Random Spawns
for (let i = 0; i < 4; i++) {
    const rx = 4 + Math.floor(Math.random() * 24);
    const ry = 4 + Math.floor(Math.random() * 24);
    spawnPoints.push({ x: rx, y: ry, team: 'neutral', type: 'enemy' });
}

// Output
const mapData = {
    name: "complex_dm", // Keep original name ID
    version: "3.0",
    tileSize: 2,
    tiles: tiles,
    heights: heights,
    indoor: indoor,
    roofs: roofs,
    spawnPoints: spawnPoints
};

// Write file
const outputPath = path.join(__dirname, '../game/maps/complex_dm.json');
fs.writeFileSync(outputPath, JSON.stringify(mapData, null, 2));
console.log(`Map written to ${outputPath}`);
