import type { IncomingMessage, ServerResponse } from 'node:http';
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { escapeHtml, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { INSTALLED_PLUGIN_BUNDLE, INSTALLED_PLUGIN_PAGE_CLASS, renderPluginDocumentShell, type PluginDirectoryEntry, type UnavailablePluginStage } from "@molis-ai/molis-work-app-workbench";
import { describePluginTablesRefusal, rollbackHrefFor } from "./home-unavailable-owners.js";
import { installedPageSelection, pluginPageRequest } from "./plugin-page-authority.js";
import { installedPluginBody, installedStageSurface } from './installed-stage-section.js';
import { installedStageSection } from './workbench-renderer.js';
import { assertStageInstallation, installedStageIdentity, installedStageReleaseMatches, requestedStageInstallation } from './installed-stage-identity.js';
import { captureWebSessionAuthority, shellPageRead } from './web-sessions.js';
import { readLocalWebBody, refuseLocalWebRequest, requestHost, sendLocalWebJson } from './web-http.js';
import { htmlLang } from "./web-locale.js";
import { ensureInstalledPlugins, type InstalledPluginHostOptions } from './installed-plugin-host.js';
import { installedPluginWords, installedPluginPage } from "./installed-plugin-page.js";
import { captureRuntimeStageOwner } from './project-plugin-stages.js';

/**
 * A project's installed signed packages as pages and calls (47-1: the platform's, not the studio's). Each page frames the package's
 * installed renderer over its sandboxed backend, and every call goes to that package's own process through the project's platform.
 */
export interface InstalledPluginHttpOptions extends Omit<InstalledPluginHostOptions, 'homeDirectory'> {
  /** Without a Home there is nothing installed: the stages are none and a page or call is refused. */
  homeDirectory?: string;
  accountRegistration?: boolean;
}

/** An installed plugin's stage in the workbench, the name it was published under, and what its Manifest declares (the page's plugin directory). */
export interface InstalledPluginStage {
  pluginId: string; surface: string; label: string; directory: PluginDirectoryEntry;
  stage?: string; unavailable?: UnavailablePluginStage;
}

/**
 * The project's installed packages as workbench stages beside the built-in ones. Each stage frames the plugin's installed page (host
 * renderer, sandboxed backend) and loads only when opened. A disabled or quarantined plugin's failed database upgrade keeps the Host's
 * upgrade card with its own directory entry.
 */
export async function installedPluginStages(options: InstalledPluginHttpOptions): Promise<InstalledPluginStage[]> {
  if (!options.homeDirectory) return [];
  const home = options.homeDirectory;
  const installed = await ensureInstalledPlugins({ ...options, homeDirectory: home }), prefix = options.routePrefix ?? '';
  return installed.records().flatMap((item): InstalledPluginStage[] => {
    const release = installed.releaseFor(item.plugin_id);
    if (!release) return [];
    const surface = installedStageSurface(release), words = installedPluginWords(release), label = words.name;
    const directory: PluginDirectoryEntry = { id: surface, plugin_id: item.plugin_id, chosen: false, ...words };
    if ((item.state === 'disabled' || item.state === 'crashed') && item.last_error_code && release.packaged?.manifest.databases?.project &&
        release.packaged.manifest.ui.views?.some(view => view.slot === 'stage')) {
      const failure = installed.recoveryErrors.get(item.plugin_id);
      const code = item.last_error_code;
      const upgrade = describePluginTablesRefusal(home, item.plugin_id, options.store.path, { code });
      if (upgrade) return [{ pluginId: item.plugin_id, surface, label, directory, unavailable: {
        surface, label, scope: 'project', reason: failure ?? '', plugin_id: item.plugin_id, code,
        upgrade: { title: label, reason: upgrade.reason, diagnostic_id: upgrade.diagnostic_id, rollback_href: rollbackHrefFor(home, upgrade.reason),
          reload_href: upgrade.reason === 'upgrade_activation_failed' ? `${prefix}/settings/plugins` : null },
      } }];
    }
    if (item.state !== 'running' || installed.recoveryErrors.has(item.plugin_id)
        || !installedStageReleaseMatches(item, release, installed.platform.supervisor.manifest(item.plugin_id))) return [];
    return [{ pluginId: item.plugin_id, surface, label, directory, stage: installedStageSection({ pluginId: item.plugin_id, surface, label, prefix, installation: installedStageIdentity("project", item) }) }];
  });
}

/**
 * The page a signed package installed in the Home draws its stage with, framed by the workbench (`?frame=workbench`): the same
 * renderer a project's installed plugin uses, with every call going to the package's own sandboxed process through the Home's
 * route. The page keeps the Home activation; a verified project entrance additionally binds its triggering project (S-15, S-107).
 */
export function renderHomePackageDocument(input: Omit<Parameters<typeof installedPluginPage>[0], 'prefix' | 'scope'> & {
  controlToken: string; accountRegistration?: boolean; projection?: boolean;
}) {
  const { release, projectId } = input, pluginId = release.pluginId;
  const prefix = projectId ? '/projects/' + encodeURIComponent(projectId) : '';
  const document = installedPluginPage({ ...input, scope: 'home', prefix });
  return input.projection ? document : renderPluginDocumentShell({ id: pluginId, plugin_id: pluginId, bundle: INSTALLED_PLUGIN_BUNDLE, lang: htmlLang(),
    title: installedPluginWords(release).name, accountRegistration: input.accountRegistration, html: installedPluginBody(pluginId), project_id: projectId ?? '',
    route_prefix: prefix, control_token: input.controlToken, ...document });
}

function recoveryHtml(error: string): string {
  return '<main class="' + INSTALLED_PLUGIN_PAGE_CLASS + '"><h1>' + escapeHtml(uiText.text("workbench.installed-plugin.recovery-title")) + '</h1><p role="alert" translate="no">'
    + escapeHtml(error) + '</p><p>' + escapeHtml(uiText.text("workbench.installed-plugin.recovery-hint")) + '</p></main>';
}

/** `/plugins/<id>` (the installed page) and `/api/plugins/<id>/call` for a package installed in this project; anything else is not ours. */
export async function handleInstalledPluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, options: InstalledPluginHttpOptions, controlToken: string): Promise<boolean> {
  const installedPage = /^\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]{0,185})$/u.exec(url.pathname);
  const installedCall = /^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]{0,185})\/call$/u.exec(url.pathname);
  if (!installedPage && !installedCall) return false;
  const method = request.method ?? 'GET', prefix = options.routePrefix ?? '';
  // The page is a frame document: opened directly, it opens the workbench at its surface instead (specs/artifact-positioning S3).
  const framed = url.searchParams.get('frame') === 'workbench';
  const projection = installedPage && framed && request.headers.accept === 'application/json';
  if (projection && (method !== 'GET' || !shellPageRead(request, 'http://' + requestHost(request)))) { refuseLocalWebRequest(response); return true; }
  const pageAuthority = pluginPageRequest(request), disconnected = new AbortController();
  const disconnect = () => { if (!response.writableEnded) disconnected.abort(new Error('调用连接已关闭')); };
  request.once('aborted', disconnect); response.once('close', disconnect);
  const signal = pageAuthority ? AbortSignal.any([pageAuthority.signal, disconnected.signal]) : disconnected.signal;
  const currentSession = captureWebSessionAuthority();
  const assertCurrent = () => { currentSession(); signal.throwIfAborted(); pageAuthority?.assertCurrent(); };
  // A native workbench request has already passed the shared local control guard; its live request owns this execution.
  const execution: PluginExecutionControl = { signal, beforeEffect: async () => { assertCurrent(); await pageAuthority?.beforeEffect(); assertCurrent(); },
    assert_authority_current: assertCurrent };
  const refuse = (status: number, key: string) => { sendLocalWebJson(response, status, { error: uiText.text(key) }); return true; };
  try {
    if (!options.homeDirectory) throw new Error('安装插件需要本机数据目录');
    const expected = installedPage && method === 'GET' ? requestedStageInstallation(url) : undefined;
    if (expected?.scope === "home") throw new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开");
    const installed = await ensureInstalledPlugins({ ...options, homeDirectory: options.homeDirectory });
    assertCurrent();
    const pluginId = (installedPage ?? installedCall)![1]!;
    const current = () => installed.records().find(item => item.plugin_id === pluginId);
    const record = current();
    if (expected) assertStageInstallation("project", record, expected);
    if (!record) return false;
    if (installedCall && method === 'POST') {
      const result = await installed.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: options.actorId ?? 'web-user', query: {}, execution, body: await readLocalWebBody(request) });
      if (!result) return refuse(409, "workbench.installed-plugin.not-running");
      sendLocalWebJson(response, result.status, result.body); return true;
    }
    if (!installedPage || method !== 'GET') return false;
    const release = installed.releaseFor(pluginId);
    const manifest = installed.platform.supervisor.manifest(pluginId);
    if (!installedStageReleaseMatches(record, release, manifest)) {
      if (expected) throw new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开");
      return refuse(404, "workbench.installed-plugin.not-found");
    }
    if (!framed) { response.writeHead(302, { location: prefix + '/?openSurface=' + encodeURIComponent(installedStageSurface(release)), 'cache-control': 'no-store' }); response.end(); return true; }
    const recoveryError = installed.recoveryErrors.get(pluginId);
    if (recoveryError) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(recoveryHtml(recoveryError)); return true;
    }
    // The page belongs to the exact installation its stage drew, with that stage's declared object slots.
    assertStageInstallation("project", current(), expected ?? installedStageIdentity("project", record));
    const owner = manifest && captureRuntimeStageOwner(installed.platform, "project", { project_plugin_id: installedStageSurface(release), manifest });
    if (!owner) throw new ActionError("actions.provider_changed", "原舞台实例已变化，请重新打开");
    assertCurrent();
    const document = installedPluginPage({ home: options.homeDirectory, actorId: options.actorId ?? 'web-user', projectId: options.projectId,
      prefix, release, scope: 'project', running: current, selection: installedPageSelection(record, options.projectId, current, owner) });
    if (projection) { sendLocalWebJson(response, 200, document); return true; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(renderPluginDocumentShell({ id: pluginId, plugin_id: pluginId, bundle: INSTALLED_PLUGIN_BUNDLE, lang: htmlLang(),
      title: installedPluginWords(release).name, html: installedPluginBody(pluginId), project_id: options.projectId, route_prefix: prefix, control_token: controlToken,
      accountRegistration: options.accountRegistration, ...document }));
    return true;
  } catch (error) {
    // The page answers a refused stage in the action shape its frame reads; a call keeps the plain refusal it always had.
    if (installedPage && error instanceof ActionError) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); return true; }
    const code = (error as { code?: string }).code;
    sendLocalWebJson(response, code === 'revision_conflict' ? 409 : 400, { error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) });
    return true;
  } finally { request.removeListener('aborted', disconnect); response.removeListener('close', disconnect); }
}
