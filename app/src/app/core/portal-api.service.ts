import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PortalCompany, PortalUser } from './portal-auth.service';

export interface Catalog {
  currency: string;
  suites: { id: string; name: string; maxTotalGuests: number | null; maxAdults: number | null; roomCount: number; unitsTotal: number | null }[];
  plans: { id: string; name: string }[];
  discountPct: number;
  holdHours: number;
  company: { id: string; name: string };
}
/** What THIS operator pays for a suite, worked out by the rate engine after
 *  the channel's last rule (engine 0.1.85). Absent when the engine did not
 *  honour a key, in which case the rack figures are all there is. */
export interface QuoteSto {
  discountPct: number;
  rateTotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
}
/** WHAT COMES BACK IF THE BOOKING IS CANCELLED — the policy a channel rule
 *  set for this stay (engine 0.1.45; fees and date changes 2026-09-02). */
export interface RefundPolicy {
  policy: string;
  nightsBefore?: number | null;
  refundPct?: number;
  processingFee?: number;
  allowDateChanges?: boolean;
  changeFee?: number;
}
export interface QuoteSuite {
  available?: boolean;
  restricted?: string | null;
  /** The CHANNEL's own (rack) figure. */
  grandTotal?: number | null;
  rateTotal?: number | null;
  vatTotal?: number | null;
  unitsFree?: number | null;
  sto?: QuoteSto | null;
  /** What the rules that priced THIS stay put on the rate, or took off it. */
  inclusionsAdded?: string[];
  inclusionsRemoved?: string[];
  refundable?: RefundPolicy | null;
}
export interface Quote {
  /** `included`/`excluded` are the plan's own words from Lodge Ops; the
   *  suite's inclusionsAdded/Removed are applied on top (Dave, 2026-09-06). */
  plans: { id: string; name: string; included?: string[]; excluded?: string[]; suites: Record<string, QuoteSuite> }[];
  sto?: { applied: boolean; discountPct: number };
}
export interface CalendarDay { free: number | null; rates: Record<string, number | null>; cheapest: number | null; rack?: number | null; closedToArrival: boolean; }
export interface SuiteCalendar { ok: boolean; roomTypeId: string; from: string; to: string; currency: string; plans: { id: string; name: string }[]; days: Record<string, CalendarDay>; }
export interface StayInput {
  from: string; to: string; adults: number; children: number; infants: number; planId: string;
  lines: { roomTypeId: string; units: number }[];
  guest?: Guest | null;
  notes?: string | null;
}
export interface SuiteLine { roomTypeId: string; name: string; units: number; planId: string | null; planName: string | null; rackTotal: number | null; total: number | null; reservationId?: string | null; engineReference?: string | null; }
/** The guest, with the FULL address the staff New booking page collects
 *  (Dave, 2026-09-06) — the address fields are optional so an older hold
 *  read back without them still type-checks. */
export interface Guest {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  street?: string | null;
  apartment?: string | null;
  city?: string | null;
  postCode?: string | null;
  state?: string | null;
}
export interface Hold {
  id: string; reference: string; status: string; from: string; to: string; nights: number; adults: number; children: number; infants: number;
  suites: SuiteLine[]; guest: Guest | null; currency: string; rackTotal: number | null; discountPct: number; total: number | null;
  holdUntil: string; active: boolean; notes: string | null; bookingId: string | null; cancelReason: string | null; cancelledAt: string | null; cancelledBy: string | null; createdAt: string; userName: string | null;
}
export interface Booking {
  id: string; reference: string; status: string; from: string; to: string; nights: number; adults: number; children: number; infants: number;
  suites: SuiteLine[]; guest: Guest | null; currency: string; rackTotal: number | null; discountPct: number; total: number | null;
  holdId: string | null; notes: string | null; cancelReason: string | null; cancelledAt: string | null; cancelledBy: string | null; createdAt: string; updatedAt: string; userName: string | null;
}
export interface Price { from: string; to: string; nights: number; currency: string; planId: string; planName: string; discountPct: number; lines: (SuiteLine & { unitsFree: number | null; available: boolean })[]; rackTotal: number; total: number; available: boolean; }
/** "Chat with 7 Star" (Dave, 2026-09-06): the agent's view of their thread with the lodge's desk — the same shape the website's chat panel reads. */
export interface ChatMessage { id: string; from: 'visitor' | 'staff'; senderLabel: string; body: string; createdAt: string }
export interface ChatView {
  conversationId: string;
  token: string;
  status: 'open' | 'closed';
  claimed: boolean;
  answeredBy: string | null;
  answeredByAvatar: string | null;
  answeredByInitials: string | null;
  agentsOnline: number;
  staffTyping: boolean;
  messages: ChatMessage[];
}

export interface Summary {
  logins: number; searches: number;
  holds: { count: number; value: number; cancelled: number; expired: number; converted: number; open: number; openValue: number };
  bookings: { count: number; value: number; cancelled: number; cancelledValue: number; live: number; liveValue: number; discountGiven: number; liveRackValue: number; nights: number; roomNights: number; guests: number };
  upcoming: Booking[];
}

/** THE HEAT MAP (Dave, 2026-09-06): units free per day across every suite the
 *  channel sells. How many units the lodge HAS comes from the catalogue. */
export interface Heatmap {
  ok: boolean;
  from: string;
  to: string;
  suites: string[];
  days: Record<string, { free: number | null }>;
}

export function money(v: number | null | undefined, currency?: string | null): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const s = Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (currency === 'ZAR' || !currency ? 'R' : currency + ' ') + s;
}
/** "Fully refundable up to 7 nights before check-in, less a R250 processing
 *  fee. Date changes allowed after that for a R100 change fee" — the same
 *  sentence Lodge Ops and the booking site write, so nobody reads different
 *  terms for the same rate. Empty when no rule set a policy. */
export function refundLabel(r: RefundPolicy | null | undefined): string {
  if (!r || !r.policy) return '';
  const fee = Number(r.processingFee);
  const changeFee = Number(r.changeFee);
  const changes =
    r.allowDateChanges === true
      ? 'Date changes allowed after that' + (Number.isFinite(changeFee) && changeFee > 0 ? ` for a ${money(changeFee, 'ZAR')} change fee` : ' at no charge')
      : '';
  if (r.policy === 'nonrefundable') {
    return 'Nonrefundable' + (changes ? '. ' + changes.replace('after that', '').replace(/\s+/g, ' ').trim() : '');
  }
  const pct = Number(r.refundPct);
  const name =
    r.policy === 'partial'
      ? 'Partially refundable' + (Number.isFinite(pct) && pct >= 1 ? ` (${pct}% refunded)` : '')
      : 'Fully refundable';
  const n = Number(r.nightsBefore);
  let out = !Number.isFinite(n) || n < 0 ? name : `${name} up to ${n} night${n === 1 ? '' : 's'} before check-in`;
  if (Number.isFinite(fee) && fee > 0) out += `, less a ${money(fee, 'ZAR')} processing fee`;
  if (changes) out += '. ' + changes;
  return out;
}

export const STATUS_LABELS: Record<string, string> = { held: 'Held', converted: 'Became a booking', cancelled: 'Cancelled', expired: 'Ran out', provisional: 'Provisional', confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', no_show: 'No show' };

/** Everything the portal app asks its own server for. */
@Injectable({ providedIn: 'root' })
export class PortalApiService {
  private readonly http = inject(HttpClient);

  private params(o: Record<string, string | number | null | undefined>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p = p.set(k, String(v));
    return p;
  }

  login(email: string, password: string): Observable<{ ok: true; token: string; user: PortalUser; company: PortalCompany; expiresAt: string } | { ok: false; message: string }> {
    return this.http.post<{ ok: true; token: string; user: PortalUser; company: PortalCompany; expiresAt: string } | { ok: false; message: string }>('/api/auth/login', { email, password });
  }
  me(): Observable<{ user: PortalUser; company: PortalCompany }> { return this.http.get<{ user: PortalUser; company: PortalCompany }>('/api/lo/me'); }
  changePassword(current: string, next: string): Observable<{ ok: boolean; message?: string }> { return this.http.post<{ ok: boolean; message?: string }>('/api/lo/me/password', { current, next }); }
  summary(): Observable<Summary> { return this.http.get<Summary>('/api/lo/summary'); }
  // ---- Chat with 7 Star ----
  chatStart(): Observable<ChatView> { return this.http.post<ChatView>('/api/lo/chat/start', {}); }
  chatSend(token: string, body: string): Observable<ChatView> { return this.http.post<ChatView>('/api/lo/chat/send', { token, body }); }
  chatPoll(token: string, since?: string | null): Observable<ChatView> { return this.http.post<ChatView>('/api/lo/chat/poll', since ? { token, since } : { token }); }
  chatTyping(token: string, typing: boolean): Observable<{ ok: true }> { return this.http.post<{ ok: true }>('/api/lo/chat/typing', { token, typing }); }
  chatClose(token: string): Observable<{ ok: true }> { return this.http.post<{ ok: true }>('/api/lo/chat/close', { token }); }
  catalog(): Observable<Catalog> { return this.http.get<Catalog>('/api/lo/catalog'); }
  availability(from: string, to: string): Observable<{ suites: Record<string, number | null> }> { return this.http.get<{ suites: Record<string, number | null> }>('/api/engine/availability', { params: this.params({ from, to }) }); }
  quote(body: { roomTypeIds: string[]; from: string; to: string; adults: number; children: number; infants: number }): Observable<Quote> { return this.http.post<Quote>('/api/engine/quote', body); }
  calendar(q: { roomTypeId: string; from: string; to: string; adults: number; children: number; infants: number }): Observable<SuiteCalendar> { return this.http.get<SuiteCalendar>('/api/engine/calendar', { params: this.params(q) }); }
  /** THE GUEST BOOKING INFORMATION SHEET (Dave, 2026-09-06) as a PDF. Fetched
   *  through HttpClient rather than linked with an <a href> because the relay
   *  wants the session's Bearer token, which only the interceptor can add. */
  sheet(kind: 'hold' | 'booking', id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/api/lo/${kind === 'hold' ? 'holds' : 'bookings'}/${id}/sheet`, { observe: 'response', responseType: 'blob' });
  }

  /** THE OPERATOR'S OWN LOGO (Dave, 2026-09-06), set from the avatar in the
   *  command bar. An empty string clears it and puts the 7 Star mark back. */
  setLogo(logo: string): Observable<{ ok: true; logo: string | null }> {
    return this.http.post<{ ok: true; logo: string | null }>('/api/lo/me/logo', { logo });
  }

  heatmap(from: string, to: string): Observable<Heatmap> { return this.http.get<Heatmap>('/api/engine/heatmap', { params: this.params({ from, to }) }); }
  price(body: StayInput): Observable<Price> { return this.http.post<Price>('/api/lo/price', body); }
  holds(q: { page: number; pageSize: number; sort: string; dir: string; q?: string; status?: string }): Observable<{ rows: Hold[]; total: number }> { return this.http.get<{ rows: Hold[]; total: number }>('/api/lo/holds', { params: this.params(q) }); }
  hold(id: string): Observable<Hold> { return this.http.get<Hold>(`/api/lo/holds/${encodeURIComponent(id)}`); }
  createHold(body: StayInput): Observable<Hold> { return this.http.post<Hold>('/api/lo/holds', body); }
  cancelHold(id: string, reason: string | null): Observable<Hold> { return this.http.post<Hold>(`/api/lo/holds/${encodeURIComponent(id)}/cancel`, { reason }); }
  convertHold(id: string, body: { guest?: Guest | null; notes?: string | null }): Observable<Booking> { return this.http.post<Booking>(`/api/lo/holds/${encodeURIComponent(id)}/convert`, body); }
  bookings(q: { page: number; pageSize: number; sort: string; dir: string; q?: string; status?: string }): Observable<{ rows: Booking[]; total: number }> { return this.http.get<{ rows: Booking[]; total: number }>('/api/lo/bookings', { params: this.params(q) }); }
  booking(id: string): Observable<Booking> { return this.http.get<Booking>(`/api/lo/bookings/${encodeURIComponent(id)}`); }
  createBooking(body: StayInput): Observable<Booking> { return this.http.post<Booking>('/api/lo/bookings', body); }
  cancelBooking(id: string, reason: string | null): Observable<Booking> { return this.http.post<Booking>(`/api/lo/bookings/${encodeURIComponent(id)}/cancel`, { reason }); }
}
