import { randomUUID } from "node:crypto";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionHandler, requireSynchronous, type ActionCallContext, type ActionClient, type ActionExecutionContext,
  type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { AUTOMATION_ADOPTION_PROVIDER_ID, automationAdoptionActions as actions, type AutomationAdoptInput, type AutomationAdoptResult,
  type AutomationUndoResult } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { CONNECTOR_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/connector-host";
import { SKILLS_PROVIDER_ID, skillCatalogActions, type SkillCatalogEntry, type SkillSettingsSetRequest } from "@molis-ai/molis-work-contracts/services/skills";
import { changeOfferRecord, hideAutomationSuggestions, readOfferRecord, type AdoptedSkill, type OfferedItem } from "@molis-ai/molis-work-service-automation-recommender";
import { connectorSetupAction } from "./connector-setup.js";
import { connectorManagementActions } from "./connector-management-actions.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { takeAutomationCardDecision } from "./automation-adoption-authority.js";
import { withSkillSettingReceipt } from "./agent-definitions/skill-setting-receipt.js";

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
const cancelSetupRef = { capability_id: connectorManagementActions.cancel.capability_id, version: connectorManagementActions.cancel.version, provider_id: CONNECTOR_PROVIDER_ID };

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
const assertCurrent = (caller: ActionExecutionContext) => {
  caller.signal?.throwIfAborted();
  requireSynchronous(caller.assert_authority_current?.());
};

async function adopt(ports: AutomationAdoptionPorts, input: AutomationAdoptInput, caller: ActionExecutionContext): Promise<AutomationAdoptResult> {
  const decision = takeAutomationCardDecision(caller, { capability_id: actions.adopt.capability_id, version: actions.adopt.version, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID }, input);
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
    const row = catalog.find(entry => sameSkill(entry, item));
    if (!row || row.ref.installation_generation !== item.installation_generation) throw new ActionError("actions.conflict", `「${item.title}」已经变化，请让助理重新看看`);
    if (!row.availability.available) throw new ActionError("actions.conflict", `「${item.title}」现在用不了，没有开启`);
    return { item, row };
  });
  const service = connections[0];
  // Finished in the card: a sign-in in the browser when the product can sign in to it, else one pasted key.
  const options = service ? (await listConnectorSettingsCards(ports.home)).find(row => row.connector_id === service.service_id)?.method_options ?? [] : [];
  const method = options.find(option => option.kind === "oauth" && option.login_ready) ?? options.find(option => option.kind === "token");
  if (service && !method) throw new ActionError("actions.conflict", `「${service.title}」现在不能在这里接入，请到服务连接页接入`);

  const adopted: AdoptedSkill[] = [];
  const adoptionId = randomUUID(), at = new Date().toISOString();
  let prepared: { authorization_id: string; created: boolean } | undefined;
  const saveReceipt = (skills: readonly AdoptedSkill[]) => changeOfferRecord(ports.home, subject, previous => ({ result: undefined,
    next: { ...previous, adoptions: [...previous.adoptions.filter(row => row.adoption_id !== adoptionId),
      ...(skills.length ? [{ adoption_id: adoptionId, at, skills, undone: false }] : [])] } }));
  try {
    for (const { item, row } of current) {
      if (row.state !== "off") continue; // Already on (the person did it meanwhile): nothing of ours to undo.
      const update: SkillSettingsSetRequest = { scope: "project", install_id: item.install_id, skill_id: item.skill_id,
        state: input.skill_state, expected_revision: row.settings_revision };
      // Record the exact revision in the successful local write, before the next await can observe cancellation or revocation.
      await withSkillSettingReceipt({ actor_id: caller.actor_id, project_id: caller.project_id, input: update, record: after => {
        const skill = { install_id: item.install_id, skill_id: item.skill_id, title: item.title, revision: after.settings_revision };
        saveReceipt([...adopted, skill]);
        try { decision.receipt?.record(adoptionId); }
        catch (error) { saveReceipt(adopted); throw error; }
        adopted.push(skill);
      } }, () => client.invoke(caller, setStateRef, update));
    }
    if (service && method) {
      prepared = await client.invoke(caller, setupRef, { service_id: service.service_id, method: method.kind, display_name: service.title, expected_revision: null }) as NonNullable<typeof prepared>;
    }
    if (never.length) {
      await caller.beforeEffect();
      hideAutomationSuggestions(ports.home, subject, never.map(item => ({ id: item.id, title: item.title })), () => assertCurrent(caller));
    }
  } catch (error) {
    if (!adopted.length && !prepared?.created) throw error;
    let needsSkillUndo = adopted.length > 0;
    try {
      await caller.beforeEffect();
      for (const skill of [...adopted].reverse()) {
        try {
          await client.invoke(caller, setStateRef, { scope: "project", install_id: skill.install_id, skill_id: skill.skill_id,
            state: "off", expected_revision: skill.revision });
        } catch (restoreError) {
          if (!(restoreError instanceof ActionError) || !["skills.settings_conflict", "skills.not_found"].includes(restoreError.code)) throw restoreError;
        }
      }
      await caller.beforeEffect();
      if (adopted.length) {
        saveReceipt([]);
        decision.receipt?.clear(adoptionId);
        needsSkillUndo = false;
      }
      if (prepared?.created) await client.invoke(caller, cancelSetupRef, { authorization_id: prepared.authorization_id, expected_status: "prepared" });
    } catch {
      const key = needsSkillUndo ? "workbench.automation-adoption.reconcile-skills" : "workbench.automation-adoption.reconcile-connection";
      const message = error instanceof Error ? error.message : String(error);
      throw new ActionError(error instanceof ActionError ? error.code : "actions.outcome_unknown", `${message} ${uiText.text(key)}`);
    }
    throw error;
  }
  const enabled = current.filter(({ row }) => row.state === "off").map(({ item }) => ({ id: item.id, title: item.title }));
  const alreadyOn = current.filter(({ row }) => row.state !== "off").map(({ item }) => item.title);
  const parts = [
    ...(enabled.length ? [uiText.text(input.skill_state === "auto" ? "workbench.automation-adoption.skills-auto" : "workbench.automation-adoption.skills-manual", { names: listOf(enabled.map(item => item.title)) })] : []),
    ...(alreadyOn.length ? [uiText.text("workbench.automation-adoption.already-on", { names: listOf(alreadyOn) })] : []),
    ...(service ? [uiText.text("workbench.automation-adoption.connect-next", { name: service.title })] : []),
    ...(never.length ? [uiText.text("workbench.automation-adoption.never-again", { names: listOf(never.map(item => item.title)) })] : []),
  ];
  return { ...(adopted.length ? { adoption_id: adoptionId, kit_section: "kit" as const } : {}), summary: parts.join(" "), enabled, hidden: never.map(item => ({ id: item.id, title: item.title })),
    ...(prepared ? { authorization_id: prepared.authorization_id } : {}) };
}

async function undo(ports: AutomationAdoptionPorts, input: { adoption_id: string }, caller: ActionExecutionContext): Promise<AutomationUndoResult> {
  takeAutomationCardDecision(caller, { capability_id: actions.undo.capability_id, version: actions.undo.version, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID }, input);
  const subject = await subjectOf(ports, caller);
  const adoption = readOfferRecord(ports.home, subject).adoptions.find(row => row.adoption_id === input.adoption_id);
  if (!adoption) throw new ActionError("actions.missing", "找不到这次开启");
  if (adoption.undone) return { adoption_id: adoption.adoption_id, restored: [], kept: [],
    summary: uiText.text("workbench.automation-adoption.already-undone") };
  const client = ports.clientFor(caller);
  const { skills } = await client.invoke(caller, skillsRef, {}) as { skills: SkillCatalogEntry[] };
  const restored: string[] = [], kept: { title: string; reason: string }[] = [];
  for (const skill of adoption.skills) {
    const live = skills.find(row => sameSkill(row, skill));
    // The person may have already turned it off, or a previous undo may have got this far.
    if (live?.state === "off") { kept.push({ title: skill.title, reason: uiText.text("workbench.automation-adoption.already-off") }); continue; }
    try {
      await client.invoke(caller, setStateRef, { scope: "project", install_id: skill.install_id, skill_id: skill.skill_id, state: "off", expected_revision: skill.revision });
      restored.push(skill.title);
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      if (error.code === "skills.settings_conflict") kept.push({ title: skill.title, reason: uiText.text("workbench.automation-adoption.changed-since") });
      else if (error.code === "skills.not_found") kept.push({ title: skill.title, reason: uiText.text("workbench.automation-adoption.skill-removed") });
      else throw error;
    }
  }
  await caller.beforeEffect();
  changeOfferRecord(ports.home, subject, record => ({ result: undefined,
    next: { ...record, adoptions: record.adoptions.map(row => row.adoption_id === adoption.adoption_id ? { ...row, undone: true } : row) } }), () => assertCurrent(caller));
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
