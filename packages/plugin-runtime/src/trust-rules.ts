import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentGrant, PluginConsentGranter, PluginConsentKind, PluginDeclarationNeedingConsent, PluginTrust, PluginTrustLevel } from "@molis-ai/molis-work-contracts/platform/plugin-trust";

// Install trust and the declarations that need consent (ac-trust T1, specs/repository-anti-corruption/slices/ac-trust-install.md §2–§3).
// Pure rules: the install, the supervisor and the tests read the same ones. A level is evidence the Host gives; nothing a plugin writes
// (its Manifest, its package, a caller's input) can name its own.

/** The evidence for a definition the Host's own start list carries: its code is in the Host's build, so nothing is verified. */
export const HOST_BUILD_TRUST: PluginTrust = Object.freeze({ level: "host" });

/** No evidence at all: the plugin studio's output, a development directory, a definition the Host was handed for a test or a probe. */
export const UNSIGNED_TRUST: PluginTrust = Object.freeze({ level: "unsigned" });

export const isHostTrust = (trust: PluginTrust): boolean => trust.level === "host";

/**
 * The default-rule keys the Host's own build declares are the Host's: a plugin that is not host-trusted may not be installed declaring
 * one, whatever id it carries. Refused before any record is written, so nothing of it is left behind.
 */
export function assertRuleKeysUnreserved(manifest: PluginManifest, trust: PluginTrust, reserved: ReadonlySet<string> | undefined): void {
  if (!reserved?.size || isHostTrust(trust)) return;
  const taken = (manifest.action_scenes ?? []).flatMap(scene => scene.default_rule && reserved.has(scene.default_rule.function_key) ? [scene.default_rule.function_key] : []);
  if (taken.length) throw pluginErrors.rule_key_reserved(`默认规则 ${taken.join("、")} 是宿主自带场景的，未受宿主信任的插件不能声明`);
}

const LEVELS: readonly PluginTrustLevel[] = ["host", "pinned", "unsigned"];
const KEY_ID = /^ed25519:sha256:[0-9a-f]{64}$/u;

/** The evidence an install is called with, checked by shape: tests and scripts are not type-checked, so the type alone would not make a caller give it. */
export function assertPluginTrust(value: unknown): PluginTrust {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw pluginErrors.state_invalid("安装需要宿主给出的信任等级（trust）");
  const level = (value as { level?: unknown }).level;
  const keys = Object.keys(value).sort().join(",");
  if (!LEVELS.includes(level as PluginTrustLevel)) throw pluginErrors.state_invalid("未知的安装信任等级");
  if (level === "pinned") {
    const keyId = (value as { publisher_key_id?: unknown }).publisher_key_id;
    if (keys !== "level,publisher_key_id" || typeof keyId !== "string" || !KEY_ID.test(keyId)) throw pluginErrors.state_invalid("pinned 等级需要验证过的发布者公钥指纹");
  } else if (keys !== "level") {
    throw pluginErrors.state_invalid("安装信任等级只带等级本身");
  }
  return value as PluginTrust;
}

/**
 * A level and the way the code runs must agree where it is a safety matter: code of the Host's build runs in the Host (a sandboxed
 * definition is a generated plugin's, whose permissions are what a person confirmed, never what its Manifest declares), and a
 * definition run in the sandbox never holds the Host's own level. And the other way round (BL-588, S-75 ⑥): code that runs in the
 * Host's process holds the Host's level, unless the Host's own code admitted that very definition (`InProcessAdmission`): the
 * development directory's loaded plugin and the test fixtures are the closed list of such exceptions. `inProcessAdmitted` is true
 * for a definition so admitted, and for any definition in a Runtime that checks none. Official integrations shipped in the Host's
 * build and registered by its build catalog have `host` trust. If an integration is later distributed independently, its trust
 * follows its own signature instead.
 */
export function assertTrustFitsExecution(trust: PluginTrust, execution: "host" | "sandbox", inProcessAdmitted: boolean): void {
  if (trust.level === "host" && execution === "sandbox") throw pluginErrors.grant_denied("沙箱里的生成插件不能当作随宿主发布的插件：它的权限是人确认的，不是 Manifest 声明的全部");
  if (trust.level !== "host" && execution === "host" && !inProcessAdmitted) {
    throw pluginErrors.in_process_denied("在宿主进程里运行的代码只给随宿主发布的插件：别处来的插件要装成沙箱定义（开发目录与测试夹具是宿主代码逐个放行的例外）");
  }
}

/**
 * The definitions the Host's own code lets run in its process without `host` trust (BL-588). A Runtime given one admits exactly these
 * objects (by identity, as `pluginEntryIdentity` does for the Host's build; asked at each install and start, so a set the Host's
 * code fills later counts), an empty set none; a Runtime given none checks nothing,
 * which only a test's bare Runtime does (a gate keeps every production construction naming it). It is a construction option of the
 * Host's code: no Manifest, package, caller's input or stored record can set it.
 */
export interface InProcessAdmission { readonly admit: { has(definition: PluginDefinition): boolean } }

/**
 * Where a plugin runs is its Manifest's (`runtime.scope`, PG-011), but nothing a plugin writes can put its code in the Host's process:
 * only code of the Host's build is started there (its Home registration). A plugin that writes `runtime.scope: "home"` is installed only
 * when it is of the Host's build, or when it is a sandboxed definition under a pinned publisher, the one path S-84 verifies (signature,
 * pinned publisher, the person's confirmation) and the one that runs its code in the sandbox, never in the Host (BL-628, S-80; the person
 * decided 2026-10-26). An unsigned or generated plugin, and a pinned one that would run in the Host, are refused at install. This is the one
 * place that says so.
 */
export function assertHomeScopeAllowed(manifest: PluginManifest, trust: PluginTrust, execution: "host" | "sandbox"): void {
  if (manifest.runtime?.scope !== "home" || isHostTrust(trust)) return;
  if (trust.level === "pinned" && execution === "sandbox") return;
  throw pluginErrors.home_scope_unavailable("Home 级插件只有随宿主发布的、或来自已固定发布者的签名沙箱包才能装：请删掉 Manifest 的 runtime，或改用签名的沙箱包");
}

/**
 * The Runtime a plugin is installed into is the one its Manifest names (BL-628): a plugin that is not of the Host's build and writes
 * `runtime.scope: "home"` is never installed into a project's Runtime, and a signed package that writes none is never installed into the
 * Home's. Without this an entry that guessed wrong, or a package whose scope was changed, would run in a place its Manifest never asked
 * for. The Host's own build is not asked (the halves of a dual-instance plugin share one Manifest and run in both), and neither is a
 * definition the Host itself was handed for a test (`unsigned`): only the Host's configuration can put one in the Home.
 */
export function assertScopeFitsRuntime(manifest: PluginManifest, trust: PluginTrust, runtimeScope: "home" | "project" | undefined): void {
  if (runtimeScope === undefined || isHostTrust(trust)) return;
  const declaredHome = manifest.runtime?.scope === "home";
  if (runtimeScope === "project" && declaredHome) {
    throw pluginErrors.home_scope_unavailable("这个插件的 Manifest 声明了 runtime.scope: home，只能装进 Home，不能装进项目");
  }
  if (runtimeScope === "home" && trust.level === "pinned" && !declaredHome) {
    throw pluginErrors.home_scope_unavailable("这个插件的 Manifest 没有声明 runtime.scope: home，只能装进项目，不能装进 Home");
  }
}

/**
 * Looking for command-line tools on this machine (`local_tools`, PG-112) is told to a plugin of the Host's build alone: what is installed
 * here is information about the person's machine, and a plugin whose code the Host did not ship has no consent behind it yet. It is
 * refused at install, before any record, so a declaration that could never be served does not sit in the permissions a person is asked
 * to confirm (opening it to other plugins goes through the consent ledger, BL-626).
 */
export function assertLocalToolsAllowed(manifest: PluginManifest, trust: PluginTrust): void {
  if (manifest.local_tools !== undefined && !isHostTrust(trust)) {
    throw pluginErrors.declaration_invalid("本机工具查找（local_tools）现在只给随宿主发布的插件，请删掉 Manifest 的 local_tools");
  }
}

/** What `install` asks of a definition's trust: it fits where the code runs, a Home scope in the Manifest is the Host build's or a pinned sandbox package's, and a look for local tools is the Host build's alone. */
export function assertTrustFitsDefinition(definition: PluginDefinition, trust: PluginTrust, inProcess?: InProcessAdmission): void {
  const execution = definition.execution ?? "host";
  assertTrustFitsExecution(trust, execution, !inProcess || inProcess.admit.has(definition));
  assertHomeScopeAllowed(definition.manifest, trust, execution);
  assertLocalToolsAllowed(definition.manifest, trust);
}

/** Who a consent is recorded as given by: the Host, for the build it ships; a person, for everything else. */
export const consentGranter = (trust: PluginTrust): PluginConsentGranter => trust.level === "host" ? "host_build" : "user";

/** A consent's subject, written the one way: a declaration that changes is another subject and asks again. */
export const consentSubject = {
  alwaysOn: (): string => "always_on",
  defaultGroup: (groupId: string): string => groupId,
  /** The target port reads the source plugin's output by default, for the source publisher that was current when the consent was given. */
  defaultWiring: (targetPort: string, source: { plugin_id: string; port: string }, sourcePublisherSignature: string): string =>
    `${targetPort}<-${source.plugin_id}:${source.port}@${sourcePublisherSignature}`,
};

/** A declaration of a Manifest that asks for consent. A default wiring's subject is complete once the source's publisher signature follows `prefix`. */
interface DeclaredConsent { readonly kind: PluginConsentKind; readonly prefix: string; readonly complete: boolean; readonly summary: string }

function declaredConsents(manifest: PluginManifest): DeclaredConsent[] {
  const declared: DeclaredConsent[] = [];
  if (manifest.always_on === true) declared.push({ kind: "always_on", prefix: consentSubject.alwaysOn(), complete: true, summary: "每个项目都开、删不掉（常开插件）" });
  for (const input of manifest.ports?.inputs ?? []) {
    const source = input.default_source;
    if (source) declared.push({ kind: "default_wiring", prefix: `${input.port}<-${source.plugin_id}:${source.port}@`, complete: false,
      summary: `端口「${input.port}」默认读取 ${source.plugin_id} 的「${source.port}」` });
  }
  for (const group of manifest.ports?.input_groups ?? []) {
    if (group.default === true) declared.push({ kind: "default_group", prefix: consentSubject.defaultGroup(group.group_id), complete: true, summary: `默认使用输入组「${group.title}」` });
  }
  return declared;
}

/**
 * What the Manifest declares that asks for consent, for a preview. `sourceSignature` says the publisher signature of a default
 * wiring's source plugin; a wiring whose source it cannot name is not listed, as it cannot be agreed to (nor bound).
 */
export function declarationsNeedingConsent(manifest: PluginManifest, sourceSignature: (pluginId: string) => string | undefined): PluginDeclarationNeedingConsent[] {
  const listed: PluginDeclarationNeedingConsent[] = [];
  for (const declaration of declaredConsents(manifest)) {
    if (declaration.complete) { listed.push({ kind: declaration.kind, subject: declaration.prefix, summary: declaration.summary }); continue; }
    const source = manifest.ports?.inputs.find(input => declaration.prefix.startsWith(`${input.port}<-`) && input.default_source)?.default_source;
    const signature = source ? sourceSignature(source.plugin_id) : undefined;
    if (source && signature) listed.push({ kind: declaration.kind, subject: `${declaration.prefix}${signature}`, summary: declaration.summary });
  }
  return listed;
}

/** What the Host agrees to for a plugin of its own build: every declaration of the Manifest it ships, so a built-in plugin works without being asked. */
export const hostBuildConsents = (manifest: PluginManifest, sourceSignature: (pluginId: string) => string | undefined): PluginConsentGrant[] =>
  declarationsNeedingConsent(manifest, sourceSignature).map(({ kind, subject }) => ({ kind, subject }));

/** A consent must be to something the Manifest declares: a grant for another plugin's declaration, or a made-up one, is refused. */
export function assertConsentsDeclared(manifest: PluginManifest, grants: readonly PluginConsentGrant[]): void {
  const declared = declaredConsents(manifest);
  for (const grant of grants) {
    const known = declared.some(declaration => declaration.kind === grant.kind
      && (declaration.complete ? grant.subject === declaration.prefix : grant.subject.startsWith(declaration.prefix) && grant.subject.length > declaration.prefix.length));
    if (!known) throw pluginErrors.declaration_invalid(`同意的声明 ${grant.kind}（${grant.subject}）不在这个插件的 Manifest 里`);
  }
}
