import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { CalendarDay, PortalApiService, SuiteCalendar, money } from '../core/portal-api.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addMonths = (month: string, n: number) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
export const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plusDays = (from: string, n: number) => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const calMoney = (v: number, currency: string) => (currency === 'ZAR' || !currency ? 'R' : currency + ' ') + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export interface CalCell {
  date: string; num: number; day: CalendarDay | null; stay: boolean; past: boolean;
  rate: string; rack: string; freeText: string; title: string; pick: boolean; pickStart: boolean;
}

/**
 * TWO MONTHS OF AVAILABILITY AND RATES for one suite, as a modal.
 *
 * Extracted from the New booking page (Dave, 2026-09-07) when the Guest
 * Suites page needed the same thing: two implementations of a rate calendar
 * would have drifted, and every figure in here is money, so drift would
 * eventually mean a wrong price shown to an operator.
 *
 * Every rate it shows is THIS operator's — the rate engine applies the
 * channel's rules and then the STO discount, so the page must never take a
 * percentage off again. `rack` is the channel's own figure, struck through
 * beside it when it is higher.
 *
 * `pickable` is what separates the two callers. New booking lets the
 * operator click the stay out (check-in, then check-out) and emits it;
 * Guest Suites is read-only, a window on what is free and what it costs.
 */
@Component({
  selector: 'sto-rate-calendar',
  standalone: true,
  template: `
    <div class="rc-backdrop" (click)="close()">
      <div class="rc-panel" role="dialog" aria-modal="true" aria-label="Availability and rates" (click)="$event.stopPropagation()">
        <header class="rc-head">
          <div>
            <h2>{{ suiteName || 'Availability and rates' }}</h2>
            @if (pickable) {
              <p class="rc-hint">{{ pick() ? 'Now click the CHECK-OUT day — the day the guest leaves.' : 'Click a day to move the stay: check-in, then check-out.' }}</p>
            } @else {
              <p class="rc-hint">What this suite costs you a night, and how many are free. {{ planName ? planName + '.' : '' }}</p>
            }
            @if (note) { <p class="rc-note">{{ note }}</p> }
          </div>
          <button type="button" class="rc-close" (click)="close()" aria-label="Close">✕</button>
        </header>
        <div class="rc-nav">
          <button type="button" class="oa-btn" name="calPrev" (click)="shift(-1)" aria-label="Earlier months">‹</button>
          <strong>{{ rangeLabel() }}</strong>
          <button type="button" class="oa-btn" name="calNext" (click)="shift(1)" aria-label="Later months">›</button>
        </div>
        @if (error()) { <p class="rc-error">{{ error() }}</p> }
        <div class="rc-months" [class.rc-loading]="loading()">
          @for (m of months(); track m.key) {
            <div class="rc-month">
              <h3>{{ m.label }}</h3>
              <div class="rc-grid">
                @for (d of DOW; track d) { <span class="rc-dow">{{ d }}</span> }
                @for (c of m.cells; track $index) {
                  @if (c) {
                    <button type="button" class="rc-day" [class.stay]="c.stay" [class.pick]="c.pick" [class.pick-start]="c.pickStart" [class.soldout]="c.day?.free === 0" [class.unknown]="!c.day || c.day.free == null" [class.past]="c.past" [class.rc-flat]="!pickable" [disabled]="c.past || !pickable" [attr.data-date]="c.date" [title]="c.title" (click)="pickDay(c)" (mouseenter)="hover.set(c.date)">
                      <span class="rc-num">{{ c.num }}</span>
                      @if (c.day && !c.past) { <span class="rc-rate">{{ c.rate }}</span>@if (c.rack) { <span class="rc-rack">{{ c.rack }}</span> }<span class="rc-free">{{ c.freeText }}</span> }
                    </button>
                  } @else { <div class="rc-day rc-blank"></div> }
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .rc-backdrop { position: fixed; inset: 0; background: rgba(20, 16, 10, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1200; padding: 16px; }
      .rc-panel { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); width: min(980px, 100%); max-height: 92vh; overflow: auto; padding: 16px 18px 12px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
      .rc-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
      .rc-head h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
      .rc-hint { margin: 0; max-width: 80ch; color: var(--oa-text-dim); font-size: 12.5px; }
      .rc-close { margin-left: auto; border: 0; background: transparent; font-size: 18px; cursor: pointer; color: var(--oa-text-dim); padding: 2px 6px; }
      .rc-error { color: #9e4029; margin: 4px 0; }
      .rc-nav { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 6px 0 10px; }
      .rc-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 18px; transition: opacity 0.15s; }
      .rc-loading { opacity: 0.5; }
      .rc-month h3 { margin: 0 0 6px; font-size: 14px; font-weight: 650; text-align: center; }
      .rc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
      .rc-dow { text-align: center; font-size: 11px; color: var(--oa-text-dim); text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 2px; }
      .rc-day { min-height: 58px; border: 1px solid var(--oa-border); border-radius: 6px; padding: 4px 5px; display: flex; flex-direction: column; gap: 1px; background: var(--oa-surface-2); font-variant-numeric: tabular-nums; font: inherit; color: inherit; text-align: left; align-items: stretch; cursor: pointer; }
      .rc-day:hover:not(:disabled) { border-color: #8a6d2f; }
      .rc-day:disabled { cursor: default; }
      /* Read-only: the days are a table, not buttons — no hover lift, and the
         cursor says so. They stay <button> for the keyboard and the tooltip. */
      .rc-flat { cursor: default; }
      .rc-blank { cursor: default; border-color: transparent; background: transparent; }
      .rc-num { font-size: 12px; font-weight: 600; }
      .rc-rate { font-size: 12.5px; }
      .rc-rack { font-size: 10.5px; color: var(--oa-text-dim); text-decoration: line-through; }
      .rc-free { font-size: 11px; color: #2f6b3a; }
      .rc-day.soldout { background: #f1ebe2; color: var(--oa-text-dim); }
      .rc-day.soldout .rc-free { color: #9e4029; }
      .rc-day.unknown .rc-free { color: var(--oa-text-dim); }
      .rc-day.past { opacity: 0.4; }
      .rc-day.stay { border-color: #8a6d2f; background: #f6efe1; }
      .rc-day.pick { border-color: #8a6d2f; background: #efe4cd; }
      .rc-day.pick-start { box-shadow: inset 0 0 0 1px #8a6d2f; }
      .rc-note { margin: 2px 0 0; font-size: 12px; color: var(--oa-text-dim); }
    `,
  ],
})
export class RateCalendarComponent implements OnChanges {
  private readonly api = inject(PortalApiService);

  @Input({ required: true }) roomTypeId = '';
  @Input() suiteName = '';
  @Input() adults = 2;
  @Input() children = 0;
  @Input() infants = 0;
  /** Whose rate to read out of each day; null takes the cheapest on offer. */
  @Input() planId: string | null = null;
  @Input() planName = '';
  @Input() currency = 'ZAR';
  /** An existing stay to outline, or null. */
  @Input() stay: { from: string; to: string } | null = null;
  /** The first of the two months shown; today's month when empty. */
  @Input() startMonth = '';
  @Input() pickable = false;
  /** A line of the PAGE's own words under the hint — New booking explains that
   *  the figures are already this operator's discounted rate, which is the one
   *  thing the calendar itself cannot know. */
  @Input() note = '';

  @Output() picked = new EventEmitter<{ from: string; to: string }>();
  @Output() closed = new EventEmitter<void>();

  readonly DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly month = signal('');
  readonly data = signal<SuiteCalendar | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pick = signal('');
  readonly hover = signal('');
  private seq = 0;

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['roomTypeId'] || ch['startMonth'] || ch['adults'] || ch['children'] || ch['infants']) {
      if (!this.month() || ch['roomTypeId'] || ch['startMonth']) this.month.set(this.startMonth || iso(new Date()).slice(0, 7));
      this.load();
    }
  }

  close(): void { this.closed.emit(); }
  shift(by: number): void { this.month.set(addMonths(this.month(), by)); this.load(); }
  rangeLabel(): string { const m = this.month(); return m ? `${monthLabel(m)} – ${monthLabel(addMonths(m, 1))}` : ''; }

  /**
   * The two clicked days ARE the dates: the earlier is check-in, the later
   * check-out, whichever order they come in. Clicking one day twice cannot be
   * a stay, so it is ignored and the calendar keeps waiting for a check-out.
   */
  pickDay(c: CalCell): void {
    if (!this.pickable || c.past) return;
    const first = this.pick();
    if (!first) { this.pick.set(c.date); this.hover.set(c.date); return; }
    if (first === c.date) return;
    const lo = first < c.date ? first : c.date;
    const hi = first < c.date ? c.date : first;
    this.pick.set(''); this.hover.set('');
    this.picked.emit({ from: lo, to: hi });
  }

  private load(): void {
    const m = this.month();
    if (!this.roomTypeId || !m) return;
    const seq = ++this.seq;
    this.loading.set(true); this.error.set('');
    this.api.calendar({ roomTypeId: this.roomTypeId, from: `${m}-01`, to: `${addMonths(m, 2)}-01`, adults: this.adults, children: this.children, infants: this.infants }).subscribe({
      next: (c) => { if (seq !== this.seq) return; this.data.set(c); this.loading.set(false); },
      error: (e: { error?: { message?: string } }) => { if (seq !== this.seq) return; this.loading.set(false); this.error.set(e?.error?.message ?? 'The calendar could not be loaded.'); },
    });
  }

  months(): { key: string; label: string; cells: (CalCell | null)[] }[] {
    const m0 = this.month();
    if (!m0) return [];
    const data = this.data(), today = iso(new Date());
    const from = this.stay?.from ?? '', to = this.stay?.to ?? '';
    const currency = data?.currency || this.currency || 'ZAR';
    // The provisional range while a stay is being clicked out: the first
    // night and wherever the pointer is, in either order. The pointer's day
    // would be check-out, so the nights previewed stop the day before it.
    const pick = this.pick(), over = this.hover() || pick;
    const pickLo = pick ? (pick <= over ? pick : over) : '';
    const pickEnd = pick ? (pick <= over ? over : pick) : '';
    const pickHi = pickEnd && pickEnd > pickLo ? plusDays(pickEnd, -1) : pickEnd;
    return [m0, addMonths(m0, 1)].map((m) => {
      const first = new Date(`${m}-01T00:00:00Z`);
      const lead = (first.getUTCDay() + 6) % 7;
      const cells: (CalCell | null)[] = Array.from({ length: lead }, () => null);
      const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let n = 1; n <= days; n++) {
        const date = `${m}-${String(n).padStart(2, '0')}`;
        const day = data?.days?.[date] ?? null;
        // The figure the server sends IS this operator's — the rate engine
        // applied the discount after the channel's last rule. Discounting it
        // again here would take it off twice.
        const rate = day ? (this.planId && day.rates[this.planId] != null ? day.rates[this.planId] : day.cheapest) : null;
        const rackRate = day?.rack ?? null;
        const inPick = !!pickLo && date >= pickLo && date <= pickHi;
        cells.push({
          date, num: n, day,
          stay: !!from && date >= from && date < to,
          past: date < today,
          pick: inPick,
          pickStart: date === pick,
          rate: rate != null ? calMoney(rate, currency) : day ? '—' : '',
          rack: rackRate != null && rate != null && rackRate > rate ? calMoney(rackRate, currency) : '',
          freeText: day ? (day.free == null ? 'not known' : day.free === 0 ? 'none free' : `${day.free} free`) : '',
          title: day ? `${date}: ${day.free == null ? 'availability not known' : day.free + ' unit(s) free'}${rate != null ? ', ' + money(rate, currency) + ' per night for you' : ''}` : date,
        });
      }
      while (cells.length % 7) cells.push(null);
      return { key: m, label: monthLabel(m), cells };
    });
  }
}
