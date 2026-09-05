import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PortalAuthService } from './core/portal-auth.service';

/**
 * The STO portal shell (Dave, 2026-09-05): a PINNED COMMAND BAR along the
 * top with the standard things — the lodge, the operator, the places
 * (Home, New booking, Holds, Bookings), a search box that opens Bookings
 * filtered, the clock, the signed-in user and Sign out — and the page below.
 * The login page has no bar.
 */
@Component({
  selector: 'sto-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (auth.signedIn() && !onLogin()) {
      <header class="pb">
        <a class="pb-brand" routerLink="/">
          <span class="pb-mark">7</span>
          <span class="pb-brand-text"><b>7 Star Lodges</b><small>STO portal</small></span>
        </a>
        <nav class="pb-nav">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/new" routerLinkActive="on">New booking</a>
          <a routerLink="/holds" routerLinkActive="on">Holds</a>
          <a routerLink="/bookings" routerLinkActive="on">Bookings</a>
        </nav>
        <form class="pb-search" (submit)="search($event)">
          <input class="oa-input" type="search" name="q" placeholder="Find a reference or guest…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </form>
        <div class="pb-right">
          <span class="pb-clock" [title]="'Your local time'">{{ clock() }}</span>
          <span class="pb-who"><b>{{ auth.company()?.name }}</b><small>{{ auth.user()?.name }} · {{ auth.company()?.discountPct }}% off</small></span>
          <a class="oa-btn pb-btn" routerLink="/account" title="Your account">Account</a>
          <button type="button" class="oa-btn pb-btn" (click)="signOut()">Sign out</button>
        </div>
      </header>
    }
    <main class="sto-main" [class.no-bar]="!auth.signedIn() || onLogin()">
      <router-outlet />
    </main>
  `,
  styles: [
    `
      .pb { position: fixed; top: 0; left: 0; right: 0; height: var(--sto-bar-h); z-index: 1000; display: flex; align-items: center; gap: 18px; padding: 0 18px; background: var(--oa-rail-bg); border-bottom: 1px solid var(--oa-rail-border); box-shadow: 0 4px 18px rgba(78, 64, 36, 0.12); }
      .pb-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
      .pb-mark { width: 34px; height: 34px; border-radius: 50%; background: var(--oa-accent); color: #f3ede1; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: Georgia, serif; }
      .pb-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
      .pb-brand-text small { color: var(--oa-text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .pb-nav { display: flex; gap: 4px; }
      .pb-nav a { padding: 8px 12px; border-radius: 8px; text-decoration: none; color: var(--oa-text); font-weight: 600; font-size: 14px; }
      .pb-nav a.on { background: rgba(83, 102, 58, 0.14); color: var(--oa-accent-strong); }
      .pb-search { flex: 1 1 200px; max-width: 360px; }
      .pb-search .oa-input { width: 100%; }
      .pb-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
      .pb-clock { font-variant-numeric: tabular-nums; color: var(--oa-text-dim); font-size: 13px; }
      .pb-who { display: flex; flex-direction: column; line-height: 1.15; text-align: right; }
      .pb-who small { color: var(--oa-text-dim); font-size: 11.5px; }
      .pb-btn { padding: 6px 10px; font-size: 13px; text-decoration: none; }
      .no-bar { padding-top: 0; }
      @media (max-width: 900px) { .pb-search, .pb-clock { display: none; } .pb { gap: 10px; } }
    `,
  ],
})
export class AppComponent {
  readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  readonly q = signal('');
  readonly url = signal(this.router.url);
  readonly onLogin = computed(() => this.url().startsWith('/login'));
  readonly clock = signal('');

  constructor() {
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.url.set(e.urlAfterRedirects); });
    const tick = () => this.clock.set(new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
    tick();
    setInterval(tick, 15_000);
  }

  search(ev: Event): void {
    ev.preventDefault();
    void this.router.navigate(['/bookings'], { queryParams: { q: this.q().trim() || null } });
  }
  signOut(): void {
    this.auth.clear();
    void this.router.navigate(['/login']);
  }
}
