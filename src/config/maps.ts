/** Maps available in the main menu and for navmesh baking. */
export const AVAILABLE_MAPS = [
    'de_dust2_d',
    'de_train_d',
    'de_chateau_d',
    'cs_office_d',
    'cs_italy_d',
    'de_inferno_d',
    'generated_test',
    'window_test',
] as const;

export type MapName = (typeof AVAILABLE_MAPS)[number];

export const DEFAULT_MENU_MAP: MapName = 'generated_test';

/** Map name used when a mode generates its own geometry. */
export const PROCEDURAL_MAP_NAMES = {
    MOBA: 'moba',
} as const;
