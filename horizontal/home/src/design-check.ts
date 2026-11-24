import type { UiTokenMap } from "@molis-ai/molis-work-contracts/platform/ui";
import type { HomePageFile } from "@molis-ai/molis-work-contracts/services/home";

export interface HomePageDesignIssue {
  readonly code:
    | "inline_style_attr"
    | "inline_event_handler"
    | "external_asset"
    | "cross_project_path"
    | "action_not_public"
    | "dynamic_eval"
    | "nested_embed"
    | "literal_color"
    | "low_contrast"
    | "amber_usage"
    | "pill_radius";
  readonly path: string;
  readonly severity: "error" | "warning";
  readonly reason: string;
}

export interface HomePageCheckItem {
  readonly id: "public_actions" | "sandbox_isolation" | "project_scope" | "design_tokens";
  readonly ok: boolean;
  readonly severity: "ok" | "error" | "warning";
  readonly issues: readonly HomePageDesignIssue[];
}

export interface HomePageDesignCheckReport {
  readonly ok: boolean;
  readonly checks: readonly HomePageCheckItem[];
  readonly issues: readonly HomePageDesignIssue[];
}

const INLINE_STYLE_RE = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/iu;
const INLINE_HANDLER_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/iu;
const EXTERNAL_URL_RE = /(?:src|href)\s*=\s*(?:"|')\s*(?:https?:|\/\/)/iu;
const CSS_EXTERNAL_URL_RE = /(?:url\s*\(\s*(?:"|')?\s*(?:https?:|\/\/)|@import\s+(?:url\s*\(\s*)?(?:"|')?\s*(?:https?:|\/\/))/iu;
const NESTED_EMBED_RE = /<\s*(?:iframe|object|embed|base)\b/iu;
const DYNAMIC_EVAL_RE = /\b(?:eval|Function)\s*\(|new\s+Function\b/u;
const LITERAL_COLOR_VALUE_RE = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(|\boklab\s*\(/iu;
const PILL_RADIUS_RE = /border-radius\s*:\s*(?:999|9999)px/iu;
const CROSS_PROJECT_PATH_RE = /\/projects\/[^/\s"']+\//u;

/**
 * Extracts CSS declaration values (the part after `:` inside rule blocks, skipping selectors and nested at-rule preludes)
 * so ID selectors like `#feed`, `#cafe`, or `#fade` are never misclassified as literal hex colors.
 */
function extractCssDeclarationValues(css: string, visit: (selector: string, property: string, value: string) => void): string[] {
  const selectors: string[] = [];
  const values: string[] = [];
  let i = 0;
  let depth = 0;
  let inQuote: string | null = null;
  let tokenStart = 0;
  let colonAt = -1;
  const flushDecl = (end: number) => {
    if (colonAt >= 0 && colonAt < end) {
      const prop = css.slice(tokenStart, colonAt).trim();
      if (prop && !prop.includes("{") && !prop.includes("}") && !prop.startsWith("@")) {
        const value = css.slice(colonAt + 1, end);
        values.push(value);
        visit(selectors.at(-1) ?? "", prop.toLowerCase(), value);
      }
    }
    tokenStart = end + 1;
    colonAt = -1;
  };
  while (i < css.length) {
    const ch = css[i]!;
    if (inQuote) {
      if (ch === "\\" && i + 1 < css.length) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i++;
      continue;
    }
    if (ch === "{") {
      selectors.push(css.slice(tokenStart, i).trim());
      depth++;
      tokenStart = i + 1;
      colonAt = -1;
    } else if (ch === "}") {
      if (depth > 0) flushDecl(i);
      selectors.pop();
      depth = Math.max(0, depth - 1);
      tokenStart = i + 1;
      colonAt = -1;
    } else if (ch === ";" && depth > 0) {
      flushDecl(i);
    } else if (ch === ":" && depth > 0 && colonAt < 0) {
      colonAt = i;
    }
    i++;
  }
  return values;
}

function luminance(role: string, palette: UiTokenMap): number | undefined {
  const visited = new Set<string>();
  let value = palette[role];
  while (value && typeof value === "object" && "role" in value && !visited.has(value.role)) {
    visited.add(value.role); value = palette[value.role];
  }
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return undefined;
  const channels = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

/**
 * Inspects generated-page files against the Batch 37 isolation and Soft Workbench design-language rules:
 * - Zero inline `style=` attributes or `on*=` event handlers (strict hash-only CSP without `'unsafe-inline'`).
 * - Zero external asset links, nested frames/objects, or `eval`/`new Function`.
 * - Zero cross-project hardcoded paths.
 * - Semantic CSS tokens only (no literal `#hex`/`rgb()`/`hsl()` colors outside `var(--...)`; no 999px pills).
 */
export function inspectHomePageDesign(
  files: readonly HomePageFile[],
  options: { readonly actionsValid?: boolean; readonly actionIssueReason?: string; readonly palettes?: readonly UiTokenMap[] } = {},
): HomePageDesignCheckReport {
  const sandboxIssues: HomePageDesignIssue[] = [];
  const scopeIssues: HomePageDesignIssue[] = [];
  const designIssues: HomePageDesignIssue[] = [];

  for (const file of files) {
    if (file.media_type === "text/html") {
      if (INLINE_STYLE_RE.test(file.text)) {
        sandboxIssues.push({
          code: "inline_style_attr",
          path: file.path,
          severity: "error",
          reason: "HTML 中不能使用内联 style 属性，请把样式写进独立 CSS 文件并使用工作台语义变量",
        });
      }
      if (INLINE_HANDLER_RE.test(file.text)) {
        sandboxIssues.push({
          code: "inline_event_handler",
          path: file.path,
          severity: "error",
          reason: "HTML 中不能使用内联事件属性（如 onclick），请在脚本文件里用 addEventListener 绑定",
        });
      }
      if (EXTERNAL_URL_RE.test(file.text)) {
        sandboxIssues.push({
          code: "external_asset",
          path: file.path,
          severity: "error",
          reason: "页面不能引用外部网络脚本或样式，所有资源必须声明在页面清单内",
        });
      }
      if (NESTED_EMBED_RE.test(file.text)) {
        sandboxIssues.push({
          code: "nested_embed",
          path: file.path,
          severity: "error",
          reason: "生成页面内不能嵌套 iframe、object、embed 或 base 标签",
        });
      }
    }

    if (file.media_type === "text/javascript") {
      if (DYNAMIC_EVAL_RE.test(file.text)) {
        sandboxIssues.push({
          code: "dynamic_eval",
          path: file.path,
          severity: "error",
          reason: "脚本中不能使用 eval 或 Function 动态执行代码",
        });
      }
      if (CROSS_PROJECT_PATH_RE.test(file.text)) {
        scopeIssues.push({
          code: "cross_project_path",
          path: file.path,
          severity: "error",
          reason: "脚本不能直接拼写跨项目路径，请通过获准动作读取本项目数据",
        });
      }
    }

    if (file.media_type === "text/css") {
      const stripped = file.text.replace(/\/\*[\s\S]*?\*\//gu, "");
      if (CSS_EXTERNAL_URL_RE.test(stripped)) {
        sandboxIssues.push({
          code: "external_asset",
          path: file.path,
          severity: "error",
          reason: "样式不能引用外部网络资源（url 或 @import），所有资源必须声明在页面清单内",
        });
      }
      const colors = new Map<string, { ink?: string; paper?: string }>();
      let amberMisused = false;
      const declValues = extractCssDeclarationValues(stripped, (selector, prop, value) => {
        if (prop !== "color" && prop !== "background" && prop !== "background-color") return;
        const role = /^\s*var\(\s*--([a-z0-9-]+)\s*\)\s*(?:!important)?\s*$/iu.exec(value)?.[1];
        if (!role) return;
        if (/^amber(?:-|$)/u.test(role) && !/attention|waiting|approval|question|decision|ask|danger/iu.test(selector)) amberMisused = true;
        const pair = colors.get(selector) ?? {};
        if (prop === "color") pair.ink = role; else pair.paper = role;
        colors.set(selector, pair);
      });
      if (amberMisused) designIssues.push({ code: "amber_usage", path: file.path, severity: "error", reason: "琥珀色只用于等你确认的内容" });
      for (const { ink = "ink", paper = "paper" } of colors.values()) {
        const fails = ink === paper || options.palettes?.some(palette => {
          const fg = luminance(ink, palette), bg = luminance(paper, palette);
          return fg !== undefined && bg !== undefined && (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) < 4.5;
        });
        if (fails) {
          designIssues.push({ code: "low_contrast", path: file.path, severity: "error", reason: "文字与背景的对比度不足 4.5:1" });
          break;
        }
      }
      if (declValues.some(val => LITERAL_COLOR_VALUE_RE.test(val))) {
        designIssues.push({
          code: "literal_color",
          path: file.path,
          severity: "error",
          reason: "样式里出现了字面颜色值，请改用工作台配色变量（如 var(--paper)、var(--ink)、var(--accent)、var(--amber)）",
        });
      }
      if (PILL_RADIUS_RE.test(stripped)) {
        designIssues.push({
          code: "pill_radius",
          path: file.path,
          severity: "warning",
          reason: "标签与徽标圆角请使用 var(--r-tag)（6px），不要用 999px 胶囊圆角",
        });
      }
    }
  }

  const actionsOk = options.actionsValid !== false;
  const checks: HomePageCheckItem[] = [
    {
      id: "public_actions",
      ok: actionsOk,
      severity: actionsOk ? "ok" : "error",
      issues: actionsOk
        ? []
        : [{ code: "action_not_public", path: "$.actions", severity: "error", reason: options.actionIssueReason ?? "页面声明的动作不可用或未开放给页面调用" }],
    },
    {
      id: "sandbox_isolation",
      ok: sandboxIssues.length === 0,
      severity: sandboxIssues.length === 0 ? "ok" : "error",
      issues: sandboxIssues,
    },
    {
      id: "project_scope",
      ok: scopeIssues.length === 0,
      severity: scopeIssues.length === 0 ? "ok" : "error",
      issues: scopeIssues,
    },
    {
      id: "design_tokens",
      ok: designIssues.length === 0,
      severity: designIssues.some(item => item.severity === "error")
        ? "error"
        : designIssues.length === 0
          ? "ok"
          : "warning",
      issues: designIssues,
    },
  ];

  const allIssues = [...checks.flatMap(item => item.issues)];
  const ok = checks.every(item => item.severity !== "error");
  return { ok, checks, issues: allIssues };
}
