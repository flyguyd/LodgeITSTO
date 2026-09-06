import { Injectable, computed, inject, signal } from '@angular/core';
import { ChatMessage, ChatView, PortalApiService } from './portal-api.service';
import { PortalAuthService } from './portal-auth.service';

/**
 * "CHAT WITH 7 STAR" (Dave, 2026-09-06): the agent's live line to the lodge's
 * desk. One conversation per agent, opened from the command bar rather than
 * a floating icon; the transcript is kept by Lodge Ops, so the panel only
 * remembers the token (per signed-in user, in sessionStorage) and polls.
 *
 * Lodge Ops writes the opening line for the agent when the chat is new —
 * the operator's name, the nights they have booked and the revenue — so the
 * person answering knows who they are talking to before a question lands.
 */
@Injectable({ providedIn: 'root' })
export class PortalChatService {
  private readonly api = inject(PortalApiService);
  private readonly auth = inject(PortalAuthService);

  readonly open = signal(false);
  readonly view = signal<ChatView | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  /** Staff messages that arrived while the panel was shut. */
  readonly unread = signal(0);
  readonly messages = computed<ChatMessage[]>(() => this.view()?.messages ?? []);
  readonly status = computed(() => {
    const v = this.view();
    if (!v) return 'Not connected';
    if (v.status === 'closed') return 'This chat has ended';
    if (v.answeredBy) return `${v.answeredBy} is with you`;
    return v.agentsOnline > 0 ? 'Waiting for the desk to pick up…' : 'The desk is away — leave a message';
  });

  private timer: ReturnType<typeof setInterval> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private typingSent = false;

  private key(): string {
    return `sto_chat_token:${this.auth.user()?.id ?? 'anon'}`;
  }
  private token(): string | null {
    try { return sessionStorage.getItem(this.key()); } catch { return null; }
  }
  private remember(token: string | null): void {
    try { token ? sessionStorage.setItem(this.key(), token) : sessionStorage.removeItem(this.key()); } catch { /* private mode */ }
  }

  toggle(): void {
    this.open() ? this.close() : this.show();
  }

  /** Open the panel: pick up the thread we have, or start one. */
  show(): void {
    this.open.set(true);
    this.unread.set(0);
    this.error.set('');
    if (!this.view()) this.start();
    this.poll(true);
  }

  close(): void {
    this.open.set(false);
    this.stopPolling();
    // Keep a light poll going so a reply while the panel is shut still counts.
    if (this.view() && this.view()!.status !== 'closed') this.timer = setInterval(() => this.pollOnce(), 10_000);
  }

  private start(): void {
    this.busy.set(true);
    this.api.chatStart().subscribe({
      next: (v) => { this.apply(v); this.remember(v.token); this.busy.set(false); },
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'The chat could not be started — please try again.'); },
    });
  }

  private apply(v: ChatView): void {
    const before = this.view();
    if (before && !this.open()) {
      const seen = new Set(before.messages.map((m) => m.id));
      const fresh = v.messages.filter((m) => m.from === 'staff' && !seen.has(m.id)).length;
      if (fresh) this.unread.set(this.unread() + fresh);
    }
    // A poll with `since` brings only the tail — merge it onto what we have.
    if (before && before.conversationId === v.conversationId && v.messages.length && before.messages.length) {
      const seen = new Set(before.messages.map((m) => m.id));
      const merged = [...before.messages, ...v.messages.filter((m) => !seen.has(m.id))];
      this.view.set({ ...v, messages: merged });
    } else {
      this.view.set(v);
    }
  }

  private poll(fast: boolean): void {
    this.stopPolling();
    this.timer = setInterval(() => this.pollOnce(), fast ? 3000 : 10_000);
  }
  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private pollOnce(): void {
    const v = this.view();
    const token = v?.token ?? this.token();
    if (!token) return;
    const last = v?.messages.length ? v.messages[v.messages.length - 1].createdAt : null;
    this.api.chatPoll(token, last).subscribe({
      next: (nv) => this.apply(nv),
      error: () => { /* a missed poll is just a missed poll */ },
    });
  }

  send(text: string): void {
    const v = this.view();
    const body = text.trim();
    if (!v || !body || v.status === 'closed') return;
    this.busy.set(true);
    this.api.chatSend(v.token, body).subscribe({
      next: (nv) => { this.view.set(nv); this.busy.set(false); this.typingSent = false; },
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'That message did not send.'); },
    });
  }

  /** Called on every keystroke — tells the desk once, and "stopped" after a quiet second. */
  typing(): void {
    const v = this.view();
    if (!v || v.status === 'closed') return;
    if (!this.typingSent) { this.typingSent = true; this.api.chatTyping(v.token, true).subscribe({ error: () => undefined }); }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => { this.typingSent = false; this.api.chatTyping(v.token, false).subscribe({ error: () => undefined }); }, 1200);
  }

  /** End the conversation; the next open starts a fresh one. */
  end(): void {
    const v = this.view();
    if (!v) return;
    this.api.chatClose(v.token).subscribe({ next: () => { this.view.set({ ...v, status: 'closed' }); this.remember(null); }, error: () => undefined });
  }

  /** Start over after a closed chat. */
  restart(): void {
    this.view.set(null);
    this.remember(null);
    this.start();
    this.poll(true);
  }

  /** On sign-out nothing of the chat may outlive the session. */
  reset(): void {
    this.stopPolling();
    this.open.set(false);
    this.view.set(null);
    this.unread.set(0);
    this.remember(null);
  }
}
