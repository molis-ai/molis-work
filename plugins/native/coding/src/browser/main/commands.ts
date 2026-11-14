import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Command as CommandItem } from "../commands.js";
import { roundActive, stopRound } from "./composer-mount.js";
import { shut } from "./composer-state.js";
import { chooseIntent } from "./configuration.js";
import { counts, openMaterials } from "./controls.js";
import { openMcp } from "./click-round.js";
import { openMethods } from "./methods.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";

/** One command for each way of working the composer offers. */
function intentCommands(page: Page): CommandItem[] {
  const { readText, refs, s } = page;
  return s.intents.map(option => ({
    slash: option.value, label: readText("coding.palette.intent", { intent: option.label.replace(/\s*[（(].*[）)]/, "") }), hint: readText("coding.palette.intent-hint"), keywords: ["方式", "intent"],
    enabled: !option.disabled && !shut(page) && !roundActive(page),
    run: () => {
      chooseIntent(page, option.value);
      status(page, readText("coding.intent.next", { intent: option.label }));
      refs.composer.focus();
    },
  }));
}

/** Puts the focus on the composer's model choice (on a narrow screen it sits behind "more"). */
function focusModel(page: Page) {
  const select = page.root.querySelector<HTMLSelectElement>('[data-coding-input]:not([data-composer-remote]) [data-composer-control="model"]');
  // In the bar (one input), the model is the bar's own control beside the box: the box takes the focus.
  if (!select) { page.refs.composer.focus(); return; }
  select.closest(".mw-composer__start")?.querySelector<HTMLElement>("[data-composer-more][aria-expanded=false]")?.click();
  select.focus();
}

/** A count after a name, as ＋ lists what the next round is given. */
const counted = (label: string, count: number) => count ? label + " · " + count : label;

/** What sets the next round, offered in the composer's ＋ (with its glyph) as well as under `/` and in the palette. */
function choiceCommands(page: Page): CommandItem[] {
  const { readText, q, refs, s } = page, open = !shut(page), held = counts(page), context = q("[data-coding-context]");
  return [
    { slash: "materials", label: counted(readText("coding.attach.material"), held.materials), hint: readText("coding.palette.materials-hint"), keywords: ["引用", "材料", "资料", "reference"], adds: "paperclip", enabled: open, run: () => openMaterials(page) },
    { slash: "character", label: held.character ? readText("coding.attach.character") + " · v" + held.character.version : readText("coding.attach.character"),
      hint: held.character ? readText("coding.character.next", { title: s.characterTitles.get(s.current) || held.character.artifact_id, version: held.character.version }) : readText("coding.character.none-next"),
      keywords: ["character", "角色"], adds: "user", enabled: open, run: () => refs.openCharacter() },
    { slash: "methods", label: counted(readText("coding.attach.method"), held.methods), hint: readText("coding.palette.methods-hint"), keywords: ["skill", "技能"], adds: "list", enabled: open, run: () => openMethods(page) },
    { slash: "actions", label: counted(readText("coding.attach.actions"), held.actions), hint: readText("coding.actions.label"), keywords: ["action", "动作", "能力"], adds: "workflow", enabled: open, run: () => refs.openActions() },
    { slash: "mcp", label: counted("MCP", held.mcp), hint: readText("coding.mcp.title"), keywords: ["tool", "工具"], adds: "network", enabled: open, run: () => openMcp(page) },
    { slash: "delegate", label: readText("coding.delegate.title"), hint: readText("coding.palette.delegate-hint"), keywords: ["委派", "delegate"], adds: "share", enabled: open, run: () => refs.cooperationUi.openDialog() },
    // This session's memory: what it has learned and can clear, one press away rather than under 工作区与目标.
    { slash: "memory", label: readText("coding.memory.session"), hint: readText("coding.palette.memory-hint"), keywords: ["记忆", "memory", "清除"], adds: "sparkles", enabled: Boolean(s.current),
      run: () => q<HTMLAnchorElement>("[data-coding-memory-open]").click() },
    { slash: "context", label: readText("coding.attach.context"), hint: context.hidden ? readText("coding.context.show") : readText("coding.context.hide"), keywords: ["workspace", "goal", "目录", "目标"], adds: "tune",
      run: () => { context.hidden = !context.hidden; } },
  ];
}

/** The same commands in the composer's `/` (and ＋), the palette and the shortcuts; each says when it is not available. */
export function codingCommands(page: Page): CommandItem[] {
  const { readText, q, s } = page, { commandsUi } = page.refs, open = !shut(page);
  return [
    ...choiceCommands(page),
    ...intentCommands(page),
    { slash: "compact", label: uiText.text("coding.palette.compact"), hint: uiText.text("coding.palette.compact-hint"), keywords: ["摘要", "整理", "context"], enabled: Boolean(open && s.runtimeSessionId),
      run: async () => {
        const id = s.current;
        await api(page, sessionPath(id) + "/compact", "POST", { on: true });
        status(page, uiText.text("coding.palette.compact-done"));
        if (id === s.current) await readCurrent(page);
      } },
    { slash: "usage", label: readText("coding.meter.title"), hint: readText("coding.palette.usage-hint"), keywords: ["cost", "费用", "预算", "context"], enabled: !q("[data-coding-meter]").hidden, run: () => q("[data-coding-meter-toggle]").click() },
    { slash: "model", label: readText("coding.palette.model"), hint: readText("coding.palette.model-hint"), keywords: ["model"], enabled: open, run: () => focusModel(page) },
    { slash: "workspace", label: readText("coding.workspace.title"), hint: readText("coding.palette.workspace-hint"), keywords: ["目录", "folder"], enabled: open, run: () => q<HTMLDialogElement>("[data-coding-workspace-dialog]").showModal() },
    { slash: "new", label: readText("coding.palette.new"), keys: "Mod+Alt+N", keywords: ["new", "会话"], run: () => q("[data-coding-new]").click() },
    { slash: "stop", label: readText("coding.run.stop-title"), hint: readText("coding.palette.stop-hint"), keywords: ["stop", "停止"], enabled: roundActive(page) && !s.sending, run: () => stopRound(page) },
    { slash: "results", label: readText("coding.results.title"), keys: "Mod+Alt+R", keywords: ["review", "审查", "结果"], run: () => q("[data-coding-results-open]").click() },
    { slash: "palette", label: readText("coding.palette.label"), keys: "Mod+Shift+P", keywords: ["command", "命令"], run: () => commandsUi.openPalette() },
  ];
}
