import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { badge, colon, joined, readText, mark, type Kit } from "./common.js";

// What each entry and each pack says about itself, read from the catalog alone (contract-design §4.4): an entry's own state word at
// the end of its row, and a pack's state from its plugin and what it holds. A pack has no switch of its own.

const SKILL_STATE: Record<string, string> = { off: "workbench.catalog-skill-packs.off", auto: "workbench.catalog-skill-packs.automatic", manual: "workbench.catalog-skill-packs.manual-only" };
/** An owner's own reason codes the page has words for; any other code reads 「暂时用不了」 with the owner's detail beside it. */
const REASON: Record<string, string> = {
  plugin_disabled: "workbench.kit.plugin-off", resource_invalid: "workbench.catalog-skill-packs.its-text-or-files-are-missing", requires_unmet: "workbench.kit.missing-capability",
  connection_missing: "workbench.kit.service-disconnected", native_only: "workbench.kit.native-only", not_applicable: "workbench.kit.unsupported-run",
};
export const reasonWord = (entry: KitEntry) => entry.availability.available ? ""
  : entry.availability.reason === "publisher_revoked" ? readText("workbench.catalog-skill-packs.retracted") : readText(REASON[entry.availability.reason] || "workbench.catalog-skill-packs.unavailable-for-now");

/** The word at the end of an entry's row, as a status mark (a tool's is a tag: it has no state, only whether it writes). */
export function entryMark(entry: KitEntry): string {
  if (entry.kind === "tool") return entry.tool.writes ? badge(readText("workbench.kit.writes"), "warning") : badge(readText("workbench.characters.execution-read-only"));
  if (!entry.availability.available) return mark(reasonWord(entry), "hold", "unavailable");
  if (entry.kind === "skill") return entry.skill.state === "off" ? mark(readText("workbench.catalog-skill-packs.off"), "quiet", "idle") : mark(readText(SKILL_STATE[entry.skill.state]!), "idle", "ready");
  if (entry.kind === "prompt") {
    if (entry.version.change?.kind === "default_updated") return mark(readText("workbench.settings-prompts.default-updated"), "attention", "ready");
    return entry.prompt.edited ? mark(readText("workbench.settings-agent-diagnostics.version"), "idle", "ready") : mark(readText("workbench.settings-prompts.default"), "quiet", "idle");
  }
  if (entry.kind === "mcp") {
    if (entry.ref.part === "outbound") return entry.mcp.granted_to?.length ? mark(readText("workbench.kit.outbound-open"), "idle", "ready") : mark(readText("workbench.kit.outbound-closed"), "quiet", "idle");
    if (entry.ref.part === "server") {
      if (entry.mcp.server_enabled === false) return mark(readText("workbench.kit.server-off"), "quiet", "paused");
      return entry.mcp.health === "connected" ? mark(readText("workbench.assistant-side-context.connected"), "idle", "ready") : mark(readText("workbench.kit.disconnected"), "hold", "unavailable");
    }
    return entry.mcp.action_available ? mark(readText("workbench.kit.callable"), "idle", "ready") : mark(readText("workbench.settings-skills.unavailable"), "hold", "unavailable");
  }
  return mark(readText("workbench.appearance-picker.use"), "idle", "ready");
}

export type PackGroup = "on" | "na" | "off";
export interface PackState { word: string; mark: string; group: PackGroup; body: string }

/** A pack's state and the one sentence under it (README rule 5): only availability counts, never a newer default. */
export function packState(kit: Kit, pack: KitPack): PackState {
  const state = pack.state;
  const make = (word: string, tone: "idle" | "hold" | "quiet", ring: "ready" | "unavailable" | "paused", group: PackGroup, body: string) =>
    ({ word, mark: mark(word, tone, ring), group, body });
  if (state.kind === "uninstalled") return make(readText("workbench.settings-plugins.uninstalled"), "quiet", "paused", "off", readText("workbench.kit.uninstall-description"));
  if (state.kind === "disabled") return make(readText("workbench.kit.disabled"), "quiet", "paused", "off", readText("workbench.kit.disabled-description"));
  if (state.kind === "unknown") {
    const titles = state.issues.map(index => kit.catalog.issues[index]?.title).filter((title): title is string => Boolean(title));
    return make(readText("workbench.kit.incomplete"), "hold", "unavailable", "na", readText("workbench.kit.unread-reports", { what: joined(titles.map(title => readText("common.punctuation.quoted", { value: title }))) }));
  }
  if (state.kind === "attention") {
    const items = state.items.map(item => kit.byKey.get(item.entry)).filter((entry): entry is KitEntry => Boolean(entry));
    return make(readText("workbench.assistant-side-context.n-handle", { n: state.items.length }), "hold", "unavailable", "na", items.map(entry => entry.name + colon() + reasonWord(entry)).join(readText("workbench.kit.reason-separator")));
  }
  return make(readText("workbench.appearance-picker.use"), "idle", "ready", "on", readText("workbench.kit.all-available"));
}
