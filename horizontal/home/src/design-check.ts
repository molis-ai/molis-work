import type { HomePageFile } from "@molis-ai/molis-work-contracts/services/home";

export interface HomePageDesignIssue {
  readonly code:
    | "inline_style_attr"
    | "inline_event_handler"
    | "external_asset"
    | "dynamic_eval"
    | "nested_embed"
    | "literal_color"
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
const NESTED_EMBED_RE = /<\s*(?:iframe|object|embed|base)\b/iu;
const DYNAMIC_EVAL_RE = /\b(?:eval|Function)\s*\(|new\s+Function\b/u;
const LITERAL_COLOR_RE = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/iu;
const PILL_RADIUS_RE = /border-radius\s*:\s*(?:999|9999)px/iu;
const CROSS_PROJECT_PATH_RE = /\/projects\/[^/\s"']+\//u;

/**
 * Inspects generated-page files against the Batch 37 isolation and Soft Workbench design-language rules:
 * - Zero inline `style=` attributes or `on*=` event handlers (strict hash-only CSP without `'unsafe-inline'`).
 * - Zero external asset links, nested frames/objects, or `eval`/`new Function`.
 * - Zero cross-project hardcoded paths.
 * - Semantic CSS tokens only (no literal `#hex`/`rgb()`/`hsl()` colors outside `var(--...)`; no 999px pills).
 */
export function inspectHomePageDesign(
  files: readonly HomePageFile[],
  options: { readonly actionsValid?: boolean; readonly actionIssueReason?: string } = {},
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
          code: "external_asset",
          path: file.path,
          severity: "error",
          reason: "脚本不能直接拼写跨项目路径，请通过获准动作读取本项目数据",
        });
      }
    }

    if (file.media_type === "text/css") {
      const stripped = file.text.replace(/\/\*[\s\S]*?\*\//gu, "");
      if (LITERAL_COLOR_RE.test(stripped)) {
        designIssues.push({
          code: "literal_color",
          path: file.path,
          severity: "warning",
          reason: "样式里出现了字面颜色值，请改用工作台语义变量（如 var(--paper)、var(--ink)、var(--accent)、var(--amber)）",
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
        : [{ code: "external_asset", path: "$.actions", severity: "error", reason: options.actionIssueReason ?? "页面声明的动作不可用或未开放给页面调用" }],
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
      severity: designIssues.length === 0 ? "ok" : "warning",
      issues: designIssues,
    },
  ];

  const allIssues = [...checks.flatMap(item => item.issues)];
  const ok = checks.every(item => item.severity !== "error");
  return { ok, checks, issues: allIssues };
}
