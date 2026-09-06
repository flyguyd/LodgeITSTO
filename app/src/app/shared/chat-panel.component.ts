import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PortalChatService } from '../core/portal-chat.service';

/**
 * The "Chat with 7 Star" panel (Dave, 2026-09-06) — opened from the command
 * bar, docked bottom-right, the Organic palette. The transcript scrolls to the
 * newest line whenever one lands; the agent's own lines sit on the right.
 */
@Component({
  selector: 'sto-chat-panel',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (chat.open()) {
      <section class="cp" aria-label="Chat with 7 Star">
        <header class="cp-head">
          <div class="cp-title">
            <b>Chat with 7 Star</b>
            <small>{{ chat.status() }}</small>
          </div>
          @if (chat.view()?.answeredBy; as who) {
            <span class="cp-agent" [title]="who">
              @if (chat.view()?.answeredByAvatar; as pic) { <img [src]="pic" [alt]="who" /> } @else { {{ chat.view()?.answeredByInitials || who.slice(0, 1) }} }
            </span>
          }
          <button type="button" class="cp-x" (click)="chat.close()" title="Hide the chat">×</button>
        </header>
        <div class="cp-body" #body>
          @if (chat.error()) { <div class="cp-err">{{ chat.error() }}</div> }
          @if (!chat.view() && chat.busy()) { <div class="cp-note">Connecting you to the desk…</div> }
          @for (m of chat.messages(); track m.id) {
            <div class="cp-msg" [class.me]="m.from === 'visitor'">
              @if (m.from !== 'visitor') { <span class="cp-who">{{ m.senderLabel }}</span> }
              <span class="cp-bubble">{{ m.body }}</span>
              <span class="cp-when">{{ m.createdAt | date: 'HH:mm' }}</span>
            </div>
          }
          @if (chat.view()?.staffTyping) { <div class="cp-note cp-typing">{{ chat.view()?.answeredBy || 'The desk' }} is typing…</div> }
          @if (chat.view()?.status === 'closed') {
            <div class="cp-note">This chat has ended. <button type="button" class="cp-link" (click)="chat.restart()">Start a new one</button></div>
          }
        </div>
        @if (chat.view()?.status !== 'closed') {
          <form class="cp-form" (submit)="send($event)">
            <textarea class="cp-input" name="chatText" rows="2" placeholder="Type your message…" [value]="draft()" (input)="typed($any($event.target).value)" (keydown.enter)="enter($event)"></textarea>
            <div class="cp-actions">
              <button type="button" class="cp-link" (click)="chat.end()" title="End this conversation">End chat</button>
              <button type="submit" class="oa-btn oa-btn-primary cp-send" [disabled]="chat.busy() || !draft().trim()">Send</button>
            </div>
          </form>
        }
      </section>
    }
  `,
  styles: [`
    .cp { position: fixed; right: 18px; bottom: 18px; width: 360px; max-width: calc(100vw - 24px); height: 520px; max-height: calc(100vh - 90px); display: flex; flex-direction: column; background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: 16px; box-shadow: 0 18px 40px rgba(38, 34, 26, 0.22); z-index: 60; overflow: hidden; }
    .cp-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #3d372e; color: #f3ede1; }
    .cp-title { display: flex; flex-direction: column; line-height: 1.15; flex: 1; }
    .cp-title small { color: #c8a45f; font-size: 11.5px; }
    .cp-agent { width: 30px; height: 30px; border-radius: 50%; background: #c8a45f; color: #3d372e; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; overflow: hidden; }
    .cp-agent img { width: 100%; height: 100%; object-fit: cover; }
    .cp-x { background: transparent; border: 0; color: #f3ede1; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .cp-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--oa-page-bg, var(--oa-bg)); }
    .cp-msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 85%; }
    .cp-msg.me { align-self: flex-end; align-items: flex-end; }
    .cp-who { font-size: 11px; color: var(--oa-text-dim); margin: 0 4px 2px; }
    .cp-bubble { background: var(--oa-surface); border: 1px solid var(--oa-border); border-radius: 14px 14px 14px 4px; padding: 8px 11px; font-size: 13.5px; white-space: pre-wrap; word-break: break-word; }
    .cp-msg.me .cp-bubble { background: rgba(83, 102, 58, 0.16); border-color: rgba(83, 102, 58, 0.3); border-radius: 14px 14px 4px 14px; }
    .cp-when { font-size: 10.5px; color: var(--oa-text-dim); margin: 2px 4px 0; }
    .cp-note { font-size: 12.5px; color: var(--oa-text-dim); text-align: center; padding: 6px; }
    .cp-typing { text-align: left; font-style: italic; }
    .cp-err { background: rgba(166, 71, 47, 0.12); border: 1px solid var(--oa-danger); color: #6e4338; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; }
    .cp-form { border-top: 1px solid var(--oa-border); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--oa-surface); }
    .cp-input { width: 100%; box-sizing: border-box; resize: none; font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--oa-border); border-radius: 10px; background: var(--oa-surface); color: var(--oa-text); }
    .cp-actions { display: flex; justify-content: space-between; align-items: center; }
    .cp-link { background: transparent; border: 0; color: var(--oa-text-dim); font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: underline; padding: 0; }
    .cp-send { padding: 6px 14px; }
  `],
})
export class ChatPanelComponent {
  readonly chat = inject(PortalChatService);
  readonly draft = signal('');
  private readonly body = viewChild<ElementRef<HTMLDivElement>>('body');

  constructor() {
    // Newest line into view whenever the transcript grows or the panel opens.
    effect(() => {
      const n = this.chat.messages().length;
      const open = this.chat.open();
      const el = this.body()?.nativeElement;
      untracked(() => { if (open && el && n >= 0) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0); });
    });
  }

  typed(v: string): void {
    this.draft.set(v);
    if (v.trim()) this.chat.typing();
  }
  enter(ev: Event): void {
    const ke = ev as KeyboardEvent;
    if (ke.shiftKey) return;
    ev.preventDefault();
    this.send(ev);
  }
  send(ev: Event): void {
    ev.preventDefault();
    const text = this.draft().trim();
    if (!text) return;
    this.chat.send(text);
    this.draft.set('');
  }
}
