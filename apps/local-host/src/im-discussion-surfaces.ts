import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { actionErrorResponse, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { ContinuityService, Identity, ImRequest, ImSession, createImDomain } from "@molis-ai/molis-work-server";
import type { MolisWorkLocalHost } from "./project-host.js";
import { discussionSurfaceRequest } from "./surface-project-read.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { confirmPositionOffer, positionOfferScope } from "./surface-position-http.js";
import { positionOfferIntent, takePositionOffer, withPositionOfferWindow } from "./surface-position-offers.js";
import { needsPositionWindow } from "./surface-placement.js";
import { positionCorrection, positionRecovery } from "./surface-position-correction.js";

export type DiscussionProjectLookup = (id: string) => Promise<{ id: string; title: string; reference?: LocalHostProjectReference } | null>;
type Parts = { message_id: string; part: "message" | "quote" | "share"; expanded?: true };
type Intent = { views: Parts[]; click?: { owner_plugin_id: string; target: Record<string, unknown> };
  offer?: NonNullable<ReturnType<typeof positionOfferIntent>>; correction?: NonNullable<ReturnType<typeof positionCorrection>>; recovery?: ReturnType<typeof positionRecovery> };
type Domain = ReturnType<typeof createImDomain>;
const denied = () => new ActionError("actions.forbidden", "项目对象只向本机工作台里的讨论主人开放");
const invalid = () => new ActionError("actions.input_invalid", "讨论对象请求无效");
const ID = /^[A-Za-z0-9_-]{1,128}$/u;

function inputOf(body: Record<string, unknown>): Intent {
  const { views, click } = body, offer = positionOfferIntent(body.offer), correction = positionCorrection(body.correct), recovery = positionRecovery(body.recovery);
  if (Object.keys(body).some(key => !["views", "click", "offer", "correct", "recovery"].includes(key)) || !Array.isArray(views) || !views.length || views.length > 6
    || (offer || correction || recovery) && views.length !== 1 || [click, offer ?? undefined, correction ?? undefined, recovery].filter(value => value !== undefined).length > 1) throw invalid();
  const selected = views.map((view): Parts => {
    if (!isRecord(view) || typeof view.message_id !== "string" || !ID.test(view.message_id)
      || view.part !== "message" && view.part !== "quote" && view.part !== "share"
      || view.expanded !== undefined && view.expanded !== true
      || Object.keys(view).some(key => key !== "message_id" && key !== "part" && key !== "expanded")) throw invalid();
    return { message_id: view.message_id, part: view.part, ...(view.expanded ? { expanded: true } : {}) };
  });
  if (new Set(selected.map(view => `${view.message_id}/${view.part}`)).size !== selected.length) throw invalid();
  if (click === undefined) return { views: selected, ...(offer ? { offer } : {}), ...(correction ? { correction } : {}), ...(recovery ? { recovery } : {}) };
  if (views.length !== 1 || !isRecord(click) || Object.keys(click).length !== 2
    || typeof click.owner_plugin_id !== "string" || !isRecord(click.target)) throw invalid();
  return { views: selected, click: { owner_plugin_id: click.owner_plugin_id, target: click.target } };
}

export function discussionSurfaces(host: MolisWorkLocalHost, projectFor: DiscussionProjectLookup, identity: Identity, continuity: ContinuityService, im: Domain,
  authenticated: () => boolean, input: ImRequest) {
  const { request, response, url } = input;
  const workbenchCurrent = captureWebSessionAuthority();
  const webCurrent = () => {
    if (pluginPageRequest(request) || !authenticated()) throw denied();
    workbenchCurrent();
  };
  const ownerCurrent = (projectId: string, session: ImSession) => {
    webCurrent();
    const original = identity.session(request);
    if (original?.id !== session.id || original.member_id !== session.member_id || !session.member_id
      || continuity.projectOwner(projectId)?.id !== session.member_id) throw denied();
    if (identity.roleOf(projectId, session.member_id) !== "owner") throw denied();
    return session.member_id;
  };
  const referenceFor = async (projectId: string, current: () => void) => {
    current();
    const project = await projectFor(projectId);
    current();
    if (project?.reference?.project_id !== projectId) throw denied();
    return project.reference;
  };
  const waited = async <Result>(use: (signal: AbortSignal) => Promise<Result>) => {
    const controller = new AbortController();
    const stop = () => { if (!response.writableEnded) controller.abort(new ActionError("actions.cancelled", "讨论请求已结束")); };
    response.once("close", stop);
    try { stopIfGone(); return await use(controller.signal); }
    finally { response.off("close", stop); }
    function stopIfGone() { if (request.aborted || response.destroyed) stop(); controller.signal.throwIfAborted(); }
  };
  const match = /^\/im\/api\/rooms\/([A-Za-z0-9_-]{1,128})\/surfaces$/u.exec(url.pathname);
  if (!match) {
    const authorizeSubjects: ImRequest["authorizeSubjects"] = (projectId, session, subjects, assertRoom) => waited(async signal => {
      const current = () => {
        signal.throwIfAborted();
        if (request.aborted || response.destroyed) throw new ActionError("actions.cancelled", "讨论请求已结束");
        ownerCurrent(projectId, session); assertRoom();
      };
      const reference = await referenceFor(projectId, current);
      const groups = [{ subjects, expanded: true as const }];
      const proved = await host.surfacePosition(reference, discussionSurfaceRequest(groups), "", signal, current,
        position => position.assertReadable(subjects), groups);
      if (!proved) throw denied();
      proved();
      return proved;
    });
    return im.handleImRequest({ ...input, ...(authenticated() && !pluginPageRequest(request) ? { authorizeSubjects } : {}) });
  }
  return waited(async signal => {
    try {
      webCurrent();
      if (request.method !== "POST" || !input.session?.member_id) throw denied();
      const { session } = input, room = match[1]!, member = identity.requireMember(session);
      const project = im.discussionProject(room, member.id);
      ownerCurrent(project, session);
      const body = await readLocalWebBody(request, 24_000);
      const roomCurrent = () => {
        ownerCurrent(project, session);
        if (im.discussionProject(room, member.id) !== project) throw denied();
      };
      if (Object.keys(body).length === 1 && typeof body.query === "string") {
        const query = body.query.trim();
        if (!query || query.length > 200) throw invalid();
        const reference = await referenceFor(project, roomCurrent);
        const items = await host.surfaceSearch(reference, query, signal, roomCurrent);
        roomCurrent();
        if (!items) throw denied();
        sendLocalWebJson(response, 200, { items });
        return true;
      }
      const intent = inputOf(body);
      const [source] = intent.views, scope = positionOfferScope(project, "discussion", room, source!.message_id, source!.part, session.id, member.id);
      if (intent.offer) {
        roomCurrent();
        const claimed = takePositionOffer(scope, intent.offer);
        if (!claimed) { sendLocalWebJson(response, 200, { closed: true }); return true; }
        try {
          const reference = await referenceFor(project, roomCurrent);
          if (!await confirmPositionOffer(host, reference, signal, roomCurrent, claimed, response)) throw denied();
          return true;
        } finally { claimed.window.close(); }
      }
      const reference = await referenceFor(project, roomCurrent);
      const retained = im.discussionReferences(project, room, session, intent.views);
      const current = () => { roomCurrent(); retained.assertCurrent(); };
      const groups = intent.views.map((view, index) => ({ subjects: retained.subjects[index]!, expanded: view.expanded }));
      const sent = await withPositionOfferWindow(scope, needsPositionWindow(intent.click?.target.kind), window =>
        host.surfacePosition(reference, discussionSurfaceRequest(groups), "/projects/" + encodeURIComponent(project), signal, current, async position => {
          const value = intent.correction ? await position.correct(intent.correction) : intent.click ? await position.open(intent.click.owner_plugin_id, intent.click.target, 0,
            window && { window, source: () => ({ current: retained.assertCurrent }) }) : await position.display(intent.recovery);
          position.current();
          sendLocalWebJson(response, 200, value);
          return true;
        }, groups, window));
      if (!sent) throw denied();
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      if (!response.destroyed) { const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body); }
    }
    return true;
  });
}
