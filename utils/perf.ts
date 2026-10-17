// Dev-only timing helpers for the PRD §4 measurements (issue #18). Both are
// no-ops in release builds; the measurement protocol lives in
// docs/PERFORMANCE.md.

const marks = new Map<string, number>();

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** Records a monotonic timestamp (ms) under `label`. */
export function perfMark(label: string): void {
  if (!__DEV__) return;
  marks.set(label, now());
}

/** Logs `label` since `from` and returns the elapsed ms (null if unmarked). */
export function perfMeasure(label: string, from: string): number | null {
  const start = marks.get(from);
  if (start === undefined) return null;
  const elapsed = now() - start;
  if (__DEV__) console.log(`[perf] ${label}: ${elapsed.toFixed(0)}ms`);
  return elapsed;
}
