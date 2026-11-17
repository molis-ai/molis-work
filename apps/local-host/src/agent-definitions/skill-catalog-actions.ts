import { bindActionHandler, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction } from "@molis-ai/molis-work-contracts/platform/kit-report";
import { SKILLS_PROVIDER_ID, SKILLS_READ_PERMISSION, skillAuthoringActions, skillCatalogActions, skillDraftActions } from "@molis-ai/molis-work-contracts/services/skills";
import { SkillCatalog, type SkillCatalogPorts } from "./skill-catalog.js";
import type { SkillWorkshop } from "./skill-workshop.js";

/** The catalog's Skills as AI kit entries (specs/capability-pack/contract-design.md §4.8): only this provider reports Skills. */
const skillsKitReport = defineKitReportAction("skills.kit.report", /* @version action.skills.kit.report */ 1, "技能的能力包条目", [SKILLS_READ_PERMISSION]);

/** Drafts, known answers, replays, versions and copies (batch 42); adopting a draft is the install provider's, as saving was. */
const { adopt: _adopt, ...workshopActions } = skillDraftActions;

export function skillCatalogProvider(ports: SkillCatalogPorts, workshop?: SkillWorkshop): ActionProviderRegistration {
  const catalog = new SkillCatalog(workshop ? { ...ports, decorate: (caller, skills, entries) => workshop.decorate(caller, skills, entries) } : ports);
  return { provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" },
    definitions: [...Object.values(skillCatalogActions), skillAuthoringActions.read, skillsKitReport, ...workshop ? Object.values(workshopActions) : []], handlers: [
    // The person's own read for the settings form (batch 41); adopting and removing are the install provider's.
    bindActionHandler(skillAuthoringActions.read, (input, caller) => catalog.readSource(caller, input.ref)),
    bindActionHandler(skillsKitReport, (_input, caller) => catalog.kitReport(caller)),
    bindActionHandler(skillCatalogActions.list, (input, caller) => catalog.list(caller, input)),
    bindActionHandler(skillCatalogActions.readBodies, (input, caller) => catalog.readBodies(caller, input.refs)),
    bindActionHandler(skillCatalogActions.readResource, (input, caller) => catalog.readResource(caller, input.ref, input.path)),
    bindActionHandler(skillCatalogActions.setState, (input, caller) => catalog.setState(caller, input)),
    ...workshop ? workshopHandlers(workshop) : [],
  ] };
}

function workshopHandlers(workshop: SkillWorkshop): ActionHandlerBinding[] {
  return [
    bindActionHandler(skillDraftActions.list, (_input, caller) => workshop.list(caller)),
    bindActionHandler(skillDraftActions.read, (input, caller) => workshop.read(caller, input.draft_id)),
    bindActionHandler(skillDraftActions.create, (input, caller) => workshop.create(caller, input)),
    bindActionHandler(skillDraftActions.update, (input, caller) => workshop.update(caller, input)),
    { ...bindActionHandler(skillDraftActions.revise, (input, caller) => workshop.revise(caller, input)), availability: () => workshop.modelAvailability("改技能草稿") },
    bindActionHandler(skillDraftActions.discard, (input, caller) => workshop.discard(caller, input.draft_id, input.restore === true)),
    bindActionHandler(skillDraftActions.putCase, (input, caller) => workshop.putCase(caller, input)),
    bindActionHandler(skillDraftActions.removeCase, (input, caller) => workshop.removeCase(caller, input.draft_id, input.case_id)),
    { ...bindActionHandler(skillDraftActions.runTrial, (input, caller) => workshop.runTrial(caller, input)), availability: () => workshop.modelAvailability("回放技能") },
    bindActionHandler(skillDraftActions.versions, (input, caller) => workshop.versions(caller, input.scope, input.skill_id)),
    bindActionHandler(skillDraftActions.dismissSource, (input, caller) => workshop.dismissSource(caller, input.scope, input.skill_id, input.source_version)),
  ];
}
