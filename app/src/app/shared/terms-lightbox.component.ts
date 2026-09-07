import { Component, inject, signal } from '@angular/core';
import { PortalApiService, PortalTerms } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

/**
 * THE STO TERMS, AT SIGN-IN (Dave, 2026-09-07: "When an STO user logs in the
 * for the first time, open a light box and show the T&C's and below add this
 * ☐ I have read and agree to the STO Terms & Conditions").
 *
 * It has no ✕ and no backdrop click, and Escape does not close it. That is
 * deliberate: this is not a message to dismiss, it is the thing that has to
 * happen before this person can book. Sign out is the only way past it —
 * refusing is a real answer and must be possible without a dead end.
 *
 * The words are Lodge Ops' own published version, rendered through Angular's
 * sanitiser: an admin's headings, lists, tables and links survive, and any
 * script in the field does not.
 *
 * NOTHING HERE IS THE CONTROL. A browser that never showed this box can still
 * post a booking, so Lodge Ops refuses holds and bookings on the server until
 * the acceptance is on file; the box is how a person is ASKED.
 */
@Component({
  selector: 'sto-terms-lightbox',
  standalone: true,
  template: `
    @if (terms(); as t) {
      <div class="tl-backdrop" data-terms-box role="dialog" aria-modal="true" aria-labelledby="tl-title">
        <div class="tl-box">
          <header class="tl-head">
            <div>
              <h2 id="tl-title">STO Terms &amp; Conditions</h2>
              <p class="tl-dim">
                @if (t.acceptedVersion) {
                  These terms have been revised since you accepted version {{ t.acceptedVersion }}. Please read and accept version {{ t.version }} to carry on booking.
                } @else {
                  Please read these before you make your first booking. Version {{ t.version }}.
                }
              </p>
            </div>
          </header>

          <div class="tl-body" data-terms-body tabindex="0" [innerHTML]="t.bodyHtml"></div>

          <label class="tl-agree">
            <input type="checkbox" name="agree" [checked]="agreed()" (change)="agreed.set($any($event.target).checked)" [disabled]="busy()" />
            <span>I have read and agree to the STO Terms &amp; Conditions</span>
          </label>

          @if (error()) { <p class="tl-err" role="alert">{{ error() }}</p> }

          <div class="tl-actions">
            <button type="button" class="oa-btn" name="signOut" [disabled]="busy()" (click)="signOut()">Sign out</button>
            <span class="tl-spacer"></span>
            <button type="button" class="oa-btn oa-btn-primary" name="acceptTerms" [disabled]="!agreed() || busy()" (click)="accept()">{{ busy() ? 'Recording…' : 'Accept and continue' }}</button>
          </div>
          <p class="tl-fine">
            Accepting records your company, your name, the date and time, your IP address and a fingerprint of these exact words.
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .tl-backdrop { position: fixed; inset: 0; background: rgba(20, 16, 10, 0.66); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
      .tl-box { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius, 12px); width: min(760px, 100%); max-height: 92vh; display: flex; flex-direction: column; padding: 18px 20px 16px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4); }
      .tl-head h2 { margin: 0; font-size: 19px; }
      .tl-dim { margin: 4px 0 0; color: var(--oa-text-dim); font-size: 13px; line-height: 1.5; }
      .tl-body { flex: 1 1 auto; overflow: auto; margin: 12px 0; padding: 12px 14px; border: 1px solid var(--oa-border); border-radius: 8px; background: var(--oa-surface-2); font-size: 13.5px; line-height: 1.6; }
      .tl-body :first-child { margin-top: 0; }
      .tl-body :last-child { margin-bottom: 0; }
      .tl-body table { border-collapse: collapse; }
      .tl-body td, .tl-body th { border: 1px solid var(--oa-border); padding: 4px 8px; }
      .tl-agree { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--oa-border); border-radius: 8px; cursor: pointer; font-size: 14px; }
      .tl-agree input { margin-top: 2px; accent-color: var(--oa-accent); }
      .tl-err { margin: 8px 0 0; color: var(--oa-danger); font-size: 13.5px; }
      .tl-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
      .tl-spacer { flex: 1; }
      .tl-fine { margin: 10px 0 0; font-size: 11.5px; color: var(--oa-text-dim); }
    `,
  ],
})
export class TermsLightboxComponent {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(PortalAuthService);

  /** Non-null only while an acceptance is actually owed. */
  readonly terms = signal<PortalTerms | null>(null);
  readonly agreed = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    this.refresh();
  }

  /** Ask Lodge Ops where this person stands. Safe to call again — the box
   *  shows only while `required` is true. */
  refresh(): void {
    if (!this.auth.session()) return;
    this.api.me().subscribe({
      next: (r) => this.terms.set(r?.terms?.required ? r.terms : null),
      error: () => this.terms.set(null),
    });
  }

  accept(): void {
    if (this.busy() || !this.agreed()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.acceptTerms().subscribe({
      next: (t) => {
        this.busy.set(false);
        // Believe the server, not the button: it comes back saying whether
        // anything is still owed.
        this.terms.set(t?.required ? t : null);
        this.agreed.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.message ?? 'That could not be recorded — please try again.');
      },
    });
  }

  /** Refusing is a real answer: it must not be a dead end. */
  signOut(): void {
    this.auth.clear();
    window.location.assign('/login');
  }
}
