
const fs = require('fs');
const path = require('path');

const BlockType = {
    AIR: 0,
    CONCRETE: 1,
    BRICK: 2,
    WOOD_PLANKS: 3,
    GRASS: 4,
    DIRT: 5,
    STONE: 6,
    METAL: 7,
    CRATE: 8,
    SPAWN_POINT: 99
};

const width = 16;
const height = 16;
const scale = 2; // 2 units per block

const blocks = [];
const spawnPoints = [];

function addBlock(x, y, z, type) {
    blocks.push({ x, y, z, type });
}

// === Map Generation: The Tower ===

// Ground Floor (y=0)
for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
        addBlock(x, -1, z, BlockType.GRASS); // Foundation

        // Walls
        if (x === 0 || x === width - 1 || z === 0 || z === height - 1) {
            // Leave entrance
            if (x === 8 && z === 0) {
                // Doorway
            } else {
                addBlock(x, 0, z, BlockType.BRICK);
                addBlock(x, 1, z, BlockType.BRICK);
                addBlock(x, 2, z, BlockType.BRICK);
            }
        }
    }
}
// Floor 1 Ceiling / Floor 2 Base (y=3)
for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
        if (x > 1 && x < width - 2 && z > 1 && z < height - 2) {
            addBlock(x, 3, z, BlockType.WOOD_PLANKS);
        }
    }
}

// Stairs from 0 to 3
for (let i = 0; i < 4; i++) {
    addBlock(2, i, 2 + i, BlockType.WOOD_PLANKS); // Simple stairs
}

// Second Floor Walls (y=4,5,6)
for (let x = 2; x < width - 2; x++) {
    for (let z = 2; z < height - 2; z++) {
        if (x === 2 || x === width - 3 || z === 2 || z === height - 3) {
            addBlock(x, 4, z, BlockType.CONCRETE);
            addBlock(x, 5, z, BlockType.CONCRETE);
            // Windows
            if ((x === 4 || x === 10) && (z === 2 || z === height - 3)) {
                // No block = window
            } else {
                addBlock(x, 6, z, BlockType.CONCRETE);
            }
        }
    }
}

// Roof (y=7)
for (let x = 2; x < width - 2; x++) {
    for (let z = 2; z < height - 2; z++) {
        addBlock(x, 7, z, BlockType.STONE);
    }
}

// Spawns
spawnPoints.push({ x: 8, y: 0, z: -2, type: 'player' }); // Outside front
spawnPoints.push({ x: 8, y: 4, z: 8, type: 'enemy' }); // 2nd Floor
spawnPoints.push({ x: 8, y: 8, z: 8, type: 'enemy' }); // Roof

// Write Map
const mapData = {
    name: "tower_voxel",
    version: "1.0",
    scale: scale,
    blocks: blocks,
    spawnPoints: spawnPoints
};

const outputPath = path.join(__dirname, '../game/maps/tower_voxel.json');
fs.writeFileSync(outputPath, JSON.stringify(mapData, null, 2));
console.log(`Voxel Map written to ${outputPath}`);
