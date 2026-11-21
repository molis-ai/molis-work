/**
 * Shared Scheme A on-demand help browser controller (Batch 03 / Batch 40 VUX-55).
 * Runs identically in workbench pages, settings pages, catalog specimens, and framed plugin pages.
 * Renders strictly through DOM textContent (never innerHTML for topic text) and moves reading to
 * the right side pane via `molis:side-open` when the user clicks "在右栏继续看".
 */

interface HelpTextRef {
  literal?: string;
  key?: string;
  fallback?: string;
}

interface ResolvedSection {
  id: string;
  heading: string;
  body?: string;
  items?: string[];
  collapsible?: boolean;
  summary?: string;
}

interface ResolvedNextStep {
  title: string;
  fact: string;
  actionLabel: string;
  actionHref?: string;
}

interface ResolvedTopic {
  id: string;
  title: string;
  context?: string;
  firstVisitTip?: string;
  focusOnly?: boolean;
  failed?: boolean;
  sections?: ResolvedSection[];
  nextStep?: ResolvedNextStep;
}

interface RawDeclarationSection {
  id?: string;
  heading?: string | HelpTextRef;
  body?: string | HelpTextRef;
  items?: Array<string | HelpTextRef>;
  collapsible?: boolean;
  summary?: string | HelpTextRef;
}

interface RawDeclarationTopic {
  id?: string;
  title?: string | HelpTextRef;
  first_visit_tip?: string | HelpTextRef;
  sections?: RawDeclarationSection[];
}

interface ActiveHelp {
  card: HTMLDivElement;
  trigger: HTMLElement;
  topicId: string;
  focusId: string | null;
  scroller: HTMLElement | null;
  prevPad: string;
  prevScrollPad: string;
}

type HelpTopicProvider = ResolvedTopic | (() => ResolvedTopic);

declare global {
  var __molisOnDemandHelpInstalled: boolean | undefined;
  var t: { text?: (key: string) => string } | undefined;
  var molisWorkRequest: { toast?: (message: string) => void } | undefined;
  var molisOnDemandHelp: {
    open: (trigger: HTMLElement, topicId: string, focusId: string | null) => void;
    close: (restore?: boolean) => void;
    syncTips: () => void;
    register: (id: string, topicOrLoader: HelpTopicProvider) => void;
    unregister: (id: string) => void;
  } | undefined;
}

if (!globalThis.__molisOnDemandHelpInstalled) {
  globalThis.__molisOnDemandHelpInstalled = true;
  const TIP_PREFIX = "molis-work:help-tip-skipped:";
  const providers = new Map<string, HelpTopicProvider>();
  let active: ActiveHelp | null = null;

  const isEn = (): boolean => String(document.documentElement.lang || "").toLowerCase().startsWith("en");

  const word = (key: string, zh: string, en: string): string => {
    try {
      const read = globalThis.t?.text;
      if (typeof read === "function") {
        const value = read(key);
        if (value && value !== key && !value.startsWith("common.help.")) return value;
      }
    } catch {
      // Fallback to bilingual literal below.
    }
    return isEn() ? en : zh;
  };

  const resolveRef = (ref: string | HelpTextRef | undefined): string => {
    if (typeof ref === "string") return ref;
    if (!ref || typeof ref !== "object") return "";
    if (typeof ref.literal === "string") return ref.literal;
    if (typeof ref.key === "string") {
      try {
        const read = globalThis.t?.text;
        if (typeof read === "function") return read(ref.key);
      } catch {
        // Fallback below.
      }
      return typeof ref.fallback === "string" ? ref.fallback : ref.key;
    }
    return "";
  };

  const iconSvg = (name: string): SVGSVGElement => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  };

  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  const collectTopics = (): Map<string, ResolvedTopic> => {
    const map = new Map<string, ResolvedTopic>();
    for (const node of document.querySelectorAll("script[data-mw-help-data]")) {
      try {
        const list = JSON.parse(node.textContent || "[]") as unknown;
        if (Array.isArray(list)) {
          for (const topic of list) {
            if (topic && typeof topic === "object" && typeof (topic as ResolvedTopic).id === "string") {
              map.set((topic as ResolvedTopic).id, topic as ResolvedTopic);
            }
          }
        }
      } catch {
        // Ignore malformed inline script.
      }
    }
    for (const node of document.querySelectorAll("script[data-mw-help-declaration]")) {
      try {
        const decl = JSON.parse(node.textContent || "null") as { default_topic?: string; topics?: RawDeclarationTopic[] } | null;
        if (decl && Array.isArray(decl.topics)) {
          const defId = decl.default_topic || decl.topics[0]?.id;
          for (const raw of decl.topics) {
            if (!raw || typeof raw.id !== "string") continue;
            const resolved: ResolvedTopic = {
              id: raw.id,
              title: resolveRef(raw.title),
              firstVisitTip: raw.first_visit_tip ? resolveRef(raw.first_visit_tip) : undefined,
              sections: (raw.sections || []).map((section) => ({
                id: String(section.id || ""),
                heading: resolveRef(section.heading),
                body: section.body !== undefined ? resolveRef(section.body) : undefined,
                items: Array.isArray(section.items) ? section.items.map(resolveRef).filter(Boolean) : undefined,
                collapsible: Boolean(section.collapsible),
                summary: section.summary !== undefined ? resolveRef(section.summary) : undefined,
              })),
            };
            map.set(raw.id, resolved);
            if (raw.id === defId && !map.has("page")) map.set("page", resolved);
          }
        }
      } catch {
        // Ignore malformed declaration.
      }
    }
    for (const [id, value] of providers) {
      try {
        const resolved = typeof value === "function" ? value() : value;
        if (resolved) map.set(id, resolved);
      } catch {
        map.set(id, { id, title: word("common.help.title", "帮助", "Help"), failed: true });
      }
    }
    return map;
  };

  const scrollTarget = (anchor: HTMLElement | null): HTMLElement => {
    let cur = anchor?.parentElement ?? null;
    while (cur && cur !== document.body) {
      const oy = getComputedStyle(cur).overflowY;
      if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight + 2) return cur;
      cur = cur.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) || document.documentElement;
  };

  const clearRoom = (): void => {
    if (!active?.scroller) return;
    active.scroller.style.paddingBottom = active.prevPad || "";
    active.scroller.style.scrollPaddingBottom = active.prevScrollPad || "";
  };

  const close = (restore = true): void => {
    if (!active) return;
    const { card, trigger } = active;
    clearRoom();
    card.remove();
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    active = null;
    if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
  };

  const buildBody = (topic: ResolvedTopic | null, focusId: string | null, onRetry: () => void): HTMLDivElement => {
    const wrap = mk("div", "mw-help-content");
    wrap.dataset.slot = "help-content";
    if (!topic || topic.failed) {
      const empty = mk("div", "mw-empty mw-empty--error");
      empty.dataset.slot = "empty";
      const mark = mk("span", "mw-empty__mark");
      mark.setAttribute("aria-hidden", "true");
      mark.append(iconSvg("circle-alert"));
      const strong = mk("strong", "", word("common.help.load-failed-title", "帮助没读出来", "Help didn't load"));
      const p = mk("p", "", word("common.help.load-failed-body", "这一页照常能用；权限、费用和后果仍直接写在操作前。", "This page still works; permissions, costs and effects stay listed before the action."));
      const acts = mk("div", "mw-empty__actions");
      const retry = mk("button", "mw-btn mw-btn--secondary mw-btn--sm");
      retry.type = "button";
      retry.dataset.slot = "button";
      retry.dataset.mwHelpRetry = "true";
      retry.append(iconSvg("refresh"), mk("span", "", word("common.help.retry", "再试一次", "Try again")));
      retry.addEventListener("click", onRetry);
      acts.append(retry);
      empty.append(mark, strong, p, acts);
      wrap.append(empty);
      return wrap;
    }
    const allSections = topic.sections || [];
    const sections = focusId && allSections.length > 1 && topic.focusOnly
      ? allSections.filter((section) => section.id === focusId)
      : allSections;
    for (const section of sections) {
      const sec = mk("section", `mw-help-section${focusId && section.id === focusId ? " is-highlighted" : ""}`);
      sec.dataset.helpSection = section.id;
      sec.append(mk("h4", "mw-help-section__heading", section.heading));
      const fill = (parent: HTMLElement): void => {
        if (section.body) parent.append(mk("p", "mw-help-section__body", section.body));
        if (Array.isArray(section.items) && section.items.length) {
          const ul = mk("ul", "mw-help-section__list");
          for (const item of section.items) ul.append(mk("li", "", item));
          parent.append(ul);
        }
      };
      if (section.collapsible) {
        const det = mk("details", "mw-collapsible");
        det.dataset.slot = "collapsible";
        det.append(mk("summary", "", section.summary || section.heading));
        const body = mk("div", "mw-collapsible__body");
        fill(body);
        det.append(body);
        sec.append(det);
      } else {
        fill(sec);
      }
      wrap.append(sec);
    }
    if (topic.nextStep) {
      const next = mk("div", "mw-help-next");
      next.append(mk("h4", "mw-help-next__title", topic.nextStep.title));
      next.append(mk("p", "mw-help-next__fact", topic.nextStep.fact));
      const acts = mk("div", "mw-help-next__actions");
      if (topic.nextStep.actionHref) {
        const link = mk("a", "mw-btn mw-btn--primary mw-btn--sm");
        link.dataset.slot = "button";
        link.setAttribute("href", topic.nextStep.actionHref);
        link.append(mk("span", "", topic.nextStep.actionLabel));
        acts.append(link);
      } else {
        const btn = mk("button", "mw-btn mw-btn--primary mw-btn--sm");
        btn.type = "button";
        btn.dataset.slot = "button";
        btn.append(mk("span", "", topic.nextStep.actionLabel));
        acts.append(btn);
      }
      next.append(acts);
      wrap.append(next);
    }
    return wrap;
  };

  const canMoveToSide = (): boolean => {
    if (document.body?.hasAttribute("data-standalone-help")) return false;
    return Boolean(document.querySelector("[data-side-panel]")) || window.parent !== window;
  };

  const place = (card: HTMLDivElement, trigger: HTMLElement): number => {
    const r = trigger.getBoundingClientRect();
    const colEl = trigger.closest<HTMLElement>(".mw-help-anchor-col, form, .settings-page-shell, main, [data-work-surface]");
    const col = colEl ? colEl.getBoundingClientRect() : null;
    if (innerWidth > 760) {
      const room = col ? innerWidth - 12 - (col.right + 16) : 0;
      card.style.width = room >= 300 && room < 380 ? `${Math.floor(room)}px` : "";
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      let left = r.right - w;
      let top = r.bottom + 6;
      if (col && col.right + 16 + w <= innerWidth - 12) {
        left = Math.max(col.right + 16, r.right - w);
        top = Math.max(48, Math.min(r.top, innerHeight - 84 - h));
      }
      if (top + h > innerHeight - 84) top = Math.max(48, innerHeight - 84 - h);
      left = Math.min(Math.max(8, left), innerWidth - w - 8);
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      return 0;
    }
    card.style.left = "";
    card.style.top = "";
    card.style.width = "";
    const scroller = scrollTarget(trigger);
    const box = scroller.getBoundingClientRect();
    return Math.max(0, Math.round(box.bottom - card.getBoundingClientRect().top + 16));
  };

  const open = (trigger: HTMLElement, topicId: string, focusId: string | null): void => {
    if (active && active.trigger === trigger) {
      close(true);
      return;
    }
    close(false);
    const topics = collectTopics();
    const topic = topics.get(topicId) || topics.get("page") || null;
    const card = mk("div", "mw-help-card");
    card.id = trigger.getAttribute("aria-controls") || "mw-help-region";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", word("common.help.title", "帮助", "Help"));
    card.setAttribute("tabindex", "-1");

    const head = mk("div", "mw-help-card__head");
    const helpWord = word("common.help.title", "帮助", "Help");
    const title = mk("strong", "mw-help-card__title", topic?.title ? `${helpWord} · ${topic.title}` : helpWord);
    const closeBtn = mk("button", "mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only");
    closeBtn.type = "button";
    closeBtn.dataset.slot = "button";
    closeBtn.setAttribute("aria-label", word("common.help.close", "关闭帮助", "Close help"));
    closeBtn.append(iconSvg("x"));
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      close(true);
    });
    head.append(iconSvg("question"), title, closeBtn);

    const body = mk("div", "mw-help-card__body");
    body.append(buildBody(topic, focusId, () => {
      document.dispatchEvent(new CustomEvent("molis:help-retry", { detail: { topic: topicId } }));
      const next = active?.trigger;
      close(false);
      if (next) open(next, topicId, focusId);
    }));

    const foot = mk("div", "mw-help-card__foot");
    foot.append(mk("span", "mw-help-card__hint", word("common.help.esc-closes", "Esc 关闭", "Esc closes")));
    if (canMoveToSide() && topic && !topic.failed) {
      const sideBtn = mk("button", "mw-btn mw-btn--ghost mw-btn--sm");
      sideBtn.type = "button";
      sideBtn.dataset.slot = "button";
      sideBtn.dataset.mwHelpToSide = "true";
      sideBtn.append(iconSvg("sidebar"), mk("span", "", word("common.help.keep-reading-side", "在右栏继续看", "Keep reading in the side pane")));
      sideBtn.addEventListener("click", () => {
        const payload = {
          title: topic.title,
          context: topic.context || word("common.help.looking-at", "正在看：", "Looking at: ") + topic.title,
          focusId: focusId || null,
          sections: (topic.sections || []).slice(0, 12).map((section) => ({
            id: String(section.id || ""),
            heading: String(section.heading || ""),
            body: section.body ? String(section.body) : "",
            items: Array.isArray(section.items) ? section.items.slice(0, 12).map(String) : [],
            collapsible: Boolean(section.collapsible),
            summary: section.summary ? String(section.summary) : "",
          })),
        };
        close(false);
        document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "help", target: payload, focus: true }, cancelable: true }));
      });
      foot.append(sideBtn);
    }

    card.append(head, body, foot);
    document.body.append(card);
    trigger.setAttribute("aria-expanded", "true");
    const scroller = scrollTarget(trigger);
    const prevPad = scroller.style.paddingBottom || "";
    const prevScrollPad = scroller.style.scrollPaddingBottom || "";
    const overlap = place(card, trigger);
    if (overlap > 0) {
      scroller.style.paddingBottom = `${overlap}px`;
      scroller.style.scrollPaddingBottom = `${overlap}px`;
    }
    active = { card, trigger, topicId, focusId, scroller: overlap > 0 ? scroller : null, prevPad, prevScrollPad };
    card.focus({ preventScroll: true });
    if (focusId) {
      const targetSec = body.querySelector(`[data-help-section="${CSS.escape(focusId)}"]`);
      targetSec?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  };

  const syncTips = (): void => {
    for (const tip of document.querySelectorAll<HTMLElement>("[data-mw-help-tip]")) {
      const key = tip.getAttribute("data-mw-help-tip");
      if (!key) continue;
      try {
        if (localStorage.getItem(TIP_PREFIX + key) === "1") tip.hidden = true;
      } catch {
        // Ignore restricted storage.
      }
    }
  };

  const skipTip = (tip: HTMLElement, notify: boolean): void => {
    const key = tip.getAttribute("data-mw-help-tip");
    if (key) {
      try {
        localStorage.setItem(TIP_PREFIX + key, "1");
      } catch {
        // Ignore restricted storage.
      }
    }
    tip.hidden = true;
    const trigger = document.querySelector<HTMLElement>("[data-mw-help-trigger]");
    if (notify) {
      trigger?.focus({ preventScroll: true });
      globalThis.molisWorkRequest?.toast?.(word("common.help.tip-skipped-toast", "不再提示；随时点「帮助」都能找回", "Won't show again; Help is always there"));
    }
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const skipBtn = target.closest("[data-mw-help-tip-skip]");
    if (skipBtn) {
      const tip = skipBtn.closest<HTMLElement>("[data-mw-help-tip]");
      if (tip) skipTip(tip, true);
      return;
    }
    const tipAction = target.closest("[data-mw-help-tip-action]");
    if (tipAction) {
      const tip = tipAction.closest<HTMLElement>("[data-mw-help-tip]");
      if (tip) skipTip(tip, false);
      const topicAttr = tipAction.getAttribute("data-help-topic") || "page";
      const trigger = document.querySelector<HTMLElement>(`[data-mw-help-trigger][data-help-topic="${CSS.escape(topicAttr)}"]`)
        || document.querySelector<HTMLElement>("[data-mw-help-trigger]");
      if (trigger) open(trigger, topicAttr, null);
      return;
    }
    const trigger = target.closest<HTMLElement>("[data-mw-help-trigger]");
    if (trigger) {
      event.preventDefault();
      open(trigger, trigger.getAttribute("data-help-topic") || "page", trigger.getAttribute("data-help-focus") || null);
      return;
    }
    if (active && !target.closest(".mw-help-card")) close(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      close(true);
    }
  }, true);

  addEventListener("resize", () => {
    if (!active) return;
    const { trigger } = active;
    if (!trigger.isConnected) {
      close(false);
      return;
    }
    clearRoom();
    const overlap = place(active.card, trigger);
    if (overlap > 0) {
      const scroller = scrollTarget(trigger);
      active.scroller = scroller;
      scroller.style.paddingBottom = `${overlap}px`;
      scroller.style.scrollPaddingBottom = `${overlap}px`;
    } else {
      active.scroller = null;
    }
  });

  document.addEventListener("molis-work:language-changed", () => {
    if (!active) return;
    const { trigger, topicId, focusId } = active;
    close(false);
    if (trigger.isConnected) open(trigger, topicId, focusId);
  });

  syncTips();
  globalThis.molisOnDemandHelp = {
    open,
    close,
    syncTips,
    register(id, topicOrLoader) {
      providers.set(id, topicOrLoader);
    },
    unregister(id) {
      providers.delete(id);
    },
  };
}

export {};
