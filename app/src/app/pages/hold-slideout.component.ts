import { Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Guest, Hold, PortalApiService, STATUS_LABELS, money } from '../core/portal-api.service';
import { SlideoutExit } from '../shared/slideout-exit';
import { DETAIL_STYLES } from './detail-styles';

@Component({
  selector: 'sto-hold-slideout',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="sd-backdrop oa-slideout-backdrop" [class.oa-closing]="oaExit.closing()" (click)="close()"></div>
    <aside class="sd-panel oa-slideout" [class.oa-closing]="oaExit.closing()" role="dialog" aria-modal="true" aria-label="Hold">
      <div class="sd-head">
        <div>
          <span class="sd-kicker">Hold</span>
          <h2>{{ h()?.reference || '…' }}</h2>
          @if (h(); as x) { <span class="sd-pill" [class.ok]="x.active" [class.bad]="x.status === 'cancelled' || x.status === 'expired'" [class.busy]="x.status === 'converted'">{{ x.active ? 'Held' : label(x.status) }}</span> }
        </div>
        <button type="button" class="sd-close" aria-label="Close" (click)="close()">×</button>
      </div>
      @if (error()) { <p class="sd-err">{{ error() }}</p> }
      @if (h(); as x) {
        @if (x.active) {
          <div class="sd-clock"><span class="sd-dim">Time left</span><strong>{{ timer() }}</strong><span class="sd-dim">runs out {{ x.holdUntil | date: 'EEE d MMM, HH:mm' }}</span></div>
        }
        <dl class="sd-meta">
          <dt>Stay</dt><dd>{{ x.from | date: 'EEE d MMM' }} → {{ x.to | date: 'EEE d MMM yyyy' }} · {{ x.nights }} night{{ x.nights === 1 ? '' : 's' }}</dd>
          <dt>Party</dt><dd>{{ x.adults }} adult{{ x.adults === 1 ? '' : 's' }}@if (x.children) { , {{ x.children }} child{{ x.children === 1 ? '' : 'ren' }} }@if (x.infants) { , {{ x.infants }} infant{{ x.infants === 1 ? '' : 's' }} } (each suite)</dd>
          <dt>Guest</dt><dd>{{ guest(x) }}</dd>
          @if (address(x); as a) { <dt>Address</dt><dd>{{ a }}</dd> }
          <dt>Taken</dt><dd>{{ x.createdAt | date: 'd MMM yyyy, HH:mm' }}@if (x.userName) { by {{ x.userName }} }</dd>
          @if (x.notes) { <dt>Notes</dt><dd>{{ x.notes }}</dd> }
          @if (x.status === 'cancelled') { <dt>Cancelled</dt><dd>{{ x.cancelledAt | date: 'd MMM, HH:mm' }} by {{ x.cancelledBy }}@if (x.cancelReason) { — {{ x.cancelReason }} }</dd> }
        </dl>
        <h3>Suites · {{ x.suites[0]?.planName || 'plan' }}</h3>
        @for (s of x.suites; track $index) {
          <div class="sd-suite"><span>{{ s.name }}@if (s.units > 1) { × {{ s.units }} }</span><span><span class="sd-strike">{{ money(s.rackTotal, x.currency) }}</span> {{ money(s.total, x.currency) }}</span></div>
        }
        <div class="sd-total"><span>Total at {{ x.discountPct }}% off</span><span>{{ money(x.total, x.currency) }}</span></div>
        @if (x.active) {
          <div class="sd-actions">
            <button type="button" class="oa-btn oa-btn-primary" (click)="convertOpen.set(!convertOpen())">Make the booking</button>
            <button type="button" class="oa-btn oa-btn-danger" [disabled]="busy()" (click)="cancel()">Cancel the hold</button>
          </div>
          @if (convertOpen()) {
            <div class="sd-form">
              <b>The guest</b>
              <div class="sd-row">
                <label class="sd-field"><span>First name</span><input class="oa-input" type="text" name="cFirst" [ngModel]="g().firstName" (ngModelChange)="setG('firstName', $event)" /></label>
                <label class="sd-field"><span>Last name</span><input class="oa-input" type="text" name="cLast" [ngModel]="g().lastName" (ngModelChange)="setG('lastName', $event)" /></label>
              </div>
              <div class="sd-row">
                <label class="sd-field"><span>E-mail</span><input class="oa-input" type="email" name="cEmail" [ngModel]="g().email" (ngModelChange)="setG('email', $event)" /></label>
                <label class="sd-field"><span>Phone</span><input class="oa-input" type="tel" name="cPhone" [ngModel]="g().phone" (ngModelChange)="setG('phone', $event)" /></label>
              </div>
              <div class="sd-row">
                <label class="sd-field"><span>Street</span><input class="oa-input" type="text" name="cStreet" [ngModel]="g().street" (ngModelChange)="setG('street', $event)" /></label>
                <label class="sd-field"><span>Apartment / unit</span><input class="oa-input" type="text" name="cApartment" [ngModel]="g().apartment" (ngModelChange)="setG('apartment', $event)" /></label>
              </div>
              <div class="sd-row">
                <label class="sd-field"><span>City</span><input class="oa-input" type="text" name="cCity" [ngModel]="g().city" (ngModelChange)="setG('city', $event)" /></label>
                <label class="sd-field"><span>Post code</span><input class="oa-input" type="text" name="cPostCode" [ngModel]="g().postCode" (ngModelChange)="setG('postCode', $event)" /></label>
              </div>
              <div class="sd-row">
                <label class="sd-field"><span>State / province</span><input class="oa-input" type="text" name="cState" [ngModel]="g().state" (ngModelChange)="setG('state', $event)" /></label>
                <label class="sd-field"><span>Country</span><input class="oa-input" type="text" name="cCountry" [ngModel]="g().country" (ngModelChange)="setG('country', $event)" /></label>
              </div>
              <p class="sd-dim">The booking is made at the held figures and lands provisional; the lodge confirms it.</p>
              <div class="sd-actions">
                <button type="button" class="oa-btn oa-btn-primary" [disabled]="busy() || !(g().firstName.trim() || g().lastName.trim())" (click)="convert()">{{ busy() ? 'Booking…' : 'Confirm — make the booking' }}</button>
              </div>
            </div>
          }
        }
        @if (x.status === 'converted' && x.bookingId) {
          <div class="sd-actions"><button type="button" class="oa-btn" (click)="openBooking(x.bookingId)">Open the booking</button></div>
        }
      } @else if (!error()) { <p class="sd-dim">Loading…</p> }
    </aside>
  `,
  styles: [DETAIL_STYLES],
})
export class HoldSlideoutComponent implements OnInit, OnDestroy {
  readonly id = input.required<string>();
  readonly closed = output<void>();
  readonly changed = output<void>();
  private readonly api = inject(PortalApiService);
  private readonly router = inject(Router);
  readonly oaExit = new SlideoutExit();
  readonly h = signal<Hold | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly timer = signal('');
  readonly convertOpen = signal(false);
  readonly g = signal({ firstName: '', lastName: '', email: '', phone: '', street: '', apartment: '', city: '', postCode: '', state: '', country: '' });
  private tick: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.load();
    this.tick = setInterval(() => this.updateTimer(), 1000);
  }
  ngOnDestroy(): void { if (this.tick) clearInterval(this.tick); }
  private load(): void {
    this.api.hold(this.id()).subscribe({
      next: (h) => {
        this.h.set(h);
        // Pre-fill the convert form from whatever the hold already carries,
        // address included, so an operator retypes nothing.
        const g = h.guest;
        this.g.set({
          firstName: g?.firstName ?? '', lastName: g?.lastName ?? '', email: g?.email ?? '', phone: g?.phone ?? '',
          street: g?.street ?? '', apartment: g?.apartment ?? '', city: g?.city ?? '', postCode: g?.postCode ?? '', state: g?.state ?? '', country: g?.country ?? '',
        });
        this.updateTimer();
      },
      error: (e) => this.error.set(e?.error?.message ?? 'The hold could not be loaded.'),
    });
  }
  private updateTimer(): void {
    const h = this.h();
    if (!h) return;
    const ms = Date.parse(h.holdUntil) - Date.now();
    if (ms <= 0) { this.timer.set('00:00'); return; }
    const hrs = Math.floor(ms / 3_600_000), min = Math.floor((ms % 3_600_000) / 60_000), sec = Math.floor((ms % 60_000) / 1000);
    this.timer.set(hrs > 0 ? `${hrs}h ${String(min).padStart(2, '0')}m` : `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  guest(h: Hold): string { return h.guest ? [`${h.guest.firstName} ${h.guest.lastName}`.trim(), h.guest.email, h.guest.phone].filter(Boolean).join(' · ') || 'not named yet' : 'not named yet'; }
  /** The guest's full address on one line — blank when none was given. */
  address(x: { guest: Guest | null }): string {
    const g = x.guest;
    if (!g) return '';
    return [g.street, g.apartment, g.city, g.postCode, g.state, g.country].map((v) => (v ?? '').trim()).filter(Boolean).join(', ');
  }
  setG(k: 'firstName' | 'lastName' | 'email' | 'phone' | 'street' | 'apartment' | 'city' | 'postCode' | 'state' | 'country', v: string): void { this.g.set({ ...this.g(), [k]: v }); }
  cancel(): void {
    const h = this.h();
    if (!h) return;
    const reason = prompt(`Cancel hold ${h.reference}? The nights go back on sale. Reason (optional):`);
    if (reason === null) return;
    this.busy.set(true);
    this.api.cancelHold(h.id, reason.trim() || null).subscribe({ next: (x) => { this.busy.set(false); this.h.set(x); this.changed.emit(); }, error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'Not cancelled.'); } });
  }
  convert(): void {
    const h = this.h();
    if (!h) return;
    this.busy.set(true);
    this.error.set('');
    const g = this.g();
    this.api.convertHold(h.id, {
      guest: {
        firstName: g.firstName.trim(),
        lastName: g.lastName.trim(),
        email: g.email.trim() || null,
        phone: g.phone.trim() || null,
        country: g.country.trim() || null,
        street: g.street.trim() || null,
        apartment: g.apartment.trim() || null,
        city: g.city.trim() || null,
        postCode: g.postCode.trim() || null,
        state: g.state.trim() || null,
      },
    }).subscribe({
      next: (b) => { this.busy.set(false); this.changed.emit(); this.oaExit.run(() => { this.closed.emit(); void this.router.navigate(['/bookings'], { queryParams: { open: b.id } }); }); },
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'The booking could not be made.'); },
    });
  }
  openBooking(id: string): void { this.oaExit.run(() => { this.closed.emit(); void this.router.navigate(['/bookings'], { queryParams: { open: id } }); }); }
  close(): void { this.oaExit.emit(this.closed); }
}
