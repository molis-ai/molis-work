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

const EXECUTION: Record<string, string> = { "read-only": "只读", "text-edit": "可改文字", "workspace-write": "可改文件、运行命令", operate: "可调用业务能力" };

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
  copy.append(el("strong", role.name), el("small", "由 " + role.prompt_keys.length + " 段提示词组成 · 打开可以查看和修改"));
  const meta = el("span", undefined, "characters-row-meta");
  meta.append(tag(EXECUTION[role.execution] || role.execution));
  if (role.subagent) meta.append(tag("子任务", "quiet"));
  if (role.edited) meta.append(tag("含你的修改", "attention"));
  link.append(copy, meta, chevron());
  item.append(link);
  return item;
}

function groupsOf(roles: BuiltinRole[]): Map<string, BuiltinRole[]> {
  const groups = new Map<string, BuiltinRole[]>();
  for (const role of roles) {
    const owner = isSystem(role) ? "系统" : role.source.title + (role.source.plugin_version ? " " + role.source.plugin_version : "");
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
    const payload = await read<{ roles: BuiltinRole[] }>(section.dataset.characterBuiltinApi ?? "", { fallback: "读取失败" });
    const roles = [...payload.roles].sort((a, b) => (isSystem(a) ? 0 : 1) - (isSystem(b) ? 0 : 1));
    box.replaceChildren();
    if (!roles.length) { box.textContent = "没有登记的系统或插件角色。"; return; }
    for (const [owner, members] of groupsOf(roles)) {
      box.append(el("p", owner, "characters-group-label"));
      for (const role of members) box.append(roleRow(section, role));
    }
  } catch (error) {
    box.textContent = "系统与插件角色暂时读不到：" + (messageOf(error) || "请稍后重试");
    const retry = el("button", "重试", "mw-btn mw-btn--secondary mw-btn--sm");
    retry.type = "button";
    retry.addEventListener("click", () => { retry.disabled = true; void renderBuiltinRoles(q); });
    box.append(" ", retry);
  }
}
