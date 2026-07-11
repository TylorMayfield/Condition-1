import { describe, expect, it } from 'vitest';
import { TextMapParser } from './TextMapParser';
import { TextBlockType } from './TextMap';

describe('TextMapParser', () => {
    it('parses map metadata and legend', () => {
        const content = `
@name Test Arena
@version 2.0
@scale 4
@legend
. = air
B = brick
@layer y=0 "ground"
....
....
`;

        const map = TextMapParser.parse(content);

        expect(map.name).toBe('Test Arena');
        expect(map.version).toBe('2.0');
        expect(map.scale).toBe(4);
        expect(map.legend.get('.')).toBe(TextBlockType.AIR);
        expect(map.legend.get('B')).toBe(TextBlockType.BRICK);
        expect(map.layers).toHaveLength(1);
        expect(map.layers[0].label).toBe('ground');
    });
});
