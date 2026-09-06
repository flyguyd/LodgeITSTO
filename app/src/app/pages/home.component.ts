import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Catalog, Heatmap, PortalApiService, STATUS_LABELS, Summary, money } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

interface HeatCell {
  date: string;
  num: number;
  free: number | null;
  past: boolean;
  shade: string;
  freeText: string;
  title: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Gold, deepening as the lodge fills: every unit free is barely tinted, none
 *  free is the full accent. Unknown days are left to the striped CSS. */
const shadeFor = (free: number | null, total: number): string => {
  if (free == null) return '';
  const t = total > 0 ? total : Math.max(free, 1);
  const busy = Math.min(1, Math.max(0, 1 - free / t));
  return `rgba(200, 164, 95, ${(0.08 + busy * 0.72).toFixed(3)})`;
};

@Component({
  selector: 'sto-home',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule],
  template: `
    <section class="hm-page">
      <header class="hm-head">
        <div>
          <h1>Welcome, {{ auth.user()?.name }}</h1>
          <p class="hm-dim">{{ auth.company()?.name }} books the lodge at {{ auth.company()?.discountPct }}% off the published rate; a hold keeps the nights for {{ auth.company()?.holdHours }} hours.</p>
        </div>
        <a class="oa-btn oa-btn-primary" routerLink="/new">+ New booking or hold</a>
      </header>
      @if (summary(); as s) {
        <div class="hm-stats">
          <a class="hm-stat" routerLink="/holds" [queryParams]="{ status: 'active' }"><span>Open holds</span><strong>{{ s.holds.open }}</strong><small>{{ money(s.holds.openValue) }}</small></a>
          <a class="hm-stat" routerLink="/bookings"><span>Live bookings</span><strong>{{ s.bookings.live }}</strong><small>{{ money(s.bookings.liveValue) }} · {{ s.bookings.nights }} nights</small></a>
          <!-- WHAT THE OPERATOR HAS BOOKED, IN MONEY (Dave, 2026-09-06) -->
          <div class="hm-stat hm-stat-wide"><span>Revenue booked</span><strong>{{ money(s.bookings.liveValue) }}</strong><small>{{ s.bookings.live }} live booking{{ s.bookings.live === 1 ? '' : 's' }}@if (s.bookings.liveRackValue > s.bookings.liveValue) { · {{ money(s.bookings.liveRackValue) }} at rack }@if (s.bookings.cancelled) { · {{ money(s.bookings.cancelledValue) }} cancelled }</small></div>
          <div class="hm-stat"><span>Saved with your discount</span><strong>{{ money(s.bookings.discountGiven) }}</strong><small>on live bookings</small></div>
          <div class="hm-stat"><span>Nights booked</span><strong>{{ s.bookings.roomNights }}</strong><small>{{ s.bookings.guests }} guest{{ s.bookings.guests === 1 ? '' : 's' }} booked · one night per suite per night</small></div>
          <div class="hm-stat"><span>Searches</span><strong>{{ s.searches }}</strong><small>{{ s.logins }} sign-ins</small></div>
        </div>
        <div class="hm-heat">
          <div class="hm-heathead">
            <h2>Suite availability</h2>
            <div class="hm-nav">
              <button type="button" class="oa-btn hm-navbtn" name="heatPrev" aria-label="Earlier month" (click)="shiftHeat(-1)">‹</button>
              <input class="oa-input hm-date" type="month" name="heatMonth" [ngModel]="heatMonth()" (ngModelChange)="setHeatMonth($event)" aria-label="Jump to a month" />
              <button type="button" class="oa-btn hm-navbtn" name="heatNext" aria-label="Later month" (click)="shiftHeat(1)">›</button>
              <button type="button" class="oa-btn hm-navbtn hm-today" name="heatToday" (click)="setHeatMonth(thisMonth)">Today</button>
            </div>
          </div>
          <p class="hm-dim">Free units across every suite you may sell, two months at a time. Darker is busier; a night with nothing left is marked.</p>
          <p class="hm-pick" name="heatHint">{{ pickHint() }}</p>
          @if (heatError(); as he) { <p class="hm-err">{{ he }}</p> }
          <div class="hm-months" [class.hm-loading]="heatLoading()">
            @for (m of heatMonths(); track m.key) {
              <div class="hm-month">
                <h3>{{ m.label }}</h3>
                <div class="hm-grid">
                  @for (d of DOW; track d) { <span class="hm-dow">{{ d }}</span> }
                  @for (c of m.cells; track $index) {
                    @if (c) {
                      <button type="button" class="hm-cell" [class.none]="c.free === 0" [class.unknown]="c.free === null" [class.past]="c.past" [class.picked]="inPick(c.date)" [class.first]="pickFrom() === c.date" [style.background]="c.shade" [attr.data-date]="c.date" [attr.data-free]="c.free" [title]="c.title" [disabled]="c.past" (click)="pickDay(c.date)" (mouseenter)="pickHover.set(c.date)" (mouseleave)="pickHover.set('')">
                        <span class="hm-day">{{ c.num }}</span>
                        <span class="hm-free">{{ c.freeText }}</span>
                      </button>
                    } @else { <div class="hm-cell hm-blank"></div> }
                  }
                </div>
              </div>
            }
          </div>
          <div class="hm-key">
            <span class="hm-dim">Free units:</span>
            @for (k of legend(); track k.label) { <span class="hm-keyitem"><i [style.background]="k.shade"></i>{{ k.label }}</span> }
          </div>
        </div>

        <!-- TWO CLICKS ON THE HEAT MAP MAKE A STAY (Dave, 2026-09-06): the
             second click opens this, and the button carries the dates to the
             New booking page rather than making anyone re-type them. -->
        @if (stay(); as st) {
          <div class="hm-modal" (click)="clearPick()">
            <div class="hm-modalbox" role="dialog" aria-modal="true" aria-label="Book these dates" (click)="$event.stopPropagation()">
              <button type="button" class="hm-x" name="stayClose" aria-label="Close" (click)="clearPick()">✕</button>
              <h3>Book these dates</h3>
              <p class="hm-stayline">Check in <b>{{ st.from | date: 'EEE d MMM yyyy' }}</b> → check out <b>{{ st.to | date: 'EEE d MMM yyyy' }}</b></p>
              <p class="hm-dim">{{ st.nights }} night{{ st.nights === 1 ? '' : 's' }}{{ st.freeText }}</p>
              <div class="hm-stayacts">
                <button type="button" class="oa-btn" name="stayCancel" (click)="clearPick()">Pick again</button>
                <a class="oa-btn oa-btn-primary" name="stayBook" routerLink="/new" [queryParams]="{ from: st.from, to: st.to }">Create a booking for these dates</a>
              </div>
            </div>
          </div>
        }

        <h2>Next arrivals</h2>
        @for (b of s.upcoming; track b.id) {
          <a class="hm-row" routerLink="/bookings" [queryParams]="{ open: b.id }">
            <b>{{ b.reference }}</b>
            <span>{{ b.from | date: 'EEE d MMM' }} → {{ b.to | date: 'd MMM yyyy' }} · {{ b.nights }}n</span>
            <span>{{ suites(b.suites) }}</span>
            <span>{{ guest(b.guest) }}</span>
            <span class="hm-pill">{{ label(b.status) }}</span>
            <span class="hm-num">{{ money(b.total, b.currency) }}</span>
          </a>
        } @empty { <p class="hm-dim">No upcoming bookings yet — make one with the button above.</p> }
      } @else if (error()) { <p class="hm-err">{{ error() }}</p> } @else { <p class="hm-dim">Loading…</p> }
    </section>
  `,
  styles: [
    `
      .hm-page { width: min(1100px, 94%); margin: 0 auto; padding: 24px 0 60px; }
      .hm-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
      .hm-head h1 { margin: 0; font-size: 24px; }
      .hm-dim { color: var(--oa-text-dim); font-size: 13.5px; margin: 4px 0 0; }
      .hm-err { color: var(--oa-danger); }
      .hm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 22px; }
      .hm-stat { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; background: var(--oa-card-bg); border: 1px solid var(--oa-card-border); border-radius: var(--oa-card-radius); box-shadow: var(--oa-card-shadow); text-decoration: none; color: inherit; }
      .hm-stat span { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--oa-text-dim); }
      .hm-stat strong { font-size: 26px; }
      .hm-stat small { color: var(--oa-text-dim); }
      h2 { font-size: 16px; margin: 0 0 8px; }
      .hm-row { display: grid; grid-template-columns: 1fr 1.6fr 1.6fr 1.4fr 0.9fr 0.9fr; gap: 10px; align-items: center; padding: 10px 12px; background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: 10px; margin-bottom: 6px; text-decoration: none; color: inherit; font-size: 13.5px; }
      .hm-row:hover { border-color: var(--oa-card-border-hover); }
      .hm-pill { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid var(--oa-border); border-radius: 999px; padding: 2px 10px; justify-self: start; }
      .hm-num { text-align: right; font-variant-numeric: tabular-nums; }
      .hm-stat-wide strong { color: var(--oa-accent-strong); }
      .hm-heat { background: var(--oa-card-bg); border: 1px solid var(--oa-card-border); border-radius: var(--oa-card-radius); box-shadow: var(--oa-card-shadow); padding: 14px 16px; margin-bottom: 22px; }
      .hm-heathead { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
      .hm-nav { display: flex; align-items: center; gap: 6px; }
      .hm-navbtn { padding: 4px 10px; }
      .hm-today { font-size: 12px; }
      .hm-date { width: 150px; padding: 4px 8px; }
      .hm-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; margin-top: 12px; }
      .hm-loading { opacity: 0.55; }
      .hm-month h3 { margin: 0 0 6px; font-size: 13px; font-weight: 700; }
      .hm-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
      .hm-dow { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--oa-text-dim); text-align: center; }
      .hm-cell { min-height: 38px; border: 1px solid var(--oa-border); border-radius: 5px; padding: 2px 4px; display: flex; flex-direction: column; justify-content: space-between; font-variant-numeric: tabular-nums; }
      .hm-cell.hm-blank { border-color: transparent; background: none; }
      .hm-cell.none { border-color: #9a3b2e; }
      .hm-cell.unknown { background: repeating-linear-gradient(45deg, var(--oa-surface-2), var(--oa-surface-2) 3px, var(--oa-border) 3px, var(--oa-border) 4px); }
      .hm-cell.past { opacity: 0.4; }
      /* the cells are BUTTONS now (two clicks make a stay) — put the browser's
         button styling back to the card look it had as a div */
      button.hm-cell { font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; appearance: none; }
      button.hm-cell:disabled { cursor: default; }
      button.hm-cell:not(:disabled):hover { border-color: var(--oa-accent); }
      .hm-cell.picked { outline: 2px solid var(--oa-accent); outline-offset: -2px; }
      .hm-cell.first { outline-width: 3px; }
      .hm-pick { margin: 6px 0 0; font-size: 12.5px; color: var(--oa-accent); }
      .hm-modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 60; }
      .hm-modalbox { position: relative; background: var(--oa-card-bg); border: 1px solid var(--oa-card-border); border-radius: var(--oa-card-radius); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35); padding: 20px 22px; max-width: 420px; width: 100%; }
      .hm-modalbox h3 { margin: 0 0 8px; font-size: 17px; }
      .hm-stayline { margin: 0 0 2px; font-size: 15px; }
      .hm-x { position: absolute; top: 8px; right: 10px; background: none; border: 0; color: var(--oa-text-dim); font-size: 15px; cursor: pointer; line-height: 1; padding: 4px; }
      .hm-stayacts { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
      .hm-day { font-size: 11px; }
      .hm-free { font-size: 10.5px; color: var(--oa-text-dim); text-align: right; }
      .hm-cell.none .hm-free { color: #9a3b2e; font-weight: 700; }
      .hm-key { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
      .hm-keyitem { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--oa-text-dim); }
      .hm-keyitem i { width: 14px; height: 14px; border: 1px solid var(--oa-border); border-radius: 4px; display: inline-block; }
    `,
  ],
})
export class HomeComponent implements OnInit {
  readonly auth = inject(PortalAuthService);
  private readonly api = inject(PortalApiService);
  readonly summary = signal<Summary | null>(null);
  readonly error = signal('');
  // ---- the availability heat map (Dave, 2026-09-06) ----
  readonly DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly thisMonth = iso(new Date()).slice(0, 7);
  /** The FIRST of the two months shown. Forward, back and the picker all move it. */
  readonly heatMonth = signal(iso(new Date()).slice(0, 7));
  readonly heat = signal<Heatmap | null>(null);
  readonly heatLoading = signal(false);
  readonly heatError = signal('');
  readonly catalog = signal<Catalog | null>(null);
  private heatSeq = 0;
  /** TWO CLICKS MAKE A STAY (Dave, 2026-09-06). THE CLICKED DAYS ARE THE
   *  DATES THEMSELVES: the earlier one is check-IN, the later one is
   *  check-OUT, whichever order they are clicked in — the same convention as
   *  the suite calendar on both New booking pages. The cells outlined are the
   *  NIGHTS, check-in up to the day before check-out, because those are the
   *  nights that would be paid for. The same day twice cannot be a stay, so it
   *  is ignored and the map keeps waiting for a check-out day. */
  readonly pickFrom = signal('');
  readonly pickTo = signal('');
  readonly pickHover = signal('');
  /** How many units the lodge HAS — Lodge Ops' figure, from the catalogue, so
   *  the shade is a real proportion rather than a guess from the busiest day. */
  readonly totalUnits = computed(() => (this.catalog()?.suites ?? []).reduce((n, x) => n + (x.unitsTotal ?? x.roomCount ?? 0), 0));

  /** The stay the two clicks describe, once both are in. */
  readonly stay = computed(() => {
    const a = this.pickFrom();
    const b = this.pickTo();
    if (!a || !b || a === b) return null;
    const first = a < b ? a : b;
    const to = a < b ? b : a;
    const nights = Math.round((Date.parse(to) - Date.parse(first)) / 86400e3);
    const days = this.heat()?.days ?? {};
    let least: number | null = null;
    for (let d = new Date(`${first}T00:00:00Z`); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 1)) {
      const free = days[d.toISOString().slice(0, 10)]?.free ?? null;
      if (free == null) { least = null; break; }
      least = least == null ? free : Math.min(least, free);
    }
    return { from: first, to, nights, freeText: least == null ? '' : ` · ${least} unit${least === 1 ? '' : 's'} free on the tightest night` };
  });

  ngOnInit(): void {
    this.api.summary().subscribe({ next: (s) => this.summary.set(s), error: (e) => this.error.set(e?.error?.message ?? 'The portal could not load your summary.') });
    this.api.me().subscribe({ next: (m) => this.auth.update({ user: { ...m.user, stoId: m.company.id }, company: m.company }), error: () => undefined });
    this.api.catalog().subscribe({ next: (c) => this.catalog.set(c), error: () => this.catalog.set(null) });
    this.loadHeat();
  }

  /** Is this day inside the stay, or inside the range being hovered out? */
  inPick(date: string): boolean {
    const a = this.pickFrom();
    if (!a) return false;
    const b = this.pickTo() || this.pickHover();
    if (!b || b === a) return date === a;
    // b would be CHECK-OUT, so the nights marked stop the day before it.
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return date >= lo && date < hi;
  }

  /** The line under the grid that says what a click will do next. */
  pickHint(): string {
    if (this.stay()) return 'Those are the dates — the box asks what to do with them.';
    if (this.pickFrom()) return 'Now click the CHECK-OUT day — the day the guest leaves.';
    return 'Click the check-in day and then the check-out day, and you can book those dates straight from here.';
  }

  pickDay(date: string): void {
    if (this.stay()) { this.pickFrom.set(date); this.pickTo.set(''); return; }
    if (!this.pickFrom()) { this.pickFrom.set(date); this.pickTo.set(''); return; }
    if (this.pickFrom() === date) return;
    this.pickTo.set(date);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pickFrom() || this.pickTo()) this.clearPick();
  }

  clearPick(): void {
    this.pickFrom.set('');
    this.pickTo.set('');
    this.pickHover.set('');
  }

  setHeatMonth(m: string): void {
    if (!/^\d{4}-\d{2}$/.test(String(m ?? ''))) return;
    this.heatMonth.set(m);
    this.loadHeat();
  }
  shiftHeat(by: number): void {
    this.heatMonth.set(addMonths(this.heatMonth(), by));
    this.loadHeat();
  }
  private loadHeat(): void {
    const m = this.heatMonth();
    const seq = ++this.heatSeq;
    this.heatLoading.set(true);
    this.heatError.set('');
    this.api.heatmap(`${m}-01`, `${addMonths(m, 2)}-01`).subscribe({
      next: (h) => { if (seq !== this.heatSeq) return; this.heat.set(h); this.heatLoading.set(false); },
      error: (e) => { if (seq !== this.heatSeq) return; this.heatLoading.set(false); this.heatError.set(e?.error?.message ?? 'The availability could not be loaded.'); },
    });
  }

  /** The two months as cells. A cell's shade runs from the lodge's busiest
   *  (nothing free) to its emptiest (every unit free). */
  heatMonths(): { key: string; label: string; cells: (HeatCell | null)[] }[] {
    const m0 = this.heatMonth();
    const data = this.heat();
    const today = iso(new Date());
    const total = this.totalUnits();
    return [m0, addMonths(m0, 1)].map((m) => {
      const first = new Date(`${m}-01T00:00:00Z`);
      const lead = (first.getUTCDay() + 6) % 7;
      const cells: (HeatCell | null)[] = Array.from({ length: lead }, () => null);
      const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let n = 1; n <= days; n++) {
        const date = `${m}-${String(n).padStart(2, '0')}`;
        const free = data?.days?.[date]?.free ?? null;
        cells.push({
          date,
          num: n,
          free,
          past: date < today,
          shade: shadeFor(free, total),
          freeText: free == null ? '?' : String(free),
          title: free == null ? `${date}: availability not known` : `${date}: ${free} of ${total || '?'} unit(s) free`,
        });
      }
      while (cells.length % 7) cells.push(null);
      return { key: m, label: monthLabel(m), cells };
    });
  }

  /** The scale under the grid, in the lodge's own units. */
  legend(): { label: string; shade: string }[] {
    const total = this.totalUnits();
    if (!total) return [{ label: 'none', shade: shadeFor(0, 0) }, { label: 'some', shade: shadeFor(1, 2) }];
    const stops = [0, Math.round(total / 2), total];
    return [...new Set(stops)].map((n) => ({ label: n === 0 ? 'none' : String(n), shade: shadeFor(n, total) }));
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  suites(s: { name: string; units: number }[]): string { return s.map((x) => `${x.name}${x.units > 1 ? ' × ' + x.units : ''}`).join(', '); }
  guest(g: { firstName: string; lastName: string } | null): string { return g ? `${g.firstName} ${g.lastName}`.trim() || '—' : '—'; }
}
