import type { ComposerDraftAdapter } from "@molis-ai/molis-work-plugin-sdk/page-globals";
/** The page's own lifetime (packages/ui-host client-lifecycle): its timers end with the page. */
interface DraftLifetime {
  timeout(job: () => void, delay: number): number;
  clearTimeout(timer: number | undefined): void;
  listen(target: EventTarget, type: string, listener: (event: Event) => void): void;
}

/** What the Coding page's client (src/client.ts) hands the composer's draft. */
export interface DraftPorts {
  readonly lifetime: DraftLifetime;
  /** One request to the Coding routes; a failure is an Error. */
  readonly write: (id: string, body: Record<string, unknown>, premise: number) => Promise<unknown>;
  readonly premise: (id: string) => number;
  /** The session's words as the service last confirmed them (a started round clears them there itself); undefined when not known. */
  readonly confirmed: (id: string) => string | undefined;
  readonly input: HTMLTextAreaElement;
  /** The session on show. */
  readonly current: () => string;
  /** Where this window keeps a session's unconfirmed words in sessionStorage. */
  readonly key: (id: string) => string;
  /** Each choice for a session's next round this window holds, by session, under the name it is saved as. */
  readonly choices: Readonly<Record<string, Map<string, unknown>>>;
}

/**
 * The composer's draft and the choices for a session's next round, saved to the session (the session's own service is the one
 * owner, `routes-sessions.ts` `draft:<session_id>`; unified-input-voice K4, #1803 §6 item 10). The platform's composer reaches it
 * through `adapter(id)`: it reads a session's words once that session's first read is in (`claim`), and writes what is typed,
 * throttled, with every choice this window holds for the session in the same PATCH.
 *
 * - The box is a session's once its first read claimed it (`owns`); until then nothing typed or saved goes to it as its words, so
 *   the words of the session before never land there.
 * - Words not yet confirmed by the service are kept in this window's sessionStorage and nowhere else: written as they are typed
 *   (the composer saves a moment later, and a page that goes first must not lose them), removed once the service confirmed them and
 *   the box still holds them, or when the service's own snapshot is adopted. A read finds them only when a save failed (or the page
 *   went before it was answered): then they are put back and saved again; otherwise the service's draft is the one taken.
 * Part of the Coding page bundle (mounted by browser/main/mount-composer.ts); type-checked by tsconfig.browser.json.
 */
export function codingDraft({ lifetime, write, premise, confirmed, input, current, key, choices }: DraftPorts) {
  const drafts = new Map<string, string>(), writes = new Map<string, Promise<unknown>>(), done = Promise.resolve();
  /** Each session's read the composer is waiting on, settled by that session's claim. */
  const waiting = new Map<string, { promise: Promise<string>; resolve: (text: string) => void }>();
  /** One adapter per session for the page's life: the composer keys what it retains for a draft by its adapter. */
  const adapters = new Map<string, ComposerDraftAdapter>();
  let owner = "", timer: number | undefined;
  const owns = (id: string) => Boolean(id) && owner === id;
  const unconfirmed = (id: string): string | undefined => {
    try { return sessionStorage.getItem(key(id)) ?? undefined; } catch { return undefined; /* storage closed: nothing kept there */ }
  };
  const keep = (id: string, value: string) => { try { sessionStorage.setItem(key(id), value); } catch { /* storage closed: the service write is all there is */ } };
  const confirm = (id: string, value?: string) => { try { if (value === undefined || sessionStorage.getItem(key(id)) === value) sessionStorage.removeItem(key(id)); } catch { /* storage closed */ } };
  const remember = (id: string, value: string) => { drafts.set(id, value); };
  // Typed words are unconfirmed from the keystroke: the box's own session keeps them until a save is confirmed.
  lifetime.listen(input, "input", () => { const id = current(); if (owns(id)) keep(id, input.value); });
  /**
   * What this window knows of a session's words: the box itself for the session it holds (the composer saves what is typed a
   * moment later), else what it last saw or wrote, or what it could not get confirmed.
   */
  const local = (id: string): string | undefined => owns(id) && id === current() ? input.value : drafts.has(id) ? drafts.get(id) : unconfirmed(id);
  // Saved with the draft: every choice this window holds for the session; picked is a dialog's selection not yet held.
  const save = (id: string, value: string, picked?: Record<string, unknown>): Promise<void> => {
    if (!id) return done;
    const own = id !== current() || owns(id);
    if (own) { remember(id, value); keep(id, value); }
    const held = Object.entries(choices).flatMap(([name, map]) => map.has(id) ? [[name, map.get(id)]] : []);
    const body: Record<string, unknown> = structuredClone({ ...(own ? { draft: value } : {}), ...Object.fromEntries(held), ...picked });
    if (!body.configuration) delete body.configuration;
    const observed = premise(id);
    const next = (writes.get(id) ?? done).catch(() => undefined).then(() => write(id, body, observed));
    writes.set(id, next);
    // Confirmed: the words are the service's now, so this window's unconfirmed copy goes (unless newer words replaced it meanwhile).
    return next.then(() => { if (own) confirm(id, value); });
  };
  const wait = (id: string) => {
    // Claimed already (the composer is mounted once the read is in): its words are known.
    if (owns(id)) return Promise.resolve(drafts.get(id) ?? "");
    let entry = waiting.get(id);
    if (!entry) {
      let resolve!: (text: string) => void;
      const promise = new Promise<string>((done) => { resolve = done; });
      waiting.set(id, entry = { promise, resolve });
    }
    return entry.promise;
  };
  return {
    owns, local, remember, save,
    /** A save that may wait a moment (an answer being typed into a question card): the next one replaces it. */
    later(job: () => void) { lifetime.clearTimeout(timer); timer = lifetime.timeout(job, 400); },
    /** An adopted snapshot supersedes what this window held and the save still waiting; queued writes retain their original premise. */
    adopt(id: string, value: string) { if (id === current()) lifetime.clearTimeout(timer); remember(id, value); confirm(id); },
    /**
     * The session's first read is in: the box is its own. Words this window could not get confirmed win and are saved again; else
     * the service's draft is the session's words. The composer waiting on this session's read gets them.
     */
    claim(id: string, saved?: string) {
      const pending = unconfirmed(id), words = pending ?? saved ?? "";
      remember(id, words);
      owner = id;
      waiting.get(id)?.resolve(words);
      waiting.delete(id);
      if (pending !== undefined && pending !== (saved ?? "")) void save(id, pending).catch(() => undefined);
    },
    // Another session is on show: until its first read claims the box, the box is no session's.
    release() { owner = ""; },
    flush() { const id = current(); return owns(id) ? save(id, input.value) : done; },
    saveChoices: (id: string) => save(id, id === current() ? input.value : local(id) || ""),
    // Words put in from elsewhere (review notes handed back, a rework request) go only to the session the box holds.
    async append(id: string, build: (value: string) => string, refusal: string) {
      if (!owns(id)) throw new Error(refusal);
      const value = build(input.value);
      input.value = value;
      window.molisFit?.(input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await save(id, value);
    },
    /**
     * The composer's way to this session's words (`draft.adapter`): read once the session's first read is in, written with the
     * session's choices, and cleared after a send of what the box held then.
     */
    adapter(id: string): ComposerDraftAdapter {
      let one = adapters.get(id);
      if (!one) adapters.set(id, one = {
        read: (signal) => Promise.race([wait(id), new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))]),
        write: (text) => owns(id) ? save(id, text) : done,
        // After a send: a round that started from these words already cleared them in the session, so only words still there are cleared.
        sent: () => {
          if (!owns(id)) return done;
          if (confirmed(id) !== "") return save(id, "");
          remember(id, "");
          confirm(id);
          return done;
        },
      });
      return one;
    },
  };
}

export type CodingDraft = ReturnType<typeof codingDraft>;
