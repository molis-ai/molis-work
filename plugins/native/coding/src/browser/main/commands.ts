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
  const { L, refs, s } = page;
  return s.intents.map(option => ({
    slash: option.value, label: L("coding.palette.intent", { intent: option.label.replace(/\s*[（(].*[）)]/, "") }), hint: L("coding.palette.intent-hint"), keywords: ["方式", "intent"],
    enabled: !option.disabled && !shut(page) && !roundActive(page),
    run: () => {
      chooseIntent(page, option.value);
      status(page, L("coding.intent.next", { intent: option.label }));
      refs.composer.focus();
    },
  }));
}

/** Puts the focus on the composer's model choice (on a narrow screen it sits behind "more"). */
function focusModel(page: Page) {
  const select = page.root.querySelector<HTMLSelectElement>('[data-coding-input] [data-composer-control="model"]');
  if (!select) return;
  select.closest(".mw-composer__start")?.querySelector<HTMLElement>("[data-composer-more][aria-expanded=false]")?.click();
  select.focus();
}

/** A count after a name, as ＋ lists what the next round is given. */
const counted = (label: string, count: number) => count ? label + " · " + count : label;

/** What sets the next round, offered in the composer's ＋ (with its glyph) as well as under `/` and in the palette. */
function choiceCommands(page: Page): CommandItem[] {
  const { L, q, refs, s } = page, open = !shut(page), held = counts(page), context = q("[data-coding-context]");
  return [
    { slash: "materials", label: counted(L("coding.attach.material"), held.materials), hint: L("coding.palette.materials-hint"), keywords: ["引用", "材料", "资料", "reference"], adds: "paperclip", enabled: open, run: () => openMaterials(page) },
    { slash: "character", label: held.character ? L("coding.attach.character") + " · v" + held.character.version : L("coding.attach.character"),
      hint: held.character ? L("coding.character.next", { title: s.characterTitles.get(s.current) || held.character.artifact_id, version: held.character.version }) : L("coding.character.none-next"),
      keywords: ["character", "角色"], adds: "user", enabled: open, run: () => refs.openCharacter() },
    { slash: "methods", label: counted(L("coding.attach.method"), held.methods), hint: L("coding.palette.methods-hint"), keywords: ["skill", "技能"], adds: "list", enabled: open, run: () => openMethods(page) },
    { slash: "actions", label: counted(L("coding.attach.actions"), held.actions), hint: L("coding.actions.label"), keywords: ["action", "动作", "能力"], adds: "workflow", enabled: open, run: () => refs.openActions() },
    { slash: "mcp", label: counted("MCP", held.mcp), hint: L("coding.mcp.title"), keywords: ["tool", "工具"], adds: "network", enabled: open, run: () => openMcp(page) },
    { slash: "delegate", label: L("coding.delegate.title"), hint: L("coding.palette.delegate-hint"), keywords: ["委派", "delegate"], adds: "share", enabled: open, run: () => refs.cooperationUi.openDialog() },
    { slash: "context", label: L("coding.attach.context"), hint: context.hidden ? L("coding.context.show") : L("coding.context.hide"), keywords: ["workspace", "goal", "目录", "目标"], adds: "tune",
      run: () => { context.hidden = !context.hidden; } },
  ];
}

/** The same commands in the composer's `/` (and ＋), the palette and the shortcuts; each says when it is not available. */
export function codingCommands(page: Page): CommandItem[] {
  const { L, q, s } = page, { commandsUi } = page.refs, open = !shut(page);
  return [
    ...choiceCommands(page),
    ...intentCommands(page),
    { slash: "compact", label: L("coding.palette.compact"), hint: L("coding.palette.compact-hint"), keywords: ["摘要", "整理", "context"], enabled: Boolean(open && s.runtimeSessionId),
      run: async () => {
        const id = s.current;
        await api(page, sessionPath(id) + "/compact", "POST", { on: true });
        status(page, L("coding.palette.compact-done"));
        if (id === s.current) await readCurrent(page);
      } },
    { slash: "usage", label: L("coding.meter.title"), hint: L("coding.palette.usage-hint"), keywords: ["cost", "费用", "预算", "context"], enabled: !q("[data-coding-meter]").hidden, run: () => q("[data-coding-meter-toggle]").click() },
    { slash: "model", label: L("coding.palette.model"), hint: L("coding.palette.model-hint"), keywords: ["model"], enabled: open, run: () => focusModel(page) },
    { slash: "workspace", label: L("coding.workspace.title"), hint: L("coding.palette.workspace-hint"), keywords: ["目录", "folder"], enabled: open, run: () => q<HTMLDialogElement>("[data-coding-workspace-dialog]").showModal() },
    { slash: "new", label: L("coding.palette.new"), keys: "Mod+Alt+N", keywords: ["new", "会话"], run: () => q("[data-coding-new]").click() },
    { slash: "stop", label: L("coding.run.stop-title"), hint: L("coding.palette.stop-hint"), keywords: ["stop", "停止"], enabled: roundActive(page) && !s.sending, run: () => stopRound(page) },
    { slash: "results", label: L("coding.results.title"), keys: "Mod+Alt+R", keywords: ["review", "审查", "结果"], run: () => q("[data-coding-results-open]").click() },
    { slash: "palette", label: L("coding.palette.label"), keys: "Mod+Shift+P", keywords: ["command", "命令"], run: () => commandsUi.openPalette() },
  ];
}
