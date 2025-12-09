/**
 * Map Validation Utilities
 * 
 * This module exports validation functions for use in the browser.
 * For CLI validation during development, use the pattern shown in the example below.
 */

import { BrushMapParser } from './BrushMapParser';
import { MapValidator } from './MapValidator';

/**
 * Validate a brushmap file content and return the result.
 */
export function validateBrushMap(content: string): {
    valid: boolean;
    report: string;
    stats: {
        totalBrushes: number;
        solidBrushes: number;
        detailBrushes: number;
        totalEntities: number;
        playerSpawns: number;
        enemySpawns: number;
    };
} {
    const mapData = BrushMapParser.parse(content);
    const validator = new MapValidator(mapData);
    const result = validator.validate();
    const report = MapValidator.formatReport(result);

    return {
        valid: result.valid,
        report,
        stats: result.stats,
    };
}

/**
 * Parse and validate a brushmap, returning both the parsed data and validation.
 */
export function parseAndValidate(content: string) {
    const mapData = BrushMapParser.parse(content);
    const validator = new MapValidator(mapData);
    const result = validator.validate();

    return {
        mapData,
        validation: result,
        report: MapValidator.formatReport(result),
    };
}

// Re-export for convenience
export { BrushMapParser } from './BrushMapParser';
export { MapValidator } from './MapValidator';
export type { ValidationResult, ValidationIssue } from './MapValidator';
