import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalApiService } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

@Component({
  selector: 'sto-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="lg-wrap">
      <form class="lg-card" (submit)="submit($event)">
        <div class="lg-brand"><span class="lg-mark">7</span><div><b>7 Star Lodges</b><small>STO portal</small></div></div>
        <h1>Sign in</h1>
        <p class="lg-dim">Your operator's account on the lodge's booking portal. Ask the lodge if you need one.</p>
        <label class="lg-field"><span>E-mail</span><input class="oa-input" type="email" name="email" autocomplete="username" required [ngModel]="email()" (ngModelChange)="email.set($event)" /></label>
        <label class="lg-field"><span>Password</span><input class="oa-input" type="password" name="password" autocomplete="current-password" required [ngModel]="password()" (ngModelChange)="password.set($event)" /></label>
        @if (error()) { <p class="lg-err" role="alert">{{ error() }}</p> }
        <button type="submit" class="oa-btn oa-btn-primary lg-btn" [disabled]="busy() || !email().trim() || !password()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </section>
  `,
  styles: [
    `
      .lg-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .lg-card { width: min(420px, 100%); background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-card-radius); box-shadow: var(--oa-shadow); padding: 28px 28px 24px; display: flex; flex-direction: column; gap: 12px; }
      .lg-brand { display: flex; align-items: center; gap: 10px; }
      .lg-brand small { display: block; color: var(--oa-text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .lg-mark { width: 38px; height: 38px; border-radius: 50%; background: var(--oa-accent); color: #f3ede1; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: Georgia, serif; }
      h1 { margin: 8px 0 0; font-size: 22px; }
      .lg-dim { margin: 0; color: var(--oa-text-dim); font-size: 13.5px; }
      .lg-field { display: flex; flex-direction: column; gap: 4px; }
      .lg-field span { font-size: 12.5px; color: var(--oa-text-dim); font-weight: 600; }
      .lg-field .oa-input { width: 100%; box-sizing: border-box; }
      .lg-err { margin: 0; color: var(--oa-danger); font-size: 13.5px; }
      .lg-btn { margin-top: 6px; }
    `,
  ],
})
export class LoginComponent {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  readonly email = signal('');
  readonly password = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  submit(ev: Event): void {
    ev.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.login(this.email().trim(), this.password()).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (!r.ok) { this.error.set(r.message); return; }
        this.auth.set({ token: r.token, user: r.user, company: r.company, expiresAt: r.expiresAt });
        void this.router.navigate(['/']);
      },
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'Sign-in failed — please try again.'); },
    });
  }
}
