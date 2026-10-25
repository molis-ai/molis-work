import type {} from "@molis-ai/molis-work-design-system";
/** The page's own lifetime (packages/ui-host client-lifecycle): its timers and listeners end with the page. */
interface DraftLifetime {
  timeout(job: () => void, delay: number): number;
  clearTimeout(timer: number | undefined): void;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
}

/** What the Coding page's client (src/client.ts) hands the composer's draft. */
export interface DraftPorts {
  readonly lifetime: DraftLifetime;
  readonly q: (selector: string) => Element;
  /** One request to the Coding routes; a failure is an Error. */
  readonly api: (path: string, method: "PATCH", body: Record<string, unknown>) => Promise<unknown>;
  readonly input: HTMLTextAreaElement;
  /** The session on show. */
  readonly current: () => string;
  /** Where this window keeps a session's draft in sessionStorage. */
  readonly key: (id: string) => string;
  /** Each choice for a session's next round this window holds, by session, under the name it is saved as. */
  readonly choices: Readonly<Record<string, Map<string, unknown>>>;
  readonly status: (text: string, isError?: boolean) => void;
}

/**
 * The composer's draft and the choices for a session's next round, kept in this window and saved to the session. The box
 * is a session's once that session's first read has put its draft in (`claim`); until then (`owns` is false) nothing
 * typed, added or saved from the box goes to it, so the words still showing from the session before never land there.
 * Built with esbuild into `dist/draft-bundle.js` (src/draft-client.ts reads it); type-checked by tsconfig.browser.json.
 */
export function codingDraft({ lifetime, q, api, input, current, key, choices, status }: DraftPorts) {
  const drafts = new Map<string, string>(), writes = new Map<string, Promise<unknown>>(), done = Promise.resolve();
  let owner = "", timer: number | undefined;
  const note = (text: string) => { q("[data-coding-draft-status]").textContent = text; };
  const owns = (id: string) => Boolean(id) && owner === id;
  const remember = (id: string, value: string) => {
    drafts.set(id, value);
    try { sessionStorage.setItem(key(id), value); } catch { /* storage closed: this window keeps its copy */ }
  };
  const local = (id: string): string | undefined => {
    if (drafts.has(id)) return drafts.get(id);
    try { return sessionStorage.getItem(key(id)) ?? undefined; } catch { return undefined; /* storage closed: nothing kept there */ }
  };
  const later = (job: () => void) => { lifetime.clearTimeout(timer); timer = lifetime.timeout(job, 400); };
  // Saved with the draft: every choice this window holds for the session; picked is a dialog's selection not yet held.
  // A save for the session shown carries the box as it is now, so the typing save still waiting is dropped: fired later,
  // it would carry the choices of its moment and land after this one.
  const save = (id: string, value: string, picked?: Record<string, unknown>): Promise<void> => {
    if (!id) return done;
    if (id === current()) lifetime.clearTimeout(timer);
    const own = id !== current() || owns(id);
    if (own) remember(id, value);
    const held = Object.entries(choices).flatMap(([name, map]) => map.has(id) ? [[name, map.get(id)]] : []);
    const body: Record<string, unknown> = structuredClone({ ...(own ? { draft: value } : {}), ...Object.fromEntries(held), ...picked });
    if (!body.configuration) delete body.configuration;
    const next = (writes.get(id) ?? done).catch(() => undefined).then(() => api(`/sessions/${encodeURIComponent(id)}`, "PATCH", body));
    writes.set(id, next);
    return next.then(() => { if (own && current() === id && input.value === value) note("草稿已保存；模型与方式用于下一轮。"); });
  };
  lifetime.listen(input, "input", () => {
    const id = current(), value = input.value;
    if (!owns(id)) return;
    remember(id, value); note("正在保存草稿…");
    later(() => void save(id, value).catch((error: Error) => status(`草稿暂未写入服务，当前窗口仍保留：${error.message}`, true)));
  });
  return {
    owns, local, later, save,
    // This window's copy wins while it holds something; an empty copy never hides a draft the service kept.
    claim(id: string, saved?: string) { input.value = local(id) || saved || ""; window.molisFit?.(input); remember(id, input.value); owner = id; note("草稿已恢复；模型与方式用于下一轮。"); },
    // Another session is on show: until its first read claims the box, the box is no session's.
    release() { owner = ""; note("正在读取会话…"); },
    flush() { const id = current(); return owns(id) ? save(id, input.value) : done; },
    saveChoices: (id: string) => save(id, id === current() ? input.value : local(id) || ""),
    // Words put in from elsewhere (review notes handed back, a rework request) go only to the session the box holds.
    async append(id: string, build: (value: string) => string, refusal: string) {
      if (!owns(id)) throw new Error(refusal);
      const value = build(input.value);
      input.value = value;
      window.molisFit?.(input);
      await save(id, value);
    },
  };
}

export type CodingDraft = ReturnType<typeof codingDraft>;
