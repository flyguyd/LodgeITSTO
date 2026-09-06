import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Booking, Guest, PortalApiService, STATUS_LABELS, money } from '../core/portal-api.service';
import { SlideoutExit } from '../shared/slideout-exit';
import { DETAIL_STYLES } from './detail-styles';

@Component({
  selector: 'sto-booking-slideout',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="sd-backdrop oa-slideout-backdrop" [class.oa-closing]="oaExit.closing()" (click)="close()"></div>
    <aside class="sd-panel oa-slideout" [class.oa-closing]="oaExit.closing()" role="dialog" aria-modal="true" aria-label="Booking">
      <div class="sd-head">
        <div>
          <span class="sd-kicker">Booking</span>
          <h2>{{ b()?.reference || '…' }}</h2>
          @if (b(); as x) { <span class="sd-pill" [class.ok]="x.status === 'confirmed' || x.status === 'checked_in'" [class.bad]="x.status === 'cancelled' || x.status === 'no_show'" [class.busy]="x.status === 'provisional'">{{ label(x.status) }}</span> }
        </div>
        <button type="button" class="sd-close" aria-label="Close" (click)="close()">×</button>
      </div>
      @if (error()) { <p class="sd-err">{{ error() }}</p> }
      @if (b(); as x) {
        @if (x.status === 'provisional') { <p class="sd-dim">Provisional: the nights are yours on the diary; the lodge confirms the booking, and that is when the guest is promised the stay.</p> }
        <dl class="sd-meta">
          <dt>Stay</dt><dd>{{ x.from | date: 'EEE d MMM' }} → {{ x.to | date: 'EEE d MMM yyyy' }} · {{ x.nights }} night{{ x.nights === 1 ? '' : 's' }}</dd>
          <dt>Party</dt><dd>{{ x.adults }} adult{{ x.adults === 1 ? '' : 's' }}@if (x.children) { , {{ x.children }} child{{ x.children === 1 ? '' : 'ren' }} }@if (x.infants) { , {{ x.infants }} infant{{ x.infants === 1 ? '' : 's' }} } (each suite)</dd>
          <dt>Guest</dt><dd>{{ guest(x) }}</dd>
          @if (address(x); as a) { <dt>Address</dt><dd>{{ a }}</dd> }
          <dt>Made</dt><dd>{{ x.createdAt | date: 'd MMM yyyy, HH:mm' }}@if (x.userName) { by {{ x.userName }} }@if (x.holdId) { · from a hold }</dd>
          @if (x.notes) { <dt>Notes</dt><dd>{{ x.notes }}</dd> }
          @if (x.status === 'cancelled') { <dt>Cancelled</dt><dd>{{ x.cancelledAt | date: 'd MMM, HH:mm' }} by {{ x.cancelledBy }}@if (x.cancelReason) { — {{ x.cancelReason }} }</dd> }
        </dl>
        <h3>Suites · {{ x.suites[0]?.planName || 'plan' }}</h3>
        @for (s of x.suites; track $index) {
          <div class="sd-suite"><span>{{ s.name }}@if (s.units > 1) { × {{ s.units }} }@if (s.engineReference) { <span class="sd-dim"> · lodge ref {{ s.engineReference }}</span> }</span><span><span class="sd-strike">{{ money(s.rackTotal, x.currency) }}</span> {{ money(s.total, x.currency) }}</span></div>
        }
        <div class="sd-total"><span>Total at {{ x.discountPct }}% off</span><span>{{ money(x.total, x.currency) }}</span></div>
        <!-- THE GUEST SHEET (Dave, 2026-09-06), at the FULL rate, ready to
             forward to the guest exactly as the operator received it. -->
        <div class="sd-actions">
          <button type="button" class="oa-btn" name="sheet" [disabled]="sheetBusy()" (click)="downloadSheet(x.id)">{{ sheetBusy() ? 'Preparing…' : 'Guest booking information (PDF)' }}</button>
        </div>
        @if (x.status !== 'cancelled' && x.status !== 'checked_in' && x.status !== 'checked_out') {
          <div class="sd-actions"><button type="button" class="oa-btn oa-btn-danger" [disabled]="busy()" (click)="cancel()">Cancel the booking</button></div>
        }
      } @else if (!error()) { <p class="sd-dim">Loading…</p> }
    </aside>
  `,
  styles: [DETAIL_STYLES],
})
export class BookingSlideoutComponent implements OnInit {
  readonly id = input.required<string>();
  readonly closed = output<void>();
  readonly changed = output<void>();
  private readonly api = inject(PortalApiService);
  readonly oaExit = new SlideoutExit();
  readonly b = signal<Booking | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  ngOnInit(): void {
    this.api.booking(this.id()).subscribe({ next: (b) => this.b.set(b), error: (e) => this.error.set(e?.error?.message ?? 'The booking could not be loaded.') });
  }
  money(v: number | null, c?: string | null): string { return money(v, c ?? 'ZAR'); }
  label(s: string): string { return STATUS_LABELS[s] ?? s; }
  guest(b: Booking): string { return b.guest ? [`${b.guest.firstName} ${b.guest.lastName}`.trim(), b.guest.email, b.guest.phone].filter(Boolean).join(' · ') || '—' : '—'; }
  /** The guest's full address on one line — blank when none was given. */
  address(x: { guest: Guest | null }): string {
    const g = x.guest;
    if (!g) return '';
    return [g.street, g.apartment, g.city, g.postCode, g.state, g.country].map((v) => (v ?? '').trim()).filter(Boolean).join(', ');
  }
  cancel(): void {
    const b = this.b();
    if (!b) return;
    const reason = prompt(`Cancel booking ${b.reference}? Reason (optional):`);
    if (reason === null) return;
    this.busy.set(true);
    this.api.cancelBooking(b.id, reason.trim() || null).subscribe({ next: (x) => { this.busy.set(false); this.b.set(x); this.changed.emit(); }, error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'Not cancelled.'); } });
  }
  close(): void { this.oaExit.emit(this.closed); }
  readonly sheetBusy = signal(false);

  /** Fetch the sheet with the session's token on it, then hand the browser the
   *  bytes under the file name Lodge Ops chose. */
  downloadSheet(id: string): void {
    this.sheetBusy.set(true);
    this.api.sheet('booking', id).subscribe({
      next: (res) => {
        this.sheetBusy.set(false);
        const blob = res.body;
        if (!blob) return;
        const disp = res.headers.get('content-disposition') ?? '';
        const named = /filename="?([^"]+)"?/.exec(disp);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = named ? named[1] : 'Guest booking information.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke on the next tick: revoking synchronously can beat the click.
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      error: () => { this.sheetBusy.set(false); window.alert('That sheet could not be prepared.'); },
    });
  }

}
