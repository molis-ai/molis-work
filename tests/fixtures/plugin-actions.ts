import { ActionService } from "@molis-ai/molis-work-kernel";

/** Standalone owner fixtures explicitly share one Kernel, just as the application Host does. */
const services = new WeakMap<object, Map<string, ActionService>>();
export function pluginActions(owner: object, project_id: string) {
  let projects = services.get(owner);
  if (!projects) { projects = new Map(); services.set(owner, projects); }
  let service = projects.get(project_id);
  if (!service) { service = new ActionService(); projects.set(project_id, service); }
  return { registry: service, client: service, project_id };
}
