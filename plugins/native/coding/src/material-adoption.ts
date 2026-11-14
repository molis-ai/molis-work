import { parseArtifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactMaterial, materialSelection, type CodingMaterial } from "./materials.js";

/**
 * Coding's own conversion of its two private values in the current-version adoption of a project library (specs/batch-06-shared-tools/
 * current-version-adoption.md「Coding 私有值」, materials-ui-contract.md): `materials:<session>` (the next round's draft) and
 * `queued:<wait>` (a round the person queued). A piece in the earlier `{ kind, id, title }` shape becomes its exact fixed version when
 * it names one (`kind: "artifact"` with a parseable id), and otherwise a recorded piece with its old subject and title, never a made-up
 * version. A queued round keeps its work id, text and intent; its `materials` stay absent or null when they were (the round then takes
 * the draft, as it always did) and `[]` stays no materials. Returns the value in the current shape, or null when it already is; throws
 * for a value it cannot read, which leaves the project's library as it was.
 */
export function adoptCodingPrivateValue(key: string, value: string): string | null {
  const parsed: unknown = JSON.parse(value);
  if (key.startsWith("materials:")) {
    const converted = convertPieces(parsed);
    return converted === null ? null : JSON.stringify(converted);
  }
  if (key.startsWith("queued:")) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { work_id?: unknown }).work_id !== "string") throw new Error(`排队的轮次 ${key} 无法读取`);
    const queued = parsed as { body?: unknown; work_id: string };
    if (!queued.body || typeof queued.body !== "object" || Array.isArray(queued.body)) throw new Error(`排队的轮次 ${key} 无法读取`);
    const body = queued.body as Record<string, unknown>;
    if (body.materials === undefined || body.materials === null) return null;
    const converted = convertPieces(body.materials);
    return converted === null ? null : JSON.stringify({ ...queued, body: { ...body, materials: converted } });
  }
  return null;
}

/** The pieces in the current shape, or null when none needed converting. */
function convertPieces(value: unknown): CodingMaterial[] | null {
  if (!Array.isArray(value)) throw new Error("材料选择无法读取");
  let changed = false;
  const pieces = value.map(item => {
    if (!item || typeof item !== "object" || "ref" in item || "recorded" in item) return item;
    const { kind, id, title } = item as { kind?: unknown; id?: unknown; title?: unknown };
    if (typeof kind !== "string" || typeof id !== "string" || typeof title !== "string" || Object.keys(item).length !== 3) throw new Error("材料选择无法读取");
    changed = true;
    const version = kind === "artifact" ? parseArtifactSubjectId(id) : null;
    return version ? artifactMaterial(version, title) : { recorded: { kind, id }, title };
  });
  // What comes out must be a selection the current code accepts, or the project is not adopted.
  const current = materialSelection(pieces);
  return changed ? current : null;
}
