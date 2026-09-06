import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortalAuthService } from '../core/portal-auth.service';

interface HelpSection { id: string; title: string }

/**
 * THE USER GUIDE, BUILT IN (Dave, 2026-09-06: "write a full set of user
 * documentation for the STO site and include it in the build with a link on
 * the command bar"). Plain, complete, and written for the operator's agent
 * rather than the lodge — every page, every button, and what happens on the
 * lodge's side when it is pressed. It ships inside the app so it can never be
 * a version behind the portal it describes.
 */
@Component({
  selector: 'sto-help',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="hp-page">
      <nav class="hp-toc" aria-label="Contents">
        <b>User guide</b>
        @for (s of sections; track s.id) {
          <a [href]="'#' + s.id" [class.on]="current() === s.id" (click)="jump($event, s.id)">{{ s.title }}</a>
        }
      </nav>
      <article class="hp-doc">
        <header class="hp-head">
          <h1>The STO portal — user guide</h1>
          <p class="hp-dim">For agents of {{ auth.company()?.name || 'a specialist tour operator' }} booking Oase by 7 Star Lodges. Everything here is what the portal does today; the lodge's reservations desk is a click away under <b>Chat with 7 Star</b> if a question is not answered below.</p>
        </header>

        <section id="start" class="hp-sec">
          <h2>1. Getting started</h2>
          <p>The portal is your operator's own window onto the lodge's diary. It shows what is free, prices every stay at <b>your operator's contracted rate</b>, and lets you hold or book suites directly on the lodge's booking engine — the same engine the lodge's own website sells from, so what you see is what the lodge sees.</p>
          <h3>Signing in</h3>
          <ul>
            <li>The lodge creates your account and sends your e-mail address and first password. There is no self-registration — ask the lodge if you need an account.</li>
            <li>Sign in with that e-mail and password. A wrong password says so and lets you try again; <b>eight wrong passwords in a row lock the account for a while</b>.</li>
            <li>Your session lasts for the number of hours the lodge sets (typically a working day) and then asks you to sign in again. Signing out from the <b>Sign out</b> button ends it at once.</li>
            <li>If the lodge deactivates your account or your operator, the portal signs you out immediately and will not sign you in again until it is reactivated.</li>
          </ul>
          <h3>The command bar</h3>
          <p>The bar pinned to the top of every page carries, left to right:</p>
          <ul>
            <li><b>Your operator's logo</b> (or the 7 Star mark until one is set) — click it to set or change the logo; see <a href="#account" (click)="jump($event, 'account')">Your account</a>.</li>
            <li><b>Home · New booking · Holds · Bookings</b> — the four pages.</li>
            <li><b>Find a reference or guest…</b> — type a booking or hold reference, or a guest's name, and press Enter to search your bookings.</li>
            <li>Your local time, your operator's name, your name and your contracted discount.</li>
            <li><b>Chat with 7 Star</b>, <b>Help</b> (this guide), <b>Account</b> and <b>Sign out</b>.</li>
          </ul>
        </section>

        <section id="home" class="hp-sec">
          <h2>2. Home</h2>
          <p>Your operator's dashboard.</p>
          <ul>
            <li><b>Nights booked</b> — the room nights on your live bookings (one per suite per night) with the guests booked beside it.</li>
            <li><b>Revenue booked</b> — what your live bookings add up to at your rate, with the lodge's published figure and anything cancelled shown beside it.</li>
            <li><b>Suite availability</b> — a two-month heat map, this month and the next. Each day is shaded by how much of the lodge is still free: pale is wide open, deep gold is full. Use <b>‹ ›</b>, the month picker or <b>Today</b> to move around.</li>
            <li><b>Click two days on the heat map</b> — the earlier is the check-in, the later the check-out — and a card offers <b>Create a booking for these dates</b>, which opens New booking with the stay already filled in. <b>Pick again</b> clears the choice.</li>
            <li><b>Next arrivals</b> — your next five bookings by check-in date.</li>
          </ul>
        </section>

        <section id="new" class="hp-sec">
          <h2>3. New booking</h2>
          <p>One page takes a stay from dates to a hold or a booking. Work down it in order; the price updates as you go.</p>
          <h3>The stay</h3>
          <ul>
            <li>Enter <b>Check-in</b> and <b>Check-out</b>, or Check-in and the number of <b>Nights</b> — changing either keeps the other in step.</li>
            <li><b>Adults</b>, <b>Children</b> and <b>Infants</b> are <b>per suite</b>: a party of two adults in each of two suites is entered as 2 adults with 2 units, not 4 adults.</li>
          </ul>
          <h3>The suites</h3>
          <ul>
            <li>Choose a suite and how many <b>Units</b> of it you need. <b>+ Add another suite</b> adds a second line for a party spread over different suite types.</li>
            <li>The <b>calendar button</b> beside a suite opens its availability and rates: every night shows the units free and your rate, with the lodge's published rate struck through beneath. Click a night to set the check-in, click a later night to set the check-out — the calendar closes by itself once both are set. Sold-out nights cannot be picked.</li>
            <li>A suite that cannot take the party you entered (over its maximum guests) is marked as such and will not price.</li>
          </ul>
          <h3>The rate</h3>
          <ul>
            <li>The rate card is your operator's channel: the large figure is <b>your price</b>, the struck-through figure beneath is the lodge's published rate with the percentage off. The same pairing appears in the calendar and on the summary.</li>
            <li>The <b>ⓘ</b> on the card lists what the rate includes and excludes for this stay.</li>
            <li>If the card says the lodge has not finished setting the portal up, no channel has been assigned to your operator yet — ask the lodge.</li>
          </ul>
          <h3>The guest</h3>
          <ul>
            <li>First name, last name, e-mail, phone and country are required; the address lines are optional. The <b>Country</b> is a dropdown with its flag beside it.</li>
            <li><b>Notes for the lodge</b> reach the reservations desk with the booking — dietary needs, arrival times, anything the lodge should know.</li>
          </ul>
          <h3>Hold or book</h3>
          <ul>
            <li><b>Hold for N hours</b> takes the suites off the lodge's diary for your operator's hold period (the number of hours is set by the lodge) without committing the guest. Use it while you confirm with your client.</li>
            <li><b>Book now</b> makes the booking. It is <b>provisional</b> until the lodge confirms it — see <a href="#bookings" (click)="jump($event, 'bookings')">Bookings</a>.</li>
            <li>Both create a <b>Guest booking information</b> sheet (a one-page PDF for the guest, at the published rate, never your discounted one) and, if your operator has notifications switched on, e-mail you a confirmation.</li>
          </ul>
        </section>

        <section id="holds" class="hp-sec">
          <h2>4. Holds</h2>
          <p>Every hold your operator has taken, newest first. The status filter narrows to <b>Open</b>, <b>Became bookings</b>, <b>Cancelled</b> or <b>Ran out</b>; the grid can be sorted by any column and searched from its header.</p>
          <ul>
            <li>An <b>open hold</b> shows the time it has left. When the clock runs out the nights go back on sale automatically and the hold is marked <b>Ran out</b>.</li>
            <li>Click a hold to open it. From there: <b>Make the booking</b> turns the hold into a booking (you may correct the guest's details first); <b>Cancel the hold</b> releases the nights at once — a reason is required; <b>Guest booking information (PDF)</b> downloads the sheet.</li>
            <li>A hold that became a booking links straight to that booking.</li>
            <li>If notifications are switched on for your operator, you are e-mailed when a hold is taken, when it has 24 hours and 6 hours left, and when it runs out.</li>
          </ul>
        </section>

        <section id="bookings" class="hp-sec">
          <h2>5. Bookings</h2>
          <p>Every booking your operator has made. The status filter offers <b>Live</b>, <b>Provisional</b>, <b>Confirmed</b> and <b>Cancelled</b>; the search box on the command bar lands here too.</p>
          <ul>
            <li>A new booking is <b>Provisional</b> until the lodge's desk confirms it, then <b>Confirmed</b>; later the lodge marks it checked in and out.</li>
            <li>Click a booking to see the stay, the suites, the party, the guest and the money — your total and the published total. <b>Guest booking information (PDF)</b> downloads the sheet the guest can be sent.</li>
            <li><b>Cancel the booking</b> cancels it on the lodge's diary and puts the nights back on sale. Cancellation terms are the ones on the rate card at the time of booking.</li>
            <li>With notifications on, you are e-mailed when the booking is made and at the reminders the lodge has chosen (a week before, the day before, on check-in, on check-out).</li>
          </ul>
        </section>

        <section id="chat" class="hp-sec">
          <h2>6. Chat with 7 Star</h2>
          <p>The reservations desk, live, from the command bar.</p>
          <ul>
            <li>Press <b>Chat with 7 Star</b>. The panel opens bottom-right and introduces you to the desk automatically: your operator's name, the nights you have booked and your revenue go in as the first line, and your name, e-mail and phone are already with the desk — nothing to type before your question.</li>
            <li>The desk sees the chat marked as coming from an STO agent, so it is answered by the reservations team rather than as a website enquiry.</li>
            <li>The header says who has picked the chat up. Enter sends; Shift+Enter starts a new line. Close the panel with × and the conversation carries on — a reply while it is closed shows as a count on the button.</li>
            <li><b>End chat</b> closes the conversation; the next time you open the panel a new one starts. Signing out ends it too.</li>
          </ul>
        </section>

        <section id="account" class="hp-sec">
          <h2>7. Your account and your logo</h2>
          <ul>
            <li><b>Account</b> shows who you are signed in as and changes your password (10 characters or more; the current one is required). Changing it signs out your other sessions.</li>
            <li><b>Your logo</b> — click the round mark at the top left of the command bar and choose a picture (PNG, JPEG or WebP). It is fitted into the mark for everyone at your operator and printed at the top of every Guest booking information sheet. <b>Remove logo</b> beside Account takes it off again.</li>
            <li>Forgotten password, a new colleague, a change of e-mail: the lodge manages accounts — ask them, or use the chat.</li>
          </ul>
        </section>

        <section id="money" class="hp-sec">
          <h2>8. Money, rates and what the guest sees</h2>
          <ul>
            <li>Every price on the portal is in <b>South African rand</b> and includes VAT.</li>
            <li><b>Your rate</b> is the lodge's published rate less your operator's contracted discount, worked out by the lodge's rate engine for the exact stay — seasons, minimum stays and specials included. The published rate is always shown beside it.</li>
            <li>The <b>Guest booking information</b> sheet shows the guest the published rate and never your discount: your arrangement with the lodge stays between you and the lodge.</li>
            <li>The lodge invoices your operator; the portal takes no payment.</li>
          </ul>
        </section>

        <section id="glossary" class="hp-sec">
          <h2>9. Words the portal uses</h2>
          <dl class="hp-gl">
            <dt>Hold</dt><dd>Suites taken off sale for a set number of hours without a booking. Becomes a booking, is cancelled, or runs out.</dd>
            <dt>Provisional</dt><dd>A booking made but not yet confirmed by the lodge.</dd>
            <dt>Unit</dt><dd>One physical suite of a type. Two units of the Lagoon Suite is two Lagoon Suites.</dd>
            <dt>Room night</dt><dd>One suite for one night. Two suites for three nights is six room nights.</dd>
            <dt>Channel</dt><dd>The rate plan the lodge assigns to your operator; every price you see comes from it.</dd>
            <dt>Published rate</dt><dd>The lodge's own website price — the struck-through figure.</dd>
            <dt>Reference</dt><dd>The short code on every hold and booking (for example <code>H7K2QX</code>); quote it to the lodge.</dd>
          </dl>
          <p class="hp-dim"><a routerLink="/">Back to Home</a>.</p>
        </section>
      </article>
    </section>
  `,
  styles: [`
    .hp-page { width: min(1100px, 94%); margin: 0 auto; padding: 24px 0 60px; display: grid; grid-template-columns: 220px 1fr; gap: 28px; align-items: start; }
    .hp-toc { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 2px; background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: 14px; padding: 12px; }
    .hp-toc b { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--oa-text-dim); margin: 2px 6px 8px; }
    .hp-toc a { padding: 6px 8px; border-radius: 8px; text-decoration: none; color: var(--oa-text); font-size: 13.5px; }
    .hp-toc a:hover, .hp-toc a.on { background: rgba(83, 102, 58, 0.14); color: var(--oa-accent-strong); }
    .hp-doc { min-width: 0; }
    .hp-head h1 { margin: 0 0 6px; font-size: 26px; }
    .hp-dim { color: var(--oa-text-dim); font-size: 14px; line-height: 1.55; }
    .hp-sec { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: 14px; padding: 18px 22px; margin-top: 16px; scroll-margin-top: 80px; }
    .hp-sec h2 { margin: 0 0 8px; font-size: 18px; }
    .hp-sec h3 { margin: 14px 0 4px; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: var(--oa-text-dim); }
    .hp-sec p, .hp-sec li { font-size: 14px; line-height: 1.6; }
    .hp-sec ul { padding-left: 20px; margin: 6px 0; }
    .hp-sec li + li { margin-top: 4px; }
    .hp-sec a { color: var(--oa-accent-strong); }
    .hp-gl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 14px; margin: 8px 0 14px; }
    .hp-gl dt { font-weight: 700; }
    .hp-gl dd { margin: 0; font-size: 14px; line-height: 1.55; }
    code { background: var(--oa-surface-2); padding: 1px 5px; border-radius: 5px; }
    @media (max-width: 800px) { .hp-page { grid-template-columns: 1fr; } .hp-toc { position: static; } }
  `],
})
export class HelpComponent {
  readonly auth = inject(PortalAuthService);
  readonly current = signal('start');
  readonly sections: HelpSection[] = [
    { id: 'start', title: 'Getting started' },
    { id: 'home', title: 'Home' },
    { id: 'new', title: 'New booking' },
    { id: 'holds', title: 'Holds' },
    { id: 'bookings', title: 'Bookings' },
    { id: 'chat', title: 'Chat with 7 Star' },
    { id: 'account', title: 'Account and logo' },
    { id: 'money', title: 'Money and rates' },
    { id: 'glossary', title: 'Glossary' },
  ];

  /** Scroll within the page — a plain #hash would send the router to the wildcard route. */
  jump(ev: Event, id: string): void {
    ev.preventDefault();
    this.current.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
