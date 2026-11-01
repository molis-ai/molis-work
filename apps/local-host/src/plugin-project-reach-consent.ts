import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { SandboxIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { consentSubject, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import type { InstalledRelease } from "./installed-release.js";
import { captureProjectReachConsent, projectReachSubject } from "./plugin-project-reach-subject.js";

export interface ProjectReachView {
  plugin_id: string; name: string; publisher_signature: string; version: string; snapshot: string;
  state: "unapproved" | "approved" | "expanded" | "unavailable";
  capability_ids: readonly string[]; added_capability_ids: readonly string[];
  consent: PluginConsentRecord | null; error: string | null;
}
export interface ProjectReachSelection { plugin_id: string; snapshot: string }

const denied = (message: string) => new ActionError("actions.forbidden", message);
const declarationIds = (release: InstalledRelease): string[] => [...new Set(release.design.contract.operations.flatMap(operation => operation.effects.capabilities ?? []))].sort();
const currentSnapshot = (record: PluginInstanceRecord): string => JSON.stringify([record.install_id, record.installation_generation, record.version, record.manifest_digest]);

/** One projection of the existing ledger and current verified release, shared by settings and actual sandbox calls. */
export function projectReachConsents(ports: {
  ledger: PluginConsentLedger;
  records(): readonly PluginInstanceRecord[];
  releaseFor(pluginId: string): InstalledRelease | undefined;
  assertInstalled(identity: Readonly<SandboxIdentity>): void;
}) {
  const recordFor = (pluginId: string): PluginInstanceRecord => {
    const record = ports.records().find(item => item.plugin_id === pluginId);
    if (!record) throw denied("这个 Home 插件已卸载");
    return record;
  };
  const approval = (projectId: string, record: PluginInstanceRecord) => ports.ledger.consents(record.plugin_id).find(row => row.kind === "project_reach"
    && row.granted_by === "user" && row.publisher_signature === record.publisher_signature && row.revoked_at === null
    && row.subject === consentSubject.projectReach(projectId, record.install_id));
  const verified = (record: PluginInstanceRecord): InstalledRelease => {
    const release = ports.releaseFor(record.plugin_id);
    if (!release?.packaged || release.packaged.manifest.version !== record.version || release.packaged.manifest.publisher.signature !== record.publisher_signature) {
      throw denied("当前安装的签名包不可读或已失效");
    }
    return release;
  };
  const view = (projectId: string, record: PluginInstanceRecord): ProjectReachView => {
    const base = { plugin_id: record.plugin_id, name: record.plugin_id, publisher_signature: record.publisher_signature, version: record.version,
      snapshot: currentSnapshot(record), capability_ids: [] as string[], added_capability_ids: [] as string[], consent: null, error: null };
    try {
      const release = verified(record), ids = declarationIds(release), consent = approval(projectId, record) ?? null;
      const added = consent?.kind === "project_reach" ? ids.filter(id => !consent.approved_capability_ids.includes(id)) : [];
      return { ...base, name: release.packaged!.manifest.name, capability_ids: ids, added_capability_ids: added, consent,
        state: !consent ? "unapproved" : added.length ? "expanded" : "approved" };
    } catch (error) { return { ...base, state: "unavailable", error: error instanceof Error ? error.message : String(error) }; }
  };
  const selection = (input: ProjectReachSelection) => {
    const record = recordFor(input.plugin_id);
    if (currentSnapshot(record) !== input.snapshot) throw new ActionError("actions.conflict", "插件版本或启用状态已变化，请刷新后确认");
    return record;
  };
  return {
    list: (projectId: string): ProjectReachView[] => ports.records().map(record => view(projectId, record)),
    /** Remember the starting agreement before any directory await, without requiring it for a Home-only operation. */
    captureCall(token: object, identity: Readonly<SandboxIdentity>): void {
      const subject = projectReachSubject(token, identity);
      if (subject.consent_id === undefined) captureProjectReachConsent(token, identity, approval(subject.project_id, recordFor(identity.pluginId))?.consent_id ?? null);
    },
    async grant(projectId: string, input: ProjectReachSelection, beforeEffect: () => Promise<void>): Promise<ProjectReachView> {
      selection(input);
      await beforeEffect();
      const record = selection(input), release = verified(record), ids = declarationIds(release);
      const existing = approval(projectId, record);
      // A version with fewer declarations keeps the original approval and its original digest.
      if (!(existing?.kind === "project_reach" && ids.every(id => existing.approved_capability_ids.includes(id)))) {
        ports.ledger.grantProjectReach({ plugin_id: record.plugin_id, publisher_signature: record.publisher_signature, manifest_digest: record.manifest_digest,
          project_id: projectId, install_id: record.install_id, approved_capability_ids: ids, at: new Date().toISOString() });
      }
      return view(projectId, record);
    },
    async revoke(projectId: string, input: ProjectReachSelection, beforeEffect: () => Promise<void>): Promise<ProjectReachView> {
      selection(input);
      await beforeEffect();
      const record = selection(input), consent = approval(projectId, record);
      if (consent) ports.ledger.revoke(consent.consent_id, new Date().toISOString());
      return view(projectId, record);
    },
    /** Capture before asynchronous directory work, and ask again after every wait and before the actual target effect. */
    assertCall(token: object, identity: Readonly<SandboxIdentity>): string {
      const subject = projectReachSubject(token, identity);
      ports.assertInstalled(identity);
      const record = recordFor(identity.pluginId);
      if (currentSnapshot(record) !== currentSnapshot(subject.record)) throw denied("这次调用的 Home 安装已变化");
      const release = verified(record), consent = approval(subject.project_id, record);
      if (consent?.kind !== "project_reach") throw denied("请先在这个项目的设置里同意 Home 插件读写此项目");
      if (!declarationIds(release).every(id => consent.approved_capability_ids.includes(id))) throw denied("声明的动作增加，请在这个项目的设置里重新确认");
      captureProjectReachConsent(token, identity, consent.consent_id);
      return subject.project_id;
    },
  };
}

export type ProjectReachConsents = ReturnType<typeof projectReachConsents>;
