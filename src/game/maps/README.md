# Map File Format Documentation

This document describes the tile-based map format used in Condition-1. Maps are defined as JSON files using a 2D matrix system where each tile represents a 2x2 unit area in the game world.

## File Structure

A map file is a JSON object with the following structure:

```json
{
  "name": "map_name",
  "version": "1.0",
  "tileSize": 2,
  "tiles": [[...], [...]],
  "heights": [[...], [...]],
  "indoor": [[...], [...]],
  "roofs": [[...], [...]],
  "doors": [...],
  "windows": [...],
  "spawnPoints": [...],
  "materials": {...}
}
```

## Required Fields

### `name` (string)
The name of the map (e.g., "de_dust2", "my_custom_map")

### `version` (string)
Version number of the map format (currently "1.0")

### `tileSize` (number)
The size of each tile in world units. Default is `2` (each tile is 2x2 units).

### `tiles` (2D array of numbers)
A 2D matrix where each number represents a tile type. The array is indexed as `tiles[y][x]` where:
- `y` is the row (north-south)
- `x` is the column (east-west)

The map origin (0,0) is at the top-left corner, with:
- Positive X = East
- Positive Z = South (increasing Y in the array)

## Tile Types

Each tile in the `tiles` array must be one of these values:

| Code | Name | Description |
|------|------|-------------|
| `0` | `EMPTY` | Empty space (no floor, no collision) |
| `1` | `FLOOR` | Outdoor floor tile |
| `2` | `WALL` | Wall tile (will create walls around it) |
| `3` | `DOOR` | Door tile (requires door definition) |
| `4` | `WINDOW` | Window tile (requires window definition) |
| `5` | `INDOOR_FLOOR` | Indoor floor tile (different material) |
| `6` | `INDOOR_WALL` | Indoor wall tile |
| `7` | `STAIRS_UP` | Stairs going up (auto-smoothed based on height) |
| `8` | `STAIRS_DOWN` | Stairs going down (auto-smoothed based on height) |
| `9` | `RAMP_UP` | Ramp going up (smooth slope) |
| `10` | `RAMP_DOWN` | Ramp going down (smooth slope) |
| `11` | `BUILDING` | Building tile (creates walls and roof) |
| `12` | `COVER` | Cover object (crate/barrel for tactical gameplay) |

## Height System

### `heights` (2D array of numbers)
A 2D matrix matching the `tiles` array dimensions. Each value represents the height offset for that tile:
- `0` = Ground level
- `1` = 1 tile height above ground (2 units if tileSize=2)
- `2` = 2 tile heights above ground (4 units)
- `-1` = Below ground level (for basements)

**Example:**
```json
"heights": [
  [0, 0, 1, 1],
  [0, 0, 1, 1],
  [0, 0, 0, 0]
]
```

This creates a raised platform in the top-right area.

### Automatic Ramp/Stair Generation
The renderer automatically creates ramps or stairs when there's a height difference between adjacent tiles:
- **Stairs** (`STAIRS_UP`/`STAIRS_DOWN`): Creates stepped geometry
- **Ramps** (`RAMP_UP`/`RAMP_DOWN`): Creates smooth sloped surfaces
- The direction and number of steps/ramp angle is automatically calculated based on neighbor heights

## Indoor/Outdoor System

### `indoor` (2D array of booleans)
A 2D matrix matching the `tiles` array dimensions. Each value indicates if the tile is indoors:
- `true` = Indoor (uses indoor materials, can have roof)
- `false` = Outdoor (uses outdoor materials)

**Example:**
```json
"indoor": [
  [false, false, true, true],
  [false, false, true, true],
  [false, false, false, false]
]
```

### `roofs` (2D array of booleans)
A 2D matrix matching the `tiles` array dimensions. Each value indicates if the tile has a roof above it:
- `true` = Roof exists (blocks vertical movement, creates ceiling)
- `false` = No roof (open sky or upper floor)

**Note:** Roofs are typically only used for indoor areas.

## Doors and Windows

### `doors` (array of objects, optional)
Defines door positions and orientations:

```json
"doors": [
  {
    "x": 10,
    "y": 5,
    "direction": "north"
  }
]
```

**Fields:**
- `x`, `y`: Tile coordinates
- `direction`: `"north"`, `"south"`, `"east"`, or `"west"` (which side of the tile the door is on)

**Note:** The tile at (x, y) must be type `DOOR` (3) for the door to appear.

### `windows` (array of objects, optional)
Defines window positions and orientations:

```json
"windows": [
  {
    "x": 15,
    "y": 8,
    "direction": "east"
  }
]
```

**Fields:**
- `x`, `y`: Tile coordinates
- `direction`: `"north"`, `"south"`, `"east"`, or `"west"` (which side of the tile the window is on)

**Note:** The tile at (x, y) must be type `WINDOW` (4) for the window to appear.

## Spawn Points

### `spawnPoints` (array of objects, optional)
Defines where players, enemies, and squad members spawn:

```json
"spawnPoints": [
  {
    "x": 5,
    "y": 5,
    "team": "ct",
    "type": "player"
  },
  {
    "x": 20,
    "y": 20,
    "team": "t",
    "type": "enemy"
  }
]
```

**Fields:**
- `x`, `y`: Tile coordinates
- `team` (optional): `"ct"`, `"t"`, or `"neutral"`
- `type`: `"player"`, `"enemy"`, or `"squad"`

## Materials

### `materials` (object, optional)
Defines color/material properties for different tile types:

```json
"materials": {
  "floor": 8947848,
  "wall": 6710886,
  "indoorFloor": 11184810,
  "indoorWall": 7895160,
  "roof": 4473924
}
```

**Fields:**
- All fields are optional
- Values are hexadecimal color codes (0xRRGGBB format, but as decimal numbers)
- Default colors are used if not specified

**Color Reference:**
- `8947848` = 0x888888 (Gray)
- `6710886` = 0x666666 (Dark Gray)
- `11184810` = 0xAAAAAA (Light Gray)
- `7895160` = 0x787878 (Medium Gray)
- `4473924` = 0x444444 (Very Dark Gray)
- `13945152` = 0xD4D4D4 (Light Gray)
- `13945152` = 0xD4D4D4 (Beige/Sand)

## Complete Example

Here's a simple 5x5 map example:

```json
{
  "name": "example_map",
  "version": "1.0",
  "tileSize": 2,
  "tiles": [
    [1, 1, 1, 1, 1],
    [1, 5, 5, 5, 1],
    [1, 5, 5, 5, 1],
    [1, 1, 7, 1, 1],
    [1, 1, 1, 1, 1]
  ],
  "heights": [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ],
  "indoor": [
    [false, false, false, false, false],
    [false, true, true, true, false],
    [false, true, true, true, false],
    [false, false, false, false, false],
    [false, false, false, false, false]
  ],
  "roofs": [
    [false, false, false, false, false],
    [false, true, true, true, false],
    [false, true, true, true, false],
    [false, false, false, false, false],
    [false, false, false, false, false]
  ],
  "doors": [
    {
      "x": 1,
      "y": 1,
      "direction": "south"
    }
  ],
  "windows": [
    {
      "x": 2,
      "y": 1,
      "direction": "east"
    }
  ],
  "spawnPoints": [
    {
      "x": 2,
      "y": 4,
      "team": "ct",
      "type": "player"
    }
  ],
  "materials": {
    "floor": 8947848,
    "wall": 6710886,
    "indoorFloor": 11184810,
    "indoorWall": 7895160,
    "roof": 4473924
  }
}
```

This example creates:
- A 5x5 outdoor area
- A 3x3 indoor building in the center (raised 1 level)
- A door on the south side of the building
- A window on the east side
- Stairs connecting the raised area to ground level
- A player spawn point

## Map Creation Tips

1. **Start Small**: Begin with a small map (10x10 or 20x20) to test your layout
2. **Plan Heights**: Use the heights array to create multi-level structures
3. **Indoor Areas**: Mark indoor tiles and add roofs for enclosed spaces
4. **Smooth Transitions**: Use `RAMP_UP`/`RAMP_DOWN` for smooth elevation changes, `STAIRS_UP`/`STAIRS_DOWN` for stepped transitions
5. **Walls**: Walls are automatically generated between tiles with height differences or indoor/outdoor transitions
6. **Cover**: Use `COVER` tiles (12) to add tactical cover objects
7. **Spawn Points**: Place spawn points on valid floor tiles (not on walls or empty spaces)

## Coordinate System

- **Origin**: Top-left corner of the map (tiles[0][0])
- **X-axis**: Increases to the right (East)
- **Z-axis**: Increases downward in the array (South)
- **Y-axis**: Height (upward)

When placing spawn points or doors/windows, remember:
- `x` = column index (0 to width-1)
- `y` = row index (0 to height-1)

## File Location

Place your map JSON files in: `src/game/maps/`

The file should be named: `your_map_name.json`

To load a map, use: `levelGen.loadMap('your_map_name')`

## Advanced Features

### Multi-Level Buildings
Create buildings with multiple floors by:
1. Using height values > 0 for upper floors
2. Marking tiles as indoor
3. Adding roofs to create ceilings
4. Using stairs/ramps to connect levels

### Outdoor Structures
Create outdoor structures like platforms or bridges:
1. Use height values to raise tiles
2. Keep `indoor` as `false`
3. Use `BUILDING` tiles (11) for structures that need walls

### Tactical Layouts
Design for gameplay:
1. Use `COVER` tiles for strategic positions
2. Create chokepoints with walls
3. Use height differences for vertical gameplay
4. Place spawn points away from each other

## Troubleshooting

**Map doesn't load:**
- Check JSON syntax (use a JSON validator)
- Ensure all arrays have the same dimensions
- Verify tile type codes are valid (0-12)

**Walls missing:**
- Walls are auto-generated between height differences
- Ensure adjacent tiles have different heights or indoor/outdoor status

**Doors/Windows not appearing:**
- Tile must be type `DOOR` (3) or `WINDOW` (4)
- Door/window definition must match tile coordinates
- Direction must be valid: "north", "south", "east", or "west"

**Spawn points in wrong location:**
- Check tile coordinates (x, y) match your intended position
- Ensure spawn point is on a valid floor tile (not empty or wall)


