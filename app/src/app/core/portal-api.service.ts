import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
export interface QuoteSuite {
  available?: boolean;
  restricted?: string | null;
  /** The CHANNEL's own (rack) figure. */
  grandTotal?: number | null;
  rateTotal?: number | null;
  vatTotal?: number | null;
  unitsFree?: number | null;
  sto?: QuoteSto | null;
}
export interface Quote {
  plans: { id: string; name: string; suites: Record<string, QuoteSuite> }[];
  sto?: { applied: boolean; discountPct: number };
}
export interface CalendarDay { free: number | null; rates: Record<string, number | null>; cheapest: number | null; rack?: number | null; closedToArrival: boolean; }
export interface SuiteCalendar { ok: boolean; roomTypeId: string; from: string; to: string; currency: string; plans: { id: string; name: string }[]; days: Record<string, CalendarDay>; }
export interface StayInput {
  from: string; to: string; adults: number; children: number; infants: number; planId: string;
  lines: { roomTypeId: string; units: number }[];
  guest?: { firstName: string; lastName: string; email: string | null; phone: string | null; country: string | null } | null;
  notes?: string | null;
}
export interface SuiteLine { roomTypeId: string; name: string; units: number; planId: string | null; planName: string | null; rackTotal: number | null; total: number | null; reservationId?: string | null; engineReference?: string | null; }
export interface Guest { firstName: string; lastName: string; email: string | null; phone: string | null; country: string | null; }
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
export interface Summary {
  logins: number; searches: number;
  holds: { count: number; value: number; cancelled: number; expired: number; converted: number; open: number; openValue: number };
  bookings: { count: number; value: number; cancelled: number; live: number; liveValue: number; discountGiven: number; nights: number };
  upcoming: Booking[];
}

export function money(v: number | null | undefined, currency?: string | null): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const s = Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (currency === 'ZAR' || !currency ? 'R' : currency + ' ') + s;
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
  catalog(): Observable<Catalog> { return this.http.get<Catalog>('/api/lo/catalog'); }
  availability(from: string, to: string): Observable<{ suites: Record<string, number | null> }> { return this.http.get<{ suites: Record<string, number | null> }>('/api/engine/availability', { params: this.params({ from, to }) }); }
  quote(body: { roomTypeIds: string[]; from: string; to: string; adults: number; children: number; infants: number }): Observable<Quote> { return this.http.post<Quote>('/api/engine/quote', body); }
  calendar(q: { roomTypeId: string; from: string; to: string; adults: number; children: number; infants: number }): Observable<SuiteCalendar> { return this.http.get<SuiteCalendar>('/api/engine/calendar', { params: this.params(q) }); }
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
