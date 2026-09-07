import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalApiService } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

/**
 * Signing in to the portal.
 *
 * THE LODGE'S LOGO (Dave, 2026-09-07: "On the login page add the company
 * logo") comes from Lodge Ops' own branding, through the portal server — the
 * same picture the Lodge Ops sign-in screen shows, so the two cannot drift.
 * Nobody has a session here, so it is fetched with the portal's key alone;
 * until it arrives (or when no logo is set at all) the 7 Star mark stands in,
 * because a broken-image icon on a sign-in page reads as a broken site.
 *
 * "FORGOT MY PASSWORD" (Dave, same day) swaps the card for an address box.
 * THE ANSWER NEVER VARIES — the same sentence whether or not the address is
 * one of ours ("Don't tell the user if it does or does not"), so this page
 * cannot be used to find out who has an account. That is also why the wording
 * promises an e-mail *if* there is an account rather than claiming one was
 * sent.
 */
@Component({
  selector: 'sto-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="lg-wrap">
      @if (mode() === 'in') {
        <form class="lg-card" (submit)="submit($event)">
          <div class="lg-brand">
            @if (logoOk()) {
              <img class="lg-logo" [src]="logoSrc" alt="7 Star Lodges" (error)="logoOk.set(false)" />
            } @else {
              <span class="lg-mark">7</span>
            }
            <div><b>7 Star Lodges</b><small>STO portal</small></div>
          </div>
          <h1>Sign in</h1>
          <p class="lg-dim">Your operator's account on the lodge's booking portal. Ask the lodge if you need one.</p>
          <label class="lg-field"><span>E-mail</span><input class="oa-input" type="email" name="email" autocomplete="username" required [ngModel]="email()" (ngModelChange)="email.set($event)" /></label>
          <label class="lg-field"><span>Password</span><input class="oa-input" type="password" name="password" autocomplete="current-password" required [ngModel]="password()" (ngModelChange)="password.set($event)" /></label>
          @if (error()) { <p class="lg-err" role="alert">{{ error() }}</p> }
          <button type="submit" class="oa-btn oa-btn-primary lg-btn" [disabled]="busy() || !email().trim() || !password()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
          <button type="button" class="lg-link" name="forgot" (click)="toForgot()">Forgot my password</button>
        </form>
      } @else {
        <form class="lg-card" data-forgot (submit)="sendReset($event)">
          <div class="lg-brand">
            @if (logoOk()) {
              <img class="lg-logo" [src]="logoSrc" alt="7 Star Lodges" (error)="logoOk.set(false)" />
            } @else {
              <span class="lg-mark">7</span>
            }
            <div><b>7 Star Lodges</b><small>STO portal</small></div>
          </div>
          <h1>Forgot my password</h1>
          @if (sent(); as said) {
            <p class="lg-dim" data-sent>{{ said }}</p>
            <button type="button" class="oa-btn oa-btn-primary lg-btn" name="backToSignIn" (click)="toSignIn()">Back to sign in</button>
          } @else {
            <p class="lg-dim">Type the address you sign in with. If it has a portal account, a link to choose a new password is on its way.</p>
            <label class="lg-field"><span>E-mail</span><input class="oa-input" type="email" name="forgotEmail" autocomplete="username" required [ngModel]="email()" (ngModelChange)="email.set($event)" /></label>
            <button type="submit" class="oa-btn oa-btn-primary lg-btn" name="sendReset" [disabled]="busy() || !email().trim()">{{ busy() ? 'Sending…' : 'Send me a link' }}</button>
            <button type="button" class="lg-link" name="backToSignIn" (click)="toSignIn()">Back to sign in</button>
          }
        </form>
      }
    </section>
  `,
  styles: [
    `
      .lg-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .lg-card { width: min(420px, 100%); background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-card-radius); box-shadow: var(--oa-shadow); padding: 28px 28px 24px; display: flex; flex-direction: column; gap: 12px; }
      .lg-brand { display: flex; align-items: center; gap: 10px; }
      .lg-brand small { display: block; color: var(--oa-text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .lg-mark { width: 38px; height: 38px; border-radius: 50%; background: var(--oa-accent); color: #f3ede1; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: Georgia, serif; }
      .lg-logo { width: 44px; height: 44px; object-fit: contain; display: block; }
      h1 { margin: 8px 0 0; font-size: 22px; }
      .lg-dim { margin: 0; color: var(--oa-text-dim); font-size: 13.5px; }
      .lg-field { display: flex; flex-direction: column; gap: 4px; }
      .lg-field span { font-size: 12.5px; color: var(--oa-text-dim); font-weight: 600; }
      .lg-field .oa-input { width: 100%; box-sizing: border-box; }
      .lg-err { margin: 0; color: var(--oa-danger); font-size: 13.5px; }
      .lg-btn { margin-top: 6px; }
      .lg-link { align-self: center; margin-top: 2px; border: 0; background: none; padding: 4px; font: inherit; font-size: 13px; color: #8a6d2f; font-weight: 600; cursor: pointer; text-decoration: underline; }
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
  readonly mode = signal<'in' | 'forgot'>('in');
  readonly sent = signal('');
  readonly logoOk = signal(true);
  readonly logoSrc = '/api/branding/logo';

  toForgot(): void { this.mode.set('forgot'); this.error.set(''); this.sent.set(''); this.password.set(''); }
  toSignIn(): void { this.mode.set('in'); this.error.set(''); this.sent.set(''); }

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

  sendReset(ev: Event): void {
    ev.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const said = 'If that address has a portal account, a link to choose a new password is on its way. It expires in two hours.';
    this.api.forgotPassword(this.email().trim()).subscribe({
      // The same words either way, INCLUDING when the request itself fails:
      // an error shown here would say "that address is not one of ours" by
      // implication, which is the one thing this must never do.
      next: (r) => { this.busy.set(false); this.sent.set(r?.message || said); },
      error: () => { this.busy.set(false); this.sent.set(said); },
    });
  }
}
