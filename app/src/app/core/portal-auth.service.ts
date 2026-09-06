import { Injectable, computed, signal } from '@angular/core';

export interface PortalUser { id: string; stoId: string; name: string; email: string; phone: string | null; }
export interface PortalCompany {
  id: string;
  name: string;
  code: string | null;
  discountPct: number;
  holdHours: number;
  /** The operator's own logo as a data: URL (Lodge Ops migration 395), shown
   *  in the command bar in place of the 7 Star mark. Null = not set. */
  logo?: string | null;
}

const KEY = 'sto_session';

/** The signed-in STO user: the token Lodge Ops issued (kept in localStorage), who they are and which company. */
@Injectable({ providedIn: 'root' })
export class PortalAuthService {
  private readonly _session = signal<{ token: string; user: PortalUser; company: PortalCompany; expiresAt: string } | null>(this.read());
  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly company = computed(() => this._session()?.company ?? null);
  readonly signedIn = computed(() => {
    const s = this._session();
    return !!s && Date.parse(s.expiresAt) > Date.now();
  });

  get token(): string | null {
    return this._session()?.token ?? null;
  }

  private read(): { token: string; user: PortalUser; company: PortalCompany; expiresAt: string } | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  set(s: { token: string; user: PortalUser; company: PortalCompany; expiresAt: string }): void {
    this._session.set(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine */ }
  }

  update(patch: { user?: PortalUser; company?: PortalCompany }): void {
    const s = this._session();
    if (s) this.set({ ...s, ...patch });
  }

  clear(): void {
    this._session.set(null);
    try { localStorage.removeItem(KEY); } catch { /* fine */ }
  }
}
