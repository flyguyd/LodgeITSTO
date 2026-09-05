/** The shared look of the portal's grid pages (holds, bookings). Its own file: a const read by a decorator must be declared BEFORE the class (TDZ). */
export const GRID_PAGE_STYLES = `
  .gp-page { width: 95%; max-width: none; margin: 0 auto; padding: 24px 0 60px; }
  .gp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
  .gp-head h1 { margin: 0; font-size: 22px; font-weight: 650; }
  .gp-dim { color: var(--oa-text-dim); font-size: 12.5px; margin: 4px 0 0; }
  .gp-bar { display: flex; gap: 10px; margin-bottom: 10px; }
  .gp-filter { width: auto; }
  .gp-ref { font-weight: 600; letter-spacing: 0.02em; }
  .gp-num { font-variant-numeric: tabular-nums; }
  .gp-ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gp-pill { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid var(--oa-border); border-radius: 999px; padding: 2px 10px; }
  .gp-pill.ok { color: var(--oa-success); border-color: var(--oa-success); }
  .gp-pill.bad { color: var(--oa-danger); border-color: var(--oa-danger); }
  .gp-pill.busy { color: #705003; border-color: #705003; }
`;
