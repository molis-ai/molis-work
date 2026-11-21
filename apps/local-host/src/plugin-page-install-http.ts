import { randomUUID } from "node:crypto";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  ActionError,
  defineErrorCodes,
  type BoundActionClient,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { currentInstalledPluginHost } from "./installed-plugin-host.js";
import type { PackageInstallSecret } from "./installed-release.js";
import { installedStageSurface } from "./installed-stage-section.js";
import { pageOwnerClient, trustedPluginPage } from "./plugin-connection-slots-http.js";
import { pluginInstallActions } from "./plugin-install-actions.js";
import { stageInstallSecrets, type PluginInstallConfirmResult } from "./plugin-install-service.js";
import type { WebRequestContext } from "./web-route-table.js";

// 原处的安装单的宿主路由 (specs/plugin-builder-upgrade/spec.md §7.0, S-package-install-sheet). Only the trusted shell calls it, with the outer
// document's `x-molis-context-page` (the transport guard refuses the child's `x-molis-plugin-page`). A page hands the shell a signed package;
// the shell asks here what installing it means and, on the person's own press in the sheet, installs it. Both are the install provider's
// own actions (`plugins.install.preview@1`, `plugins.install.confirm@1`, S-84) made as the person: the package is verified there, and
// nothing a page says is taken for what it may do. The page's authority fences every call; a page that has closed installs nothing.

/** A package carries the plugin's code and files, base64 inside the signed bundle; the settings door and the command line take the same. */
export const PAGE_INSTALL_MAX_BYTES = 24 * 1024 * 1024;

export const pageInstallErrors = defineErrorCodes("host.package_install", {
  preview_unknown: "not_found",
  publisher_untrusted: "forbidden",
});

/** How this Home's own publisher identity is named when the sheet's confirmation is the first to pin it, as an import from this computer names it. */
const LOCAL_PIN_LABEL = "这台电脑";
const PREVIEW_TTL_MS = 15 * 60_000,
  MAX_SHEETS = 64;
const invalid = (message: string) => new ActionError("actions.input_invalid", message);

/** What the route remembers of a preview it made: the page whose sheet asked, and how its publisher is to be pinned by the confirmation. */
interface Sheet {
  page_id: string;
  project_id: string;
  home: boolean;
  pin: string | null;
  trusted: boolean;
  refs: readonly string[];
  expires: number;
}
const sheets = new Map<string, Sheet>();

/** One permission as the sheet draws it: what the package asks, whether it is on where the plugin is installed now, and whether this version is the first to ask. */
export interface PageInstallPermission {
  permission: string;
  required: boolean;
  reason: string;
  meaning: string | null;
  on: boolean;
  fresh: boolean;
}

/** What only the trusted shell reads (never the frame): the package as the Host verified it, and how it stands against what is installed. */
export interface PageInstallView {
  preview_id: string;
  plugin_id: string;
  name: string;
  version: string;
  /** The version installed here from the same publisher, which confirming upgrades; null for a first installation. */
  from_version: string | null;
  runtime_scope: "home" | "project";
  dual: boolean;
  /** `trusted`: the person pinned this publisher, or the package was signed with this Home's own identity. Anything else is not installed from a page. */
  publisher: { label: string | null; local: boolean; trusted: boolean };
  permissions: PageInstallPermission[];
  jobs: Array<{ reason: string }>;
  secrets: Array<{ name: string; saved: boolean }>;
  network: string[];
}

/** The person's own action client for one press in the sheet: stamped as theirs (S-58), fenced by the page at every authority check and effect. */
const sheetClient = (
  context: WebRequestContext,
  project: LocalHostProjectReference,
  page: ReturnType<typeof trustedPluginPage>["page"],
): Promise<BoundActionClient> =>
  pageOwnerClient(context, project, page, {
    actor_kind: "user",
    user_action: {
      source: "web",
      conversation_ref: `web:${project.project_id}`,
      message_ref: `web:request:${randomUUID()}`,
    },
  });

function secretsOf(value: unknown, refs: readonly string[]): PackageInstallSecret[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw invalid("密钥的格式不对");
  return value.map((item): PackageInstallSecret => {
    const entry = (item && typeof item === "object" && !Array.isArray(item) ? item : {}) as Record<string, unknown>;
    const { name, header, value: secret } = entry;
    if (
      Object.keys(entry).length !== 3 ||
      typeof name !== "string" ||
      typeof header !== "string" ||
      typeof secret !== "string" ||
      !refs.includes(name)
    )
      throw invalid("密钥的格式不对");
    return { name, header: header.trim(), value: secret };
  });
}

/** `POST /api/host/plugin-page-install`: preview the package a page handed the shell, or install the one the person just confirmed in the sheet. */
export async function pagePackageInstall(
  context: WebRequestContext,
  reference: LocalHostProjectReference | undefined,
  body: Record<string, unknown>,
): Promise<PageInstallView | (PluginInstallConfirmResult & { open_surface?: string })> {
  const { page, project } = trustedPluginPage(context, reference);
  const pageId = String(context.request.headers["x-molis-context-page"]);
  const keys = Object.keys(body ?? {});
  await page.beforeEffect();
  const now = Date.now();
  for (const [id, sheet] of sheets) if (sheet.expires <= now) sheets.delete(id);
  if (
    body?.operation === "preview" &&
    keys.length === 2 &&
    body.bundle &&
    typeof body.bundle === "object" &&
    !Array.isArray(body.bundle)
  ) {
    const client = await sheetClient(context, project, page);
    const shown = await client.invoke(pluginInstallActions.preview, { bundle: body.bundle });
    const home = shown.runtime_scope === "home";
    const { plugins } = home
      ? await client.invoke(pluginInstallActions.homeInstalled, {})
      : await client.invoke(pluginInstallActions.installed, {});
    const installed = plugins.find(
      (row) =>
        row.plugin_id === shown.preview.plugin_id &&
        row.publisher_signature === shown.preview.publisher_signature &&
        row.state !== "uninstalled",
    );
    const local = shown.publisher.local === true,
      trusted = shown.publisher.pinned_label !== null || local;
    if (sheets.size >= MAX_SHEETS) sheets.delete(sheets.keys().next().value!);
    sheets.set(shown.preview_id, {
      page_id: pageId,
      project_id: project.project_id,
      home,
      trusted,
      pin: shown.publisher.pinned_label === null && local ? LOCAL_PIN_LABEL : null,
      refs: (shown.secrets ?? []).map((item) => item.name),
      expires: now + PREVIEW_TTL_MS,
    });
    return {
      preview_id: shown.preview_id,
      plugin_id: shown.preview.plugin_id,
      name: shown.name,
      version: shown.preview.version,
      from_version: installed && installed.version !== shown.preview.version ? installed.version : null,
      runtime_scope: shown.runtime_scope,
      dual: shown.dual_instance === true,
      publisher: { label: shown.publisher.pinned_label, local, trusted },
      permissions: shown.preview.permissions
        .filter((row) => row.requested)
        .map((row) => {
          const held = installed?.permissions.find((item) => item.permission === row.permission);
          return {
            permission: row.permission,
            required: row.required,
            reason: row.reason,
            meaning: row.meaning,
            on: row.required || held?.granted === true,
            fresh: Boolean(installed) && !held,
          };
        }),
      jobs: shown.preview.jobs.map((job) => ({ reason: job.reason })),
      secrets: shown.secrets ?? [],
      network: [...(shown.effects.networkDomains ?? [])],
    };
  }
  if (
    body?.operation === "confirm" &&
    typeof body.preview_id === "string" &&
    keys.every((key) => ["operation", "preview_id", "optional", "secrets"].includes(key))
  ) {
    const sheet = sheets.get(body.preview_id);
    sheets.delete(body.preview_id);
    // The preview is the one this page's sheet showed the person, in this project; another page's, or one that has lapsed, installs nothing.
    if (!sheet || sheet.page_id !== pageId || sheet.project_id !== project.project_id)
      throw pageInstallErrors.preview_unknown("这次安装的确认已经失效，请重新打开");
    if (!sheet.trusted)
      throw pageInstallErrors.publisher_untrusted("这个发布者还没有被你信任：请到 设置 › 插件 里导入这个安装包并确认");
    const optional = body.optional;
    if (
      optional !== undefined &&
      (!Array.isArray(optional) || optional.length > 64 || optional.some((item) => typeof item !== "string"))
    )
      throw invalid("可选权限的格式不对");
    const secrets = secretsOf(body.secrets, sheet.refs);
    const client = await sheetClient(context, project, page);
    await page.beforeEffect();
    if (secrets.length) stageInstallSecrets(body.preview_id, secrets);
    const done = await client.invoke(pluginInstallActions.confirm, {
      preview_id: body.preview_id,
      consent: true,
      ...(sheet.pin ? { pin_label: sheet.pin } : {}),
      ...(optional === undefined ? {} : { optional_permissions: optional as string[] }),
    });
    // Where the installed plugin opens, for the sheet's own 「打开」: the shell's, never told to the page.
    const release = sheet.home
      ? context.localHost.homePlugins?.packageStage(done.plugin_id)
      : await context.localHost
          .withProject(project, (runtime) =>
            currentInstalledPluginHost(runtime.store, runtime.project_id)?.releaseFor(done.plugin_id),
          )
          .catch(() => undefined);
    return {
      ...done,
      ...(release ? { open_surface: sheet.home ? release.pluginId : installedStageSurface(release) } : {}),
    };
  }
  throw invalid("安装单请求无效");
}
