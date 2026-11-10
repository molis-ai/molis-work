import type { UiEnvironmentSnapshot, UiLocalePack, UiSkinFile, UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { installUiText, resolveUiEnvironment, say, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createLocaleSwitch, createProducedLog } from "../locale-switch.js";

/**
 * The program of the board's 语言与文字 section (apps/workbench/src/environment-specimens.ts). The page's own `t` reads the words the Host handed it; a
 * switch changes the section's words in place from the two renders the Host put in the page; what the page drew itself follows from what produced it.
 */
interface SectionData {
  readonly locale: string;
  readonly packs: readonly UiLocalePack[];
  readonly environment: { readonly spec: UiSpecFile; readonly skin: UiSkinFile; readonly snapshots: Readonly<Record<string, UiEnvironmentSnapshot>> };
}

const section = document.getElementById("environment");
const live = section?.querySelector<HTMLElement>("[data-board-env-live]");
const source = section?.querySelector("script[data-board-env-data]")?.textContent;
if (section && live && source) start(section, live, JSON.parse(source) as SectionData);

function start(section: HTMLElement, live: HTMLElement, data: SectionData): void {
  let locale = data.locale, added = 1;
  const produced = createProducedLog();
  const packs = new Map(data.packs.map((pack) => [`${pack.owner} ${pack.locale}`, pack]));
  const defaults = new Map<string, string>(), prefixes = new Map<string, string>();
  for (const { owner, locale: tag } of data.packs) {
    if (!defaults.has(owner)) defaults.set(owner, tag);
    prefixes.set(owner.slice(owner.lastIndexOf(".") + 1), owner);
  }
  installUiText({
    locale: () => locale,
    noContext: () => "throw",
    ownerOfPrefix: (prefix) => prefixes.get(prefix) ?? null,
    message(owner, key, tag) {
      const messages = packs.get(`${owner} ${tag}`)?.messages;
      return messages !== undefined && Object.hasOwn(messages, key) ? messages[key]! : null;
    },
    defaultLocale: (owner) => defaults.get(owner) ?? null,
    produced: produced.record,
  });

  const status = section.querySelector<HTMLElement>("[data-board-env-status]"), retry = section.querySelector<HTMLButtonElement>("[data-board-env-retry]");
  const languages = [...section.querySelectorAll<HTMLButtonElement>("[data-board-env-lang]")];
  const rendered = (tag: string) => section.querySelector<HTMLTemplateElement>(`template[data-board-env-render="${tag}"]`)?.content ?? null;
  const switcher = createLocaleSwitch({ root: live, render: async (tag) => rendered(tag), use: (tag) => { locale = tag; }, produced, retext: (ref) => say.text(ref) }, locale);

  /** The page works the snapshot out again with the same function, from the same definitions: they must agree. */
  const checkSnapshot = () => {
    const { spec, skin, snapshots } = data.environment;
    const mine = resolveUiEnvironment({ spec, skin, locale: { tag: locale, source: "explicit" } });
    const same = JSON.stringify(mine) === JSON.stringify(snapshots[locale]);
    const line = live.querySelector<HTMLElement>("[data-board-env-snapshot]");
    if (!line) return;
    line.dataset.same = String(same);
    // The line's own text node, written in place like everything else in the section: nothing in it is taken out.
    const text = line.firstChild instanceof Text ? line.firstChild : line.appendChild(document.createTextNode(""));
    text.data = t.text(same ? "workbench.env.snapshot-same" : "workbench.env.snapshot-differs");
  };

  /** The toggles say the language on show, also when a switch did not happen: the toggle group marks what was clicked. */
  const showCurrent = () => {
    for (const button of languages) {
      const current = button.dataset.boardEnvLang === switcher.current();
      button.setAttribute("aria-pressed", String(current));
      button.classList.toggle("is-current", current);
    }
  };

  const choose = async (tag: string) => {
    const merged = await switcher.switchTo(tag);
    showCurrent();
    if (merged === null) {
      // Nothing on the page changed: say so, and offer the same switch again.
      if (status) { status.textContent = t.text("workbench.env.failed"); status.hidden = false; }
      if (retry) { retry.dataset.boardEnvRetry = tag; retry.querySelector("[data-slot=button-label]")!.textContent = t.text("workbench.env.retry"); retry.hidden = false; }
      return;
    }
    if (status) status.hidden = true;
    if (retry) retry.hidden = true;
    languages[0]?.parentElement?.setAttribute("aria-label", t.text("workbench.env.switch"));
    section.dataset.boardEnvShown = switcher.current();
    checkSnapshot();
  };

  section.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const language = target?.closest<HTMLElement>("[data-board-env-lang]");
    if (language?.dataset.boardEnvLang) { void choose(language.dataset.boardEnvLang); return; }
    const again = target?.closest<HTMLElement>("[data-board-env-retry]");
    if (again?.dataset.boardEnvRetry) { void choose(again.dataset.boardEnvRetry); return; }
    const rows = live.querySelector("[data-board-env-rows]");
    if (target?.closest("[data-board-env-add-row]") && rows) {
      const row = document.createElement("li");
      row.textContent = t.text("workbench.env.row", { n: ++added });
      rows.append(row);
    } else if (target?.closest("[data-board-env-add-user]") && rows) {
      // The person's own words, which happen to be an interface word: the page drew them, nothing produced them.
      const row = document.createElement("li");
      row.textContent = "保存";
      rows.append(row);
    }
  });
  checkSnapshot();
  section.dataset.boardEnvShown = locale;
}
