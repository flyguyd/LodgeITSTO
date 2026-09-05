/** The house slide-out chrome for the portal's hold and booking detail. */
export const DETAIL_STYLES = `
  .sd-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1300; }
  .sd-panel { position: fixed; top: 0; right: 0; z-index: 1301; width: min(560px, 100vw); height: 100vh; overflow-y: auto; background: var(--oa-surface); border-left: 1px solid var(--oa-border); box-shadow: -14px 0 40px rgba(0, 0, 0, 0.45); padding: 18px 20px 60px; box-sizing: border-box; }
  .sd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .sd-head h2 { margin: 2px 0 4px; font-size: 22px; letter-spacing: 0.02em; }
  .sd-kicker { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--oa-text-dim); }
  .sd-close { border: 0; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; color: var(--oa-text-dim); }
  .sd-pill { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid var(--oa-border); border-radius: 999px; padding: 2px 10px; }
  .sd-pill.ok { color: var(--oa-success); border-color: var(--oa-success); }
  .sd-pill.bad { color: var(--oa-danger); border-color: var(--oa-danger); }
  .sd-pill.busy { color: #705003; border-color: #705003; }
  .sd-clock { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; margin-bottom: 12px; border: 1px solid #c8a45f; border-radius: 10px; background: #fbf5e6; }
  .sd-clock strong { font-size: 24px; font-variant-numeric: tabular-nums; }
  .sd-meta { display: grid; grid-template-columns: 140px 1fr; gap: 6px 14px; margin: 0 0 14px; font-size: 13.5px; }
  .sd-meta dt { color: var(--oa-text-dim); } .sd-meta dd { margin: 0; }
  .sd-suite { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--oa-border); font-size: 13.5px; }
  .sd-total { display: flex; justify-content: space-between; padding: 8px 0; font-weight: 650; }
  .sd-dim { color: var(--oa-text-dim); font-size: 12.5px; }
  .sd-strike { text-decoration: line-through; color: var(--oa-text-dim); }
  .sd-err { color: var(--oa-danger); font-size: 13.5px; }
  .sd-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .sd-form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px; border: 1px solid var(--oa-border); border-radius: 10px; background: var(--oa-surface-2); }
  .sd-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .sd-field { display: flex; flex-direction: column; gap: 3px; flex: 1 1 140px; }
  .sd-field span { font-size: 12px; color: var(--oa-text-dim); font-weight: 600; }
  .sd-field .oa-input { width: 100%; box-sizing: border-box; }
  h3 { margin: 12px 0 6px; font-size: 13.5px; }
`;
