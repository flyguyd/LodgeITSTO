// Copied from Lodge Ops (frontend/src/app/shared) when the STO portal became its own
// repo (2026-09-05). Keep in step by hand; the portal must build without Lodge Ops.
import {
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SortDir } from './grid-sort';

/** One column of a Standard Grid header. */
export interface StdGridColumn {
  key: string;
  label: string;
  /** Default true. False renders a plain label — no sort button, no arrow. */
  sortable?: boolean;
}

/**
 * THE STANDARD GRID (Dave, 2026-08-28) — the house grid chrome, extracted
 * from the Stay Proposals grid so every grid can carry it: when Dave asks
 * for "a standard grid", this component with the requested content is what
 * he means.
 *
 * What it owns:
 *  - A soft-dark header (#3d372e) with bright ivory column titles, every
 *    column a sort button with a gold ▲/▼ on the active one (faint ↕
 *    elsewhere). Sorting behaviour follows the shared GridSort rules.
 *  - THE HOVER SEARCH: hovering the header slides a search strip out from
 *    behind it. Leave without typing and it slides away; type something and
 *    it stays until the ✕ hide button clears it (or the text is deleted).
 *    With `rowText` set the search FILTERS THE LOADED CONTENT in place;
 *    without it the grid emits `searchChange` (debounced) for server-side
 *    search. While a local filter hides rows the body keeps the height it
 *    had unfiltered, so the page does not jump.
 *  - A matching dark footer: total, « ‹ Page X of Y › », and a Show
 *    dropdown (20/50/100/200). Always present — it owns the page size.
 *
 * The page provides the CONTENT: a `columns` config, a CSS grid template
 * shared by header and rows, and an <ng-template #row let-r> rendering one
 * row's cells. Rows are clickable when a rowClick listener is attached.
 */
@Component({
  selector: 'oa-standard-grid',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule],
  template: `
    <div class="std-grid">
      <div
        class="std-headzone"
        (mouseenter)="hovering.set(true)"
        (mouseleave)="hovering.set(false)"
      >
        <div class="std-row-head" [style.gridTemplateColumns]="template">
          @for (c of columns; track c.key) {
            @if (c.sortable !== false) {
              <button type="button" class="std-sort" (click)="setSort(c.key)">
                {{ c.label }}
                <span class="std-arrow" [class.on]="sortKey === c.key">{{
                  sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'
                }}</span>
              </button>
            } @else {
              <span class="std-sort std-sort-static">{{ c.label }}</span>
            }
          }
        </div>
        <!-- The search strip lives BEHIND the header and slides into view
             under it. Kept in the DOM so the slide animates both ways. -->
        <div class="std-search" [class.open]="searchOpen()">
          <input
            class="std-search-input"
            type="text"
            [placeholder]="searchPlaceholder"
            [ngModel]="query()"
            (ngModelChange)="onQuery($event)"
          />
          <button
            type="button"
            class="std-search-hide"
            title="Hide search"
            (click)="hideSearch()"
          >✕</button>
        </div>
      </div>

      <div class="std-body" #body [style.minHeight.px]="heldHeight()">
        @if (loading && view().length === 0) {
          <div class="std-empty">Loading…</div>
        } @else if (view().length === 0) {
          <div class="std-empty">
            {{ query() ? 'Nothing matches your search.' : emptyText }}
          </div>
        } @else {
          @for (r of view(); track trackBy(r)) {
            <div
              class="std-rowwrap"
              [class.clickable]="rowClick.observed"
              (click)="rowClick.emit(r)"
            >
              <div class="std-row" [style.gridTemplateColumns]="template">
                <ng-container
                  [ngTemplateOutlet]="rowTpl"
                  [ngTemplateOutletContext]="{ $implicit: r }"
                />
              </div>
            </div>
          }
        }
      </div>

      <footer class="std-foot">
        <span class="std-foot-total">{{ totalLabel() }}</span>
        <nav class="std-foot-nav">
          <button type="button" class="std-foot-btn" [disabled]="page <= 1" (click)="pageChange.emit(1)" title="First page">«</button>
          <button type="button" class="std-foot-btn" [disabled]="page <= 1" (click)="pageChange.emit(page - 1)" title="Previous page">‹</button>
          <span class="std-foot-info">Page {{ page }} of {{ pages() }}</span>
          <button type="button" class="std-foot-btn" [disabled]="page >= pages()" (click)="pageChange.emit(page + 1)" title="Next page">›</button>
          <button type="button" class="std-foot-btn" [disabled]="page >= pages()" (click)="pageChange.emit(pages())" title="Last page">»</button>
        </nav>
        <label class="std-foot-size">
          Show
          <select class="std-foot-select" (change)="onPageSize($any($event.target).value)">
            @for (n of pageSizes; track n) {
              <option [value]="n" [selected]="pageSize === n">{{ n }}</option>
            }
          </select>
        </label>
      </footer>
    </div>
  `,
  styles: [
    `
      /* The Standard Grid palette: a SOFT dark (Dave: the first cut was too
         dark), bright ivory text, gold accents. Explicit colours on purpose
         so the chrome reads identically in both themes. */
      .std-grid {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--oa-border);
        border-radius: 14px;
        overflow: hidden;
        background: var(--oa-surface);
      }
      .std-headzone { position: relative; z-index: 1; }
      .std-row-head {
        display: grid;
        gap: 12px;
        align-items: center;
        padding: 0 16px;
        background: #3d372e;
        color: #f3ede1;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        position: relative;
        z-index: 2;
      }
      .std-sort {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        text-transform: inherit;
        letter-spacing: inherit;
        cursor: pointer;
        padding: 12px 0;
        text-align: left;
      }
      .std-sort-static { cursor: default; }
      .std-sort:not(.std-sort-static):hover { color: #c8a45f; }
      .std-arrow { color: rgba(243, 237, 225, 0.35); font-size: 10px; }
      .std-arrow.on { color: #c8a45f; }

      /* The search strip: parked behind the header (translated up under it),
         slides down on hover, stays while it holds text. */
      .std-search {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        background: #4a4337;
        max-height: 0;
        overflow: hidden;
        transform: translateY(-6px);
        opacity: 0;
        transition: max-height 0.22s ease, transform 0.22s ease, opacity 0.22s ease, padding 0.22s ease;
      }
      .std-search.open {
        max-height: 52px;
        padding: 8px 16px;
        transform: translateY(0);
        opacity: 1;
      }
      .std-search-input {
        flex: 1 1 auto;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(243, 237, 225, 0.3);
        border-radius: 8px;
        color: #f3ede1;
        font: inherit;
        font-size: 13px;
        padding: 6px 10px;
      }
      .std-search-input::placeholder { color: rgba(243, 237, 225, 0.55); }
      .std-search-input:focus { outline: none; border-color: #c8a45f; }
      .std-search-hide {
        border: 1px solid rgba(243, 237, 225, 0.3);
        background: none;
        color: #f3ede1;
        border-radius: 8px;
        width: 28px;
        height: 28px;
        cursor: pointer;
        line-height: 1;
      }
      .std-search-hide:hover { border-color: #c8a45f; color: #c8a45f; }

      .std-body { display: flex; flex-direction: column; }
      .std-rowwrap { position: relative; }
      .std-rowwrap.clickable { cursor: pointer; }
      .std-rowwrap.clickable:hover .std-row { background: var(--oa-surface-2); }
      .std-row {
        display: grid;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--oa-border);
        color: var(--oa-text);
        font-size: 14px;
        background: var(--oa-surface);
      }
      .std-rowwrap:last-of-type .std-row { border-bottom: none; }
      .std-empty {
        padding: 40px;
        text-align: center;
        color: var(--oa-text-dim);
      }

      .std-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        padding: 10px 16px;
        background: #3d372e;
        color: #f3ede1;
        font-size: 13px;
      }
      .std-foot-total { color: rgba(243, 237, 225, 0.75); }
      .std-foot-nav { display: flex; align-items: center; gap: 6px; }
      .std-foot-info { padding: 0 8px; font-variant-numeric: tabular-nums; }
      .std-foot-btn {
        min-width: 30px;
        height: 30px;
        border: 1px solid rgba(243, 237, 225, 0.3);
        border-radius: 8px;
        background: none;
        color: #f3ede1;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
      }
      .std-foot-btn:hover:not(:disabled) { border-color: #c8a45f; color: #c8a45f; }
      .std-foot-btn:disabled { opacity: 0.35; cursor: default; }
      .std-foot-size { display: inline-flex; align-items: center; gap: 8px; color: rgba(243, 237, 225, 0.75); }
      .std-foot-select {
        background: #2e2a23;
        color: #f3ede1;
        border: 1px solid rgba(243, 237, 225, 0.3);
        border-radius: 8px;
        padding: 5px 8px;
        font: inherit;
        cursor: pointer;
      }
    `,
  ],
})
export class StandardGridComponent<T = unknown> {
  @Input({ required: true }) columns: StdGridColumn[] = [];
  /** grid-template-columns, shared by the header and every row. */
  @Input({ required: true }) template = '';
  @Input({ required: true }) set rows(v: T[]) {
    this._rows.set(v ?? []);
  }
  @Input({ required: true }) trackBy: (r: T) => unknown = (r) => r;
  /** Local-filter text per row. Omit to emit searchChange (server search). */
  @Input() rowText: ((r: T) => string) | null = null;
  @Input() total = 0;
  @Input() page = 1;
  @Input() pageSize = 50;
  @Input() pageSizes: number[] = [20, 50, 100, 200];
  @Input() sortKey = '';
  @Input() sortDir: SortDir = 'asc';
  @Input() loading = false;
  @Input() emptyText = 'Nothing here yet.';
  @Input() searchPlaceholder = 'Search…';
  @Input() noun = 'rows';

  @Output() sortChange = new EventEmitter<string>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() rowClick = new EventEmitter<T>();

  @ContentChild(TemplateRef, { static: false }) rowTpl!: TemplateRef<{ $implicit: T }>;
  @ViewChild('body') bodyEl?: ElementRef<HTMLElement>;

  private readonly _rows = signal<T[]>([]);
  readonly hovering = signal(false);
  readonly query = signal('');
  /** The body's height as last seen UNFILTERED, held while a local filter
   *  hides rows so the grid does not shrink under the pointer. */
  private readonly held = signal<number | null>(null);
  private debounce: ReturnType<typeof setTimeout> | null = null;

  /** Open while hovered, and pinned open while it holds text. */
  readonly searchOpen = computed(() => this.hovering() || this.query().trim().length > 0);

  readonly view = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this._rows();
    if (!q || !this.rowText) return rows;
    return rows.filter((r) => this.rowText!(r).toLowerCase().includes(q));
  });

  heldHeight(): number | null {
    return this.query().trim() && this.rowText ? this.held() : null;
  }

  onQuery(q: string): void {
    // Capture the unfiltered height the moment filtering starts, so hiding
    // rows cannot shrink the grid (Dave: the vertical size must not change).
    if (!this.query().trim() && q.trim() && this.bodyEl) {
      this.held.set(this.bodyEl.nativeElement.offsetHeight);
    }
    if (!q.trim()) this.held.set(null);
    this.query.set(q);
    if (!this.rowText) {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.searchChange.emit(q.trim()), 250);
    }
  }

  hideSearch(): void {
    // Hiding clears: a hidden-but-active filter would be invisible state.
    this.onQuery('');
    this.hovering.set(false);
  }

  setSort(key: string): void {
    this.sortChange.emit(key);
  }

  onPageSize(raw: string): void {
    const n = Number(raw);
    if (this.pageSizes.includes(n)) this.pageSizeChange.emit(n);
  }

  pages(): number {
    return Math.max(1, Math.ceil(this.total / Math.max(1, this.pageSize)));
  }

  totalLabel(): string {
    const q = this.query().trim();
    if (q && this.rowText) {
      return `${this.view().length} of ${this._rows().length} ${this.noun} match`;
    }
    return `${this.total} ${this.noun}`;
  }
}
