# Map Creation Quick Reference

## Tile Type Codes

```
0  = EMPTY          (no floor, void)
1  = FLOOR          (outdoor floor)
2  = WALL           (wall tile)
3  = DOOR           (door - requires door definition)
4  = WINDOW         (window - requires window definition)
5  = INDOOR_FLOOR   (indoor floor)
6  = INDOOR_WALL    (indoor wall)
7  = STAIRS_UP      (stairs going up)
8  = STAIRS_DOWN    (stairs going down)
9  = RAMP_UP        (ramp going up)
10 = RAMP_DOWN      (ramp going down)
11 = BUILDING       (building with walls)
12 = COVER          (cover object)
```

## Height Values

- `0` = Ground level
- `1` = 1 level up (2 units if tileSize=2)
- `2` = 2 levels up (4 units)
- `-1` = Below ground

## Directions

- `"north"` = Negative Z (up in array)
- `"south"` = Positive Z (down in array)
- `"east"` = Positive X (right in array)
- `"west"` = Negative X (left in array)

## Spawn Types

- `"player"` = Main player spawn
- `"enemy"` = Enemy spawn
- `"squad"` = Squad member spawn

## Teams

- `"ct"` = Counter-Terrorist / Friendly
- `"t"` = Terrorist / Enemy
- `"neutral"` = Neutral spawn

## Common Color Codes (Decimal)

```
8947848  = 0x888888  (Gray)
6710886  = 0x666666  (Dark Gray)
11184810 = 0xAAAAAA  (Light Gray)
7895160  = 0x787878  (Medium Gray)
4473924  = 0x444444  (Very Dark Gray)
13945152 = 0xD4D4D4  (Light Gray/Beige)
```

## File Structure Checklist

- [ ] `name` (string)
- [ ] `version` (string, "1.0")
- [ ] `tileSize` (number, usually 2)
- [ ] `tiles` (2D array, all same dimensions)
- [ ] `heights` (2D array, same size as tiles)
- [ ] `indoor` (2D array, same size as tiles)
- [ ] `roofs` (2D array, same size as tiles)
- [ ] `doors` (array, optional)
- [ ] `windows` (array, optional)
- [ ] `spawnPoints` (array, optional)
- [ ] `materials` (object, optional)

## Tips

1. **Always match array dimensions** - All 2D arrays must be the same size
2. **Use stairs for stepped transitions** - Auto-calculates step count
3. **Use ramps for smooth slopes** - Auto-calculates angle
4. **Mark indoor areas** - Set `indoor: true` and add roofs
5. **Walls auto-generate** - Between height differences and indoor/outdoor transitions
6. **Test spawn points** - Place on valid floor tiles (1, 5, 7, 8, 9, 10)

## Coordinate System

```
(0,0) -----> X (East)
  |
  |
  v
  Y (South)
```

Array indexing: `tiles[y][x]` where:
- `y` = row (north-south)
- `x` = column (east-west)

