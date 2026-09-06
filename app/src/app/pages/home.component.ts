import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
          @if (heatError(); as he) { <p class="hm-err">{{ he }}</p> }
          <div class="hm-months" [class.hm-loading]="heatLoading()">
            @for (m of heatMonths(); track m.key) {
              <div class="hm-month">
                <h3>{{ m.label }}</h3>
                <div class="hm-grid">
                  @for (d of DOW; track d) { <span class="hm-dow">{{ d }}</span> }
                  @for (c of m.cells; track $index) {
                    @if (c) {
                      <div class="hm-cell" [class.none]="c.free === 0" [class.unknown]="c.free === null" [class.past]="c.past" [style.background]="c.shade" [attr.data-date]="c.date" [attr.data-free]="c.free" [title]="c.title">
                        <span class="hm-day">{{ c.num }}</span>
                        <span class="hm-free">{{ c.freeText }}</span>
                      </div>
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
  /** How many units the lodge HAS — Lodge Ops' figure, from the catalogue, so
   *  the shade is a real proportion rather than a guess from the busiest day. */
  readonly totalUnits = computed(() => (this.catalog()?.suites ?? []).reduce((n, x) => n + (x.unitsTotal ?? x.roomCount ?? 0), 0));

  ngOnInit(): void {
    this.api.summary().subscribe({ next: (s) => this.summary.set(s), error: (e) => this.error.set(e?.error?.message ?? 'The portal could not load your summary.') });
    this.api.me().subscribe({ next: (m) => this.auth.update({ user: { ...m.user, stoId: m.company.id }, company: m.company }), error: () => undefined });
    this.api.catalog().subscribe({ next: (c) => this.catalog.set(c), error: () => this.catalog.set(null) });
    this.loadHeat();
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
