import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitCatalog } from "@molis-ai/molis-work-contracts/services/kit";
import { renderAlert, renderEmpty, renderSkeleton, type AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, esc, kitOf, linkedKitEntry, readText, post, skillUi, updateKitWords, type Kit } from "./common.js";
import { setSkillScenes } from "./scenes.js";
import { skillWriting, type WritingFocus } from "./writing.js";
import { applyPicked, exportPack, handPackage, importPanel, readKitFile, type ExportPart } from "./files.js";
import { mountKitPromptEditor, type PromptRecordResponse } from "./prompt-editor.js";
import { packViews, type View } from "./view.js";
import type { KitSettingsPage } from "./writing-context.js";

// The 「能力包」 page (decided scheme A, docs/design/capability-pack/README.md): the pack list beside one pack; an entry of the pack opens
// in the pack's place under a way back. One read of `kit.catalog.list` draws it all; the toolbar stays, everything under it is redrawn.

export function mountKit(root: HTMLElement, page?: KitSettingsPage): () => void {
  const project = root.dataset.project ?? "";
  const $ = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-kit-${name}]`)!;
  const body = $("body"), notice = $("notice"), search = $<HTMLInputElement>("search"), kindSelect = $<HTMLSelectElement>("kind"), groupSelect = $<HTMLSelectElement>("group");
  const pluginsHref = `/projects/${encodeURIComponent(project || "personal")}/settings/plugins`;
  const view: View = { query: "", kind: "all", group: "all", detail: false };
  const address = page ?? { address: () => new URL(location.href), replace: (next: URL) => history.replaceState(history.state, "", next) };
  const link = address.address().searchParams;
  let followLink = Boolean(link.get("install") && (link.get("skill") || link.get("role")));
  const selectedLanguage = () => document.documentElement.dataset.uiLanguageTag ?? document.documentElement.lang;
  let kit: Kit | undefined, failure: unknown, turn = 0, entering = false, requestedLanguage: string | undefined, disposed = false;
  let savedPrompt: PromptRecordResponse | undefined;
  setSkillScenes([]);

  const say = (text: string, tone: "success" | "danger" = "success", next?: { label: string; attrs: Record<string, AttrValue> }) => notify(notice, text, tone, next);

  const writing = skillWriting({ root, project, address, active: () => !disposed, view, kit: () => kit, load: () => load(), draw: focus => draw(focus), say,
    show(entry) { view.query = ""; search.value = ""; view.kind = "all"; kindSelect.value = "all"; view.group = "all"; groupSelect.value = "all"; open(entry.pack, entry.key); } });
  page?.retain({
    beforeReplace: writing.beforeReplace,
    dispose() {
      disposed = true;
      setSkillScenes([]);
      writing.dispose();
    },
  });
  async function load(retitle = false): Promise<void> {
    const mine = ++turn, language = selectedLanguage();
    requestedLanguage = language;
    failure = undefined;
    try {
      const catalog = await post<KitCatalog>(project, "list");
      if (mine !== turn || disposed) return;
      if (retitle && kit) {
        const before = translatedView(kit, view.importing);
        setSkillScenes(catalog.scenes ?? []);
        updateKitWords(kit, catalog);
        globalThis.molisWorkRetitleRegion?.(body, before, translatedView(kit, view.importing));
        return;
      }
      setSkillScenes(catalog.scenes ?? []);
      kit = kitOf(catalog);
      if (followLink) {
        followLink = false;
        const selected = linkedKitEntry(catalog, link);
        if (selected) open(selected.pack, selected.key);
        else say(readText("workbench.automation.item-changed"), "danger");
      }
    } catch (cause) {
      if (mine !== turn || disposed) return;
      if (retitle && kit) { requestedLanguage = undefined; say((cause as Error)?.message || readText("workbench.kit.host-did-not-respond"), "danger"); return; }
      failure = cause;
    }
    if (mine === turn) draw();
  }

  function translatedView(source: Kit, importing: View["importing"]): string {
    if (importing) return importPanel(source, project, importing);
    const ids = [...body.querySelectorAll<HTMLElement>('[data-kit-act="pack"]')].map(row => row.dataset.kitV);
    const packs = ids.flatMap(id => source.catalog.packs.find(pack => pack.pack_id === id) ?? []);
    if (view.workshop) return writing.workshop() ?? "";
    const result = kitMarkup(source, view, pluginsHref, packs, false, writing.asking(), writing.strip()), region = document.createElement("div");
    region.innerHTML = result.html;
    if (result.entry?.kind === "skill") {
      const box = region.querySelector<HTMLElement>("[data-kit-skill]")!;
      drawSkill(box, result.entry, project, notice, () => {}, writing.decorate);
    }
    return region.innerHTML;
  }

  // ---------- drawing ----------
  function draw(focus?: "detail" | "list" | "from" | "import" | WritingFocus): void {
    if (disposed) return;
    if (failure) {
      body.innerHTML = renderEmpty({ icon: "alert", title: readText("workbench.kit.read-failed"), body: (failure as Error)?.message || readText("workbench.kit.host-did-not-respond"), className: "mw-empty--error",
        action: `<div class="kit-chips">${button(readText("common.control.retry"), { icon: "refresh", attrs: act("retry") })}</div>` });
      return;
    }
    if (!kit) {
      body.innerHTML = `<p class="kit-summary" role="status">${esc(readText("workbench.kit.reading"))}</p><div class="mw-list-detail"><div class="mw-list-detail__body"><section class="mw-list-detail__list"><ul class="mw-items">${
        Array.from({ length: 6 }, () => `<li class="mw-item">${renderSkeleton({ className: "mw-mark" })}${renderSkeleton()}</li>`).join("")}</ul></section></div></div>`;
      return;
    }
    if (view.workshop) {
      body.innerHTML = writing.workshop() ?? "";
      writing.focus(body, focus);
      return;
    }
    if (view.importing && !view.asking) {
      body.innerHTML = importPanel(kit, project, view.importing);
      if (focus === "import") root.querySelector<HTMLElement>("#kit-import-title")?.focus();
      return;
    }
    const packs = packViews(kit, view, pluginsHref).shown();
    if (packs.length && !packs.some(pack => pack.pack_id === view.pack)) { view.pack = packs[0]!.pack_id; view.item = undefined; }
    const { entry, html } = kitMarkup(kit, view, pluginsHref, packs, entering, writing.asking(), writing.strip());
    body.innerHTML = html;
    entering = false;
    const skillBox = body.querySelector<HTMLElement>("[data-kit-skill]");
    // A Skill's state redraws the page (its row's word changes too); the focus stays on the choice it was on.
    // 08's own detail goes in after the way back, and what the kit adds stays last.
    if (skillBox && entry?.kind === "skill") {
      drawSkill(skillBox, entry, project, notice, () => {
        const kept = skillBox.contains(document.activeElement) && !document.activeElement?.closest(".mw-list-detail__trail, .kit-outer");
        draw();
        if (kept) body.querySelector<HTMLElement>("[data-kit-skill] input:checked")?.focus();
      }, writing.decorate);
    }
    const promptBox = body.querySelector<HTMLElement>("[data-kit-prompt-editor]");
    if (promptBox && entry?.kind === "prompt" && promptBox.dataset.kitPromptEditor) {
      const promptKey = promptBox.dataset.kitPromptEditor;
      const cached = savedPrompt?.prompt.key === promptKey ? savedPrompt : undefined;
      savedPrompt = undefined;
      mountKitPromptEditor(promptBox, promptKey, {
        onSaved: (next) => {
          savedPrompt = next;
          void load();
        },
        say,
      }, cached);
    }
    writing.focus(body, focus);
    if (focus === "detail") body.querySelector<HTMLElement>(".kit-detail h3")?.focus();
    if (focus === "list") body.querySelector<HTMLElement>(".mw-list-detail__list [aria-current='true']")?.focus();
    if (focus === "from") (body.querySelector<HTMLElement>(`.kit-detail [data-kit-act="item"][data-kit-v="${CSS.escape(view.from ?? "")}"]`) ?? body.querySelector<HTMLElement>(".kit-detail h3"))?.focus();
  }

  // ---------- what the person does ----------
  const open = (pack?: string, item?: string, from?: string) => { view.pack = pack ?? view.pack; view.item = item; view.from = from; view.detail = true; entering = true; };
  async function run(name: string, value: string | undefined, origin: HTMLElement): Promise<void> {
    if (name === "pack") { open(value); return draw("detail"); }
    if (name === "item") { open(view.pack, value); return draw("detail"); }
    if (name === "up") { const from = view.item; open(view.pack, undefined, from); return draw("from"); }
    if (name === "unsel") { view.detail = false; return draw("list"); }
    if (name === "only-na") { view.group = "na"; groupSelect.value = "na"; return draw(); }
    if (name === "clear-q") { view.query = ""; search.value = ""; search.focus(); return draw(); }
    if (name === "clear-k") { view.kind = "all"; kindSelect.value = "all"; return draw(); }
    if (name === "clear-g") { view.group = "all"; groupSelect.value = "all"; return draw(); }
    if (name === "retry") { kit = undefined; failure = undefined; draw(); return load(); }
    if (name === "import") return $<HTMLInputElement>("file").click();
    if (name === "import-local") { const panel = $("local-import"); return skillUi()?.importPanel(panel, project, load); }
    if (name === "install") { location.href = `${pluginsHref}#plugin-trust-install-title`; return; }
    if (name === "import-close") { view.importing = undefined; return draw(); }
    if (name === "export") {
      origin.closest<HTMLElement>("[popover]")?.hidePopover();
      const pack = kit!.catalog.packs.find(candidate => candidate.pack_id === view.pack)!;
      const file = await exportPack(project, kit!, pack, value as ExportPart);
      return say(readText("workbench.kit.exported", { x: file }));
    }
    if (name === "import-apply" && view.importing) { (origin as HTMLButtonElement).disabled = true; await applyPicked(project, view.importing); return draw("import"); }
    if (name === "import-package" && view.importing) {
      if (handPackage(view.importing)) { location.href = pluginsHref; return; }
      return say(readText("workbench.kit.package-not-retained"), "danger");
    }
    return writing.run(name, value, origin);
  }

  root.addEventListener("click", event => {
    const origin = (event.target as Element).closest<HTMLElement>("[data-kit-act]");
    if (!origin || !root.contains(origin) || (origin as HTMLButtonElement).disabled) return;
    const name = origin.dataset.kitAct!;
    const go = () => { run(name, origin.dataset.kitV, origin).catch(cause => say((cause as Error)?.message || String(cause), "danger")); };
    if (writing.holds(name, go)) return;
    notice.hidden = true;
    go();
  });
  search.addEventListener("input", () => { view.query = search.value; draw(); });
  kindSelect.addEventListener("change", () => { view.kind = kindSelect.value as View["kind"]; view.item = undefined; draw(); });
  groupSelect.addEventListener("change", () => { view.group = groupSelect.value as View["group"]; draw(); });
  listenForImports(root, project, view, focus => draw(focus), say);
  draw();
  void load().then(() => { if (!disposed) return writing.fromAddress(); });
  return () => {
    const language = selectedLanguage();
    if (language !== requestedLanguage && root.getClientRects().length) void load(true);
  };
}

/** A file chosen to import is read into the import panel; a picked part of it is kept for applying. */
function listenForImports(root: HTMLElement, project: string, view: View, draw: (focus?: "import") => void, say: (text: string, tone: "danger") => void): void {
  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.kitPick !== undefined && view.importing) {
      if (target.checked) view.importing.picked.add(target.dataset.kitPick); else view.importing.picked.delete(target.dataset.kitPick);
      return draw();
    }
    if (target.matches("[data-kit-file]") && target.files?.[0]) {
      const chosen = target.files[0];
      target.value = "";
      readKitFile(project, chosen).then(importing => { view.importing = importing; draw("import"); }, cause => say((cause as Error)?.message || String(cause), "danger"));
    }
  });
}

/** The page's notice under the toolbar. One that offers a next step is said where the person can see it, wherever the detail's focus scrolled the page. */
function notify(notice: HTMLElement, text: string, tone: "success" | "danger", next?: { label: string; attrs: Record<string, AttrValue> }): void {
  notice.hidden = false;
  notice.innerHTML = renderAlert({ title: text, tone, role: tone === "danger" ? "alert" : "status", ...(next ? { actions: [{ label: next.label, variant: "secondary" as const, size: "sm" as const, attrs: next.attrs }] } : {}) });
  if (next) notice.scrollIntoView({ block: "nearest" });
}

function drawSkill(box: HTMLElement, entry: Extract<KitEntry, { kind: "skill" }>, project: string, notice: HTMLElement, redraw: () => void,
  decorate: (box: HTMLElement, entry: Extract<KitEntry, { kind: "skill" }>) => void): void {
  const outer = box.querySelector(".kit-outer");
  skillUi()?.detail(box, entry.skill, project, { notice, redraw });
  if (outer) box.append(outer);
  // Under 08's heading: a draft, a source's newer version, whose it is (batch 41); its versions above what the kit adds (batch 42).
  decorate(box, entry);
}

function kitMarkup(kit: Kit, view: View, pluginsHref: string, packs: KitCatalog["packs"], entering: boolean, writing?: string, drafts = "") {
  const { packRow, packDetail, itemDetail, summary, onlyBuiltin } = packViews(kit, view, pluginsHref);
  const pack = packs.find(candidate => candidate.pack_id === view.pack);
  const entry = pack && view.item && !writing ? kit.byKey.get(view.item) : undefined;
  const clear = view.query ? button(readText("workbench.chooser.clear-search"), { icon: "x", attrs: act("clear-q") }) : view.kind !== "all" ? button(readText("workbench.kit.show-all-kinds"), { attrs: act("clear-k") }) : view.group !== "all" ? button(readText("workbench.kit.show-all-states"), { attrs: act("clear-g") }) : "";
  const list = packs.length ? `<ul class="mw-items">${packs.map(packRow).join("")}</ul>` : `<p class="kit-inline-empty">${esc(readText("workbench.kit.no-matches"))}${clear}</p>`;
  const right = writing ?? (pack ? (entry ? itemDetail(pack, entry) : packDetail(pack))
    : renderEmpty({ icon: "search", title: readText("workbench.kit.no-matches"), body: readText("workbench.kit.try-other-search"), action: clear ? `<div class="kit-chips">${clear}</div>` : "" }));
  return { entry, html: `${summary(packs)}${onlyBuiltin()}${drafts}<div class="mw-list-detail" data-sticky-detail${view.detail && (pack || writing) ? " data-detail" : ""}><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(readText("workbench.kit.title"))}">${list}</section><section class="mw-list-detail__detail kit-detail${entering ? " is-entering" : ""}"${entry?.kind === "skill" ? " data-kit-skill" : ""} aria-label="${esc(readText(entry ? "workbench.kit.entry-detail" : "workbench.kit.title"))}">${right}</section></div></div>` };
}
