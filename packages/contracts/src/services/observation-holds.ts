import type { ActionDefinition } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import { OBSERVATION_LIMITS } from "./observation-types.js";

export interface ObservationHoldPutInput {
  readonly hold_id: string;
  readonly sample_id: string;
  readonly owner?: string;
  readonly project_id?: string | null;
  readonly record_ids: readonly string[];
  readonly expires_at?: string | null;
  readonly note?: string;
}

export interface ObservationHoldView {
  readonly hold_id: string;
  readonly owner: string;
  readonly sample_id: string;
  readonly project_id: string | null;
  readonly record_ids: readonly string[];
  readonly active_record_count: number;
  readonly bytes: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string | null;
  readonly expired: boolean;
  readonly note?: string;
}

export interface ObservationHoldPutResult {
  readonly hold: ObservationHoldView;
  readonly held_record_ids: readonly string[];
  readonly missing_record_ids: readonly string[];
}

export interface ObservationHoldReleaseInput {
  readonly hold_id?: string;
  readonly sample_id?: string;
}

export interface ObservationHoldReleaseResult {
  readonly released_hold_ids: readonly string[];
  readonly released_record_count: number;
}

export interface ObservationHoldListInput {
  readonly project_id?: string | null;
  readonly sample_id?: string;
  readonly include_expired?: boolean;
}

export interface ObservationHoldListOutput {
  readonly holds: readonly ObservationHoldView[];
  readonly summary: { readonly count: number; readonly bytes: number; readonly retention_days: number };
}

const token = { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.ref_text } as const;
const nullableToken = { type: ["string", "null"], maxLength: OBSERVATION_LIMITS.ref_text } as const;

export const observationHoldActions = {
  /** Place or update an evaluation sample hold so its records and evidence snapshots are exempted from clean-up (OCL-12, batch 30). */
  holdsPut: {
    capability_id: "observation.holds.put",
    version: /* @version action.observation.holds.put */ 1,
    operation: "command",
    action: {
      title: "登记评测样本留存",
      description: "为评测样本登记工作记录与证据快照留存，豁免自动到期与手动清理；项目删除与插件清除仍优先",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<ObservationHoldPutInput>()(closedObjectSchema({
        hold_id: token,
        sample_id: token,
        owner: token,
        project_id: nullableToken,
        record_ids: { type: "array", minItems: 1, maxItems: 500, items: token },
        expires_at: nullableToken,
        note: { type: "string", maxLength: OBSERVATION_LIMITS.detail_text },
      }, ["hold_id", "sample_id", "record_ids"])),
      output_schema: closedObjectSchema({
        hold: { type: "object" },
        held_record_ids: { type: "array", items: token },
        missing_record_ids: { type: "array", items: token },
      }),
    },
  } as ActionDefinition<ObservationHoldPutInput, ObservationHoldPutResult>,

  /** Release evaluation sample holds by `hold_id` or `sample_id` so records return to normal retention rules (OCL-12, batch 30). */
  holdsRelease: {
    capability_id: "observation.holds.release",
    version: /* @version action.observation.holds.release */ 1,
    operation: "command",
    action: {
      title: "释放评测样本留存",
      description: "释放已登记的评测样本留存，使关联工作记录回到常规保留期与清理范围",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<ObservationHoldReleaseInput>()(closedObjectSchema({
        hold_id: token,
        sample_id: token,
      }, [])),
      output_schema: closedObjectSchema({
        released_hold_ids: { type: "array", items: token },
        released_record_count: { type: "integer", minimum: 0 },
      }),
    },
  } as ActionDefinition<ObservationHoldReleaseInput, ObservationHoldReleaseResult>,

  /** List evaluation sample holds and their retained space summary (OCL-12, batch 30). */
  holdsList: {
    capability_id: "observation.holds.list",
    version: /* @version action.observation.holds.list */ 1,
    operation: "query",
    action: {
      title: "查看评测样本留存",
      description: "查看当前登记的评测样本留存、覆盖记录数与占用空间",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<ObservationHoldListInput>()(closedObjectSchema({
        project_id: nullableToken,
        sample_id: token,
        include_expired: { type: "boolean" },
      }, [])),
      output_schema: closedObjectSchema({
        holds: { type: "array" },
        summary: closedObjectSchema({
          count: { type: "integer", minimum: 0 },
          bytes: { type: "integer", minimum: 0 },
          retention_days: { type: "integer", minimum: 1 },
        }),
      }),
    },
  } as ActionDefinition<ObservationHoldListInput, ObservationHoldListOutput>,
};
