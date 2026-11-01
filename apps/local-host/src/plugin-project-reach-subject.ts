import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";

interface Subject {
  readonly project_id: string;
  readonly record: PluginInstanceRecord;
  readonly control: PluginExecutionControl;
  consent_id?: string | null;
}
// Neither a copied control nor JSON from the worker can acquire this per-invocation identity.
const executions = new WeakMap<PluginExecutionControl, object>();
const subjects = new WeakMap<object, Subject>();
const refused = () => new ActionError("actions.forbidden", "这次调用的项目授权已失效");

/** Only verified HTTP routes and action handlers issue a subject; the installation itself stays in Home. */
export async function withProjectReachInvocation<T>(control: PluginExecutionControl, projectId: string | null,
  record: PluginInstanceRecord, invoke: () => Promise<T>): Promise<T> {
  if (!projectId) return invoke();
  const token = Object.freeze({});
  subjects.set(token, { project_id: projectId, record: { ...record }, control });
  executions.set(control, token);
  try { return await invoke(); }
  finally { executions.delete(control); subjects.delete(token); }
}

export const executionProjectReach = (control: PluginExecutionControl | undefined): object | undefined => control && executions.get(control);

/** Resolve only Host-issued identity, still live and belonging to this Home installation. */
export function projectReachSubject(token: object, identity: Readonly<SandboxIdentity>): Subject {
  const subject = subjects.get(token);
  if (!subject || identity.namespace !== "installed" || identity.projectId !== null || subject.record.install_id !== identity.installationId
    || subject.record.plugin_id !== identity.pluginId) throw refused();
  subject.control.signal?.throwIfAborted();
  subject.control.assert_authority_current?.();
  return subject;
}

/** Keep the first agreement's identity: withdrawal followed by regrant never revives an older invocation. */
export function captureProjectReachConsent(token: object, identity: Readonly<SandboxIdentity>, consentId: string | null): Subject {
  const subject = projectReachSubject(token, identity);
  if (subject.consent_id !== undefined && subject.consent_id !== consentId) throw refused();
  subject.consent_id = consentId;
  return subject;
}
