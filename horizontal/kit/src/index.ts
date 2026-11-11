import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import {
  KIT_REPORT_INPUT_TYPE, KIT_REPORT_OUTPUT_TYPE,
  type KitEntry, type KitKind, type KitPackId, type KitReport, type KitReportedEntry, type KitReportedPack, type KitRoleRef, type KitSource,
} from "@molis-ai/molis-work-contracts/platform/kit-report";
import { KIT_AGENT_DEFINITIONS_PROVIDER_ID, KIT_AGENT_MCP_PROVIDER_ID, KIT_AGENT_TOOLS_PROVIDER_ID, KIT_MCP_ACCESS_PROVIDER_ID, kitErrors,
  type KitCatalog, type KitPack, type KitPackState } from "@molis-ai/molis-work-contracts/services/kit";
import { SKILLS_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/skills";

// The AI kit's gatherer (specs/capability-pack/contract-design.md §4.6, §4.7): it finds the owners' reports in the caller's own
// directory, calls each once, stamps where each entry comes from and which pack it is in, and reads every pack's state from what it
// holds. Nothing is stored: every call gathers again.

type PackRule = "plugin" | "system:builtin" | "system:characters";

/** A named system provider may speak for others: the kinds it reports, the sources it may give and the packs it may put entries in. */
export interface KitSystemReporter {
  readonly kinds: readonly KitKind[];
  readonly sources: readonly KitSource["kind"][];
  readonly packs: readonly PackRule[];
  /** Only the plugin install service gives pack headers. */
  readonly headers?: true;
}

/**
 * Who may say where an entry comes from and which pack it is in (§4.6). A trust boundary, not a list of reporters: reporters are found
 * by their contract types; a provider named here is believed only when the Host registered it (no plugin installation behind it).
 */
export const KIT_SYSTEM_REPORTERS: Readonly<Record<string, KitSystemReporter>> = {
  [SKILLS_PROVIDER_ID]: { kinds: ["skill"], sources: ["plugin"], packs: ["plugin"] },
  [KIT_AGENT_DEFINITIONS_PROVIDER_ID]: { kinds: ["prompt", "role"], sources: ["plugin", "system"], packs: ["plugin", "system:builtin"] },
  [KIT_AGENT_TOOLS_PROVIDER_ID]: { kinds: ["tool"], sources: ["runtime", "system"], packs: ["system:builtin"] },
  [CHARACTER_PLUGIN_ID]: { kinds: ["role"], sources: ["character"], packs: ["system:characters"] },
  [KIT_AGENT_MCP_PROVIDER_ID]: { kinds: ["mcp"], sources: ["mcp_server"], packs: ["plugin"] },
  // The Host's connections and its plugin install service (their ids are the Host's: apps/local-host).
  "system.connectors": { kinds: ["mcp"], sources: ["mcp_server"], packs: ["plugin", "system:builtin"] },
  [KIT_MCP_ACCESS_PROVIDER_ID]: { kinds: ["mcp"], sources: ["outbound"], packs: ["system:builtin"] },
  "plugin-install": { kinds: [], sources: [], packs: [], headers: true },
};

/** How long one reporter may take before the gatherer goes on without it (§4.7). */
export const KIT_REPORT_TIMEOUT_MS = 5_000;

/** What a plugin's own reporter may report: never a Skill, a tool or a pack header (§4.6). */
const PLUGIN_KINDS: readonly KitKind[] = ["prompt", "role", "mcp"];
const BUILTIN: KitPackId = "system:builtin", CHARACTERS: KitPackId = "system:characters";
const SYSTEM_PACKS = {
  [BUILTIN]: { zh: ["Molis Work 自带", "个人助理、平台的提示词与全部 Agent 工具、对外接入的 MCP。"], en: ["Built into Molis Work", "The personal assistant, the platform's prompts, every Agent tool, and the MCP Molis Work offers."] },
  [CHARACTERS]: { zh: ["你的角色", "你写的角色，各带自己声明的工具。"], en: ["Your characters", "The characters you wrote, each with the tools it declares."] },
} as const;
const ASSISTANT: KitRoleRef = { kind: "assistant" };

type Issue = KitCatalog["issues"][number];
interface Reporter { view: ActionView; system?: KitSystemReporter; install?: { id: string; plugin_id: string } }
interface Answer { reporter: Reporter; report?: KitReport; issue?: number }

/** Gather the kit in the caller's scope through the caller's own client: one discovery, one call per reporter, in parallel. */
export async function gatherKit(caller: ActionCallContext, client: ActionClient): Promise<KitCatalog> {
  const issues: Issue[] = [];
  const issue = (view: ActionView, message: string) => issues.push({ provider_id: view.provider.provider_id, title: view.provider.title, message }) - 1;
  const reporters = (await client.discover(caller)).filter(view => view.action.input_type === KIT_REPORT_INPUT_TYPE && view.action.output_type === KIT_REPORT_OUTPUT_TYPE)
    .flatMap(view => { const reporter = reporterOf(view); return reporter ? [reporter] : []; });
  const answers = await Promise.all(reporters.map(async (reporter): Promise<Answer> => {
    const { view } = reporter;
    if (!view.availability.available) return { reporter, issue: issue(view, view.availability.reason) };
    // A reporter that does not answer in time is cut off: its packs read 「没读到」, the rest of the page is not held up.
    const limit = AbortSignal.timeout(KIT_REPORT_TIMEOUT_MS), signal = caller.signal ? AbortSignal.any([caller.signal, limit]) : limit;
    try {
      const report = await new Promise<KitReport>((resolve, reject) => {
        const stop = () => reject(new ActionError("actions.timeout", "上报超时"));
        if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
        client.invoke({ ...caller, signal }, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {}).then(answer => resolve(answer as KitReport), reject);
      });
      const ids = new Set<string>();
      for (const entry of report.entries) {
        if (ids.has(entry.entry_id)) throw kitErrors.report_invalid(`重复的条目 ${entry.entry_id}`);
        ids.add(entry.entry_id);
      }
      return { reporter, report };
    } catch (error) {
      return { reporter, issue: issue(view, error instanceof ActionError ? error.message : "暂时读不到") };
    }
  }));
  const headers = new Map<string, KitReportedPack>();
  for (const { reporter, report } of answers) {
    if (!report?.packs?.length) continue;
    if (!reporter.system?.headers) { issue(reporter.view, "只有插件安装服务能给出包头"); continue; }
    for (const pack of report.packs) headers.set(pack.source.install_id, pack);
  }
  const entries = answers.flatMap(({ reporter, report }) => (report?.entries ?? []).flatMap(entry => {
    const stamped = stamp(reporter, entry, headers);
    if (typeof stamped === "string") { issue(reporter.view, `${entry.name}：${stamped}`); return []; }
    return [stamped];
  }));
  return assemble(caller, headers, entries, answers, issues);
}

/** A reporter's standing: a named provider the Host registered, a plugin installation's own, or nobody that may report. */
function reporterOf(view: ActionView): Reporter | undefined {
  const provider = view.provider, system = KIT_SYSTEM_REPORTERS[provider.provider_id];
  if (provider.plugin_install_id === undefined) return system ? { view, system } : undefined;
  return provider.kind === "plugin" && provider.plugin_id ? { view, install: { id: provider.plugin_install_id, plugin_id: provider.plugin_id } } : undefined;
}

/** Stamp one entry with its source and pack, or say why it is dropped (§4.6). */
function stamp({ view, system, install }: Reporter, entry: KitReportedEntry, headers: ReadonlyMap<string, KitReportedPack>): KitEntry | string {
  const reporter = { provider_id: view.provider.provider_id, title: view.provider.title };
  const { source: claimed, pack: claimedPack, ...reported } = entry;
  const key = `${reporter.provider_id}/${entry.entry_id}`;
  if (install) {
    if (!PLUGIN_KINDS.includes(entry.kind)) return "插件不能上报这一类";
    const header = headers.get(install.id);
    if (!header) return "它的安装不在包头里";
    if (!ownedByPlugin(entry, install.plugin_id)) return "引用了别的主人的角色或提示词";
    const manage = entry.manage && pluginSurface(entry.manage.href, install.plugin_id) ? { manage: entry.manage } : {};
    const { manage: _manage, ...rest } = reported as KitReportedEntry;
    return { ...rest, ...manage, key, reporter, source: header.source, pack: `plugin:${install.id}` } as KitEntry;
  }
  if (!system!.kinds.includes(entry.kind)) return "这个提供方不能上报这一类";
  if (!claimed || !system!.sources.includes(claimed.kind)) return "来源不在它能给的范围里";
  if (!claimedPack) return "没有说属于哪个包";
  if (claimedPack.startsWith("plugin:")) {
    const header = headers.get(claimedPack.slice("plugin:".length));
    if (!system!.packs.includes("plugin") || !header) return "包不在它能放的范围里";
    if (claimed.kind === "plugin" && (claimed.plugin_id !== header.source.plugin_id || claimed.install_id !== header.source.install_id)) return "来源与包的安装不符";
  } else if (!system!.packs.includes(claimedPack as PackRule)) return "包不在它能放的范围里";
  const manage = entry.manage && hostSettings(entry.manage.href) ? { manage: entry.manage } : {};
  const { manage: _manage, ...rest } = reported as KitReportedEntry;
  return { ...rest, ...manage, key, reporter, source: claimed, pack: claimedPack } as KitEntry;
}

/** A plugin's role is its own; its prompt is its own and hangs only under its own roles or the personal assistant. */
function ownedByPlugin(entry: KitReportedEntry, pluginId: string): boolean {
  const own = (role: KitRoleRef) => role.kind === "assistant" || (role.kind === "plugin" && role.owner_id === pluginId);
  if (entry.kind === "role") return entry.ref.kind === "plugin" && entry.ref.owner_id === pluginId;
  if (entry.kind === "prompt") return entry.ref.owner_id === pluginId && entry.prompt.roles.every(own);
  return true;
}

/** A plugin's own page in the workbench (`/plugins/<plugin_id>`), never the Host's settings or another plugin's. */
function pluginSurface(href: string, pluginId: string): boolean {
  const base = `/plugins/${pluginId}`;
  return href === base || ["/", "?", "#"].some(next => href.startsWith(base + next));
}

/** The Host's own settings (`/settings/…`, a project's `/projects/<id>/settings/…`, `/capabilities/…`). */
function hostSettings(href: string): boolean {
  return /^\/(?:settings|capabilities)(?:[/?#]|$)/u.test(href) || /^\/projects\/[^/?#]+\/settings(?:[/?#]|$)/u.test(href);
}

/** Packs from the headers and the two system packs; entries into their packs; each pack's tools and state (§4.4, §4.6). */
function assemble(caller: ActionCallContext, headers: ReadonlyMap<string, KitReportedPack>, entries: KitEntry[], answers: readonly Answer[], issues: Issue[]): KitCatalog {
  const english = caller.locale === "en";
  const packs = new Map<KitPackId, KitPack>();
  for (const [id, words] of Object.entries(SYSTEM_PACKS)) {
    const [name, description] = english ? words.en : words.zh;
    packs.set(id, { pack_id: id, kind: id === BUILTIN ? "builtin" : "characters", name, description, state: { kind: "active" }, roles: [], skills: [], mcp: [], tools: [],
      export: { package: false, prompt_overrides: false, references: false } });
  }
  for (const header of headers.values()) {
    const id = `plugin:${header.source.install_id}`;
    packs.set(id, { pack_id: id, kind: "plugin", name: header.source.title, description: header.description, source: header.source, version: { label: header.source.version },
      ...(header.upgraded ? { upgraded: header.upgraded } : {}), state: { kind: header.status === "enabled" ? "active" : header.status }, roles: [], skills: [], mcp: [], tools: [],
      export: { package: false, prompt_overrides: false, references: false } });
  }
  // An uninstalled pack is its header only: no entries are listed for what is gone (§4.4, §4.10).
  const kept = entries.filter(entry => packs.has(entry.pack) && packs.get(entry.pack)!.state.kind !== "uninstalled");
  const assistant = kept.find(entry => entry.kind === "role" && entry.ref.kind === "assistant");
  const tools = kept.filter(entry => entry.kind === "tool");
  for (const pack of packs.values()) fill(pack, kept.filter(entry => entry.pack === pack.pack_id), { assistant, tools }, headers, issues);
  for (const tool of tools) tool.in_packs = [...packs.values()].filter(pack => pack.tools.includes(tool.key)).map(pack => pack.pack_id);
  for (const pack of packs.values()) pack.state = stateOf(pack, kept, answers);
  return { packs: [...packs.values()].sort(byAttention), entries: kept, issues };
}

/** One pack's roles with their prompts, its Skills, MCP and tools (§4.2, §4.3, §4.6 steps 3–6). */
function fill(pack: KitPack, own: readonly KitEntry[], shared: { assistant?: KitEntry; tools: readonly KitEntry[] }, headers: ReadonlyMap<string, KitReportedPack>, issues: Issue[]): void {
  const { assistant } = shared;
  const roles = own.filter(entry => entry.kind === "role"), prompts = own.filter(entry => entry.kind === "prompt");
  const promptsOf = (role: KitRoleRef) => prompts.filter(prompt => prompt.kind === "prompt" && (prompt.prompt.roles.length ? prompt.prompt.roles.some(ref => isDeepStrictEqual(ref, role)) : role.kind === "assistant")).map(prompt => prompt.key);
  pack.roles = roles.map(role => ({ role: role.key, prompts: role.kind === "role" ? promptsOf(role.ref) : [] }));
  // A plugin pack's prompts for the personal assistant hang under one row that refers to the built-in pack's assistant (§4.2).
  const forAssistant = pack.kind === "plugin" ? promptsOf(ASSISTANT) : [];
  if (forAssistant.length) {
    if (assistant) pack.roles.push({ role: assistant.key, prompts: forAssistant });
    else issues.push({ provider_id: "system.kit", title: pack.name, message: "个人助理没有读到，归它的提示词不显示" });
  }
  const hung = new Set(pack.roles.flatMap(row => row.prompts));
  for (const prompt of prompts) if (!hung.has(prompt.key)) issues.push({ provider_id: prompt.reporter.provider_id, title: prompt.reporter.title, message: `${prompt.name}：挂的角色不在这个包里` });
  pack.roles = pack.roles.slice(0, 64);
  pack.skills = own.filter(entry => entry.kind === "skill").map(entry => entry.key);
  pack.mcp = own.filter(entry => entry.kind === "mcp").map(entry => entry.key);
  // Tools are the system's: the built-in pack has them all; another pack has those its roles name (§4.3).
  const named = new Set(roles.flatMap(role => role.kind === "role" ? role.role.host_tools : []));
  pack.tools = shared.tools.filter(tool => tool.kind === "tool" && (pack.pack_id === BUILTIN || named.has(tool.ref.tool))).map(tool => tool.key);
  const header = pack.source && headers.get(pack.source.install_id);
  pack.export = { package: Boolean(header?.exportable), prompt_overrides: prompts.some(prompt => prompt.kind === "prompt" && prompt.prompt.edited), references: own.length > 0 };
}

function stateOf(pack: KitPack, entries: readonly KitEntry[], answers: readonly Answer[]): KitPackState {
  if (pack.state.kind === "uninstalled" || pack.state.kind === "disabled") return pack.state;
  // A failed reporter whose entries could be here: nothing can be said about what is unusable, so never 「在用」 (§4.4).
  const failed = answers.filter(answer => answer.issue !== undefined && couldHold(answer.reporter, pack)).map(answer => answer.issue!);
  if (failed.length) return { kind: "unknown", issues: failed };
  const held = new Set([...pack.roles.flatMap(row => [row.role, ...row.prompts]), ...pack.skills, ...pack.mcp]);
  const items = entries.filter(entry => entry.pack === pack.pack_id && held.has(entry.key) && entry.kind !== "tool" && !entry.availability.available)
    .map(entry => ({ entry: entry.key, reason: entry.availability.available ? "" : entry.availability.reason }));
  return items.length ? { kind: "attention", items } : { kind: "active" };
}

/** A plugin reporter's entries are only in its own pack; a system reporter's in every pack its rule allows. */
function couldHold(reporter: Reporter, pack: KitPack): boolean {
  if (reporter.install) return pack.pack_id === `plugin:${reporter.install.id}`;
  const rules = reporter.system!.packs;
  return pack.kind === "plugin" ? rules.includes("plugin") : rules.includes(pack.pack_id as PackRule);
}

const NEEDS_ATTENTION = new Set<KitPackState["kind"]>(["attention", "unknown"]);
function byAttention(a: KitPack, b: KitPack): number {
  return Number(NEEDS_ATTENTION.has(b.state.kind)) - Number(NEEDS_ATTENTION.has(a.state.kind)) || a.name.localeCompare(b.name);
}
