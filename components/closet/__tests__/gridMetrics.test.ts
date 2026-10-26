import { gridMetrics } from '@/utils/grid';

describe('gridMetrics', () => {
  it('uses 2 columns on a small phone', () => {
    const { columns, tileWidth } = gridMetrics(320);
    expect(columns).toBe(2);
    expect(tileWidth).toBeGreaterThan(100);
  });

  it('uses 2 columns on a standard phone with tiles that fill the row', () => {
    const { columns, tileWidth } = gridMetrics(390);
    expect(columns).toBe(2);
    // 390 - 2*24 gutter - 12 gap = 330 → 165 per tile
    expect(tileWidth).toBe(165);
  });

  it('grows columns on tablets', () => {
    expect(gridMetrics(820).columns).toBe(4);
  });

  it('caps content width on desktop web so tiles stay reasonable', () => {
    const wide = gridMetrics(2560);
    expect(wide).toEqual(gridMetrics(1200));
    expect(wide.columns).toBeLessThanOrEqual(6);
  });

  it('never overflows the row', () => {
    for (const width of [320, 375, 414, 600, 768, 1024, 1440]) {
      const { columns, tileWidth } = gridMetrics(width);
      const used = columns * tileWidth + (columns - 1) * 12 + 48;
      expect(used).toBeLessThanOrEqual(Math.min(width, 1200));
    }
  });
});
