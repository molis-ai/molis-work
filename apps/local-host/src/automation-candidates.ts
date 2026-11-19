import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AutomationCandidate, ScanServiceHints } from "@molis-ai/molis-work-service-automation-recommender";
import type { AutomationGap, AutomationSignal } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { SKILLS_READ_PERMISSION, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { openedAgentDefinitions } from "./agent-definitions/agent-definitions.js";
import { observedSkillCatalog } from "./agent-definitions/skill-catalog-host.js";
import { projectAgentDefinitionEntries } from "./agent-definitions/kit-report.js";
import { connectorDirectory } from "./connector-directory.js";
import { existingIntegrationRegistry } from "./builtin-integrations.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import type { IntegrationRegistry } from "./integration-registry.js";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { observedScopeInstallations, type ScopeInstallation } from "./scope-installations.js";

const technical = /工程|测试|代码|审查|排错|前端|debug|test|code|review|frontend|lint|typescript/i;
const changed = () => new ActionError("actions.conflict", "建议的能力来源已变化，请重新查看");

function skillSignals(skill: SkillCatalogEntry): AutomationSignal[] {
  const purpose = (skill.ref.skill_id + " " + skill.name + " " + skill.description).toLowerCase();
  if (/前端|界面|设计|frontend|design|react|css|ui-/.test(purpose)) return ["frontend"];
  if (/测试|test|coverage|lint|format|质量/.test(purpose)) return ["tests", "format", "ci"];
  return technical.test(purpose) ? ["javascript", "python", "rust", "go"] : [];
}

/** Only registrations already visible in the original directories can become candidates. */
function skillCandidate(skill: SkillCatalogEntry, english: boolean): AutomationCandidate {
  const { ref, pack } = skill;
  return { category: "skills", key: JSON.stringify([ref.source.plugin_id, ref.source.publisher_signature, ref.skill_id]), title: skill.name, names: [ref.skill_id],
    match: skillSignals(skill), existing: skill.state !== "off", reason: skill.when_to_use || skill.description,
    effect: english ? "Makes this installed skill available in matching conversations." : "让已安装的技能可以在适用的对话里使用。",
    requirements: [pack.title + " · " + pack.version, pack.publisher_label, ...skill.tools],
    risk: skill.runs_scripts
      ? (english ? "Includes scripts. Existing tool permissions still apply." : "含脚本。启用后仍按原工具授权执行。")
      : (english ? "Using the skill can consume model quota." : "技能可能使用模型额度。"), next: { kind: "skill", ref } };
}

/**
 * The services a project points at (specs/automation-recommender §7): every declared service that says, in `project_hints`, what in a
 * project shows the person works with it, and that can be connected here. Nothing is named in the product: a service without hints is
 * never suggested, one an installed package declares is suggested like a built-in one.
 */
function connectorCandidates(home: string, registry: IntegrationRegistry, english: boolean) {
  // Presence alone avoids proposing a second setup for a service already in the person's directory, including disconnected accounts.
  // No reason to read a token, test a connection or inspect its endpoint.
  const current = () => new Set(withConnectorConnections(home, store => store.list().map(row => row.service_id), true) ?? []);
  const seen = current();
  const canConnect = (row: ReturnType<typeof connectorDirectory>[number]) => row.method_options?.some(method =>
    method.kind === "token" || method.kind === "oauth" && method.login_ready || method.kind === "cli" && method.cli?.setup_available);
  const declared = new Map(registry.connectionServices().flatMap(service => service.declaration.project_hints
    ? [[service.declaration.service_id, service.declaration.project_hints] as const] : []));
  const hints: ScanServiceHints[] = [];
  const rows = connectorDirectory(registry).flatMap((row): AutomationCandidate[] => {
    const id = row.connector_id, projectHints = declared.get(id);
    if (!projectHints || !canConnect(row)) return [];
    if (!seen.has(id)) hints.push({ service_id: id, ...projectHints });
    return [{ category: "connections", key: id, title: row.title, match: [], service: id, existing: seen.has(id),
      reason: row.summary, effect: english ? "Reads the material you grant access to after connecting." : "完成接入后，可从该服务读取有权限的资料。",
      requirements: [english ? "A service account you can authorize" : "可授权的服务账号"],
      risk: english ? "The connection uses this service’s access and pricing rules." : "连接会把获准的数据交给该服务，按服务的权限和费用规则处理。",
      next: { kind: "connection", service_id: id } }];
  });
  return { rows, hints, assertCurrent: () => {
    const live = current();
    const services = new Map(connectorDirectory(registry).map(row => [row.connector_id, row]));
    for (const row of rows) {
      const service = services.get(row.key);
      if (!service || !canConnect(service) || seen.has(row.key) !== live.has(row.key)) throw changed();
    }
  } };
}

export async function automationCandidates(home: string, source: ProjectPluginHost, project: LocalHostProjectReference, caller: ActionCallContext,
  projectAllows: (plugin: string) => boolean | undefined) {
  const rows: AutomationCandidate[] = [], gaps: AutomationGap[] = [];
  const english = caller.locale?.startsWith("en") ?? false;
  const connections = existingIntegrationRegistry(home);
  const registry = await connections?.then(value => value, () => undefined);
  const connectors = registry && connectorCandidates(home, registry, english);
  if (connectors) rows.push(...connectors.rows);
  else gaps.push({ code: "directory-unavailable", category: "connections" });

  const definitions = openedAgentDefinitions(home), ledger = new HomeConsentLedger(home);
  const tracked = new Map<string, ScopeInstallation>();
  const settingsRevisions = new Map<string, number>();
  const settingsKey = (install: string, skill: string) => install + "\0" + skill;
  const pins = ledger.observedPublishers();
  const byPublisher = new Map(pins.map(pin => [pin.key_id, pin]));
  if (definitions) {
    const scope = await observedScopeInstallations(source, project);
    const installations = new Map(scope.installations.map(row => [row.record.install_id, row]));
    const track = (id: string, generation?: string) => {
      const row = installations.get(id), record = row?.record;
      if (!row || !record || row.recoveryCode || record.state !== "running" || projectAllows(record.plugin_id) === false
        || generation !== undefined && record.installation_generation !== generation) return false;
      if (record.publisher_trust === "pinned") {
        const pin = byPublisher.get(record.publisher_signature);
        if (!pin || pin.revoked_at) return false;
      }
      tracked.set(id, row);
      return true;
    };
    const catalog = observedSkillCatalog(home, source, definitions, scope, byPublisher);
    const skills = await catalog.list({ actor_id: caller.actor_id, project_id: caller.project_id, audience: "user", locale: caller.locale, signal: caller.signal,
      permissions: [SKILLS_READ_PERMISSION] }, {});
    for (const skill of skills.skills) {
      if (!skill.availability.available || !track(skill.ref.install_id, skill.ref.installation_generation)) continue;
      settingsRevisions.set(settingsKey(skill.ref.install_id, skill.ref.skill_id), skill.settings_revision);
      rows.push(skillCandidate(skill, english));
    }
    const roles = projectAgentDefinitionEntries(home, definitions, scope.installations, caller.locale, pins);
    for (const row of roles.entries) {
      if (row.kind !== "role" || row.ref.kind !== "plugin" || !row.role.subagent || !row.availability.available
        || !technical.test(row.name + " " + row.description) || row.source?.kind !== "plugin" || !track(row.source.install_id)) continue;
      rows.push({ category: "roles", key: JSON.stringify([row.ref.owner_id, row.ref.role_id]), title: row.name, names: [row.ref.role_id], match: ["tests", "format", "ci", "frontend"],
        reason: row.description, effect: english ? "Can take on this kind of review when a role is needed." : "可在适用的工作里把这一类核对交给该角色。",
        requirements: [row.source.title + " · " + row.version.label, row.source.publisher_label, ...row.declares.tools],
        risk: english ? "Uses model quota and the current round’s tool permissions." : "调用角色会使用模型额度，工具仍受本轮权限限制。",
        next: { kind: "role", owner_id: row.ref.owner_id, role_id: row.ref.role_id, install_id: row.source.install_id, plugin_version: row.source.version } });
    }
  } else gaps.push({ code: "directory-unavailable", category: "skills" }, { code: "directory-unavailable", category: "roles" });
  gaps.push({ code: "directory-unavailable", category: "hooks" }, { code: "directory-unavailable", category: "commands" });
  return { rows, gaps, hints: connectors?.hints ?? [], assertCurrent: () => {
    const livePins = new Map(ledger.observedPublishers().map(pin => [pin.key_id, pin]));
    const settings = new Map(definitions?.skills.settings(project.project_id).map(row => [settingsKey(row.install_id, row.skill_id), row.revision]));
    for (const [key, revision] of settingsRevisions) if ((settings.get(key) ?? 0) !== revision) throw changed();
    for (const row of tracked.values()) {
      row.assertCurrent();
      const id = row.record.publisher_signature;
      if (row.record.publisher_trust === "pinned" && !isDeepStrictEqual(livePins.get(id), byPublisher.get(id))) throw changed();
    }
    connectors?.assertCurrent();
  } };
}
