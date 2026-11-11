import type { KitCatalog } from "@molis-ai/molis-work-contracts/services/kit";
import { renderAlert, renderEmpty, renderSkeleton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, esc, kitOf, L, post, skillUi, type Kit } from "./common.js";
import { applyPicked, exportPack, handPackage, importPanel, readKitFile, type ExportPart } from "./files.js";
import { packViews, type View } from "./view.js";

// The 「能力包」 page (decided scheme A, docs/design/capability-pack/README.md): the pack list beside one pack; an entry of the pack opens
// in the pack's place under a way back. One read of `kit.catalog.list` draws it all; the toolbar stays, everything under it is redrawn.

export function mountKit(root: HTMLElement): void {
  if (root.dataset.kitBound) return;
  root.dataset.kitBound = "1";
  const project = root.dataset.project ?? "";
  const $ = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-kit-${name}]`)!;
  const body = $("body"), notice = $("notice"), search = $<HTMLInputElement>("search"), kindSelect = $<HTMLSelectElement>("kind"), groupSelect = $<HTMLSelectElement>("group");
  const pluginsHref = `/projects/${encodeURIComponent(project || "personal")}/settings/plugins`;
  const view: View = { query: "", kind: "all", group: "all", detail: false };
  let kit: Kit | undefined, failure: unknown, turn = 0, entering = false;

  const say = (text: string, tone: "success" | "danger" = "success") => {
    notice.hidden = false;
    notice.innerHTML = renderAlert({ title: text, tone, role: tone === "danger" ? "alert" : "status" });
  };

  async function load(): Promise<void> {
    const mine = ++turn;
    failure = undefined;
    try {
      const catalog = await post<KitCatalog>(project, "list");
      if (mine === turn) kit = kitOf(catalog);
    } catch (cause) { if (mine === turn) failure = cause; }
    if (mine === turn) draw();
  }

  // ---------- drawing ----------
  function draw(focus?: "detail" | "list" | "from" | "import"): void {
    if (failure) {
      body.innerHTML = renderEmpty({ icon: "alert", title: L("没能读出能力包"), body: (failure as Error)?.message || L("宿主没有回应，什么都没改。"), className: "mw-empty--error",
        action: `<div class="kit-chips">${button(L("重试"), { icon: "refresh", attrs: act("retry") })}</div>` });
      return;
    }
    if (!kit) {
      body.innerHTML = `<p class="kit-summary" role="status">${esc(L("正在读能力包…"))}</p><div class="mw-list-detail"><div class="mw-list-detail__body"><section class="mw-list-detail__list"><ul class="mw-items">${
        Array.from({ length: 6 }, () => `<li class="mw-item">${renderSkeleton({ className: "mw-mark" })}${renderSkeleton()}</li>`).join("")}</ul></section></div></div>`;
      return;
    }
    if (view.importing) {
      body.innerHTML = importPanel(kit, project, view.importing);
      if (focus === "import") root.querySelector<HTMLElement>("#kit-import-title")?.focus();
      return;
    }
    const { shown, packRow, packDetail, itemDetail, summary, onlyBuiltin } = packViews(kit, view, pluginsHref);
    const packs = shown();
    if (packs.length && !packs.some(pack => pack.pack_id === view.pack)) { view.pack = packs[0]!.pack_id; view.item = undefined; }
    const pack = packs.find(candidate => candidate.pack_id === view.pack);
    const entry = pack && view.item ? kit.byKey.get(view.item) : undefined;
    const clear = view.query ? button(L("清除搜索"), { icon: "x", attrs: act("clear-q") }) : view.kind !== "all" ? button(L("看全部类别"), { attrs: act("clear-k") }) : view.group !== "all" ? button(L("看全部状态"), { attrs: act("clear-g") }) : "";
    const list = packs.length ? `<ul class="mw-items">${packs.map(packRow).join("")}</ul>` : `<p class="kit-inline-empty">${esc(L("没有符合的能力包"))}${clear}</p>`;
    const right = pack ? (entry ? itemDetail(pack, entry) : packDetail(pack))
      : renderEmpty({ icon: "search", title: L("没有符合的能力包"), body: L("换个词，或者清除搜索看全部。"), action: clear ? `<div class="kit-chips">${clear}</div>` : "" });
    body.innerHTML = `${summary(packs)}${onlyBuiltin()}<div class="mw-list-detail" data-sticky-detail${view.detail && pack ? " data-detail" : ""}><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(L("能力包"))}">${list}</section><section class="mw-list-detail__detail kit-detail${entering ? " is-entering" : ""}"${entry?.kind === "skill" ? " data-kit-skill" : ""} aria-label="${esc(L(entry ? "条目详情" : "能力包"))}">${right}</section></div></div>`;
    entering = false;
    const skillBox = body.querySelector<HTMLElement>("[data-kit-skill]");
    // A Skill's state redraws the page (its row's word changes too); the focus stays on the choice it was on.
    // 08's own detail goes in after the way back, and what the kit adds stays last.
    if (skillBox && entry?.kind === "skill") {
      const outer = skillBox.querySelector(".kit-outer");
      skillUi()?.detail(skillBox, entry.skill, project, { notice, redraw: () => {
        const kept = skillBox.contains(document.activeElement) && !document.activeElement?.closest(".mw-list-detail__trail, .kit-outer");
        draw();
        if (kept) body.querySelector<HTMLElement>("[data-kit-skill] input:checked")?.focus();
      } });
      if (outer) skillBox.append(outer);
    }
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
      return say(L("已导出：{x}", { x: file }));
    }
    if (name === "import-apply" && view.importing) { (origin as HTMLButtonElement).disabled = true; await applyPicked(project, view.importing); return draw("import"); }
    if (name === "import-package" && view.importing) {
      if (handPackage(view.importing)) { location.href = pluginsHref; return; }
      return say(L("这个窗口存不下这个内容包。请在插件设置里选这个文件安装。"), "danger");
    }
  }

  root.addEventListener("click", event => {
    const origin = (event.target as Element).closest<HTMLElement>("[data-kit-act]");
    if (!origin || !root.contains(origin) || (origin as HTMLButtonElement).disabled) return;
    notice.hidden = true;
    run(origin.dataset.kitAct!, origin.dataset.kitV, origin).catch(cause => say((cause as Error)?.message || String(cause), "danger"));
  });
  search.addEventListener("input", () => { view.query = search.value; draw(); });
  kindSelect.addEventListener("change", () => { view.kind = kindSelect.value as View["kind"]; view.item = undefined; draw(); });
  groupSelect.addEventListener("change", () => { view.group = groupSelect.value as View["group"]; draw(); });
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
  draw();
  void load();
}
