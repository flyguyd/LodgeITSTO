import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalApiService, STATUS_LABELS, Summary, money } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

@Component({
  selector: 'sto-home',
  standalone: true,
  imports: [DatePipe, RouterLink],
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
          <div class="hm-stat"><span>Searches</span><strong>{{ s.searches }}</strong><small>{{ s.logins }} sign-ins</small></div>
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
    `,
  ],
})
export class HomeComponent implements OnInit {
  readonly auth = inject(PortalAuthService);
  private readonly api = inject(PortalApiService);
  readonly summary = signal<Summary | null>(null);
  readonly error = signal('');
  ngOnInit(): void {
    this.api.summary().subscribe({ next: (s) => this.summary.set(s), error: (e) => this.error.set(e?.error?.message ?? 'The portal could not load your summary.') });
    this.api.me().subscribe({ next: (m) => this.auth.update({ user: { ...m.user, stoId: m.company.id }, company: m.company }), error: () => undefined });
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  suites(s: { name: string; units: number }[]): string { return s.map((x) => `${x.name}${x.units > 1 ? ' × ' + x.units : ''}`).join(', '); }
  guest(g: { firstName: string; lastName: string } | null): string { return g ? `${g.firstName} ${g.lastName}`.trim() || '—' : '—'; }
}
