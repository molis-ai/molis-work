import type { DatabaseSync } from "node:sqlite";
import {
  type ChoiceCriterion,
  type FunctionActionMap,
  type FunctionCriteria,
  type FunctionRecord,
  type FunctionSample,
  type FunctionSceneMap,
  type FunctionsPreviewRecord,
  type FunctionsPrimitive,
  isFunctionDestinationId,
  type NoulCriteria,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { hashFunctionConfig } from "./hash.js";
import { defaultCriteria, isRecord, normalizeCriteria, normalizeSubjectKinds } from "./record-rules.js";

export interface FunctionRow {
  id: string;
  name: string;
  function_key: string;
  primitive: string;
  status: string;
  version: number | null;
  model: string;
  instructions: string;
  criteria_json: string;
  scene_id: string | null;
  scene_version: number | null;
  scene_provider_id: string | null;
  subject_kinds_json: string | null;
  scene_map_json: string | null;
  action_map_json: string | null;
  config_hash: string;
  last_preview_json: string | null;
  samples_json: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export function insert(db: DatabaseSync, record: FunctionRecord): void {
  db.prepare(`
    INSERT INTO functions (
      id, name, function_key, primitive, status, version, model, instructions, criteria_json,
      scene_id, scene_version, scene_provider_id, subject_kinds_json, scene_map_json, action_map_json, config_hash, last_preview_json, samples_json, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.name,
    record.function_key,
    record.primitive,
    record.status,
    record.version,
    record.model,
    record.instructions,
    JSON.stringify(record.criteria),
    record.scene_id,
    record.scene_version ?? null,
    record.scene_provider_id ?? null,
    JSON.stringify(record.subject_kinds),
    JSON.stringify(record.scene_map),
    JSON.stringify(record.action_map ?? {}),
    record.config_hash,
    record.last_preview ? JSON.stringify(record.last_preview) : null,
    JSON.stringify(record.samples),
    record.published_at,
    record.created_at,
    record.updated_at,
  );
}

export function fromRow(row: FunctionRow): FunctionRecord {
  const primitive = parsePrimitive(row.primitive);
  const criteria = parseCriteria(primitive, row.criteria_json);
  return buildRecord({
    id: row.id,
    name: row.name,
    function_key: row.function_key,
    primitive,
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    model: row.model,
    scene_id: parseSceneId(row.scene_id),
    scene_version: row.scene_version ?? null,
    scene_provider_id: row.scene_provider_id ?? null,
    subject_kinds: parseSubjectKinds(row.subject_kinds_json),
    scene_map: parseSceneMap(row.scene_map_json),
    action_map: row.action_map_json ? JSON.parse(row.action_map_json) as FunctionActionMap : {},
    instructions: row.instructions,
    criteria,
    last_preview: parsePreview(row.last_preview_json, primitive),
    samples: parseSamples(row.samples_json),
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function buildRecord(input: {
  id: string;
  name: string;
  function_key: string;
  primitive: FunctionsPrimitive;
  status: FunctionRecord["status"];
  version: number | null;
  model: string;
  instructions: string;
  criteria: FunctionCriteria;
  scene_id: string | null;
  scene_version?: number | null;
  scene_provider_id?: string | null;
  subject_kinds: readonly string[];
  scene_map: FunctionSceneMap;
  action_map?: FunctionActionMap;
  last_preview: FunctionsPreviewRecord | null;
  samples: readonly FunctionSample[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}): FunctionRecord {
  const base = {
    id: input.id,
    name: input.name,
    function_key: input.function_key,
    status: input.status,
    version: input.version,
    model: input.model,
    instructions: input.instructions,
    scene_id: input.scene_id,
    scene_version: input.scene_version ?? null,
    scene_provider_id: input.scene_provider_id ?? null,
    subject_kinds: input.subject_kinds,
    scene_map: input.scene_map,
    action_map: input.action_map ?? {},
    config_hash: hashFunctionConfig({
      primitive: input.primitive,
      instructions: input.instructions,
      criteria: input.criteria,
      model: input.model,
    }),
    last_preview: input.last_preview,
    samples: input.samples,
    published_at: input.published_at,
    created_at: input.created_at,
    updated_at: input.updated_at,
  };
  if (input.primitive === "noul") {
    return { ...base, primitive: "noul", criteria: input.criteria as NoulCriteria };
  }
  if (input.primitive === "score") {
    return { ...base, primitive: "score", criteria: input.criteria as readonly string[] };
  }
  return { ...base, primitive: "choice", criteria: input.criteria as readonly ChoiceCriterion[] };
}

function parsePrimitive(value: string): FunctionsPrimitive {
  if (value === "noul" || value === "score") return value;
  return "choice";
}

function parseCriteria(primitive: FunctionsPrimitive, raw: string): FunctionCriteria {
  try {
    return normalizeCriteria(primitive, JSON.parse(raw) as FunctionCriteria, false);
  } catch {
    return defaultCriteria(primitive);
  }
}

function parsePreview(raw: string | null, primitive: FunctionsPrimitive): FunctionsPreviewRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const outcome = value.outcome === "needs_review" ? "needs_review" : "ok";
    return {
      input: typeof value.input === "string" ? value.input : "",
      outcome,
      primitive: parsePrimitive(typeof value.primitive === "string" ? value.primitive : primitive),
      choice: typeof value.choice === "string" ? value.choice : null,
      noul: typeof value.noul === "number" ? value.noul : null,
      score: typeof value.score === "number" ? value.score : null,
      legend: Array.isArray(value.legend) ? value.legend.filter((item): item is string => typeof item === "string") : null,
      probabilities: isRecord(value.probabilities)
        ? Object.fromEntries(Object.entries(value.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
        : {},
      confidence: typeof value.confidence === "number" ? value.confidence : null,
      model: typeof value.model === "string" ? value.model : "",
      config_hash: typeof value.config_hash === "string" ? value.config_hash : "",
      at: typeof value.at === "string" ? value.at : "",
    };
  } catch {
    return null;
  }
}

function parseSamples(raw: string | null): FunctionSample[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.input !== "string") return [];
      return [{
        id: row.id,
        label: typeof row.label === "string" ? row.label : "",
        input: row.input,
      }];
    });
  } catch {
    return [];
  }
}

function parseSceneId(value: string | null | undefined): string | null {
  if (!value || !isFunctionDestinationId(value)) return null;
  return value;
}

function parseSubjectKinds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return normalizeSubjectKinds(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function parseSceneMap(raw: string | null | undefined): FunctionSceneMap {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return {};
    const mapped: Record<string, string> = {};
    for (const [rawKey, rawTarget] of Object.entries(value)) {
      const key = rawKey.trim();
      const target = typeof rawTarget === "string" ? rawTarget.trim() : "";
      if (!key || !target) continue;
      mapped[key] = target;
    }
    return mapped;
  } catch {
    return {};
  }
}
