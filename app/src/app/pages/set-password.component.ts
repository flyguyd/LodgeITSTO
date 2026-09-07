import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalApiService, ResetCheck } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

/** THE PASSWORD RULE (Dave, 2026-09-07: "8 chars min, mix of upper and lower
 *  case and numbers"). Lodge Ops enforces the same rule server-side — this is
 *  only so a person sees what is wanted while they type, never the thing that
 *  decides. */
const RULES: { key: string; label: string; ok: (p: string) => boolean }[] = [
  { key: 'len', label: 'At least 8 characters', ok: (p) => p.length >= 8 },
  { key: 'lower', label: 'A lower-case letter', ok: (p) => /[a-z]/.test(p) },
  { key: 'upper', label: 'An upper-case letter', ok: (p) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'A number', ok: (p) => /[0-9]/.test(p) },
];

/**
 * WHERE AN INVITATION OR A RESET LINK LANDS (Dave, 2026-09-07: "a secret key
 * that lands the user on a page where they can set their password and login
 * once sent").
 *
 * The key rides in the address as `?key=`. The page asks Lodge Ops whose key
 * it is before showing anything, so a dead link says so plainly instead of
 * taking a password nobody can use. Choosing one signs the person straight in
 * — the point of the link is that they arrive working, not that they are
 * handed back to a form to retype what they have just chosen.
 */
@Component({
  selector: 'sto-set-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="sp-wrap">
      <form class="sp-card" data-set-password (submit)="submit($event)">
        <div class="sp-brand">
          @if (logoOk()) {
            <img class="sp-logo" [src]="logoSrc" alt="7 Star Lodges" (error)="logoOk.set(false)" />
          } @else {
            <span class="sp-mark">7</span>
          }
          <div><b>7 Star Lodges</b><small>STO portal</small></div>
        </div>

        @if (checking()) {
          <p class="sp-dim">Checking your link…</p>
        } @else if (who(); as w) {
          <h1>{{ w.kind === 'reset' ? 'Choose a new password' : 'Welcome — choose your password' }}</h1>
          <p class="sp-dim" data-who>
            {{ w.kind === 'reset' ? 'For' : 'For' }} <b>{{ w.name }}</b> ({{ w.email }})@if (w.company) { of <b>{{ w.company }}</b>}.
            @if (w.kind === 'invite') { Once it is set you will be signed in. }
          </p>
          <label class="sp-field"><span>New password</span><input class="oa-input" type="password" name="password" autocomplete="new-password" [ngModel]="password()" (ngModelChange)="password.set($event)" /></label>
          <ul class="sp-rules" data-rules>
            @for (r of RULES; track r.key) {
              <li [class.on]="r.ok(password())" [attr.data-rule]="r.key">
                <span aria-hidden="true">{{ r.ok(password()) ? '✓' : '·' }}</span> {{ r.label }}
              </li>
            }
          </ul>
          <label class="sp-field"><span>Type it again</span><input class="oa-input" type="password" name="confirm" autocomplete="new-password" [ngModel]="confirm()" (ngModelChange)="confirm.set($event)" /></label>
          @if (confirm() && confirm() !== password()) { <p class="sp-err" data-mismatch>The two passwords do not match.</p> }
          @if (error()) { <p class="sp-err" role="alert">{{ error() }}</p> }
          <button type="submit" class="oa-btn oa-btn-primary sp-btn" name="save" [disabled]="busy() || !ready()">{{ busy() ? 'Setting…' : 'Set my password and sign in' }}</button>
        } @else {
          <h1>That link is no longer valid</h1>
          <p class="sp-dim" data-dead>{{ deadMessage() }}</p>
          <button type="button" class="oa-btn oa-btn-primary sp-btn" name="toSignIn" (click)="toSignIn()">Go to sign in</button>
        }
      </form>
    </section>
  `,
  styles: [
    `
      .sp-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .sp-card { width: min(440px, 100%); background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-card-radius); box-shadow: var(--oa-shadow); padding: 28px 28px 24px; display: flex; flex-direction: column; gap: 12px; }
      .sp-brand { display: flex; align-items: center; gap: 10px; }
      .sp-brand small { display: block; color: var(--oa-text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .sp-mark { width: 38px; height: 38px; border-radius: 50%; background: var(--oa-accent); color: #f3ede1; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: Georgia, serif; }
      .sp-logo { width: 44px; height: 44px; object-fit: contain; display: block; }
      h1 { margin: 8px 0 0; font-size: 21px; }
      .sp-dim { margin: 0; color: var(--oa-text-dim); font-size: 13.5px; line-height: 1.5; }
      .sp-field { display: flex; flex-direction: column; gap: 4px; }
      .sp-field span { font-size: 12.5px; color: var(--oa-text-dim); font-weight: 600; }
      .sp-field .oa-input { width: 100%; box-sizing: border-box; }
      .sp-rules { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 12.5px; color: var(--oa-text-dim); }
      .sp-rules li.on { color: #3f6e45; font-weight: 600; }
      .sp-err { margin: 0; color: var(--oa-danger); font-size: 13.5px; }
      .sp-btn { margin-top: 6px; }
    `,
  ],
})
export class SetPasswordComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly RULES = RULES;
  readonly key = signal('');
  readonly checking = signal(true);
  readonly who = signal<ResetCheck | null>(null);
  readonly deadMessage = signal('Ask the lodge for a new one, or use "Forgot my password" on the sign-in page.');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly logoOk = signal(true);
  readonly logoSrc = '/api/branding/logo';

  ngOnInit(): void {
    const key = String(this.route.snapshot.queryParamMap.get('key') ?? '');
    this.key.set(key);
    if (!key) { this.checking.set(false); return; }
    this.api.checkResetKey(key).subscribe({
      next: (r) => {
        this.checking.set(false);
        if (r?.ok) this.who.set(r);
        else if (r?.message) this.deadMessage.set(r.message);
      },
      error: () => { this.checking.set(false); },
    });
  }

  ready(): boolean {
    const p = this.password();
    return RULES.every((r) => r.ok(p)) && this.confirm() === p;
  }

  toSignIn(): void { void this.router.navigate(['/login']); }

  submit(ev: Event): void {
    ev.preventDefault();
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.setPasswordWithKey(this.key(), this.password()).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (!r.ok) { this.error.set(r.message); return; }
        this.auth.set({ token: r.token, user: r.user, company: r.company, expiresAt: r.expiresAt });
        void this.router.navigate(['/']);
      },
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'That password could not be set — please try again.'); },
    });
  }
}
