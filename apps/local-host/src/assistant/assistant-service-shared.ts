import type { AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryServicePorts } from "@molis-ai/molis-work-service-memory";
import type { memorySources } from "../memory/memory-sources.js";
import type { ExecutorHanded } from "./assistant-executor-input.js";
import type { AssistantFollowUpPorts } from "./assistant-followups.js";
import type { AgentHost, AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentSessionRef, AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionSubjectContext, ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantCharacterChoice, AssistantWorkObject } from "@molis-ai/molis-work-contracts/services/assistant";
import type { WebLocale } from "../web-locale.js";
import type { AssistantRoundFactPorts } from "./assistant-directory.js";
import { withinTime } from "./assistant-material-scan.js";
import type { SignedAgentReference, SignedAgentInstallation, SignedAgentMaterial, SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillBodyReadResult, SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import type { SignedRoleView } from "../agent-definitions/agent-definitions.js";
import type { SkillUse } from "../agent-definitions/skill-settings.js";

/** A signed installation in a work's scope, and the check that it still is (its record, publisher and pin) before a handoff. */
export interface SignedBinding { installation: SignedAgentInstallation; assertCurrent(): void }
import type { StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";
import type { MemoryService } from "@molis-ai/molis-work-service-memory";
import type { PersonActions } from "./assistant-executor.js";
import type { AssistantMemorySourceRef } from "./assistant-inputs.js";
import type { AssistantLandingPorts } from "./assistant-landing.js";

/** What the Assistant's service and its collaborators share: the Host port, the runtime's name, and checks every one of them makes. */
export const RUNTIME = "prologue";

export const MAX_TEXT = 20_000;

export interface AssistantServicePorts extends AssistantLandingPorts, AssistantRoundFactPorts, Pick<AssistantFollowUpPorts<StoredWork>, "pages"> {
  /** Withdraw only unfinished setup requests owned by this work's session. */
  cancelSetups?(sessionId: string): void;
  retainSetups?(sessionId: string): Promise<void>;
  holdSetups?(sessionId: string, revision: string): void;
  setupMaterial?(work: StoredWork, offered: readonly ActionView[], previousWaitWithdrawn: boolean): AgentTextMaterial | undefined;
  /** The Home's Agent Host, ready to run. */
  host(): Promise<AgentHost>;
  /** The language the person last used, read when a round no page started begins. Absent: such a round is told no language. */
  lastLocale?(): WebLocale;
  authority(work: StoredWork, origin?: { source: "card" }, locale?: WebLocale): Promise<AgentStartAuthority>;
  /** How the person names a project, for the round's own description of where it runs. */
  projectTitle?(projectId: string): Promise<string | null>;
  /** IANA zone the person works in, so "tomorrow" means their tomorrow. */
  timeZone?: string;
  /** The person's own client in a work's project, to drive the plugin that carries it as its page would; a dispatch's (a Send, a follow-up's round) is its own. */
  personActions?(work: Pick<StoredWork, "project_ref">, use?: "dispatch", handed?: ExecutorHanded, executorPluginId?: string): Promise<BoundActionClient>;
  /** The person's own actions in a work's scope (its project, or the Home), for reading related objects from their owners. */
  scopeActions?(work: Pick<StoredWork, "project_ref">): Promise<PersonActions>;
  /** The person's own actions in their Home, for reading the reminders they set in Plugins. */
  homeActions?(): Promise<PersonActions>;
  /** The Characters the person published in a project, each saying whether it can run now. */
  characters?(project: LocalHostProjectReference): Promise<AssistantCharacterChoice[]>;
  /**
   * What a work may follow (specs/capability-pack/contract-design.md §2.2): the role material running signed packages offer, bound to
   * the installations in the work's scope, and the shared Skill catalog read as the person for the Assistant.
   */
  methods?: {
    roles(): SignedRoleView[];
    /**
     * The named installations that are in this scope, by install id, bound with one read of the project's and the Home's install
     * records; `assertCurrent` holds while the installation still runs the signed `source` its roles name.
     */
    bindSigned(project: LocalHostProjectReference | undefined, installs: ReadonlyArray<{ install_id: string; source: SignedAgentReference["source"] }>): Promise<ReadonlyMap<string, SignedBinding>>;
    readSigned(installId: string, ref: SignedAgentReference): SignedAgentMaterial;
    recordSignedUse(material: SignedAgentMaterial, caller: string): void;
    /** The Skills the catalog offers the Assistant in this scope and the person turned on (`skills.catalog.list@1`). */
    skills(project: LocalHostProjectReference | undefined): Promise<SkillCatalogEntry[]>;
    /** The bodies of the Skills the person named for one round, in one `skills.body.read@1`. */
    readSkills(project: LocalHostProjectReference | undefined, refs: readonly SkillRef[]): Promise<SkillBodyReadResult[]>;
    /** A Skill one round accepted, as the catalog's record of uses keeps it. */
    recordSkillUse(use: SkillUse): void;
  };
  /** The platform memory of this Home (specs/archive/memory-system). Absent: the Assistant keeps and recalls nothing. */
  memory?(...execution: [] | [control: AgentMemoryExecutionControl, bindChangeTarget: NonNullable<MemoryServicePorts["bindChangeTarget"]>]): MemoryService | undefined;
  memorySources?: Pick<ReturnType<typeof memorySources>, "check">;
  /** A round of a work finished: the platform memory may draw out what is worth keeping from the person's own words. */
  learnFromRound?(input: { work: StoredWork; said: string[]; run_id: string; sources: AssistantMemorySourceRef[] }): void;
}

/** Where a Send came from: the page's own project, when there is one. Only used to scope a new work. */
export interface AssistantCaller {
  /** Attested by the protected send owner, never read from a business input. */
  original_input?: Omit<HostOfferedOriginalInput, "action">;
  project_ref?: LocalHostProjectReference;
  /** The language of the page that sends, read at the Host's entry and never from the input. Absent: the round follows the language last used. */
  reply_locale?: WebLocale;
  /** Set by the discussion controller, never read from HTTP input. */
  thread_request?: string;
  beforeStart?: () => Promise<void>;
  assertBeforeStart?: () => void;
}

export const sessionRef = (work: StoredWork): AgentSessionRef => ({ session_id: work.session_id!, runtime_id: RUNTIME });

export function checkText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw assistantErrors.invalid(`${field}不能为空`);
  if (value.length > max) throw assistantErrors.invalid(`${field}超过 ${max} 字，请缩短或作为附件添加`);
  return value;
}

/** What a round is given as marked data, and what in it is told only once (marked told after the round has started). */
export interface RoundMaterials { materials: AgentTextMaterial[]; told: { undos: string[]; unsettled: string[] } }

/**
 * A Home-kept object that says it belongs to another project (or a project, for personal work): its content is not
 * this work's to read, whatever the owner's reader allows.
 */
export function belongsElsewhere(work: Pick<StoredWork, "project_ref">, context: ActionSubjectContext): boolean {
  if (typeof context.project_id !== "string" || context.project_id === "personal") return false;
  return context.project_id !== (work.project_ref?.project_id ?? null);
}

export const HANDOVER_MARK = "【这项工作从个人助理转交给你继续。";

export function assertSendCurrent(stillCurrent: (() => boolean) | undefined): void {
  if (stillCurrent && !stillCurrent()) throw assistantErrors.cancelled("这项工作已变化，这次发送没有继续");
}

/**
 * Where an object this work knew has gone, when the person moved it (the placement service follows moves). Content
 * in another project or the personal space is not read from this work's scope: only its name and new place are told.
 */
export async function whereNow(work: StoredWork, actions: PersonActions | null, subject: { kind: string; id: string }): Promise<{ title: string; to: NonNullable<AssistantWorkObject["moved_to"]> } | null> {
  if (!actions) return null;
  const describe = (await actions.discover().catch(() => [] as ActionView[])).find(view => view.capability_id === "placement.describe" && view.availability.available);
  if (!describe) return null;
  try {
    const found = await withinTime(actions.invoke({ capability_id: describe.capability_id, version: describe.version, provider_id: describe.provider.provider_id },
      { object: { kind: subject.kind, id: subject.id, project_id: work.project_ref?.project_id ?? null } })) as
      { state: string; title: string; location: { title: string; kind: "personal" | "project"; project_id: string | null } | null };
    if (found.state !== "ok" || !found.location) return null;
    const here = work.project_ref?.project_id ?? null;
    if (found.location.kind === "project" ? found.location.project_id === here : here === null) return null;
    return { title: found.title, to: { title: found.location.title, kind: found.location.kind } };
  } catch { return null; }
}
