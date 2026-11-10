import { bindActionHandler, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction } from "@molis-ai/molis-work-contracts/platform/kit-report";
import { SKILLS_PROVIDER_ID, SKILLS_READ_PERMISSION, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { SkillCatalog, type SkillCatalogPorts } from "./skill-catalog.js";

/** The catalog's Skills as AI kit entries (specs/capability-pack/contract-design.md §4.8): only this provider reports Skills. */
export const skillsKitReport = defineKitReportAction("skills.kit.report", /* @version action.skills.kit.report */ 1, "技能的能力包条目", [SKILLS_READ_PERMISSION]);

export function skillCatalogProvider(ports: SkillCatalogPorts): ActionProviderRegistration {
  const catalog = new SkillCatalog(ports);
  return { provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" }, definitions: [...Object.values(skillCatalogActions), skillsKitReport], handlers: [
    bindActionHandler(skillsKitReport, (_input, caller) => catalog.kitReport(caller)),
    bindActionHandler(skillCatalogActions.list, (input, caller) => catalog.list(caller, input)),
    bindActionHandler(skillCatalogActions.readBodies, (input, caller) => catalog.readBodies(caller, input.refs)),
    bindActionHandler(skillCatalogActions.readResource, (input, caller) => catalog.readResource(caller, input.ref, input.path)),
    bindActionHandler(skillCatalogActions.setState, (input, caller) => catalog.setState(caller, input)),
  ] };
}
