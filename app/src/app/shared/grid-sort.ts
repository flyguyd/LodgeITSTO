// Copied from Lodge Ops (frontend/src/app/shared) when the STO portal became its own
// repo (2026-09-05). Keep in step by hand; the portal must build without Lodge Ops.
import { WritableSignal, signal } from '@angular/core';

/** Which way a column is sorted. Mirrors the backend's `dir` query param. */
export type SortDir = 'asc' | 'desc';

/**
 * Shared click-to-sort state for a grid header.
 *
 * Every grid in the app sorts the same way, and this is the one place that
 * behaviour lives:
 *
 * - Clicking the column already sorted FLIPS its direction.
 * - Clicking a different column switches to it, opening in that column's
 *   natural direction: text ascending (A→Z), and anything listed in
 *   `descFirst` descending (newest date, biggest number, highest count) —
 *   because "sort by date" almost always means "newest first", while "sort by
 *   name" almost always means "from the top".
 * - The column in play shows ▲ / ▼ after its label, exactly as the Assets
 *   register has always done.
 *
 * The state starts on whatever the grid was ALREADY ordered by before it had
 * headers, so turning sorting on changes nothing until somebody clicks.
 *
 * Server-paged grids pass `onChange` to refetch page 1; grids holding their
 * rows in memory leave it out and let a computed re-sort itself.
 */
export class GridSort<F extends string> {
  readonly field: WritableSignal<F>;
  readonly dir: WritableSignal<SortDir>;

  private readonly initialField: F;
  private readonly initialDir: SortDir;
  private readonly descFirst: ReadonlySet<string>;
  private readonly onChange?: () => void;

  constructor(
    field: F,
    dir: SortDir,
    opts?: { descFirst?: readonly F[]; onChange?: () => void },
  ) {
    this.initialField = field;
    this.initialDir = dir;
    this.field = signal<F>(field);
    this.dir = signal<SortDir>(dir);
    this.descFirst = new Set<string>(opts?.descFirst ?? []);
    this.onChange = opts?.onChange;
  }

  /** True when this column is the one currently sorted. */
  is(field: F): boolean {
    return this.field() === field;
  }

  /** Sort by this column — flipping the direction if it is already the one. */
  by(field: F): void {
    if (this.field() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.field.set(field);
      this.dir.set(this.descFirst.has(field) ? 'desc' : 'asc');
    }
    this.onChange?.();
  }

  /** The arrow appended to a header label. Empty for every other column. */
  mark(field: F): string {
    if (this.field() !== field) return '';
    return this.dir() === 'asc' ? ' ▲' : ' ▼';
  }

  /**
   * For `[attr.aria-sort]` on the `<th>`. Screen readers announce the sorted
   * column from this; the ▲ / ▼ is decorative text they would otherwise read
   * out as a symbol.
   */
  aria(field: F): 'ascending' | 'descending' | 'none' {
    if (this.field() !== field) return 'none';
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  /** Back to the order the grid opens in. */
  reset(): void {
    this.field.set(this.initialField);
    this.dir.set(this.initialDir);
    this.onChange?.();
  }
}

/** What a column can be sorted on. Dates travel as ISO strings or Date. */
export type SortKey = string | number | boolean | Date | null | undefined;

const COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Order two cell values.
 *
 * Empty cells sort LAST in both directions — the same as the `NULLS LAST` the
 * paged endpoints use, and the only behaviour that doesn't bury the rows you
 * were looking for under a wall of blanks when you flip to descending.
 *
 * `numeric: true` on the collator means "Room 2" comes before "Room 10", which
 * is what anyone reading a list of numbered things expects.
 */
export function compareValues(a: SortKey, b: SortKey): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;

  if (a instanceof Date || b instanceof Date) {
    return Number(new Date(a as string)) - Number(new Date(b as string));
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;

  return COLLATOR.compare(String(a), String(b));
}

/**
 * A sorted COPY of `rows` — never sorts in place, so it is safe to call from a
 * `computed()` over a signal holding the source list.
 *
 * Blank cells stay last whichever way the column is pointing, so the direction
 * is applied to the comparison and not to where the empties land.
 */
export function sortRows<T>(
  rows: readonly T[],
  dir: SortDir,
  key: (row: T) => SortKey,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';
    if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
    return sign * compareValues(a, b);
  });
}

/**
 * A number out of a value that may have arrived as a string — TypeORM hands
 * back `numeric` columns as strings, so a money or count column read straight
 * off a row would otherwise sort "9" after "10" as text.
 */
export function numberKey(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
