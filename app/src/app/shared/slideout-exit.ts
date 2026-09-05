// Copied from Lodge Ops (frontend/src/app/shared) when the STO portal became its own
// repo (2026-09-05). Keep in step by hand; the portal must build without Lodge Ops.
import { signal } from '@angular/core';

/**
 * How long a slide-out's closing animation runs. MUST stay in step with
 * `.oa-slideout.oa-closing` in styles.scss — the panel is torn out of the DOM
 * when this elapses, so a longer CSS animation would simply be cut off.
 */
export const SLIDEOUT_EXIT_MS = 260;

/**
 * The "closing" half of the slide-out motion.
 *
 * A slide-out is opened by its parent (`@if (openId()) { <app-x-slideout /> }`),
 * which means the panel is DESTROYED the instant it closes — there is nothing
 * left on screen to animate. So closing has to run the other way round: mark
 * the panel as closing, let CSS fly it out, and only then tell the parent.
 *
 * Every slide-out holds one of these as `oaExit`, binds
 * `[class.oa-closing]="oaExit.closing()"` on its panel and backdrop, and routes
 * its close through `emit()` / `run()`. The motion itself lives in styles.scss
 * so the whole app moves the same way.
 *
 * Deliberately a plain class rather than a service: it is per-panel state, not
 * per-application, and a slide-out that is opened twice must start each time
 * from a clean sheet.
 */
export class SlideoutExit {
  /** True while the exit animation is playing. */
  readonly closing = signal(false);

  /**
   * Play the closing animation, then run `done` (the real close). Repeat calls
   * while it is already closing are ignored — a double-click on the X must not
   * start a second timer, and clicking the backdrop mid-flight should not
   * shorten the animation.
   */
  run(done: () => void): void {
    if (this.closing()) return;
    if (prefersReducedMotion()) {
      done();
      return;
    }
    this.closing.set(true);
    setTimeout(() => {
      done();
      // Back to rest AFTER the parent has had its change-detection pass and
      // removed the panel, so a slide-out whose component instance survives
      // its own close (the ones held open by a service) does not re-open
      // wearing the closing class. A macrotask lands after that pass; a
      // microtask would not.
      setTimeout(() => this.closing.set(false), 0);
    }, SLIDEOUT_EXIT_MS);
  }

  /** `run()` for the common case: a `closed` output with nothing else to do. */
  emit(out: { emit: (value: void) => void }): void {
    this.run(() => {
      try {
        out.emit();
      } catch {
        // The panel was torn down some other way while the animation played.
      }
    });
  }
}

/** Somebody who has asked their machine to stop moving things gets no animation. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
