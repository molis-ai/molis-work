import { builtinMailboxDrivers } from "./builtin-drivers.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { sendLocalWebJson as json } from "./web-http.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { connectorLoginReady } from "./connector-directory.js";
import { withContextJourneys } from "./context-onboarding-store.js";
import { codeRoot } from "./context-onboarding-sources.js";
import { contextReferenceText, readContextJourney, type ContextOnboardingPorts } from "./context-onboarding-service.js";
import type { OnboardingMaterialKind } from "./onboarding-takers.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextJourney } from "./context-onboarding-store.js";
import { onboardingTextModel } from "./configured-text-port.js";
import { contextOnboardingActions as actions, contextOnboardingDoor as door, type ContextOnboardingEntry } from "./context-onboarding-actions.js";
import { responseAbortSignal } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** Reads stay HTTP; each write is the person's call of its `onboarding.context.*` action through the page's door (B9). */
export function createContextOnboardingHttp(ports: ContextOnboardingPorts, host: MolisWorkLocalHost) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL, home: string): Promise<boolean> => {
    let signal: AbortSignal | undefined;
    // Only a write needs the request's signal; reads and non-onboarding routes do not attach a close listener.
    const as = (entry: Partial<ContextOnboardingEntry> = {}) => ({ host, request: req, entry: { home, ports, ...entry }, signal: signal ??= responseAbortSignal(res) });
    const prefix = "/api/onboarding/context";
    if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
    try {
      if (req.method === "GET" && url.pathname === prefix) {
        const model = await onboardingTextModel(home, ports.model);
        const mailboxes = await Promise.all(builtinMailboxDrivers().map(async driver => ({
          service_id: driver.service,
          title: driver.title,
          account_title: driver.account_title,
          configured: await connectorLoginReady(home, driver.service),
          connections: listConnectorConnectionViews(home, driver.service).filter(row => row.auth_method === "oauth" || row.auth_method === "token"),
        })));
        const primaryMailbox = mailboxes[0] ?? null;
        json(res, 200, {
          mailboxes,
          mailbox: primaryMailbox ? { service_id: primaryMailbox.service_id, title: primaryMailbox.title, account_title: primaryMailbox.account_title, configured: primaryMailbox.configured } : null,
          connections: primaryMailbox?.connections ?? [],
          model: model.runtimeLabel ?? null,
          ai_available: Boolean(model.completeText),
          resume: withContextJourneys(home, store => store.latestIncomplete(url.searchParams.get("project"))),
          // The plugins that draft and that keep documents, by name, only when there are several to choose from (contract-design §2.5).
          draft_takers: choice(ports, "drafts"),
          document_takers: choice(ports, "documents"),
        });
        return true;
      }
      if (req.method === "POST" && url.pathname === prefix) {
        const input = await readNativePluginJsonBody(req);
        json(res, 201, await door.invoke(as(), actions.create.definition, { id: String(input.id ?? ""), ...(typeof input.project_id === "string" ? { project_id: input.project_id } : {}) })); return true;
      }
      const match = url.pathname.match(/^\/api\/onboarding\/context\/([a-z0-9-]+)(?:\/(selection|start|adopt|draft|reopen|files|secret|words)|\/text\/([0-9a-f]{64}))?$/u);
      if (!match) { json(res, 404, { error: "找不到这项整理操作" }); return true; }
      const id = match[1]!;
      // One chosen file per request, as the raw body (no size limit, user 2026-10-22); the selection names it by the digest returned.
      if (req.method === "POST" && match[2] === "files") json(res, 201, await door.invoke(as({ body: req }), actions.stageFile.definition, { journey: id, path: url.searchParams.get("path") }));
      else if (req.method === "GET" && match[3]) { const text = await contextReferenceText(home, id, match[3]); json(res, 200, { text: text.slice(0, 200_000), chars: text.length }); }
      else if (req.method === "GET" && !match[2]) {
        // The plugins that declare they take a code folder, by name, only while this round has one to hand over (batch12-design §7.3).
        const journey = readContextJourney(home, id, url.searchParams.get("project") ?? undefined);
        // A round for an existing project shows that project's name; the page cannot read the catalog itself.
        const project = journey.existing ? await ports.withCatalog({ homeDirectory: home }, catalog => catalog.getProject(journey.project_id).display_name).catch(() => null) : null;
        json(res, 200, { ...journey, ...(journey.existing ? { project_title: project } : {}), takers: codeRoot(journey) ? named(ports, "code_root") : [] });
      }
      // The drafting plugin's words for the drafts this round shows (surface-composition §14.6): asked once the drafts are there, not on each poll.
      else if (req.method === "GET" && match[2] === "words") json(res, 200, { surface_text: draftWords(home, readContextJourney(home, id, url.searchParams.get("project") ?? undefined), host) });
      else if (req.method === "POST" && match[2] === "reopen") json(res, 200, await door.invoke(as(), actions.reopen.definition, { journey: id }));
      else if (req.method === "POST" && match[2] === "selection") json(res, 200, await door.invoke(as(), actions.select.definition, { journey: id, body: await readNativePluginJsonBody(req, 72_000_000) }));
      else if (req.method === "POST" && match[2] === "start") json(res, 202, await door.invoke(as(), actions.start.definition, { journey: id }));
      else if (req.method === "POST" && match[2] === "draft") json(res, 200, await door.invoke(as(), actions.draft.definition, { journey: id, body: await readNativePluginJsonBody(req) }));
      else if (req.method === "POST" && match[2] === "adopt") json(res, 200, await door.invoke(as(), actions.adopt.definition, { journey: id, body: await readNativePluginJsonBody(req) }));
      else if (req.method === "POST" && match[2] === "secret") json(res, 200, await door.invoke(as(), actions.secret.definition, { journey: id, body: await readNativePluginJsonBody(req) }));
      else json(res, 405, { error: "不支持这项整理操作" });
    } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "整理请求失败，请重试" }); }
    return true;
  };
}

const named = (ports: ContextOnboardingPorts, kind: OnboardingMaterialKind) => (ports.takers?.(kind) ?? []).map(({ plugin_id, name }) => ({ plugin_id, name }));
const choice = (ports: ContextOnboardingPorts, kind: OnboardingMaterialKind) => { const takers = named(ports, kind); return takers.length > 1 ? takers : []; };

/** One grant for the keys the drafts name, from the running Home instance of the plugin that drafted them; none when it is not running. */
function draftWords(home: string, journey: ContextJourney, host: MolisWorkLocalHost): { ref: string; owner: string; positions: string[] }[] {
  const owner = journey.drafts?.plugin_id, keys = new Set<string>();
  for (const batch of journey.drafts?.batches ?? []) for (const candidate of batch.snapshot?.candidates ?? []) {
    for (const ref of [candidate.label.text, ...candidate.meta]) if ("key" in ref && typeof ref.key === "string") keys.add(ref.key);
  }
  const record = owner ? host.homePlugins?.installation(owner) : undefined;
  if (!owner || !record || record.plugin_id !== owner || record.state !== "running" || !keys.size) return [];
  const ref = pluginPagesFor(home).grantText(null, { plugin_id: owner, project_id: null, actor_id: LOCAL_PERSON_ACTOR_ID, install_id: record.install_id,
    installation_generation: record.installation_generation }, keys, () => {
    const now = host.homePlugins?.installation(record.install_id);
    if (now?.state !== "running" || now.plugin_id !== owner || now.installation_generation !== record.installation_generation) throw new ActionError("actions.forbidden", "草稿文字的来源已变化");
  });
  return ref ? [{ ref, owner, positions: ["onboarding:drafts"] }] : [];
}
