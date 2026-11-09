import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { chevron, el, messageOf, pageRequest, tag, type Part } from "./common.js";

/** A Character registered with the Host by the system or a plugin (`/api/agent-definitions/roles`): only what the list reads. */
interface BuiltinRole {
  key: string;
  name: string;
  execution: string;
  subagent?: boolean;
  edited?: boolean;
  prompt_keys: string[];
  source: { kind: string; title: string; plugin_version?: string | null };
}

const EXECUTION: Record<string, string> = { "read-only": "workbench.characters.execution-read-only", "text-edit": "workbench.characters.execution-text-edit", "workspace-write": "workbench.characters.execution-workspace-write", operate: "workbench.characters.execution-operate" };

const isSystem = (role: BuiltinRole): boolean => role.source.kind === "system";

/** Where the prompts page of one role opens, for this project and the desktop shell. */
function settingsLink(section: HTMLElement, role: BuiltinRole): string {
  // They are the Home's, not the project's; the prompts page opens in the same settings, for this project.
  const parts = location.pathname.split("/"), project = parts[1] === "projects" ? parts[2] : "";
  return (section.dataset.characterBuiltinSettings ?? "") + "?role=" + encodeURIComponent(role.key) + (project ? "&project=" + project : "")
    + (new URLSearchParams(location.search).get("desktop") === "1" ? "&desktop=1" : "");
}

function roleRow(section: HTMLElement, role: BuiltinRole): HTMLElement {
  const item = el("div");
  item.setAttribute("role", "listitem");
  const link = el("a", undefined, "characters-row characters-builtin-item");
  link.href = settingsLink(section, role);
  const copy = el("span", undefined, "characters-row-copy");
  const name = el("strong", role.name); name.translate = false;
  copy.append(name, el("small", uiText.text("workbench.characters.builtin-prompt-count", { count: role.prompt_keys.length })));
  const meta = el("span", undefined, "characters-row-meta");
  meta.append(tag(EXECUTION[role.execution] ? uiText.text(EXECUTION[role.execution]!) : role.execution));
  if (role.subagent) meta.append(tag(uiText.text("workbench.characters.builtin-subagent"), "quiet"));
  if (role.edited) meta.append(tag(uiText.text("workbench.characters.builtin-edited"), "attention"));
  link.append(copy, meta, chevron());
  item.append(link);
  return item;
}

function groupsOf(roles: BuiltinRole[]): Map<string | null, BuiltinRole[]> {
  const groups = new Map<string | null, BuiltinRole[]>();
  for (const role of roles) {
    const owner = isSystem(role) ? null : role.source.title + (role.source.plugin_version ? " " + role.source.plugin_version : "");
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner)?.push(role);
  }
  return groups;
}

/** The system's and Plugins' Characters are registered with the Host; they are changed where their prompts are. */
export async function renderBuiltinRoles(q: Part): Promise<void> {
  const box = q("builtin-list"), section = q("builtin");
  try {
    const read = pageRequest();
    const payload = await read<{ roles: BuiltinRole[] }>(section.dataset.characterBuiltinApi ?? "", { fallback: uiText.text("workbench.characters.builtin-read-failed") });
    const roles = [...payload.roles].sort((a, b) => (isSystem(a) ? 0 : 1) - (isSystem(b) ? 0 : 1));
    box.replaceChildren();
    if (!roles.length) { box.textContent = uiText.text("workbench.characters.builtin-empty"); return; }
    for (const [owner, members] of groupsOf(roles)) {
      const label = el("p", owner ?? uiText.text("workbench.characters.builtin-system"), "characters-group-label");
      if (owner !== null) label.translate = false;
      box.append(label);
      for (const role of members) box.append(roleRow(section, role));
    }
  } catch (error) {
    const reason = messageOf(error);
    const original = el("span", reason || uiText.text("workbench.characters.try-later")); original.translate = !reason;
    box.replaceChildren(el("span", uiText.text("workbench.characters.builtin-failed")), original);
    const retry = el("button", uiText.text("common.control.retry"), "mw-btn mw-btn--secondary mw-btn--sm");
    retry.type = "button";
    retry.addEventListener("click", () => { retry.disabled = true; void renderBuiltinRoles(q); });
    box.append(" ", retry);
  }
}
