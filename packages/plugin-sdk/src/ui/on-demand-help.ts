import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { UI_HELP_LIMITS, type UiHelpDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "../json-value.js";
import { renderButton, type MwButtonOptions } from "./button.js";
import { cx, escapeHtml, renderAttrs, type AttrValue } from "./html.js";
import { icon, type PluginIconName } from "./icon.js";
import { tryOwnedTextRef } from "./text-ref.js";

const HELP_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const MAX_VISIBLE_LITERAL = 2000;

export type MwFactTone = "neutral" | "ok" | "warn" | "out";

export interface MwPreActionFactRow {
  readonly tone?: MwFactTone;
  readonly icon?: PluginIconName;
  readonly text: string;
  readonly detail?: string;
  readonly action?: MwButtonOptions;
  readonly attrs?: Record<string, AttrValue>;
}

export interface MwPreActionFactsOptions {
  readonly heading: string;
  readonly ariaLabel?: string;
  readonly rows: readonly MwPreActionFactRow[];
  readonly className?: string;
  readonly attrs?: Record<string, AttrValue>;
}

export interface MwHelpSectionView {
  readonly id: string;
  readonly heading: string;
  readonly body?: string;
  readonly items?: readonly string[];
  readonly collapsible?: boolean;
  readonly summary?: string;
}

export interface MwHelpNextStepView {
  readonly title: string;
  readonly fact: string;
  readonly action: MwButtonOptions;
}

export interface MwHelpErrorView {
  readonly title: string;
  readonly body: string;
  readonly retryLabel: string;
  readonly retryAttrs?: Record<string, AttrValue>;
}

export interface MwHelpContentOptions {
  readonly sections: readonly MwHelpSectionView[];
  readonly focusId?: string;
  readonly nextStep?: MwHelpNextStepView;
  readonly error?: MwHelpErrorView;
  readonly className?: string;
}

export interface MwHelpButtonOptions {
  readonly topic?: string;
  readonly focus?: string;
  readonly label: string;
  readonly variant?: "ghost" | "link" | "secondary";
  readonly size?: "sm" | "md";
  readonly id?: string;
  readonly controls?: string;
  readonly expanded?: boolean;
  readonly className?: string;
  readonly attrs?: Record<string, AttrValue>;
}

export interface MwHelpFirstVisitTipOptions {
  readonly storageKey: string;
  readonly text: string;
  readonly actionLabel: string;
  readonly skipLabel: string;
  readonly topic?: string;
  readonly className?: string;
  readonly attrs?: Record<string, AttrValue>;
}

export interface MwHelpTopicData {
  readonly id: string;
  readonly title: string;
  readonly context?: string;
  readonly firstVisitTip?: string;
  readonly sections: readonly MwHelpSectionView[];
  readonly nextStep?: {
    readonly title: string;
    readonly fact: string;
    readonly actionLabel: string;
    readonly actionHref?: string;
  };
}

function helpTextProblem(value: unknown, owner: string, field: string, allowString: boolean, hasLocales: boolean): string | null {
  if (allowString && typeof value === "string") {
    return value.trim().length > 0 && value.length <= MAX_VISIBLE_LITERAL ? null : `${field} 必须是有效的文字引用`;
  }
  const ref = tryOwnedTextRef(value, owner);
  if (!ref) return `${field} 必须是有效的文字引用`;
  if (!allowString && "literal" in ref) return `${field} 须引用语言文件键，不能直接写原文`;
  if ("key" in ref) {
    if (ref.args !== undefined) return `${field} 不接收插值参数`;
    if (!allowString && !ref.key.startsWith("common.") && !hasLocales) return `${field} 引用本插件的词须声明 ui.locales`;
  }
  return null;
}

function inspectHelpObject(help: unknown, owner: string, path: string, allowString: boolean, hasLocales: boolean): string[] {
  if (!isRecord(help)) return [`${path} 必须是对象`];
  const problems: string[] = [];
  for (const key of Object.keys(help)) {
    if (key !== "default_topic" && key !== "topics") problems.push(`${path} 不支持属性 ${key.slice(0, 40)}`);
  }
  if (!Array.isArray(help.topics) || help.topics.length === 0 || help.topics.length > UI_HELP_LIMITS.maxTopics) {
    return [...problems, `${path}.topics 必须是 1 到 ${UI_HELP_LIMITS.maxTopics} 个帮助主题的数组`];
  }
  const checkText = (value: unknown, field: string) => {
    const problem = helpTextProblem(value, owner, field, allowString, hasLocales);
    if (problem) problems.push(problem);
  };
  const topicIds = new Set<string>();
  for (const [ti, rawTopic] of help.topics.entries()) {
    const tPath = `${path}.topics[${ti}]`;
    if (!isRecord(rawTopic)) {
      problems.push(`${tPath} 必须是对象`);
      continue;
    }
    for (const key of Object.keys(rawTopic)) {
      if (!["id", "title", "first_visit_tip", "sections"].includes(key)) problems.push(`${tPath} 不支持属性 ${key.slice(0, 40)}`);
    }
    if (typeof rawTopic.id !== "string" || !HELP_ID.test(rawTopic.id)) {
      problems.push(`${tPath}.id 必须是小写字母开头的标识（至多 ${UI_HELP_LIMITS.maxIdLength} 字符）`);
    } else if (topicIds.has(rawTopic.id)) {
      problems.push(`${tPath}.id 重复：${rawTopic.id}`);
    } else {
      topicIds.add(rawTopic.id);
    }
    checkText(rawTopic.title, `${tPath}.title`);
    if (rawTopic.first_visit_tip !== undefined) checkText(rawTopic.first_visit_tip, `${tPath}.first_visit_tip`);
    if (!Array.isArray(rawTopic.sections) || rawTopic.sections.length === 0 || rawTopic.sections.length > UI_HELP_LIMITS.maxSectionsPerTopic) {
      problems.push(`${tPath}.sections 必须是 1 到 ${UI_HELP_LIMITS.maxSectionsPerTopic} 节的数组`);
      continue;
    }
    const sectionIds = new Set<string>();
    for (const [si, rawSection] of rawTopic.sections.entries()) {
      const sPath = `${tPath}.sections[${si}]`;
      if (!isRecord(rawSection)) {
        problems.push(`${sPath} 必须是对象`);
        continue;
      }
      for (const key of Object.keys(rawSection)) {
        if (!["id", "heading", "body", "items", "collapsible", "summary"].includes(key)) problems.push(`${sPath} 不支持属性 ${key.slice(0, 40)}`);
      }
      if (typeof rawSection.id !== "string" || !HELP_ID.test(rawSection.id)) {
        problems.push(`${sPath}.id 必须是小写字母开头的标识`);
      } else if (sectionIds.has(rawSection.id)) {
        problems.push(`${sPath}.id 重复：${rawSection.id}`);
      } else {
        sectionIds.add(rawSection.id);
      }
      checkText(rawSection.heading, `${sPath}.heading`);
      const hasBody = rawSection.body !== undefined;
      const hasItems = rawSection.items !== undefined;
      if (!hasBody && !hasItems) problems.push(`${sPath} 至少需要 body 或 items`);
      if (hasBody) checkText(rawSection.body, `${sPath}.body`);
      if (hasItems) {
        if (!Array.isArray(rawSection.items) || rawSection.items.length === 0 || rawSection.items.length > UI_HELP_LIMITS.maxItemsPerSection) {
          problems.push(`${sPath}.items 必须是 1 到 ${UI_HELP_LIMITS.maxItemsPerSection} 条有效文字引用`);
        } else {
          for (const [ii, item] of rawSection.items.entries()) checkText(item, `${sPath}.items[${ii}]`);
        }
      }
      if (rawSection.collapsible !== undefined && typeof rawSection.collapsible !== "boolean") problems.push(`${sPath}.collapsible 必须是布尔值`);
      if (rawSection.summary !== undefined) checkText(rawSection.summary, `${sPath}.summary`);
    }
  }
  if (help.default_topic !== undefined && (typeof help.default_topic !== "string" || !topicIds.has(help.default_topic))) {
    problems.push(`${path}.default_topic 必须指向 topics 里已声明的主题 id`);
  }
  return problems;
}

/** Validates `manifest.ui.help` (VUX-55): every plugin declares help through its own language keys. */
export function uiHelpDeclarationProblems(manifest: Pick<PluginManifest, "plugin_id" | "ui">): string[] {
  const help = manifest.ui?.help;
  if (help === undefined) return [];
  return inspectHelpObject(help, manifest.plugin_id, "ui.help", false, Boolean(manifest.ui?.locales));
}

/** Validates `SandboxPluginContract.help` (VUX-55, VUX-59): allows literal copy or owned TextRefs. */
export function sandboxHelpDeclarationProblems(contract: Pick<SandboxPluginContract, "pluginId" | "help">): string[] {
  if (contract.help === undefined) return [];
  return inspectHelpObject(contract.help, contract.pluginId, "help", true, true);
}

/** Trigger button for Scheme A on-demand help ("帮助" at header or "了解此项" beside a field). */
export function renderHelpButton(options: MwHelpButtonOptions): string {
  const variant = options.variant ?? "ghost";
  return renderButton({
    variant,
    size: options.size ?? "sm",
    icon: variant === "link" ? undefined : "question",
    label: options.label,
    className: options.className,
    attrs: {
      ...(options.id ? { id: options.id } : {}),
      "data-mw-help-trigger": true,
      "data-help-topic": options.topic ?? "page",
      ...(options.focus ? { "data-help-focus": options.focus } : {}),
      "aria-expanded": options.expanded ? "true" : "false",
      "aria-controls": options.controls ?? "mw-help-region",
      ...options.attrs,
    },
  });
}

/**
 * Always-visible pre-action facts block above/near a decision button (VUX-56).
 * Permissions, model/cost, external sends, and irreversible consequences stay visible even while help is closed.
 */
export function renderPreActionFacts(options: MwPreActionFactsOptions): string {
  const rows = options.rows.map((row) => {
    const toneClass = row.tone && row.tone !== "neutral" ? `mw-fact-row--${row.tone}` : "";
    const glyph = row.icon ? `<span class="mw-fact-row__icon" aria-hidden="true">${icon(row.icon)}</span>` : "";
    const detail = row.detail ? `<small class="mw-fact-row__detail">${escapeHtml(row.detail)}</small>` : "";
    const action = row.action ? renderButton({ variant: "secondary", size: "sm", ...row.action }) : "";
    return `<div class="${cx("mw-fact-row", toneClass)}"${renderAttrs(row.attrs)}>${glyph}<span class="mw-fact-row__body">${escapeHtml(row.text)}${detail}</span>${action}</div>`;
  }).join("");
  return `<section class="${cx("mw-facts", options.className)}" data-slot="facts" aria-label="${escapeHtml(options.ariaLabel ?? options.heading)}"${renderAttrs(options.attrs)}><h3 class="mw-facts__heading">${escapeHtml(options.heading)}</h3>${rows}</section>`;
}

/** Structured help body shared by the floating card (Scheme A) and right side pane (VUX-55). */
export function renderHelpContent(options: MwHelpContentOptions): string {
  if (options.error) {
    const retry = renderButton({
      variant: "secondary",
      size: "sm",
      icon: "refresh",
      label: options.error.retryLabel,
      attrs: { "data-mw-help-retry": true, ...options.error.retryAttrs },
    });
    return `<div class="${cx("mw-help-content", options.className)}" data-slot="help-content"><div class="mw-empty mw-empty--error" data-slot="empty"><span class="mw-empty__mark" aria-hidden="true">${icon("circle-alert")}</span><strong>${escapeHtml(options.error.title)}</strong><p>${escapeHtml(options.error.body)}</p><div class="mw-empty__actions">${retry}</div></div></div>`;
  }
  const sections = options.sections.map((section) => {
    const body = section.body ? `<p class="mw-help-section__body">${escapeHtml(section.body)}</p>` : "";
    const list = section.items?.length
      ? `<ul class="mw-help-section__list">${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
    const inner = section.collapsible
      ? `<details class="mw-collapsible" data-slot="collapsible"><summary>${escapeHtml(section.summary ?? section.heading)}</summary><div class="mw-collapsible__body">${body}${list}</div></details>`
      : `${body}${list}`;
    const focused = options.focusId && options.focusId === section.id;
    return `<section class="${cx("mw-help-section", focused && "is-highlighted")}" data-help-section="${escapeHtml(section.id)}"><h4 class="mw-help-section__heading">${escapeHtml(section.heading)}</h4>${inner}</section>`;
  }).join("");
  const next = options.nextStep
    ? `<div class="mw-help-next"><h4 class="mw-help-next__title">${escapeHtml(options.nextStep.title)}</h4><p class="mw-help-next__fact">${escapeHtml(options.nextStep.fact)}</p><div class="mw-help-next__actions">${renderButton({ variant: "primary", size: "sm", ...options.nextStep.action })}</div></div>`
    : "";
  return `<div class="${cx("mw-help-content", options.className)}" data-slot="help-content">${sections}${next}</div>`;
}

/** One-line skippable tip for first-time visits (VUX-55). Skipped state is remembered; Help button remains available. */
export function renderHelpFirstVisitTip(options: MwHelpFirstVisitTipOptions): string {
  const see = renderButton({
    variant: "secondary",
    size: "sm",
    label: options.actionLabel,
    attrs: { "data-mw-help-tip-action": true, "data-help-topic": options.topic ?? "page" },
  });
  const skip = renderButton({
    variant: "ghost",
    size: "sm",
    label: options.skipLabel,
    attrs: { "data-mw-help-tip-skip": true },
  });
  return `<div class="${cx("mw-help-tip", options.className)}" role="status" data-mw-help-tip="${escapeHtml(options.storageKey)}"${renderAttrs(options.attrs)}><span aria-hidden="true">${icon("sparkles")}</span><span class="mw-help-tip__text">${escapeHtml(options.text)}</span><span class="mw-help-tip__actions">${see}${skip}</span></div>`;
}

/** Embeds structured resolved help topics safely inside a page for the Scheme A client controller. */
export function renderHelpDataScript(topics: readonly MwHelpTopicData[]): string {
  return `<script type="application/json" data-mw-help-data>${JSON.stringify(topics).replaceAll("<", "\\u003c")}</script>`;
}

/** Embeds a plugin Manifest's raw `UiHelpDeclaration` for live locale resolution inside a plugin frame. */
export function renderHelpDeclarationScript(declaration: UiHelpDeclaration): string {
  return `<script type="application/json" data-mw-help-declaration>${JSON.stringify(declaration).replaceAll("<", "\\u003c")}</script>`;
}
