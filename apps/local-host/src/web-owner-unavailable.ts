import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { hostSettingsSectionLabel, renderOwnerUnavailablePage, type OwnerUnavailableCard } from "@molis-ai/molis-work-app-workbench";
import { isHomePluginStoreRefusal } from "./home-plugin-store.js";
import { describeUnavailable, diagnosticId, upgradeRefusal, type UnavailableOwner } from "./home-unavailable-owners.js";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import type { WebRequestContext } from "./web-route-table.js";
import { htmlLang, readText } from "./web-locale.js";
import { matchPageRoute } from "./page-routes.js";
import { sendLocalWebJson } from "./web-http.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readOnlyAlwaysOnProjectPlugins } from "./always-on-plugins.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** GET display projection only. Availability, commands and content routes must use the strict Catalog methods. */
export function projectPluginMembershipForPage(catalog: MolisWorkProjectCatalog, projectId: string) {
  try { return catalog.projectPluginMembershipWithRevision(projectId, () => readOnlyAlwaysOnProjectPlugins(catalog.homeDirectory)); }
  catch (error) {
    if (!isHomePluginStoreRefusal(error)) throw error;
    return { ...catalog.storedProjectPluginMembership(projectId), unavailable: uiText.text("workbench.home-plugin-recovery.home-plugin-store-unavailable") };
  }
}

const PAGE = /^\/(?:settings|capabilities|planning|assistant|side)(?:\/|$)/u;

const BLOCK_TEXT = { projects: "workbench.owner-unavailable.block.projects", shelf: "workbench.owner-unavailable.block.shelf", home: "workbench.owner-unavailable.block.home" } as const;

/** The part's name for the card's title (U3 design §2.4), in the person's words. */
function partTitle(owner: UnavailableOwner, project: { display_name: string } | null): string {
  const { block } = owner;
  if (block.kind === "plugin") return PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === block.plugin_id)?.manifest.name ?? block.plugin_id;
  if (block.kind === "project") return project?.display_name ?? uiText.text("workbench.owner-unavailable.block.project");
  if (block.kind === "setting") return hostSettingsSectionLabel(block.page) ?? block.page;
  return uiText.text(BLOCK_TEXT[block.kind]);
}

/**
 * The card for a store an open refused, when it is one of this Home's (U3 design §2.2); otherwise nothing, and the caller lets the error go
 * on as it is. `rollback_href` is filled by the rollback point once there is one to go back to (item 3).
 */
export function ownerUnavailableCard(owner: UnavailableOwner, project: { display_name: string } | null, reloadHref: string, rollbackHref: string | null): OwnerUnavailableCard {
  return { title: partTitle(owner, project), reason: owner.reason, diagnostic_id: owner.diagnostic_id, rollback_href: rollbackHref, reload_href: reloadHref };
}

/**
 * Every store of this Home that an open refused gets the same card in place of the page (U3 design §2.4); the Home plugin ledger's page
 * also keeps the saved plugins it can still list. A read API answers a ledger refusal without substitute data; a write is never caught here.
 * An error from anything that is not one of this Home's stores is not swallowed, whatever its code (RAC-403).
 */
export async function withOwnerUnavailablePage(context: WebRequestContext, projectId: string | null, render: () => Promise<unknown>) {
  try { await render(); }
  catch (error) {
    const { request, response, url, serverOptions, composition } = context, home = serverOptions.homeDirectory;
    if (!(error instanceof ActionError) || request.method !== "GET" || !home || response.headersSent) throw error;
    const refused: ActionError = error, ledger: boolean = isHomePluginStoreRefusal(refused), owner = refusedOwner(home, refused);
    if (!ledger && !owner) throw error;
    if (url.pathname.startsWith("/api/")) {
      // A read answers "unavailable" with the part and the number to quote, never substitute data; the store's own message stays as it is.
      const failure = actionErrorResponse(ledger
        ? new ActionError(error.code, uiText.text("workbench.home-plugin-recovery.home-plugin-store-unavailable"), { kind: "unavailable", cause: error })
        : new ActionError(refused.code, refused.message, { kind: "unavailable", cause: refused,
          details: { ...(refused.details ?? {}), block: owner?.block.kind, diagnostic_id: owner?.diagnostic_id, reason: owner?.reason } }));
      sendLocalWebJson(response, failure.status, failure.body);
      return;
    }
    if (matchPageRoute(url) === null && !PAGE.test(url.pathname)) throw error;
    const selectedId = projectId ?? url.searchParams.get("project");
    const prefix = projectId ? `/projects/${encodeURIComponent(projectId)}` : "", reloadHref = prefix + url.pathname + url.search;
    // The project's name and saved plugins come from the catalog; when the catalog is the store refused, there is nothing to read them from.
    const projection = selectedId && owner?.block.kind !== "projects" ? await composition.withCatalog({ homeDirectory: home }, catalog => ({
      project: catalog.getProject(selectedId), membership: ledger ? catalog.storedProjectPluginMembership(selectedId) : undefined,
    })) : { project: null, membership: ledger ? { plugins: [], hidden: [] } : undefined };
    const card: OwnerUnavailableCard = owner && !ledger ? ownerUnavailableCard(owner, projection.project, reloadHref, null)
      : { title: uiText.text("workbench.owner-unavailable.block.home-plugin-ledger"), reason: owner?.reason ?? "unreadable",
        diagnostic_id: owner?.diagnostic_id ?? diagnosticId("none", "home-plugin-runtime"), rollback_href: null, reload_href: reloadHref };
    sendOwnerUnavailablePage(context, card, projection.project, projection.membership);
  }
}

/** The owner of a store of this Home that an open refused for its version or upgrade; nothing for any other error (RAC-403). */
export function refusedOwner(home: string | undefined, error: unknown): UnavailableOwner | undefined {
  const refusal = home ? upgradeRefusal(error) : undefined;
  return home && refusal ? describeUnavailable(home, refusal) : undefined;
}

/** The card page, in place of whatever the request would have drawn: 200, because the page itself is what the person asked for. */
export function sendOwnerUnavailablePage({ request, response, url, composition }: WebRequestContext, card: OwnerUnavailableCard,
  project: { project_id: string; display_name: string } | null, membership?: ProjectPluginMembership) {
  const html = renderOwnerUnavailablePage({ project, card, ...(membership ? { membership } : {}),
    desktopShell: composition.isDesktopShellRequest(request, url) }, { readText, htmlLang, desktop: composition.desktopRenderer });
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": composition.PAGE_CSP });
  response.end(html);
}
