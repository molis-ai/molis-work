import { randomUUID } from "node:crypto";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionHandler, type ActionCallContext, type ActionClient, type ActionExecutionContext,
  type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { AUTOMATION_ADOPTION_PROVIDER_ID, automationAdoptionActions as actions, type AutomationAdoptInput, type AutomationAdoptResult,
  type AutomationUndoResult } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { CONNECTOR_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/connector-host";
import { SKILLS_PROVIDER_ID, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { changeOfferRecord, hideAutomationSuggestions, readOfferRecord, type AdoptedSkill, type OfferedItem } from "@molis-ai/molis-work-service-automation-recommender";
import { connectorSetupAction } from "./connector-setup.js";
import { listConnectorSettingsCards } from "./connector-directory.js";

/**
 * Turning on what the Assistant's card offered (specs/automation-recommender §7, AUT-06, AUT-08). Only the person calls it — the card
 * the Host placed in their work runs it as them, and no Agent, plugin, workflow or MCP client is offered it — and only for the items the
 * project's latest card listed: a skill is turned on in this project the way they picked, a connection is prepared to be finished in the
 * card, and items marked 「以后别再提」 are hidden in the project's preferences. Undo turns back exactly the skills this adoption turned
 * on, each only while it is still at the revision this adoption left; one changed since is left as it is and said.
 */
export interface AutomationAdoptionPorts {
  readonly home: string;
  clientFor(caller: ActionCallContext): ActionClient;
  /** The project's incarnation as the recommender keys it (the project record's own identity, not a value from the call). */
  incarnation(caller: ActionCallContext): Promise<string>;
}

const skillsRef = { capability_id: skillCatalogActions.list.capability_id, version: skillCatalogActions.list.version, provider_id: SKILLS_PROVIDER_ID };
const setStateRef = { capability_id: skillCatalogActions.setState.capability_id, version: skillCatalogActions.setState.version, provider_id: SKILLS_PROVIDER_ID };
const setupRef = { capability_id: connectorSetupAction.capability_id, version: connectorSetupAction.version, provider_id: CONNECTOR_PROVIDER_ID };

/** Only the person, acting for themselves in a project: never a delegated call, a plugin's or one without a project. */
function person(caller: ActionCallContext): string {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.host_plugin || caller.delegated_by || !caller.project_id) {
    throw new ActionError("actions.forbidden", "只有本人能在项目里开启或撤销建议");
  }
  return caller.project_id;
}

async function subjectOf(ports: AutomationAdoptionPorts, caller: ActionCallContext) {
  const project = person(caller);
  return { actor: caller.actor_id, project, incarnation: await ports.incarnation(caller) };
}

const sameSkill = (row: SkillCatalogEntry, item: { install_id: string; skill_id: string }) => row.ref.install_id === item.install_id && row.ref.skill_id === item.skill_id;
const listOf = (titles: readonly string[]) => titles.join(uiText.text("common.list.separator"));

async function adopt(ports: AutomationAdoptionPorts, input: AutomationAdoptInput, caller: ActionExecutionContext): Promise<AutomationAdoptResult> {
  const subject = await subjectOf(ports, caller);
  const record = readOfferRecord(ports.home, subject);
  const offered = new Map(record.offered.map(item => [item.id, item]));
  const picked = (ids: readonly string[]) => ids.map(id => {
    const item = offered.get(id);
    if (!item) throw new ActionError("actions.conflict", "这条建议已不在最近一次列出的建议里，请让助理重新看看");
    return item;
  });
  const adopting = picked(input.adopt), never = picked(input.never);
  if (adopting.some(item => input.never.includes(item.id))) throw new ActionError("actions.input_invalid", "同一条建议不能既开启又以后别再提");
  if (!adopting.length && !never.length) throw new ActionError("actions.input_invalid", "没有选中要开启或不再提的建议");
  const client = ports.clientFor(caller);
  const skills = adopting.filter((item): item is Extract<OfferedItem, { kind: "skill" }> => item.kind === "skill");
  const connections = adopting.filter((item): item is Extract<OfferedItem, { kind: "connection" }> => item.kind === "connection");
  if (connections.length > 1) throw new ActionError("actions.input_invalid", "一次只接一个服务");

  // Everything is checked before anything changes: each skill is still the one offered (same installation), usable, and still off here.
  let catalog: SkillCatalogEntry[] = [];
  if (skills.length) catalog = (await client.invoke(caller, skillsRef, {}) as { skills: SkillCatalogEntry[] }).skills;
  const current = skills.map(item => {
    const row = catalog.find(entry => sameSkill(entry, item) && entry.pack.scope !== "home");
    if (!row || row.ref.installation_generation !== item.installation_generation) throw new ActionError("actions.conflict", `「${item.title}」已经变化，请让助理重新看看`);
    if (!row.availability.available) throw new ActionError("actions.conflict", `「${item.title}」现在用不了，没有开启`);
    return { item, row };
  });
  const service = connections[0];
  // Finished in the card: a sign-in in the browser when the product can sign in to it, else one pasted key.
  const options = service ? (await listConnectorSettingsCards(ports.home)).find(row => row.connector_id === service.service_id)?.method_options ?? [] : [];
  const method = options.find(option => option.kind === "oauth" && option.login_ready) ?? options.find(option => option.kind === "token");
  if (service && !method) throw new ActionError("actions.conflict", `「${service.title}」现在不能在这里接入，请到服务连接页接入`);

  await caller.beforeEffect();
  const adopted: AdoptedSkill[] = [];
  for (const { item, row } of current) {
    if (row.state !== "off") continue; // Already on (the person did it meanwhile): nothing of ours to undo.
    const after = await client.invoke(caller, setStateRef, { scope: "project", install_id: item.install_id, skill_id: item.skill_id,
      state: input.skill_state, expected_revision: row.settings_revision }) as SkillCatalogEntry;
    adopted.push({ install_id: item.install_id, skill_id: item.skill_id, title: item.title, revision: after.settings_revision });
  }
  let authorization_id: string | undefined;
  if (service && method) {
    const prepared = await client.invoke(caller, setupRef, { service_id: service.service_id, method: method.kind, display_name: service.title, expected_revision: null }) as { authorization_id: string };
    authorization_id = prepared.authorization_id;
  }
  if (never.length) hideAutomationSuggestions(ports.home, subject, never.map(item => ({ id: item.id, title: item.title })));
  const adoption_id = randomUUID();
  changeOfferRecord(ports.home, subject, record => ({ result: undefined,
    next: { ...record, adoptions: [...record.adoptions, { adoption_id, at: new Date().toISOString(), skills: adopted, undone: false }] } }));
  const enabled = adopting.map(item => ({ id: item.id, title: item.title }));
  const parts = [
    ...(skills.length ? [uiText.text(input.skill_state === "auto" ? "workbench.automation-adoption.skills-auto" : "workbench.automation-adoption.skills-manual", { names: listOf(skills.map(item => item.title)) })] : []),
    ...(service ? [uiText.text("workbench.automation-adoption.connect-next", { name: service.title })] : []),
    ...(never.length ? [uiText.text("workbench.automation-adoption.never-again", { names: listOf(never.map(item => item.title)) })] : []),
  ];
  return { adoption_id, summary: parts.join(" "), enabled, hidden: never.map(item => ({ id: item.id, title: item.title })), ...(authorization_id ? { authorization_id } : {}) };
}

async function undo(ports: AutomationAdoptionPorts, input: { adoption_id: string }, caller: ActionExecutionContext): Promise<AutomationUndoResult> {
  const subject = await subjectOf(ports, caller);
  const adoption = readOfferRecord(ports.home, subject).adoptions.find(row => row.adoption_id === input.adoption_id);
  if (!adoption) throw new ActionError("actions.missing", "找不到这次开启");
  if (adoption.undone) throw new ActionError("actions.conflict", "这次开启已经撤销过了");
  const client = ports.clientFor(caller);
  await caller.beforeEffect();
  const restored: string[] = [], kept: { title: string; reason: string }[] = [];
  for (const skill of adoption.skills) {
    try {
      await client.invoke(caller, setStateRef, { scope: "project", install_id: skill.install_id, skill_id: skill.skill_id, state: "off", expected_revision: skill.revision });
      restored.push(skill.title);
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      kept.push({ title: skill.title, reason: error.code === "actions.conflict" ? uiText.text("workbench.automation-adoption.changed-since") : error.message });
    }
  }
  changeOfferRecord(ports.home, subject, record => ({ result: undefined,
    next: { ...record, adoptions: record.adoptions.map(row => row.adoption_id === adoption.adoption_id ? { ...row, undone: true } : row) } }));
  const summary = [
    restored.length ? uiText.text("workbench.automation-adoption.undone", { names: listOf(restored) }) : uiText.text("workbench.automation-adoption.nothing-undone"),
    ...kept.map(row => uiText.text("workbench.automation-adoption.kept", { name: row.title, reason: row.reason })),
  ].join(" ");
  return { adoption_id: adoption.adoption_id, summary, restored, kept };
}

export function automationAdoptionProvider(ports: AutomationAdoptionPorts): ActionProviderRegistration {
  return {
    provider: { provider_id: AUTOMATION_ADOPTION_PROVIDER_ID, title: "项目自动化建议", kind: "system" },
    definitions: [actions.adopt, actions.undo],
    handlers: [
      bindActionHandler(actions.adopt, (input, caller) => adopt(ports, input, caller)),
      bindActionHandler(actions.undo, (input, caller) => undo(ports, input, caller)),
    ],
  };
}
