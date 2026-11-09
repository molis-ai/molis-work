import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { PRESENTATION_LIMITS } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { AssistantStore } from "./assistant-store.js";
import { identity } from "./assistant-relations.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { surfaceClick, withSurfaceResponse } from "../surface-position-http.js";
import { readLocalWebBody, sendLocalWebJson } from "../web-http.js";

const key = (object: ActionSubject) => JSON.stringify([object.kind, object.id]);

/** A work's original edges and object materials select the objects. No model or message text participates. */
export function handleAssistantSurfaceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined, openStore: () => AssistantStore) {
  const match = /^\/api\/assistant\/works\/([A-Za-z0-9_-]{1,200})\/surfaces$/u.exec(url.pathname);
  if (!match) return undefined;
  return withSurfaceResponse(request, response, async signal => {
    const workId = match[1]!, body = await readLocalWebBody(request, 16_000);
    if (Object.keys(body).some(key => key !== "expanded" && key !== "click") || body.expanded !== undefined && body.expanded !== true)
      throw new ActionError("actions.input_invalid", "对话对象请求无效");
    if (!reference) throw new ActionError("actions.scope_mismatch", "在工作所属项目打开它的对象");
    const store = openStore(), click = surfaceClick(body.click);
    const workHere = () => {
      const work = store.get(LOCAL_PERSON_ACTOR_ID, workId);
      if (work.scope.kind !== "project" || work.scope.project_id !== reference.project_id)
        throw new ActionError("actions.scope_mismatch", "在工作所属项目打开它的对象");
      return work;
    };
    const position = () => {
      const relations = store.relations.forWork(identity(workHere()));
      const result = new Set(relations.filter(row => row.relation === "result").map(row => key(row.object)));
      const unique = new Map<string, ActionSubject>();
      const include = ({ kind, id }: ActionSubject) => unique.set(key({ kind, id }), { kind, id });
      for (const { object } of relations.slice(-40)) include(object);
      for (const round of store.rounds(workId, 40))
        for (const material of round.materials) if (material.object) include(material.object);
      const subjects = [...unique.values()].slice(-PRESENTATION_LIMITS.values_subjects);
      return { slot: { kind: "conversation" }, subjects, delivery_subjects: subjects.filter(subject => result.has(key(subject))),
        ...(body.expanded ? { expanded: true } : {}) } satisfies SurfaceRequest;
    };
    const source = position(), stamp = JSON.stringify(source);
    const current = () => { workHere(); };
    return host.surfacePosition(reference, source, "/projects/" + encodeURIComponent(reference.project_id), signal, current, async access => {
      const value = click ? await access.open(click.owner, click.target) : { ...await access.display(), declared_kinds: access.declaredKinds() };
      access.current();
      if (JSON.stringify(position()) !== stamp) throw new ActionError("actions.provider_changed", "对话引用已变化，请重新读取");
      sendLocalWebJson(response, 200, value);
      return true;
    });
  });
}
