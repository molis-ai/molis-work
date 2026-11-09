import { bindActionHandler, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PROVIDER_ID, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { SkillCatalog, type SkillCatalogPorts } from "./skill-catalog.js";

export function skillCatalogProvider(ports: SkillCatalogPorts): ActionProviderRegistration {
  const catalog = new SkillCatalog(ports);
  return { provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" }, definitions: Object.values(skillCatalogActions), handlers: [
    bindActionHandler(skillCatalogActions.list, (input, caller) => catalog.list(caller, input)),
    bindActionHandler(skillCatalogActions.readBodies, (input, caller) => catalog.readBodies(caller, input.refs)),
    bindActionHandler(skillCatalogActions.readResource, (input, caller) => catalog.readResource(caller, input.ref, input.path)),
    bindActionHandler(skillCatalogActions.setState, (input, caller) => catalog.setState(caller, input)),
  ] };
}
