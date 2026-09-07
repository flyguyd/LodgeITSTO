import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalApiService, PortalSuite, money } from '../core/portal-api.service';
import { RateCalendarComponent } from '../shared/rate-calendar.component';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GUEST SUITES (Dave, 2026-09-07: "add a Guest Suites page to the STO site.
 * On the page show a card for each suite with the hero picture and general
 * info. When clicked open a light box with all the detailed information
 * including a 2 month availability/rate calendar").
 *
 * The content is Lodge Ops' own Guest Suites — the same rows the Rate Engine
 * replicates to the booking website — so an operator and a guest can never
 * be reading two different descriptions of the same suite. The photos come
 * down as ids and are fetched one at a time from an immutable, hard-cached
 * route; the alternative, base64 inline, made this page several megabytes.
 *
 * The calendar is the shared two-month one, read-only here: this page sells
 * nothing, it answers "what is this suite, is it free, and what does it cost
 * me". Book takes the operator to New booking with the suite already chosen.
 */
@Component({
  selector: 'app-suites',
  standalone: true,
  host: { '(document:keydown.escape)': 'onEscape()' },
  imports: [RouterLink, RateCalendarComponent],
  template: `
    <section class="gs-page">
      <header class="gs-head">
        <div>
          <h1>Guest suites</h1>
          <p class="gs-sub">
            Every suite at the lodge. Click one for the full description, what it
            sleeps, what it includes, and two months of availability with your
            own rates.
            @if (discountPct() > 0) { <strong>Your rates are {{ discountPct() }}% off rack.</strong> }
          </p>
        </div>
        <label class="gs-party">
          <span>Priced for</span>
          <select class="oa-input" name="adults" [value]="adults()" (change)="setAdults($any($event.target).value)">
            @for (n of [1,2,3,4,5,6,7,8]; track n) { <option [value]="n">{{ n }} adult{{ n === 1 ? '' : 's' }}</option> }
          </select>
        </label>
      </header>

      @if (error()) {
        <p class="gs-error" data-gs-error>{{ error() }}</p>
      } @else if (loading()) {
        <p class="gs-muted">Loading the suites…</p>
      } @else if (!suites().length) {
        <p class="gs-muted">No suites have been published yet.</p>
      } @else {
        <div class="gs-cards" data-gs-cards>
          @for (s of suites(); track s.id) {
            <article class="gs-card" [attr.data-suite]="s.id" role="button" tabindex="0"
                     (click)="open(s)" (keydown.enter)="open(s)" (keydown.space)="open(s)">
              <div class="gs-photo">
                @if (hero(s); as src) {
                  <img [src]="src" [alt]="s.name" />
                } @else {
                  <div class="gs-nophoto" aria-hidden="true">✦</div>
                }
                @if (s.photos.length > 1) { <span class="gs-count">{{ s.photos.length }} photos</span> }
              </div>
              <div class="gs-body">
                <h2>{{ s.name }}</h2>
                <p class="gs-chips">
                  @if (s.maxTotalGuests) { <span class="gs-chip">Sleeps {{ s.maxTotalGuests }}</span> }
                  @if (s.unitsTotal) { <span class="gs-chip">{{ s.unitsTotal }} available</span> }
                  @if (s.pool) { <span class="gs-chip">{{ s.pool }}</span> }
                  @if (s.style) { <span class="gs-chip">{{ s.style }}</span> }
                </p>
                @if (s.description) { <p class="gs-desc">{{ s.description }}</p> }
                <p class="gs-more">View detail and availability →</p>
              </div>
            </article>
          }
        </div>
      }

      <!-- THE LIGHT BOX: everything about the suite, then the calendar. -->
      @if (chosen(); as s) {
        <div class="gs-backdrop" (click)="close()">
          <div class="gs-box" role="dialog" aria-modal="true" [attr.aria-label]="s.name" data-gs-box (click)="$event.stopPropagation()">
            <header class="gs-box-head">
              <h2>{{ s.name }}</h2>
              <button type="button" class="gs-close" (click)="close()" aria-label="Close">✕</button>
            </header>

            @if (s.photos.length) {
              <div class="gs-gallery">
                @if (img(s.photos[shot()]); as src) { <img class="gs-hero" [src]="src" [alt]="s.name" /> }
                @if (s.photos.length > 1) {
                  <div class="gs-thumbs">
                    @for (pid of s.photos; track pid; let i = $index) {
                      <button type="button" class="gs-thumb" [class.on]="i === shot()" (click)="shot.set(i)" [attr.aria-label]="'Photo ' + (i + 1)">
                        @if (img(pid); as src) { <img [src]="src" [alt]="''" /> }
                      </button>
                    }
                  </div>
                }
              </div>
            }

            @if (s.description) { <p class="gs-box-desc">{{ s.description }}</p> }

            <div class="gs-facts">
              <div><span>Sleeps</span><strong>{{ s.maxTotalGuests ?? '—' }}</strong></div>
              <div><span>Rate includes</span><strong>{{ includedText(s) }}</strong></div>
              <div><span>Maximum</span><strong>{{ maxText(s) }}</strong></div>
              <div><span>Units at the lodge</span><strong>{{ s.unitsTotal ?? '—' }}</strong></div>
              @if (s.pool) { <div><span>Pool</span><strong>{{ s.pool }}</strong></div> }
              @if (s.style) { <div><span>Style</span><strong>{{ s.style }}</strong></div> }
              @if (s.extraAdultCost) { <div><span>Extra adult</span><strong>{{ cash(s.extraAdultCost) }} a night</strong></div> }
              @if (s.extraChildCost) { <div><span>Extra child</span><strong>{{ cash(s.extraChildCost) }} a night</strong></div> }
              @if (s.extraInfantCost) { <div><span>Extra infant</span><strong>{{ cash(s.extraInfantCost) }} a night</strong></div> }
            </div>

            @if (s.amenities.length) {
              <div class="gs-amenities">
                <h3>In the suite</h3>
                <p class="gs-chips">@for (a of s.amenities; track a) { <span class="gs-chip">{{ a }}</span> }</p>
              </div>
            }

            <div class="gs-actions">
              <button type="button" class="oa-btn" name="availability" data-gs-cal (click)="calFor.set(s.id)">Availability &amp; rates</button>
              <a class="oa-btn oa-btn-primary" [routerLink]="['/new']" [queryParams]="{ suite: s.id }">Book this suite</a>
            </div>
          </div>
        </div>
      }

      @if (calFor(); as id) {
        <sto-rate-calendar
          [roomTypeId]="id"
          [suiteName]="nameOf(id)"
          [adults]="adults()"
          [currency]="currency()"
          [note]="calNote()"
          [startMonth]="thisMonth"
          [pickable]="false"
          (closed)="calFor.set(null)" />
      }
    </section>
  `,
  styles: [
    `
      .gs-page { padding: 18px 20px 60px; max-width: 1200px; margin: 0 auto; }
      .gs-head { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 16px; }
      .gs-head h1 { margin: 0 0 4px; font-size: 22px; font-weight: 650; }
      .gs-sub { margin: 0; color: var(--oa-text-dim); font-size: 13.5px; max-width: 78ch; }
      .gs-party { margin-left: auto; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--oa-text-dim); }
      .gs-muted { color: var(--oa-text-dim); }
      .gs-error { color: #9e4029; }

      .gs-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
      .gs-card { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s; }
      .gs-card:hover, .gs-card:focus-visible { border-color: #8a6d2f; transform: translateY(-2px); box-shadow: 0 10px 24px rgba(78, 64, 36, 0.14); outline: none; }
      .gs-photo { position: relative; aspect-ratio: 4 / 3; background: var(--oa-surface-2); }
      .gs-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .gs-nophoto { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 34px; color: #c8a45f; }
      .gs-count { position: absolute; right: 8px; bottom: 8px; background: rgba(29, 26, 22, 0.72); color: #f3ede1; font-size: 11px; padding: 2px 8px; border-radius: 999px; }
      .gs-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
      .gs-body h2 { margin: 0; font-size: 16px; font-weight: 650; }
      .gs-chips { margin: 0; display: flex; flex-wrap: wrap; gap: 5px; }
      .gs-chip { font-size: 11.5px; padding: 2px 9px; border-radius: 999px; background: rgba(200, 164, 95, 0.18); color: var(--oa-text); }
      .gs-desc { margin: 2px 0 0; font-size: 13px; line-height: 1.5; color: var(--oa-text-dim); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .gs-more { margin: 4px 0 0; font-size: 12px; color: #8a6d2f; font-weight: 600; }

      .gs-backdrop { position: fixed; inset: 0; background: rgba(20, 16, 10, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1150; padding: 16px; }
      .gs-box { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); width: min(860px, 100%); max-height: 92vh; overflow: auto; padding: 16px 18px 18px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
      .gs-box-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
      .gs-box-head h2 { margin: 0; font-size: 18px; font-weight: 650; }
      .gs-close { margin-left: auto; border: 0; background: transparent; font-size: 18px; cursor: pointer; color: var(--oa-text-dim); padding: 2px 6px; }
      .gs-gallery { margin-bottom: 12px; }
      .gs-hero { width: 100%; max-height: 380px; object-fit: cover; border-radius: 10px; display: block; }
      .gs-thumbs { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; padding-bottom: 4px; }
      .gs-thumb { flex: 0 0 auto; width: 72px; height: 54px; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: none; cursor: pointer; }
      .gs-thumb.on { border-color: #8a6d2f; }
      .gs-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .gs-box-desc { margin: 0 0 12px; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; }
      .gs-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 16px; margin-bottom: 12px; }
      .gs-facts div { display: flex; flex-direction: column; gap: 1px; }
      .gs-facts span { font-size: 11px; color: var(--oa-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
      .gs-facts strong { font-size: 13.5px; font-weight: 600; }
      .gs-amenities h3 { margin: 0 0 6px; font-size: 13px; font-weight: 650; }
      .gs-amenities { margin-bottom: 14px; }
      .gs-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    `,
  ],
})
export class SuitesComponent implements OnInit, OnDestroy {
  private readonly api = inject(PortalApiService);

  readonly suites = signal<PortalSuite[]>([]);
  readonly currency = signal('ZAR');
  readonly discountPct = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly chosen = signal<PortalSuite | null>(null);
  readonly shot = signal(0);
  readonly calFor = signal<string | null>(null);
  readonly adults = signal(2);
  /** Photo id → object URL, and the ids already asked for. */
  private readonly urls = signal<Record<string, string>>({});
  private readonly asked = new Set<string>();
  readonly thisMonth = iso(new Date()).slice(0, 7);

  ngOnInit(): void {
    this.api.suites().subscribe({
      next: (r) => {
        this.suites.set(r.suites ?? []);
        this.currency.set(r.currency || 'ZAR');
        this.discountPct.set(Number(r.discountPct) || 0);
        this.loading.set(false);
        // Only the hero of each card up front; the rest of a suite's gallery
        // is asked for when its light box opens.
        for (const s of this.suites()) if (s.photos[0]) this.want(s.photos[0]);
      },
      error: (e: { error?: { message?: string } }) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'The suites could not be loaded.'); },
    });
  }

  ngOnDestroy(): void {
    for (const url of Object.values(this.urls())) URL.revokeObjectURL(url);
  }

  /** Ask for a photo once. The bytes arrive with the session's token on the
   *  request, so they cannot be reached with a bare <img src>; the object URL
   *  they become is what the template points at. */
  private want(id: string): void {
    if (!id || this.asked.has(id)) return;
    this.asked.add(id);
    this.api.suiteImage(id).subscribe({
      next: (blob) => this.urls.update((m) => ({ ...m, [id]: URL.createObjectURL(blob) })),
      error: () => { this.asked.delete(id); },
    });
  }

  /** A pure lookup — never a fetch, or the template would ask again on every
   *  change-detection pass. */
  img(id: string | undefined): string { return (id && this.urls()[id]) || ''; }
  hero(s: PortalSuite): string { return this.img(s.photos[0]); }
  cash(v: number): string { return money(v, this.currency()); }
  nameOf(id: string): string { return this.suites().find((s) => s.id === id)?.name ?? ''; }
  /** Whose figures these are — the calendar itself cannot know. */
  calNote(): string {
    const party = `${this.adults()} ${this.adults() === 1 ? 'adult' : 'adults'}`;
    return this.discountPct() > 0
      ? `Your own rate for ${party}: ${this.discountPct()}% off the published figure, VAT in.`
      : `Your own rate for ${party}, VAT in.`;
  }
  setAdults(v: string): void { const n = Math.max(1, Math.min(8, Math.trunc(Number(v) || 2))); this.adults.set(n); }

  open(s: PortalSuite): void { this.chosen.set(s); this.shot.set(0); for (const p of s.photos) this.want(p); }
  close(): void { this.chosen.set(null); }
  /** Escape closes the calendar first, then the light box. */
  onEscape(): void { if (this.calFor()) { this.calFor.set(null); return; } this.close(); }

  includedText(s: PortalSuite): string {
    const bits: string[] = [];
    if (s.includedAdults) bits.push(`${s.includedAdults} adult${s.includedAdults === 1 ? '' : 's'}`);
    if (s.includedChildren) bits.push(`${s.includedChildren} child${s.includedChildren === 1 ? '' : 'ren'}`);
    if (s.includedInfants) bits.push(`${s.includedInfants} infant${s.includedInfants === 1 ? '' : 's'}`);
    return bits.length ? bits.join(', ') : '—';
  }
  maxText(s: PortalSuite): string {
    const bits: string[] = [];
    if (s.maxAdults) bits.push(`${s.maxAdults} adults`);
    if (s.maxChildren) bits.push(`${s.maxChildren} children`);
    if (s.maxInfants) bits.push(`${s.maxInfants} infants`);
    return bits.length ? bits.join(', ') : '—';
  }
}
