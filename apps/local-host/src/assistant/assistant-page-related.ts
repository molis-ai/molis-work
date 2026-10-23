import type { IncomingMessage } from "node:http";
import { pluginPageRequest } from "../plugin-page-authority.js";
import type { AssistantService } from "./assistant-service.js";

/** An isolated object's page receives related states and result links, never the work's conversation or materials. */
export async function pageRelatedWorks(service: AssistantService, request: IncomingMessage, projectId: string | null, object: {kind: string; id: string}) {
  const page = pluginPageRequest(request);
  page?.ownedObject(object);
  const related = await service.related(projectId, object);
  const works = await Promise.all(related.map(async work => {
    try {
      const view = await service.read(work.work_id);
      const results = view.objects.filter(item => item.relation === "result" && !(item.subject.kind === object.kind && item.subject.id === object.id));
      return {...work, results};
    } catch { return {...work, results: []}; }
  }));
  page?.assertCurrent();
  return {works};
}
