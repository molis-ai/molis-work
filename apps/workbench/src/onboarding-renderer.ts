import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT, ONBOARDING_CLIENT_SCRIPT } from "./browser-assets.js";
import { ONBOARDING_INTENT_FRAMES } from "./onboarding-intent.js";

type OnboardingIcon = "clock" | "terminal" | "target" | "brand" | "workflow" | "settings" | "search" | "switch" | "activity" | "book" | "back" | "arrow" | "chevron-down" | "refresh";
export interface OnboardingRenderPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  withDesktopQuery(target: string): string;
  nativeDesktopBootstrapScript: string;
  clientI18nScript(): string;
  icon(name: OnboardingIcon): string;
  renderIconSprite(): string;
}

export interface MolisWorkOnboardingRenderOptions {
  mode: "first_run" | "new_project" | "update";
  currentVersion: string | null;
  controlToken?: string;
  desktopShell?: boolean;
  cliAvailability?: Record<string, boolean>;
}

const ONBOARDING_RUNTIME_CHOICES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "opencode", label: "OpenCode" },
  { id: "pi-agent", label: "Pi Agent" },
  { id: "grok-build", label: "Grok Build" },
];

const ONBOARDING_ATMOSPHERE = `<div class="onboarding-atmosphere" aria-hidden="true"></div>`;

export function createWorkbenchOnboardingRenderer(primitives: OnboardingRenderPrimitives) {
  const { L, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, clientI18nScript, icon, renderIconSprite,
    nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = primitives;
  return function renderMolisWorkOnboarding(options: MolisWorkOnboardingRenderOptions): string {
  const desktopShell = Boolean(options.desktopShell);
  const href = (target: string) => desktopShell ? withDesktopQuery(target) : target;
  if (options.mode === "update") {
    const version = options.currentVersion ? ` ${escapeHtml(options.currentVersion)}` : "";
    return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(options.controlToken ?? "")}
  <title>${L("Molis Work 已更新")}</title>
  <script>${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}</script>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-onboarding.css">
</head>
<body class="onboarding-page onboarding-page--update"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${ONBOARDING_ATMOSPHERE}
  <main class="onboarding-update" aria-labelledby="onboarding-update-title">
    <span class="onboarding-brand">Molis Work</span>
    <div class="onboarding-update-copy">
      <h1 id="onboarding-update-title">${L("Molis Work 已更新")}${version}</h1>
      <p>${L("你的 Project、Goal 和工作记录仍保存在本机。更新不会替你接受 Goal，也不会自动修改 Runtime 配置。")}</p>
      <ul>
        <li><strong>${L("新项目可以从一个真实结果开始")}</strong><span>${L("创建 Project 时同时建立根 Draft Goal，后续从同一份事实继续。")}</span></li>
        <li><strong>${L("初始化可以直接交给 TUI")}</strong><span>${L("选择工作目录和 Runtime 后，提示会填入终端，但仍由你检查并发送。")}</span></li>
      </ul>
    </div>
    <div class="onboarding-update-actions">
      <button class="mw-btn mw-btn--primary" type="button" data-onboarding-dismiss="update">${L("继续使用 Molis Work")}</button>
      <a href="${href("/settings/projects")}">${L("查看项目设置")}</a>
    </div>
    <p class="onboarding-error" data-onboarding-error role="alert" hidden></p>
  </main>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
  }

  const runtimeAvailability = options.cliAvailability ?? {};
  const availableRuntimes = ONBOARDING_RUNTIME_CHOICES.filter(({ id }) => runtimeAvailability[id] === true);
  const runtimeChoices = [
    `<label class="onboarding-runtime-choice onboarding-runtime-choice--deferred"><input type="radio" name="runtime_kind" value="" checked><span>${icon("clock")}<strong>${L("之后再选")}</strong><i aria-hidden="true"></i></span></label>`,
    ...availableRuntimes.map(({ id, label }) => `<label class="onboarding-runtime-choice onboarding-runtime-choice--available"><input type="radio" name="runtime_kind" value="${id}"><span>${icon("terminal")}<strong>${escapeHtml(label)}</strong><i aria-hidden="true"></i></span></label>`),
  ].join("");
  const runtimeHint = availableRuntimes.length
    ? L("只会填入终端，等你自己发送。")
    : L("没有找到可用工具，可以稍后再选。");
  const intentIcons: Record<(typeof ONBOARDING_INTENT_FRAMES)[number]["id"], OnboardingIcon> = {
    open: "target",
    build_change: "brand",
    design_plan: "workflow",
    diagnose_fix: "settings",
    analyze_decide: "search",
    migrate_refactor: "switch",
    operate_process: "activity",
    content_communication: "book",
  };
  const intentOptions = ONBOARDING_INTENT_FRAMES
    .map((frame, index) => `<button type="button" role="option" aria-selected="${index === 0 ? "true" : "false"}" data-onboarding-intent-option="${frame.id}" data-intent-label="${escapeHtml(L(frame.label))}" data-placeholder="${escapeHtml(L(frame.placeholder))}"><span>${icon(intentIcons[frame.id])}<b>${escapeHtml(L(frame.label))}</b></span><i aria-hidden="true"></i></button>`)
    .join("");
  const title = options.mode === "first_run" ? L("开始使用 Molis Work") : L("建立一个新项目");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(options.controlToken ?? "")}
  <title>${title}</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-onboarding.css">
  <script>${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}</script>
</head>
<body class="onboarding-page" data-onboarding-mode="${options.mode}" data-onboarding-tone="0"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  ${ONBOARDING_ATMOSPHERE}
  <header class="onboarding-topbar">
    <a class="onboarding-brand" href="${href("/")}">Molis Work</a>
    <div class="onboarding-topbar-actions"><button class="mw-btn mw-btn--ghost" type="button" data-onboarding-dismiss="first_run">${options.mode === "first_run" ? L("跳过") : L("返回项目目录")}</button></div>
  </header>
  <main class="onboarding-room">
    <form class="onboarding-flow" data-onboarding-form novalidate>
      <div class="onboarding-flow-header">
        <p class="onboarding-progress" data-onboarding-progress aria-live="polite">01 / 04 · ${L("说说想法")}</p>
        <nav class="onboarding-actions" aria-label="${L("引导步骤导航")}">
          <button class="mw-btn mw-btn--ghost onboarding-back" type="button" data-onboarding-back hidden>${icon("back")}<span>${L("上一步")}</span></button>
          <button class="mw-btn mw-btn--primary onboarding-next" type="button" data-onboarding-next><span data-onboarding-next-label>${L("下一步")}</span>${icon("arrow")}</button>
          <button class="mw-btn mw-btn--primary onboarding-submit" type="submit" data-onboarding-submit hidden><span data-onboarding-submit-label>${L("创建项目")}</span>${icon("arrow")}</button>
        </nav>
      </div>
      <div class="onboarding-stage">
      <section class="onboarding-step is-current" data-onboarding-step="0" aria-labelledby="onboarding-question-0">
        <h1 id="onboarding-question-0" tabindex="-1">${L("你希望我们一起做什么？")}</h1>
        <p class="onboarding-intro">${L("先说说你想看到的变化，不用急着想得很完整。")}</p>
        <div class="onboarding-composer">
          <div class="onboarding-intent" data-onboarding-intent>
            <input type="hidden" name="intent_frame" value="open">
            <button type="button" class="onboarding-intent-trigger" data-onboarding-intent-trigger aria-haspopup="listbox" aria-expanded="false"><span data-onboarding-intent-current>${L("我想")}</span>${icon("chevron-down")}</button>
            <div class="onboarding-intent-options" role="listbox" aria-label="${L("这次更像哪一种？")}">${intentOptions}</div>
          </div>
          <label class="onboarding-answer onboarding-answer--plain"><span class="onboarding-visually-hidden">${L("你想推进的事")}</span><textarea name="outcome" rows="1" maxlength="2000" autocomplete="off" aria-describedby="onboarding-error-0" placeholder="${L("例如：把这个想法做成一个真的能用的产品")}" required></textarea></label>
        </div>
        <p class="onboarding-field-error" id="onboarding-error-0" data-step-error="0" role="alert" hidden></p>
      </section>
      <section class="onboarding-step" data-onboarding-step="1" aria-labelledby="onboarding-question-1" hidden>
        <p class="onboarding-echo"><span>${L("我们一起")}</span><strong data-onboarding-outcome></strong></p>
        <h1 id="onboarding-question-1" tabindex="-1">${L("给项目取个名字吧。")}</h1>
        <label class="onboarding-answer onboarding-answer--single"><span>${L("项目叫")}</span><input name="project_name" type="text" maxlength="160" autocomplete="off" aria-describedby="onboarding-error-1" placeholder="${L("例如：Molis Work 首次体验")}" required></label>
        <p class="onboarding-field-error" id="onboarding-error-1" data-step-error="1" role="alert" hidden></p>
      </section>
      <section class="onboarding-step" data-onboarding-step="2" aria-labelledby="onboarding-question-2" hidden>
        <p class="onboarding-echo"><span>${L("项目叫")}</span><strong data-onboarding-project></strong></p>
        <h1 id="onboarding-question-2" tabindex="-1">${L("接下来，你想在哪里继续？")}</h1>
        <label class="onboarding-workspace"><span>${L("工作目录")}</span><input name="workspace_path" type="text" autocomplete="off" placeholder="/Users/name/code/project" aria-describedby="onboarding-runtime-hint onboarding-error-2"></label>
        <fieldset class="onboarding-runtime"><legend>${L("想用哪个工具继续？")}</legend>${runtimeChoices}</fieldset>
        <p class="onboarding-hint" id="onboarding-runtime-hint">${runtimeHint}</p>
        <p class="onboarding-field-error" id="onboarding-error-2" data-step-error="2" role="alert" hidden></p>
      </section>
      <section class="onboarding-step onboarding-step--review" data-onboarding-step="3" aria-labelledby="onboarding-question-3" hidden>
        <h1 id="onboarding-question-3" tabindex="-1">${L("这样开始，可以吗？")}</h1>
        <p class="onboarding-intro">${L("我们会先保存项目和第一条目标，不会自动执行。")}</p>
        <dl class="onboarding-review">
          <div><dt>${L("项目名称")}</dt><dd data-review-project></dd></div>
          <div><dt>${L("想看到的结果")}</dt><dd data-review-outcome></dd></div>
          <div><dt>${L("工作目录")}</dt><dd data-review-workspace></dd></div>
          <div><dt>${L("接下来")}</dt><dd data-review-runtime></dd></div>
        </dl>
        <label class="onboarding-confirm"><input type="checkbox" name="user_confirmed"><span>${L("我确认先保存这些内容。如果选择了 Runtime，只把内容填进终端，等我自己发送。")}</span></label>
        <p class="onboarding-field-error" id="onboarding-error-3" data-step-error="3" role="alert" hidden></p>
      </section>
      <section class="onboarding-step onboarding-step--runtime-embedded" data-onboarding-step="4" aria-labelledby="onboarding-question-4" hidden>
        <div class="onboarding-runtime-heading">
          <h1 id="onboarding-question-4" tabindex="-1">${L("我们先把项目安排清楚。")}</h1>
          <p class="onboarding-intro">${L("这个 Runtime 已经绑定刚创建的根目标。它会一次问一个问题，和你一起整理出合适的目标树。")}</p>
        </div>
        <div class="onboarding-runtime-viewport">
          <iframe data-onboarding-runtime-frame title="${L("项目初始化 Runtime")}" allow="clipboard-read; clipboard-write"></iframe>
        </div>
        <div class="onboarding-runtime-state">
          <p data-onboarding-runtime-status data-state="busy" role="status">${L("正在打开 Runtime…")}</p>
          <button class="mw-btn mw-btn--secondary" type="button" data-onboarding-runtime-retry hidden>${icon("refresh")}<span>${L("重新打开")}</span></button>
        </div>
      </section>
      </div>
      <p class="onboarding-error" data-onboarding-error role="alert" hidden></p>
    </form>
  </main>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
}
}
