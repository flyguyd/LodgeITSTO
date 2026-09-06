import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PortalApiService } from './core/portal-api.service';
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
        <!-- THE AVATAR IS THE OPERATOR'S OWN (Dave, 2026-09-06): clicking it
             sets their logo, which then rides the guest booking sheet too. It
             is a SIBLING of the brand link, never nested inside it — a button
             inside a link swallows the link. -->
        <div class="pb-brand">
          <button type="button" class="pb-mark" name="logoPick" [title]="logoBusy() ? 'Sending…' : (company()?.logo ? 'Change your logo' : 'Add your logo')" [disabled]="logoBusy()" (click)="pickLogo()">
            @if (company()?.logo) { <img [src]="company()!.logo!" [alt]="company()!.name" /> } @else { <span>7</span> }
            <span class="pb-mark-hint" aria-hidden="true">✎</span>
          </button>
          <a class="pb-brand-text" routerLink="/"><b>7 Star Lodges</b><small>STO portal</small></a>
          <input class="pb-file" type="file" name="logoFile" accept="image/png,image/jpeg,image/webp" (change)="logoChosen($event)" />
        </div>
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
          @if (company()?.logo) { <button type="button" class="oa-btn pb-btn" name="logoClear" (click)="clearLogo()" [disabled]="logoBusy()" title="Remove your logo">Remove logo</button> }
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
      .pb-brand { position: relative; }
      .pb-mark { position: relative; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; background: var(--oa-accent); color: #f3ede1; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: Georgia, serif; font-size: 15px; cursor: pointer; overflow: hidden; flex: 0 0 auto; }
      .pb-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .pb-mark:disabled { opacity: 0.6; cursor: default; }
      .pb-mark-hint { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); font-size: 13px; }
      .pb-mark:hover .pb-mark-hint, .pb-mark:focus-visible .pb-mark-hint { display: flex; }
      .pb-file { display: none; }
      .pb-err { color: #d9534f; font-size: 12px; }
      .pb-brand-text { display: flex; flex-direction: column; line-height: 1.1; text-decoration: none; color: inherit; }
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
  private readonly api = inject(PortalApiService);
  private readonly router = inject(Router);
  /** The picture is shrunk HERE, in the browser, before it is ever sent: a
   *  phone photo is 4 MB and a command-bar avatar is 128 px. Lodge Ops checks
   *  the type and the size again on arrival — this is convenience, not the
   *  guard. */
  private static readonly LOGO_PX = 256;
  readonly logoBusy = signal(false);
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

  company() { return this.auth.company(); }

  /** Clicking the avatar opens the file picker beside it. */
  pickLogo(): void {
    const input = document.querySelector<HTMLInputElement>('input[name="logoFile"]');
    if (input) { input.value = ''; input.click(); }
  }

  logoChosen(ev: Event): void {
    const file = (ev.target as HTMLInputElement | null)?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { window.alert('Please choose a PNG, JPEG or WEBP image.'); return; }
    this.logoBusy.set(true);
    this.shrink(file)
      .then((dataUrl) => this.send(dataUrl))
      .catch(() => { this.logoBusy.set(false); window.alert('That image could not be read.'); });
  }

  clearLogo(): void {
    this.logoBusy.set(true);
    this.send('');
  }

  private send(dataUrl: string): void {
    this.api.setLogo(dataUrl).subscribe({
      next: (r) => {
        this.logoBusy.set(false);
        const c = this.auth.company();
        if (c) this.auth.update({ company: { ...c, logo: r.logo } });
      },
      error: (e) => {
        this.logoBusy.set(false);
        window.alert(e?.error?.message ?? 'That logo could not be saved.');
      },
    });
  }

  /** Square, at most LOGO_PX a side, drawn on a transparent canvas and kept
   *  as PNG so a logo with a cut-out background stays cut out. */
  private shrink(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const side = Math.min(AppComponent.LOGO_PX, Math.max(img.width, img.height) || AppComponent.LOGO_PX);
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no canvas')); return; }
        // Fit the whole picture inside the square — a logo cropped to a circle
        // loses its wordmark, so letterbox rather than cover.
        const scale = Math.min(side / img.width, side / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        ctx.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
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
