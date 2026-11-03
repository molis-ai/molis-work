import type { Command as CommandItem } from "../commands.js";
import { shut } from "./composer-state.js";
import { openMaterials } from "./controls.js";
import { openMethods } from "./methods.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";

/** One command for each way of working the composer offers. */
function intentCommands(page: Page): CommandItem[] {
  const { L, input, q } = page, select = q<HTMLSelectElement>("[data-coding-intent]");
  return [...select.options].map(option => ({
    slash: option.value, label: L("coding.palette.intent", { intent: (option.textContent || "").replace(/\s*[（(].*[）)]/, "") }), hint: L("coding.palette.intent-hint"), keywords: ["方式", "intent"], enabled: !option.disabled && !shut(page),
    run: () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      status(page, L("coding.intent.next", { intent: option.textContent || "" }));
      input.focus();
    },
  }));
}

/** Opens the model picker, or the plain select when the picker is not there. */
function focusModel(page: Page) {
  const select = page.q<HTMLSelectElement>("[data-coding-model]"), trigger = select.closest(".mw-select-picker")?.querySelector<HTMLElement>(".mw-select-picker__trigger");
  if (!trigger) {
    select.focus();
    return;
  }
  trigger.focus();
  trigger.click();
}

/** The same commands in the composer's slash menu, the palette and the shortcuts; each says when it is not available. */
export function codingCommands(page: Page): CommandItem[] {
  const { L, q, s } = page, { commandsUi, cooperationUi } = page.refs, open = !shut(page);
  return [
    ...intentCommands(page),
    { slash: "compact", label: L("coding.palette.compact"), hint: L("coding.palette.compact-hint"), keywords: ["摘要", "整理", "context"], enabled: Boolean(open && s.runtimeSessionId),
      run: async () => {
        const id = s.current;
        await api(page, sessionPath(id) + "/compact", "POST", { on: true });
        status(page, L("coding.palette.compact-done"));
        if (id === s.current) await readCurrent(page);
      } },
    { slash: "usage", label: L("coding.meter.title"), hint: L("coding.palette.usage-hint"), keywords: ["cost", "费用", "预算", "context"], enabled: !q("[data-coding-meter]").hidden, run: () => q("[data-coding-meter-toggle]").click() },
    { slash: "materials", label: L("coding.attach.material"), hint: L("coding.palette.materials-hint"), keywords: ["引用", "材料", "资料", "reference"], enabled: open, run: () => openMaterials(page) },
    { slash: "methods", label: L("coding.attach.method"), hint: L("coding.palette.methods-hint"), keywords: ["skill", "技能"], enabled: open, run: () => openMethods(page) },
    { slash: "delegate", label: L("coding.delegate.title"), hint: L("coding.palette.delegate-hint"), keywords: ["委派", "delegate"], enabled: open, run: () => cooperationUi.openDialog() },
    { slash: "model", label: L("coding.palette.model"), hint: L("coding.palette.model-hint"), keywords: ["model"], enabled: open, run: () => focusModel(page) },
    { slash: "workspace", label: L("coding.workspace.title"), hint: L("coding.palette.workspace-hint"), keywords: ["目录", "folder"], enabled: open, run: () => q<HTMLDialogElement>("[data-coding-workspace-dialog]").showModal() },
    { slash: "new", label: L("coding.palette.new"), keys: "Mod+Alt+N", keywords: ["new", "会话"], run: () => q("[data-coding-new]").click() },
    { slash: "stop", label: L("coding.run.stop-title"), hint: L("coding.palette.stop-hint"), keys: "", keywords: ["stop", "停止"], enabled: !q("[data-coding-stop]").hidden && !q<HTMLButtonElement>("[data-coding-stop]").disabled, run: () => q("[data-coding-stop]").click() },
    { slash: "results", label: L("coding.results.title"), keys: "Mod+Alt+R", keywords: ["review", "审查", "结果"], run: () => q("[data-coding-results-open]").click() },
    { slash: "palette", label: L("coding.palette.label"), keys: "Mod+Shift+P", keywords: ["command", "命令"], run: () => commandsUi.openPalette() },
  ];
}
