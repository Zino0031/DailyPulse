// Shared grid geometry for the closet and lookbook tiles. Pure math so it is
// unit-tested independently (utils/__tests__/grid.test.ts).

export const GRID_GUTTER = 24; // DESIGN.md §4 screen padding (px-6)
export const GRID_GAP = 12;
const MIN_TILE = 150;
const MAX_CONTENT = 1200; // keeps tiles sane on desktop web / tablets

/**
 * Column count + tile width for the available width: 2 columns on phones,
 * growing on large phones, tablets and web.
 */
export function gridMetrics(windowWidth: number): { columns: number; tileWidth: number } {
  const content = Math.min(windowWidth, MAX_CONTENT) - GRID_GUTTER * 2;
  const columns = Math.max(
    2,
    Math.min(6, Math.floor((content + GRID_GAP) / (MIN_TILE + GRID_GAP))),
  );
  const tileWidth = Math.floor((content - GRID_GAP * (columns - 1)) / columns);
  return { columns, tileWidth };
}
