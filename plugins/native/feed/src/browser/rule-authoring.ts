import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRuleRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { FEED_CAPTURE_SCENE_ID, FEED_OPEN_OPTION_ID, INBOX_ADMIT_OPTION_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FeedPage } from "./factory.js";

interface RuleDraft { mode?: string; fields?: Record<string, string>; function?: JudgmentRuleRecord; functionKey?: string; functionContent?: string; previewContent?: string }
interface RuleInput { mode: string; instructions: string; contains: string; judgment: ActionReference | null; name: string; admission: string }
interface Preview { samples: Array<{ item_id: string; title: string; input: string; matched: boolean }> }
interface Catalog { choices: Array<{ reference: ActionReference; title: string; available: boolean; reason?: string }>; usages: Array<{ binding_id: string; enabled: boolean; availability: { available: boolean; reason?: string } }> }
const fields = ["data-feed-out-rule-name", "data-feed-out-rule-contains", "data-feed-rule-instructions", "data-feed-out-rule-function-key", "data-feed-out-rule-admission"];

/** Draft recovery and CAS stay with Functions; Feed consumes six exact, provider-pinned authoring actions. */
export function feedRules(page: FeedPage) {
  const { host, q, all } = page, L = host.translate, drafts = new Map<string, RuleDraft>();
  const key = (section: HTMLElement) => host.route("/") + ":feed-rule:" + section.dataset.feedOutRules;
  const state = (section: HTMLElement): RuleDraft => { const id = key(section); if (!drafts.has(id)) { let value: RuleDraft = {}; try { value = JSON.parse(sessionStorage.getItem(id) || "{}"); } catch { /* No saved draft. */ } drafts.set(id, value); } return drafts.get(id)!; };
  const value = (section: HTMLElement, attr: string) => q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[" + attr + "]", section)?.value.trim() || "";
  const remember = (section: HTMLElement) => { const draft = state(section); draft.mode = section.dataset.ruleMode || "keyword"; draft.fields = Object.fromEntries(fields.map(attr => [attr, value(section, attr)])); try { sessionStorage.setItem(key(section), JSON.stringify(draft)); } catch { /* The current in-memory draft remains. */ } };
  const status = (section: HTMLElement, message: unknown) => { const node = q("[data-feed-rule-status]", section); if (!node) return; node.hidden = !message; node.dataset.error = String(Boolean(message) && typeof message !== "string"); if (typeof message === "string") node.textContent = message; else molisWorkRequest.show(node, message); };
  const mode = (section: HTMLElement, next: string) => { section.dataset.ruleMode = next; all("[data-feed-rule-mode]", section).forEach(button => button.setAttribute("aria-pressed", String(button.dataset.feedRuleMode === next))); all("[data-feed-rule-field]", section).forEach(field => field.hidden = field.dataset.feedRuleField !== next); };
  const authoring = (name: "list" | "get" | "create" | "update" | "preview" | "publish", version: number) => ({ capability_id: "functions.authoring." + name, version, provider_id: "system.functions" });
  const revisionOf = (fn: JudgmentRuleRecord) => ({ id: fn.id, expected_updated_at: fn.updated_at });
  const action = async <T>(name: Parameters<typeof authoring>[0], version: number, input: unknown): Promise<T> => { const check = page.guard(); const result = await host.invokeAction<T>(authoring(name, version), input); check(); return result; };
  const catalog = async (section: HTMLElement) => {
    const select = q<HTMLSelectElement>("[data-feed-out-rule-function-key]", section); if (!select) return;
    const check = page.guard(), sequence = String(Number(select.dataset.catalogRequest || 0) + 1); select.dataset.catalogRequest = sequence;
    try {
      const result = await page.api<Catalog>("/out-rules/judgments"); check(); if (!select.isConnected || select.dataset.catalogRequest !== sequence) return;
      const selected = select.value || state(section).fields?.["data-feed-out-rule-function-key"] || "";
      select.replaceChildren(new Option(L("请选择判断能力"), ""));
      result.choices.forEach(choice => { const option = new Option(choice.title + (choice.available ? "" : " · " + choice.reason), JSON.stringify(choice.reference)); option.disabled = !choice.available; select.append(option); });
      if (selected && ![...select.options].some(option => option.value === selected)) { const option = new Option(L("原判断能力不可用，请重新选择"), selected); option.disabled = true; select.append(option); } select.value = selected;
      all("[data-feed-out-rule-row]", section).forEach(row => { const usage = result.usages.find(usage => usage.binding_id === "feed.capture:" + row.dataset.feedOutRuleRow), label = q("[data-feed-rule-binding-status]", row); if (label && usage) label.textContent = !usage.enabled ? L("已停用") : usage.availability.available ? L("已启用") : usage.availability.reason || L("原判断能力不可用，请重新配置"); });
    } catch (error) { try { check(); status(section, error); } catch { /* Old editor. */ } }
  };
  const hydrate = () => all("[data-feed-out-rules]").forEach(section => {
    const composer = q("[data-feed-rule-composer]", section); if (!composer || section.closest("[hidden]")) return;
    const saved = state(section); mode(section, saved.mode || "keyword");
    if (!composer.dataset.hydrated) { for (const [attr, text] of Object.entries(saved.fields || {})) { const field = q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[" + attr + "]", section); if (field) field.value = text; } composer.dataset.hydrated = "true"; void catalog(section); }
  });
  const read = (section: HTMLElement): RuleInput => {
    const current = section.dataset.ruleMode || "keyword", instructions = value(section, "data-feed-rule-instructions"), contains = current === "keyword" ? value(section, "data-feed-out-rule-contains") : "", selected = current === "existing" ? value(section, "data-feed-out-rule-function-key") : "";
    if (current === "keyword" && !contains) throw new Error(L("填写一个关键词，再预览匹配结果。"));
    if (current === "natural" && !instructions) throw new Error(L("先描述你想捕捉什么消息。"));
    if (current === "existing" && !selected) throw new Error(L("请选择一条已发布规则。"));
    return { mode: current, instructions, contains, judgment: selected ? JSON.parse(selected) as ActionReference : null, name: value(section, "data-feed-out-rule-name") || contains || instructions.slice(0, 40), admission: value(section, "data-feed-out-rule-admission") || "suggest" };
  };
  const ensureDraft = async (section: HTMLElement, rule: RuleInput) => {
    const check = page.guard(), saved = state(section), content = JSON.stringify({ name: rule.name, instructions: rule.instructions });
    if (saved.function?.status === "published" && saved.functionContent !== content) { delete saved.function; delete saved.functionKey; delete saved.previewContent; }
    if (!saved.function) {
      saved.functionKey ||= "feed_rule_" + crypto.randomUUID().replaceAll("-", ""); remember(section);
      try { saved.function = (await action<{ function: JudgmentRuleRecord }>("create", /* @version action.functions.authoring.create */ 1, { name: rule.name, function_key: saved.functionKey, primitive: "noul" })).function; }
      catch (error) { check(); if (error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500 && !("code" in error && error.code === "functions.key_conflict")) throw error; const listed = await action<{ functions: JudgmentRuleRecord[] }>("list", /* @version action.functions.authoring.list */ 1, {}); saved.function = listed.functions.find(fn => fn.function_key === saved.functionKey); if (!saved.function) throw error; } remember(section);
    }
    if (saved.functionContent !== content) {
      saved.function = (await action<{ function: JudgmentRuleRecord }>("update", /* @version action.functions.authoring.update */ 1, { ...revisionOf(saved.function), patch: { name: rule.name, instructions: rule.instructions, criteria: { true_description: "符合用户描述，值得关注。", false_description: "不符合用户描述，无需关注。" }, scene_id: FEED_CAPTURE_SCENE_ID, subject_kinds: ["feed_item"], scene_map: { true: INBOX_ADMIT_OPTION_ID, false: FEED_OPEN_OPTION_ID } } })).function;
      saved.functionContent = content; delete saved.previewContent; remember(section);
    }
    return saved.function;
  };
  for (const type of ["input", "change"] as const) page.listen(type, event => { const target = event.target instanceof Element ? event.target : null, section = target?.closest<HTMLElement>("[data-feed-out-rules]"); if (section && target?.closest("[data-feed-rule-composer]")) remember(section); });
  const click = async (target: Element): Promise<boolean> => {
    const modeButton = target.closest<HTMLElement>("[data-feed-rule-mode]"); if (modeButton) { const section = modeButton.closest<HTMLElement>("[data-feed-out-rules]"); if (section) { mode(section, modeButton.dataset.feedRuleMode!); remember(section); const preview = q("[data-feed-rule-preview]", section); if (preview) preview.hidden = true; status(section, ""); if (modeButton.dataset.feedRuleMode === "existing") await catalog(section); } return true; }
    const manage = target.closest<HTMLButtonElement>("[data-feed-out-rule-toggle],[data-feed-out-rule-delete],[data-feed-out-rules-evaluate]");
    if (manage) { const check = page.guard(); manage.disabled = true; const release = page.pending(() => { if (manage.isConnected) manage.disabled = false; }); try { if (manage.dataset.feedOutRulesEvaluate) { const snapshot = await page.api<{ feed_items: Array<{ source_id: string; item_id: string }> }>("/snapshot"); const items = snapshot.feed_items.filter(item => item.source_id === manage.dataset.feedOutRulesEvaluate).slice(0, 20); if (!items.length) throw new Error(L("请先拉取来源内容")); await page.api("/out-rules/evaluate", "POST", { item_ids: items.map(item => item.item_id) }); } else await page.api("/out-rules/" + encodeURIComponent(manage.dataset.feedOutRuleToggle || manage.dataset.feedOutRuleDelete!), manage.dataset.feedOutRuleDelete ? "DELETE" : "PATCH", manage.dataset.feedOutRuleDelete ? undefined : { enabled: manage.dataset.enabled !== "true" }); host.invalidateView(); await page.refresh(); } catch (error) { try { check(); page.error(error); } catch { /* Old mount. */ } } finally { try { check(); release(); } catch { /* Old mount. */ } } return true; }
    const button = target.closest<HTMLButtonElement>("[data-feed-rule-preview-run],[data-feed-out-rule-create]"); if (!button) return false;
    const section = button.closest<HTMLElement>("[data-feed-out-rules]"), composer = section && q("[data-feed-rule-composer]", section); if (!section || !composer || composer.inert) return true;
    const check = page.guard(), preview = button.hasAttribute("data-feed-rule-preview-run"); composer.inert = true; composer.setAttribute("aria-busy", "true"); const release = page.pending(() => { if (composer.isConnected) { composer.inert = false; composer.removeAttribute("aria-busy"); } });
    try {
      const rule = read(section), saved = state(section);
      if (preview) {
        const result = await page.api<Preview>("/out-rules/preview", "POST", { source_id: section.dataset.feedOutRules, contains: rule.contains });
        if (!result.samples.length) throw new Error(L("还没有可预览的消息。先拉取来源内容，再试一次。"));
        if (rule.mode === "natural") {
          const available = await host.actionAvailability(authoring("preview", /* @version action.functions.authoring.preview */ 1)); check();
          if (!available.available) throw new Error(available.reason); await ensureDraft(section, rule);
        }
        const output = q("[data-feed-rule-preview]", section), rows: Array<{ title: string; matched: boolean; review: boolean }> = [];
        for (const sample of result.samples) {
          let matched = sample.matched, review = false;
          if (rule.mode === "natural") { const fn = saved.function!; saved.function = (await action<{ function: JudgmentRuleRecord }>("preview", /* @version action.functions.authoring.preview */ 1, { ...revisionOf(fn), input: sample.input })).function; const evaluated = saved.function.last_preview; review = evaluated?.outcome !== "ok"; matched = !review && (evaluated?.noul ?? 0) >= 0.5; remember(section); }
          else if (rule.mode === "existing") { const evaluated = await page.api<{ status: string; suggested_behavior_ids: string[] }>("/out-rules/preview-judgment", "POST", { judgment: rule.judgment, item_id: sample.item_id }); review = evaluated.status !== "ok"; matched = !review && evaluated.suggested_behavior_ids.includes(INBOX_ADMIT_OPTION_ID); }
          rows.push({ title: sample.title, matched, review });
        }
        check(); if (rule.mode === "natural") { saved.previewContent = saved.functionContent; remember(section); }
        if (output) { output.replaceChildren(); const heading = document.createElement("strong"); heading.textContent = L("最近 {count} 条消息的预览", { count: rows.length }); output.append(heading); rows.forEach(row => { const line = document.createElement("div"), title = document.createElement("span"), outcome = document.createElement("span"); line.className = "feed-rule-preview-row"; title.textContent = row.title; outcome.className = "feed-rule-preview-outcome"; outcome.textContent = L(row.review ? "待复核" : row.matched ? "匹配" : "不匹配"); outcome.dataset.match = String(row.matched); line.append(title, outcome); output.append(line); }); output.hidden = false; } status(section, L("预览完成，未改变消息或 Inbox。"));
      } else {
        if (rule.mode === "natural") { const content = JSON.stringify({ name: rule.name, instructions: rule.instructions }); if (!saved.function || saved.previewContent !== content) throw new Error(L("请先用当前描述预览，再保存并启用。")); if (saved.function.status !== "published") saved.function = (await action<{ function: JudgmentRuleRecord }>("publish", /* @version action.functions.authoring.publish */ 1, revisionOf(saved.function))).function; if (!saved.function.version) throw new Error(L("原判断能力不可用，请重新选择")); rule.judgment = { capability_id: "functions.published." + saved.function.function_key, version: saved.function.version, provider_id: "system.functions" }; remember(section); }
        await page.api("/out-rules", "POST", { name: rule.name || L("来源捕捉规则"), contains: rule.contains, source_id: section.dataset.feedOutRules, admission: rule.admission, judgment: rule.judgment }); check(); drafts.delete(key(section)); sessionStorage.removeItem(key(section)); composer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea").forEach(field => field.value = ""); delete composer.dataset.hydrated; host.invalidateView(); await page.refresh(); host.showToast(L("规则已启用，将处理新消息和更新。"));
      }
    } catch (error) { try { check(); status(section, error); } catch { /* Preserve the last committed draft, without stale writes. */ } }
    finally { try { check(); release(); } catch { /* No old-finally DOM writes. */ } } return true;
  };
  return { click, hydrate };
}
