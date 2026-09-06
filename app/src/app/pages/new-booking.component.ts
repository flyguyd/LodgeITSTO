import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CalendarDay, Catalog, PortalApiService, Quote, StayInput, SuiteCalendar, money, refundLabel } from '../core/portal-api.service';
import { PortalAuthService } from '../core/portal-auth.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (from: string, n: number) => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const addMonths = (month: string, n: number) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const calMoney = (v: number, currency: string) => (currency === 'ZAR' || !currency ? 'R' : currency + ' ') + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface CalCell { date: string; num: number; day: CalendarDay | null; stay: boolean; past: boolean; rate: string; freeText: string; title: string;
  /** While a new stay is being clicked out, the nights the pointer covers. */
  pick: boolean; pickStart: boolean;
  /** The channel's own nightly, struck through beneath the operator's. */
  rack: string;
}
interface SuiteLine { roomTypeId: string; units: number; }

/**
 * New booking on the STO portal (Dave, 2026-09-05): the same page as Lodge
 * Ops' New booking — dates, party, suites with the availability calendar,
 * the rate plans — priced by the Rate Engine, with the operator's discount
 * shown against the published figure. Two ways out: HOLD the nights for the
 * operator's hold hours, or MAKE THE BOOKING (provisional; the lodge
 * confirms it). The price of record is worked out by Lodge Ops when the hold
 * or booking is made; this page only shows what to expect.
 */
@Component({
  selector: 'sto-new-booking',
  host: { '(document:keydown.escape)': 'onEscape()' },
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <section class="nb-page">
      <header class="nb-head">
        <div>
          <h1>New booking</h1>
          <p class="nb-sub">Choose the stay and the suites; the rates are the lodge's published figures less your {{ discountPct() }}% discount, VAT included. Hold the nights for {{ holdHours() }} hours, or make the booking now.</p>
        </div>
      </header>
      @if (catalogError()) { <p class="nb-err">{{ catalogError() }}</p> }
      <div class="nb-grid">
        <div class="nb-card">
          <h2>The stay</h2>
          <div class="nb-row">
            <label class="nb-field"><span>Check-in</span><input class="oa-input" type="date" name="from" [ngModel]="from()" (ngModelChange)="onFrom($event)" /></label>
            <label class="nb-field"><span>Check-out</span><input class="oa-input" type="date" name="to" [ngModel]="to()" (ngModelChange)="to.set($event); requote()" /></label>
            <label class="nb-field nb-narrow"><span>Nights</span><input class="oa-input" type="number" min="1" max="60" name="nights" [ngModel]="nights()" (ngModelChange)="onNights($event)" /></label>
          </div>
          <div class="nb-row">
            <label class="nb-field nb-narrow"><span>Adults <small>(each suite)</small></span><input class="oa-input" type="number" min="1" max="20" name="adults" [ngModel]="adults()" (ngModelChange)="adults.set(+$event || 1); requote()" /></label>
            <label class="nb-field nb-narrow"><span>Children</span><input class="oa-input" type="number" min="0" max="20" name="children" [ngModel]="children()" (ngModelChange)="children.set(+$event || 0); requote()" /></label>
            <label class="nb-field nb-narrow"><span>Infants</span><input class="oa-input" type="number" min="0" max="20" name="infants" [ngModel]="infants()" (ngModelChange)="infants.set(+$event || 0); requote()" /></label>
          </div>

          <h2>The suites</h2>
          @for (line of lines(); track $index; let i = $index) {
            <div class="nb-row nb-suite-line">
              <label class="nb-field"><span>Suite {{ lines().length > 1 ? i + 1 : '' }}</span>
                <select class="oa-input" [attr.name]="i === 0 ? 'suite' : 'suite' + (i + 1)" [ngModel]="line.roomTypeId" (ngModelChange)="setLine(i, 'roomTypeId', $event)">
                  <option value="">Choose a suite…</option>
                  @for (s of suitesFor(i); track s.id) {
                    <option [value]="s.id" [disabled]="takenElsewhere(i, s.id)">{{ s.name }}@if (s.maxTotalGuests) { (up to {{ s.maxTotalGuests }} guests) }@if (freeFor(s.id) === 0) { — no availability }</option>
                  }
                </select>
              </label>
              <button type="button" class="oa-btn nb-cal-btn" [attr.name]="i === 0 ? 'calendar' : 'calendar' + (i + 1)" title="Availability and rates for this suite" aria-label="Open the availability calendar" [disabled]="!line.roomTypeId || nights() <= 0" (click)="openCalendar(line.roomTypeId)">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="5.5" y="11" width="3" height="3" rx="0.6" fill="currentColor"/></svg>
              </button>
              <label class="nb-field nb-narrow"><span>Units</span><input class="oa-input" type="number" min="1" max="20" [attr.name]="i === 0 ? 'units' : 'units' + (i + 1)" [ngModel]="line.units" (ngModelChange)="setLine(i, 'units', $event)" /></label>
              @if (lines().length > 1) { <button type="button" class="oa-btn nb-line-remove" title="Remove this suite" (click)="removeLine(i)">✕</button> }
            </div>
            @if (overCapacityFor(line); as over) { <p class="nb-warn">{{ over }}</p> }
          }
          <button type="button" class="oa-btn nb-add" [disabled]="!canAddLine()" (click)="addLine()">+ Add another suite</button>

          <h2>The rate</h2>
          @if (quoting()) { <p class="nb-dim">Asking the lodge…</p> }
          @else if (quote(); as q) {
            @if (q.plans.length) {
              <div class="nb-plans">
                @for (p of q.plans; track p.id) {
                  <div class="nb-plan-wrap">
                    <button type="button" class="nb-plan" [class.on]="planId() === p.id" [disabled]="!sellable(p.id)" (click)="planId.set(p.id)">
                      <span class="nb-plan-name">{{ p.name }}</span>
                      <span class="nb-plan-total">{{ planTotal(p.id) }}</span>
                      @if (planRack(p.id); as rk) { <span class="nb-plan-rack"><s>{{ rk }}</s> <span class="nb-plan-off">{{ discountPct() }}% off</span></span> }
                      @if (planRefund(p.id); as rf) { <span class="nb-plan-refund">{{ rf }}</span> }
                      @if (planNote(p.id); as n) { <span class="nb-plan-note">{{ n }}</span> }
                    </button>
                    <button type="button" class="nb-plan-i" [attr.name]="'inclusions-' + p.id" title="What this rate includes" aria-label="What this rate includes" (click)="openInclusions(p.id)">i</button>
                  </div>
                }
              </div>
              <p class="nb-dim">Units free for these nights: {{ unitsFreeText() }}</p>
            } @else { <p class="nb-warn">No rate plan is offered for this stay.</p> }
          } @else { <p class="nb-dim">Choose a suite and dates to see the rates.</p> }
        </div>

        <div class="nb-card">
          <h2>The guest</h2>
          <p class="nb-dim">Needed to make the booking; a hold may be taken without a name.</p>
          <div class="nb-row">
            <label class="nb-field"><span>First name</span><input class="oa-input" type="text" name="firstName" maxlength="120" [ngModel]="firstName()" (ngModelChange)="firstName.set($event)" /></label>
            <label class="nb-field"><span>Last name</span><input class="oa-input" type="text" name="lastName" maxlength="120" [ngModel]="lastName()" (ngModelChange)="lastName.set($event)" /></label>
          </div>
          <div class="nb-row">
            <label class="nb-field"><span>E-mail</span><input class="oa-input" type="email" name="email" maxlength="255" [ngModel]="email()" (ngModelChange)="email.set($event)" /></label>
            <label class="nb-field"><span>Phone</span><input class="oa-input" type="tel" name="phone" maxlength="60" [ngModel]="phone()" (ngModelChange)="phone.set($event)" /></label>
          </div>
          <h3 class="nb-h3">Address</h3>
          <div class="nb-row">
            <label class="nb-field"><span>Street</span><input class="oa-input" type="text" name="street" maxlength="200" [ngModel]="street()" (ngModelChange)="street.set($event)" /></label>
            <label class="nb-field nb-narrow"><span>Apartment / unit</span><input class="oa-input" type="text" name="apartment" maxlength="80" [ngModel]="apartment()" (ngModelChange)="apartment.set($event)" /></label>
          </div>
          <div class="nb-row">
            <label class="nb-field"><span>City</span><input class="oa-input" type="text" name="city" maxlength="120" [ngModel]="city()" (ngModelChange)="city.set($event)" /></label>
            <label class="nb-field nb-narrow"><span>Post code</span><input class="oa-input" type="text" name="postCode" maxlength="20" [ngModel]="postCode()" (ngModelChange)="postCode.set($event)" /></label>
          </div>
          <div class="nb-row">
            <label class="nb-field"><span>State / province</span><input class="oa-input" type="text" name="state" maxlength="120" [ngModel]="state()" (ngModelChange)="state.set($event)" /></label>
            <label class="nb-field"><span>Country</span><input class="oa-input" type="text" name="country" maxlength="80" [ngModel]="country()" (ngModelChange)="country.set($event)" /></label>
          </div>
          <label class="nb-field"><span>Notes for the lodge</span><textarea class="oa-input nb-notes" name="notes" maxlength="4000" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea></label>

          <div class="nb-summary">
            <div><span>{{ chosenLines().length > 1 ? 'Suites' : 'Suite' }}</span><strong>{{ suitesText() }}</strong></div>
            <div><span>Stay</span><strong>@if (from() && to()) { {{ from() | date: 'd MMM' }} → {{ to() | date: 'd MMM yyyy' }} · {{ nights() }}n } @else { — }</strong></div>
            <div>
              <span>Your price</span>
              <strong>{{ totalText() }}</strong>
              @if (totalRackText(); as rk) { <small class="nb-rack"><s>{{ rk }}</s> rack · {{ discountPct() }}% off</small> }
            </div>
          </div>
          @if (error()) { <p class="nb-err">{{ error() }}</p> }
          <div class="nb-actions">
            <a class="oa-btn" routerLink="/">Back</a>
            <span class="nb-spacer"></span>
            <button type="button" class="oa-btn" name="hold" [disabled]="busy() || !canHold()" (click)="hold()">{{ busy() === 'hold' ? 'Holding…' : 'Hold for ' + holdHours() + ' hours' }}</button>
            <button type="button" class="oa-btn oa-btn-primary" name="book" [disabled]="busy() || !canBook()" (click)="book()">{{ busy() === 'book' ? 'Making the booking…' : 'Make the booking' }}</button>
          </div>
          <p class="nb-dim">A booking is provisional until the lodge confirms it. Payment comes later.</p>
        </div>
      </div>
    </section>

    @if (incOpen(); as inc) {
      <div class="nb-inc-backdrop" (click)="incOpen.set(null)">
        <div class="nb-inc-panel" role="dialog" aria-modal="true" aria-label="What this rate includes" (click)="$event.stopPropagation()">
          <header class="nb-inc-head">
            <div>
              <h2>{{ inc.planName }}</h2>
              <p class="nb-dim">What this rate includes for the suites chosen.</p>
            </div>
            <button type="button" class="nb-inc-close" (click)="incOpen.set(null)" aria-label="Close">✕</button>
          </header>
          @for (s of inc.suites; track s.roomTypeId) {
            @if (inc.suites.length > 1) { <p class="nb-inc-suite">{{ s.name }}</p> }
            @if (s.included.length) {
              <ul class="nb-inc-list">@for (i of s.included; track i) { <li>{{ i }}</li> }</ul>
            } @else {
              <p class="nb-dim">Nothing is listed as included on this rate.</p>
            }
            @if (s.excluded.length) {
              <p class="nb-dim">Not included:</p>
              <ul class="nb-inc-list nb-inc-out">@for (i of s.excluded; track i) { <li>{{ i }}</li> }</ul>
            }
          }
        </div>
      </div>
    }

    @if (calOpen(); as cal) {
      <div class="nb-cal-backdrop" (click)="closeCalendar()">
        <div class="nb-cal-panel" role="dialog" aria-modal="true" aria-label="Availability and rates" (click)="$event.stopPropagation()">
          <header class="nb-cal-head">
            <div>
              <h2>{{ suiteOf(cal.roomTypeId)?.name || 'Suite' }} — availability and rates</h2>
              <p class="nb-dim">Free units and your nightly rate ({{ discountPct() }}% off the published figure, VAT in) for {{ adults() }} {{ adults() === 1 ? 'adult' : 'adults' }}{{ children() ? ', ' + children() + (children() === 1 ? ' child' : ' children') : '' }}. @if (calPlanName(); as pn) { Plan: <b>{{ pn }}</b>. } @else { The cheapest plan each night. } The requested nights are outlined in gold.</p>
              <p class="nb-cal-hint">{{ calPick() ? 'Now click the LAST night of the stay — click the same night again for one night.' : 'Click a night to move the stay: the first night, then the last.' }}</p>
            </div>
            <button type="button" class="nb-cal-close" (click)="closeCalendar()" aria-label="Close">✕</button>
          </header>
          <div class="nb-cal-nav">
            <button type="button" class="oa-btn" (click)="shiftCalendar(-1)" aria-label="Earlier month">‹</button>
            <span class="nb-dim">{{ calRangeLabel() }}</span>
            <button type="button" class="oa-btn" (click)="shiftCalendar(1)" aria-label="Later month">›</button>
          </div>
          @if (calError(); as e) { <p class="nb-err">{{ e }}</p> }
          <div class="nb-cal-months" [class.nb-cal-loading]="calLoading()">
            @for (m of calMonths(); track m.key) {
              <div class="nb-cal-month">
                <h3>{{ m.label }}</h3>
                <div class="nb-cal-grid">
                  @for (d of DOW; track d) { <span class="nb-cal-dow">{{ d }}</span> }
                  @for (c of m.cells; track $index) {
                    @if (c) {
                      <button type="button" class="nb-cal-day" [class.stay]="c.stay" [class.pick]="c.pick" [class.pick-start]="c.pickStart" [class.soldout]="c.day?.free === 0" [class.unknown]="!c.day || c.day.free == null" [class.past]="c.past" [disabled]="c.past" [attr.data-date]="c.date" [title]="c.title" (click)="pickDay(c)" (mouseenter)="calHover.set(c.date)">
                        <span class="nb-cal-num">{{ c.num }}</span>
                        @if (c.day && !c.past) { <span class="nb-cal-rate">{{ c.rate }}</span>@if (c.rack) { <span class="nb-cal-rack">{{ c.rack }}</span> }<span class="nb-cal-free">{{ c.freeText }}</span> }
                      </button>
                    } @else { <div class="nb-cal-day nb-cal-blank"></div> }
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .nb-page { width: 95%; max-width: 1200px; margin: 0 auto; padding: 24px 0 60px; }
      .nb-head { margin-bottom: 16px; }
      .nb-head h1 { margin: 0; font-size: 22px; font-weight: 650; }
      .nb-sub { margin: 4px 0 0; color: var(--oa-text-dim); font-size: 13.5px; max-width: 80ch; }
      .nb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; align-items: start; }
      .nb-card { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); padding: 16px 18px; }
      .nb-card h2 { margin: 0 0 12px; font-size: 15px; font-weight: 650; }
      .nb-card h2:not(:first-child) { margin-top: 20px; }
      .nb-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .nb-h3 { margin: 16px 0 0; font-size: 13px; font-weight: 650; color: var(--oa-text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
      .nb-row .nb-field { flex: 1 1 160px; }
      .nb-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
      .nb-field > span { font-size: 12.5px; color: var(--oa-text-dim); font-weight: 600; }
      .nb-field > span small { font-weight: 400; }
      .nb-field .oa-input { width: 100%; box-sizing: border-box; }
      .nb-narrow { flex: 0 1 140px !important; }
      .nb-suite-line { align-items: flex-end; }
      .nb-line-remove { flex: 0 0 auto; margin-bottom: 12px; padding: 6px 10px; }
      .nb-add { margin: 0 0 6px; }
      .nb-notes { min-height: 64px; resize: vertical; }
      .nb-dim { color: var(--oa-text-dim); font-size: 13px; }
      .nb-warn { color: #705003; font-size: 13px; margin: 0 0 10px; }
      .nb-err { color: var(--oa-danger); font-size: 13.5px; margin: 8px 0; }
      .nb-plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 10px; }
      /* The card and its "i" are SIBLINGS: a button cannot legally contain
         another button, and nesting one made the whole card unclickable. */
      .nb-plan-wrap { position: relative; display: flex; }
      .nb-plan-wrap > .nb-plan { flex: 1; }
      .nb-plan-i {
        position: absolute; top: 5px; right: 5px; width: 19px; height: 19px; padding: 0;
        border-radius: 50%; border: 1px solid var(--oa-border-strong); background: var(--oa-surface);
        color: var(--oa-text-dim); font: 600 12px/17px Georgia, 'Times New Roman', serif; cursor: pointer;
      }
      .nb-plan-i:hover { color: var(--oa-text); border-color: #c8a45f; }
      .nb-inc-backdrop { position: fixed; inset: 0; background: rgba(20, 16, 10, 0.45); z-index: 1300; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .nb-inc-panel { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); max-width: 520px; width: 100%; max-height: 80vh; overflow: auto; padding: 18px 20px; z-index: 1301; }
      .nb-inc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .nb-inc-head h2 { margin: 0; font-size: 17px; }
      .nb-inc-close { border: 0; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: var(--oa-text-dim); }
      .nb-inc-list { margin: 10px 0 0; padding-left: 18px; }
      .nb-inc-list li { margin: 3px 0; font-size: 13.5px; }
      .nb-inc-out li { color: var(--oa-text-dim); text-decoration: line-through; }
      .nb-inc-suite { margin: 12px 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--oa-text-dim); }
      .nb-plan { text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--oa-border); border-radius: var(--oa-radius); background: var(--oa-surface-2); cursor: pointer; color: inherit; font: inherit; }
      .nb-plan.on { border-color: #c8a45f; box-shadow: inset 0 0 0 1px #c8a45f; }
      .nb-plan:disabled { opacity: 0.55; cursor: not-allowed; }
      .nb-plan-name { font-weight: 600; font-size: 13.5px; }
      .nb-plan-total { font-size: 18px; font-variant-numeric: tabular-nums; }
      /* The rack figure sits BELOW the operator's price, smaller and struck
         through, so what is paid and what it is off are never confused. */
      .nb-plan-rack { font-size: 12px; color: var(--oa-text-dim); }
      .nb-plan-rack s { text-decoration: line-through; }
      .nb-plan-off { text-decoration: none; margin-left: 5px; }
      .nb-rack { display: block; font-size: 11.5px; font-weight: 400; color: var(--oa-text-dim); margin-top: 2px; }
      .nb-rack s { text-decoration: line-through; }
      .nb-cal-rack { font-size: 10.5px; color: var(--oa-text-dim); text-decoration: line-through; }
      .nb-plan-refund { font-size: 12px; color: #705003; }
      .nb-plan-note { font-size: 12px; color: var(--oa-text-dim); }
      .nb-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 8px 0 12px; padding: 10px 12px; border: 1px solid var(--oa-border); border-radius: var(--oa-radius); background: var(--oa-surface-2); }
      .nb-summary div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
      .nb-summary span { color: var(--oa-text-dim); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; }
      .nb-actions { display: flex; align-items: center; gap: 8px; }
      .nb-actions .oa-btn { text-decoration: none; }
      .nb-spacer { flex: 1 1 auto; }
      .nb-cal-btn { flex: 0 0 auto; margin-bottom: 12px; padding: 6px 9px; display: inline-flex; align-items: center; color: #8a6d2f; }
      .nb-cal-btn:disabled { opacity: 0.45; }
      .nb-cal-backdrop { position: fixed; inset: 0; background: rgba(20, 16, 10, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1200; padding: 16px; }
      .nb-cal-panel { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: var(--oa-radius); width: min(980px, 100%); max-height: 92vh; overflow: auto; padding: 16px 18px 12px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
      .nb-cal-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
      .nb-cal-head h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
      .nb-cal-head p { margin: 0; max-width: 80ch; }
      .nb-cal-close { margin-left: auto; border: 0; background: transparent; font-size: 18px; cursor: pointer; color: var(--oa-text-dim); padding: 2px 6px; }
      .nb-cal-nav { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 6px 0 10px; }
      .nb-cal-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 18px; transition: opacity 0.15s; }
      .nb-cal-loading { opacity: 0.5; }
      .nb-cal-month h3 { margin: 0 0 6px; font-size: 14px; font-weight: 650; text-align: center; }
      .nb-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
      .nb-cal-dow { text-align: center; font-size: 11px; color: var(--oa-text-dim); text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 2px; }
      /* The day cells are BUTTONS now (the stay is clicked out on them), so
         they reset the browser's button styling back to the card look. */
      .nb-cal-day { min-height: 58px; border: 1px solid var(--oa-border); border-radius: 6px; padding: 4px 5px; display: flex; flex-direction: column; gap: 1px; background: var(--oa-surface-2); font-variant-numeric: tabular-nums; font: inherit; color: inherit; text-align: left; align-items: stretch; cursor: pointer; }
      .nb-cal-day:hover:not(:disabled) { border-color: #8a6d2f; }
      .nb-cal-day:disabled { cursor: default; }
      .nb-cal-blank { cursor: default; }
      .nb-cal-blank { border-color: transparent; background: transparent; }
      .nb-cal-num { font-size: 12px; font-weight: 600; }
      .nb-cal-rate { font-size: 12.5px; }
      .nb-cal-free { font-size: 11px; color: #2f6b3a; }
      .nb-cal-day.soldout { background: #f1ebe2; color: var(--oa-text-dim); }
      .nb-cal-day.soldout .nb-cal-rate { text-decoration: line-through; }
      .nb-cal-day.soldout .nb-cal-free { color: #9a3b2e; }
      .nb-cal-day.past { opacity: 0.4; }
      .nb-cal-day.stay { border-color: #c8a45f; box-shadow: inset 0 0 0 1.5px #c8a45f; background: #fbf5e6; }
      .nb-cal-day.pick { border-color: #8a6d2f; box-shadow: inset 0 0 0 2px #8a6d2f; background: #f6ecd4; }
      .nb-cal-day.pick-start { box-shadow: inset 0 0 0 2.5px #8a6d2f; }
      .nb-cal-hint { margin: 6px 0 0; font-size: 12.5px; color: #705003; }
    `,
  ],
})
export class NewBookingComponent implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(PortalAuthService);
  private readonly router = inject(Router);
  readonly DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly catalog = signal<Catalog | null>(null);
  readonly catalogError = signal('');
  readonly lines = signal<SuiteLine[]>([{ roomTypeId: '', units: 1 }]);
  readonly from = signal(iso(new Date(Date.now() + 14 * 86400e3)));
  readonly to = signal(iso(new Date(Date.now() + 17 * 86400e3)));
  readonly adults = signal(2);
  readonly children = signal(0);
  readonly infants = signal(0);
  readonly quote = signal<Quote | null>(null);
  readonly quoting = signal(false);
  readonly planId = signal('');
  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly country = signal('');
  readonly street = signal('');
  readonly apartment = signal('');
  readonly city = signal('');
  readonly postCode = signal('');
  readonly state = signal('');
  readonly notes = signal('');
  readonly busy = signal<'' | 'hold' | 'book'>('');
  readonly error = signal('');
  readonly stayFree = signal<Record<string, number | null>>({});
  readonly calOpen = signal<{ roomTypeId: string; month: string } | null>(null);
  /** WHAT THIS RATE INCLUDES (Dave, 2026-09-06): the open inclusions modal. */
  readonly incOpen = signal<{ planName: string; suites: { roomTypeId: string; name: string; included: string[]; excluded: string[] }[] } | null>(null);
  readonly calData = signal<SuiteCalendar | null>(null);
  readonly calLoading = signal(false);
  readonly calError = signal('');
  /** CLICK-TO-PICK (Dave, 2026-09-06): the first night clicked while a new
   *  stay is being chosen, and the night the pointer is over. */
  readonly calPick = signal('');
  readonly calHover = signal('');
  private quoteSeq = 0;
  private availSeq = 0;
  private calSeq = 0;

  readonly discountPct = computed(() => this.catalog()?.discountPct ?? this.auth.company()?.discountPct ?? 0);
  readonly holdHours = computed(() => this.catalog()?.holdHours ?? this.auth.company()?.holdHours ?? 48);
  readonly nights = computed(() => { const a = Date.parse(this.from()), b = Date.parse(this.to()); return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 86400e3) : 0; });
  readonly chosenLines = computed(() => this.lines().filter((l) => !!l.roomTypeId));
  readonly canHold = computed(() => {
    const chosen = this.chosenLines();
    return chosen.length > 0 && chosen.length === this.lines().length && this.nights() > 0 && !!this.planId() && this.sellable(this.planId()) && !chosen.some((l) => !!this.overCapacityFor(l));
  });
  readonly canBook = computed(() => this.canHold() && !!(this.firstName().trim() || this.lastName().trim()));

  ngOnInit(): void {
    this.api.catalog().subscribe({
      next: (c) => { this.catalog.set(c); if (c.suites.length === 1) this.setLine(0, 'roomTypeId', c.suites[0].id); this.refreshAvailability(); },
      error: (e) => this.catalogError.set(e?.error?.message ?? 'The lodge could not be reached.'),
    });
  }

  suiteOf(id: string) { return this.catalog()?.suites.find((s) => s.id === id) ?? null; }
  setLine(i: number, key: 'roomTypeId' | 'units', v: unknown): void {
    const list = this.lines().map((l) => ({ ...l }));
    if (!list[i]) return;
    if (key === 'roomTypeId') list[i].roomTypeId = String(v ?? '');
    else list[i].units = Math.max(1, Math.min(20, Math.trunc(Number(v) || 1)));
    this.lines.set(list);
    this.requote();
  }
  addLine(): void { if (this.canAddLine()) this.lines.set([...this.lines(), { roomTypeId: '', units: 1 }]); }
  removeLine(i: number): void { if (this.lines().length > 1) { this.lines.set(this.lines().filter((_, k) => k !== i)); this.requote(); } }
  canAddLine(): boolean { const total = this.catalog()?.suites.length ?? 0; return this.lines().length < total && this.lines().every((l) => !!l.roomTypeId); }
  takenElsewhere(i: number, id: string): boolean { return this.lines().some((l, k) => k !== i && l.roomTypeId === id); }
  overCapacityFor(line: SuiteLine): string {
    const s = this.suiteOf(line.roomTypeId);
    if (!s) return '';
    const party = this.adults() + this.children();
    if (s.maxTotalGuests != null && party > s.maxTotalGuests * line.units) return `${party} guests is more than the ${s.name} takes (${s.maxTotalGuests} per unit) — add units or choose another suite.`;
    if (s.maxAdults != null && this.adults() > s.maxAdults * line.units) return `${this.adults()} adults is more than the ${s.name} takes (${s.maxAdults} per unit).`;
    return '';
  }
  suitesFor(i: number) { const free = this.stayFree(); const chosen = this.lines()[i]?.roomTypeId ?? ''; return (this.catalog()?.suites ?? []).filter((s) => s.id === chosen || free[s.id] !== 0); }
  freeFor(id: string): number | null { return this.stayFree()[id] ?? null; }
  private refreshAvailability(): void {
    if (this.nights() <= 0) { this.stayFree.set({}); return; }
    const seq = ++this.availSeq;
    this.api.availability(this.from(), this.to()).subscribe({ next: (a) => { if (seq === this.availSeq) this.stayFree.set(a.suites ?? {}); }, error: () => { if (seq === this.availSeq) this.stayFree.set({}); } });
  }
  onFrom(v: string): void { const n = this.nights() || 3; this.from.set(v); if (v) this.to.set(plusDays(v, n)); this.requote(); }
  onNights(v: number | string): void { const n = Math.max(1, Math.min(60, Math.trunc(Number(v) || 1))); if (this.from()) this.to.set(plusDays(this.from(), n)); this.requote(); }

  requote(): void {
    this.refreshAvailability();
    const ids = this.chosenLines().map((l) => l.roomTypeId);
    if (!ids.length || this.nights() <= 0) { this.quote.set(null); return; }
    const seq = ++this.quoteSeq;
    this.quoting.set(true);
    this.api.quote({ roomTypeIds: ids, from: this.from(), to: this.to(), adults: this.adults(), children: this.children(), infants: this.infants() }).subscribe({
      next: (q) => {
        if (seq !== this.quoteSeq) return;
        this.quote.set(q);
        this.quoting.set(false);
        if (!this.planId() || !this.sellableIn(q, this.planId())) this.planId.set(q.plans.find((p) => this.sellableIn(q, p.id))?.id ?? '');
      },
      error: (e) => { if (seq !== this.quoteSeq) return; this.quoting.set(false); this.error.set(e?.error?.message ?? 'The lodge could not price the stay.'); },
    });
  }
  private suiteQuote(planId: string, roomTypeId: string) { return this.quote()?.plans.find((p) => p.id === planId)?.suites?.[roomTypeId] ?? null; }
  private sellableIn(q: Quote, planId: string): boolean {
    const plan = q.plans.find((p) => p.id === planId);
    if (!plan) return false;
    const chosen = this.chosenLines();
    return chosen.length > 0 && chosen.every((l) => { const s = plan.suites?.[l.roomTypeId]; return !!s && s.available !== false && s.grandTotal != null && (s.unitsFree == null || s.unitsFree >= l.units); });
  }
  sellable(planId: string): boolean { const q = this.quote(); return !!q && this.sellableIn(q, planId); }
  private rackSum(planId: string): number | null {
    let sum = 0;
    for (const l of this.chosenLines()) { const s = this.suiteQuote(planId, l.roomTypeId); if (!s || s.grandTotal == null) return null; sum += s.grandTotal * l.units; }
    return this.chosenLines().length ? sum : null;
  }
  private discounted(v: number): number { return Math.round(v * (1 - this.discountPct() / 100) * 100) / 100; }
  /** THE OPERATOR's price, as the rate engine worked it out (engine 0.1.85):
   *  the channel's stack ran to its last rule and this operator's discount
   *  was applied after it. Falls back to the local percentage only if the
   *  engine sent no operator figure. */
  private stoSum(planId: string): number | null {
    let sum = 0;
    let sawEngineFigure = false;
    for (const l of this.chosenLines()) {
      const s = this.suiteQuote(planId, l.roomTypeId);
      if (!s || s.grandTotal == null) return null;
      const mine = s.sto?.grandTotal;
      if (mine != null) { sawEngineFigure = true; sum += mine * l.units; } else sum += this.discounted(s.grandTotal * l.units);
    }
    return sawEngineFigure || this.discountPct() <= 0 ? Math.round(sum * 100) / 100 : Math.round(sum * 100) / 100;
  }
  planTotal(planId: string): string { const sum = this.stoSum(planId); return sum == null ? 'no rate' : money(sum, this.catalog()?.currency); }
  planRack(planId: string): string { const sum = this.rackSum(planId); return sum == null || this.discountPct() <= 0 ? '' : money(sum, this.catalog()?.currency); }
  totalRackText(): string { const p = this.planId(); if (!p || this.discountPct() <= 0) return ''; const sum = this.rackSum(p); return sum == null ? '' : money(sum, this.catalog()?.currency); }
  /** REFUND TERMS ON THE CARD (Dave, 2026-09-06), in the booking site's own
   *  words. Several suites that disagree say so rather than picking one. */
  planRefund(planId: string): string {
    const chosen = this.chosenLines();
    if (!chosen.length) return '';
    const labels = new Set(chosen.map((l) => refundLabel(this.suiteQuote(planId, l.roomTypeId)?.refundable)));
    if (labels.size > 1) return 'Refund terms vary by suite';
    return [...labels][0] ?? '';
  }

  planNote(planId: string): string {
    const cur = this.catalog()?.currency;
    const chosen = this.chosenLines();
    if (chosen.length === 1) {
      const s = this.suiteQuote(planId, chosen[0].roomTypeId);
      if (!s) return 'not priced for this suite';
      if (s.available === false) return s.restricted || 'not sold for this stay';
      return `${money(s.sto?.grandTotal != null ? s.sto.grandTotal * chosen[0].units : this.discounted((s.grandTotal ?? 0) * chosen[0].units), cur)} for ${chosen[0].units > 1 ? chosen[0].units + ' units' : 'the suite'}, VAT in`;
    }
    return chosen.map((l) => { const s = this.suiteQuote(planId, l.roomTypeId); const name = this.suiteOf(l.roomTypeId)?.name ?? l.roomTypeId; if (!s) return `${name}: not priced`; if (s.available === false) return `${name}: ${s.restricted || 'not sold'}`; return `${name}${l.units > 1 ? ` × ${l.units}` : ''} ${money(s.sto?.grandTotal != null ? s.sto.grandTotal * l.units : this.discounted((s.grandTotal ?? 0) * l.units), cur)}`; }).join(' · ');
  }
  unitsFreeText(): string {
    const q = this.quote(); const chosen = this.chosenLines();
    if (!q || !chosen.length) return 'unknown';
    return chosen.map((l) => { const n = this.planId() ? this.suiteQuote(this.planId(), l.roomTypeId)?.unitsFree : null; const name = this.suiteOf(l.roomTypeId)?.name ?? l.roomTypeId; return `${chosen.length > 1 ? name + ' ' : ''}${n == null ? (this.freeFor(l.roomTypeId) ?? 'unknown') : n}`; }).join(' · ');
  }
  suitesText(): string { const chosen = this.chosenLines(); return chosen.length ? chosen.map((l) => `${this.suiteOf(l.roomTypeId)?.name ?? l.roomTypeId}${l.units > 1 ? ` × ${l.units}` : ''}`).join(', ') : '—'; }
  totalText(): string { const sum = this.planId() ? this.stoSum(this.planId()) : null; return sum != null ? money(sum, this.catalog()?.currency) : '—'; }

  private stayInput(): StayInput {
    const guest =
      this.firstName().trim() || this.lastName().trim() || this.email().trim()
        ? {
            firstName: this.firstName().trim(),
            lastName: this.lastName().trim(),
            email: this.email().trim() || null,
            phone: this.phone().trim() || null,
            country: this.country().trim() || null,
            street: this.street().trim() || null,
            apartment: this.apartment().trim() || null,
            city: this.city().trim() || null,
            postCode: this.postCode().trim() || null,
            state: this.state().trim() || null,
          }
        : null;
    return { from: this.from(), to: this.to(), adults: this.adults(), children: this.children(), infants: this.infants(), planId: this.planId(), lines: this.chosenLines().map((l) => ({ roomTypeId: l.roomTypeId, units: l.units })), guest, notes: this.notes().trim() || null };
  }
  hold(): void {
    if (!this.canHold() || this.busy()) return;
    this.busy.set('hold'); this.error.set('');
    this.api.createHold(this.stayInput()).subscribe({
      next: (h) => { this.busy.set(''); void this.router.navigate(['/holds'], { queryParams: { open: h.id } }); },
      error: (e) => { this.busy.set(''); this.error.set(e?.error?.message ?? 'The hold could not be taken.'); this.requote(); },
    });
  }
  book(): void {
    if (!this.canBook() || this.busy()) return;
    this.busy.set('book'); this.error.set('');
    this.api.createBooking(this.stayInput()).subscribe({
      next: (b) => { this.busy.set(''); void this.router.navigate(['/bookings'], { queryParams: { open: b.id } }); },
      error: (e) => { this.busy.set(''); this.error.set(e?.error?.message ?? 'The booking could not be made.'); this.requote(); },
    });
  }

  // ---- the availability + rates calendar ----
  /** The "i" on a rate card: the plan's own inclusion list, with whatever the
   *  rules that priced THIS stay added to it or took off it. */
  openInclusions(planId: string): void {
    const plan = this.quote()?.plans.find((p) => p.id === planId);
    if (!plan) return;
    const chosen = this.chosenLines();
    const lines = chosen.length ? chosen : this.lines().filter((l) => !!l.roomTypeId);
    this.incOpen.set({
      planName: plan.name,
      suites: lines.map((l) => {
        const s = plan.suites?.[l.roomTypeId];
        const off = new Set((s?.inclusionsRemoved ?? []).map((t) => t.toLowerCase()));
        const included: string[] = [];
        const seen = new Set<string>();
        for (const t of [...(plan.included ?? []), ...(s?.inclusionsAdded ?? [])]) {
          const k = t.toLowerCase();
          if (off.has(k) || seen.has(k)) continue;
          seen.add(k);
          included.push(t);
        }
        const excluded: string[] = [];
        const gone = new Set<string>();
        for (const t of [...(plan.excluded ?? []), ...(s?.inclusionsRemoved ?? [])]) {
          const k = t.toLowerCase();
          if (gone.has(k)) continue;
          gone.add(k);
          excluded.push(t);
        }
        return { roomTypeId: l.roomTypeId, name: this.suiteOf(l.roomTypeId)?.name ?? l.roomTypeId, included, excluded };
      }),
    });
  }

  /** Escape closes whichever modal is open, innermost first. */
  onEscape(): void {
    if (this.incOpen()) { this.incOpen.set(null); return; }
    this.closeCalendar();
  }

  openCalendar(roomTypeId: string): void { if (!roomTypeId || this.nights() <= 0) return; this.calOpen.set({ roomTypeId, month: this.centredMonth() }); this.loadCalendar(); }
  closeCalendar(): void { this.calOpen.set(null); this.calData.set(null); this.calError.set(''); this.calPick.set(''); this.calHover.set(''); }
  /**
   * CLICK THE STAY OUT ON THE CALENDAR (Dave, 2026-09-06: "allow the user to
   * adjust the search date by clicking on a day moving to another day and
   * clicking again"). The cells are NIGHTS, so the two clicks are the first
   * and the last night — check-out is the morning after the last one, and
   * clicking the same night twice is a one-night stay. Either order works.
   */
  pickDay(c: CalCell): void {
    if (c.past) return;
    const first = this.calPick();
    if (!first) { this.calPick.set(c.date); this.calHover.set(c.date); return; }
    const lo = first <= c.date ? first : c.date;
    const hi = first <= c.date ? c.date : first;
    this.calPick.set(''); this.calHover.set('');
    this.from.set(lo);
    this.to.set(plusDays(hi, 1));
    this.requote();
  }
  shiftCalendar(by: number): void { const cal = this.calOpen(); if (!cal) return; this.calOpen.set({ ...cal, month: addMonths(cal.month, by) }); this.loadCalendar(); }
  private centredMonth(): string {
    const from = this.from();
    const mid = (Date.parse(`${from}T00:00:00Z`) + Date.parse(`${this.to()}T00:00:00Z`)) / 2;
    const m = from.slice(0, 7);
    const centreOf = (first: string) => (Date.parse(`${first}-01T00:00:00Z`) + Date.parse(`${addMonths(first, 2)}-01T00:00:00Z`)) / 2;
    const prev = addMonths(m, -1);
    return Math.abs(centreOf(prev) - mid) < Math.abs(centreOf(m) - mid) ? prev : m;
  }
  private loadCalendar(): void {
    const cal = this.calOpen();
    if (!cal) return;
    const seq = ++this.calSeq;
    this.calLoading.set(true); this.calError.set('');
    this.api.calendar({ roomTypeId: cal.roomTypeId, from: `${cal.month}-01`, to: `${addMonths(cal.month, 2)}-01`, adults: this.adults(), children: this.children(), infants: this.infants() }).subscribe({
      next: (c) => { if (seq !== this.calSeq) return; this.calData.set(c); this.calLoading.set(false); },
      error: (e) => { if (seq !== this.calSeq) return; this.calLoading.set(false); this.calError.set(e?.error?.message ?? 'The calendar could not be loaded.'); },
    });
  }
  calPlanName(): string { const id = this.planId(); return id ? (this.calData()?.plans.find((p) => p.id === id)?.name ?? this.quote()?.plans.find((p) => p.id === id)?.name ?? '') : ''; }
  calRangeLabel(): string { const cal = this.calOpen(); return cal ? `${monthLabel(cal.month)} – ${monthLabel(addMonths(cal.month, 1))}` : ''; }
  calMonths(): { key: string; label: string; cells: (CalCell | null)[] }[] {
    const cal = this.calOpen();
    if (!cal) return [];
    const data = this.calData(), today = iso(new Date()), from = this.from(), to = this.to(), planId = this.planId();
    const currency = data?.currency || this.catalog()?.currency || 'ZAR';
    // The provisional range while the stay is being clicked out: the first
    // night and wherever the pointer is, in either order.
    const pick = this.calPick(), over = this.calHover() || pick;
    const pickLo = pick ? (pick <= over ? pick : over) : '';
    const pickHi = pick ? (pick <= over ? over : pick) : '';
    return [cal.month, addMonths(cal.month, 1)].map((m) => {
      const first = new Date(`${m}-01T00:00:00Z`);
      const lead = (first.getUTCDay() + 6) % 7;
      const cells: (CalCell | null)[] = Array.from({ length: lead }, () => null);
      const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let n = 1; n <= days; n++) {
        const date = `${m}-${String(n).padStart(2, '0')}`;
        const day = data?.days?.[date] ?? null;
        // The figure the server sends IS this operator's — the rate engine
        // applied the discount after the channel's last rule. Discounting it
        // again here would take it off twice.
        const rate = day ? (planId && day.rates[planId] != null ? day.rates[planId] : day.cheapest) : null;
        const rackRate = day?.rack ?? null;
        const inPick = !!pickLo && date >= pickLo && date <= pickHi;
        cells.push({ date, num: n, day, stay: date >= from && date < to, past: date < today, pick: inPick, pickStart: date === pick, rate: rate != null ? calMoney(rate, currency) : day ? '—' : '', rack: rackRate != null && rate != null && rackRate > rate ? calMoney(rackRate, currency) : '', freeText: day ? (day.free == null ? 'not known' : day.free === 0 ? 'none free' : `${day.free} free`) : '', title: day ? `${date}: ${day.free == null ? 'availability not known' : day.free + ' unit(s) free'}${rate != null ? ', ' + money(rate, currency) + ' per night for you' : ''}` : date });
      }
      while (cells.length % 7) cells.push(null);
      return { key: m, label: monthLabel(m), cells };
    });
  }
}
