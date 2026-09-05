import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortalApiService } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

@Component({
  selector: 'sto-account',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="ac-page">
      <h1>Your account</h1>
      <p class="ac-dim">{{ auth.user()?.name }} · {{ auth.user()?.email }} · {{ auth.company()?.name }}</p>
      <h2>Change your password</h2>
      <label class="ac-field"><span>Current password</span><input class="oa-input" type="password" name="current" autocomplete="current-password" [ngModel]="current()" (ngModelChange)="current.set($event)" /></label>
      <label class="ac-field"><span>New password <small>(10+ characters)</small></span><input class="oa-input" type="password" name="next" autocomplete="new-password" [ngModel]="next()" (ngModelChange)="next.set($event)" /></label>
      @if (note()) { <p class="ac-dim">{{ note() }}</p> }
      <button type="button" class="oa-btn oa-btn-primary" [disabled]="busy() || next().length < 10 || !current()" (click)="save()">Change password</button>
      <p class="ac-dim">Changing it signs out every other session of yours.</p>
    </section>
  `,
  styles: [
    `
      .ac-page { width: min(560px, 94%); margin: 0 auto; padding: 24px 0 60px; display: flex; flex-direction: column; gap: 10px; }
      h1 { margin: 0; font-size: 22px; } h2 { margin: 12px 0 0; font-size: 15px; }
      .ac-dim { color: var(--oa-text-dim); font-size: 13.5px; margin: 0; }
      .ac-field { display: flex; flex-direction: column; gap: 4px; }
      .ac-field span { font-size: 12.5px; color: var(--oa-text-dim); font-weight: 600; }
      .ac-field span small { font-weight: 400; }
    `,
  ],
})
export class AccountComponent {
  readonly auth = inject(PortalAuthService);
  private readonly api = inject(PortalApiService);
  readonly current = signal('');
  readonly next = signal('');
  readonly busy = signal(false);
  readonly note = signal('');
  save(): void {
    this.busy.set(true);
    this.api.changePassword(this.current(), this.next()).subscribe({
      next: (r) => { this.busy.set(false); this.note.set(r.ok ? 'Password changed.' : (r.message ?? 'Not changed.')); if (r.ok) { this.current.set(''); this.next.set(''); } },
      error: (e) => { this.busy.set(false); this.note.set(e?.error?.message ?? 'Not changed.'); },
    });
  }
}
