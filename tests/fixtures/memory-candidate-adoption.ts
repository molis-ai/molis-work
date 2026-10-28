import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { characterOwner } from "@molis-ai/molis-work-service-memory";

/** The owner is stopped. Historical shape-1 candidates enter through public Store, then public offline adoption. */
export async function seedLegacyCandidate(input: { home: string; storageRoot: string; project: string; id: string; at: number;
  meta?: Record<string, unknown>; formalExpiry?: string | null; supersedes?: string | null; sessionBound?: boolean;
  work?: { work_id: string; title: string }; character?: { id: string; title: string }; personal?: boolean }) {
  const requireSdk = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const scope = input.personal ? { scope: "user" as const, owner: LOCAL_PERSON_ACTOR_ID }
    : input.character ? { scope: "character" as const, owner: characterOwner(input.project, input.character.id) }
    : { scope: "project" as const, owner: input.project };
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: input.storageRoot }) });
  const text = `Historical suggestion ${input.id}`, owner = `${scope.scope}-${encodeURIComponent(scope.owner).replaceAll("%", "_")}`;
  try {
    const session = input.sessionBound ? await runtime.sessions.create() : undefined;
    await runtime.store.commit({ kind: "memory-candidates", id: `owner.${owner}.${input.id}.v1`, expectedVersion: 0,
      metadata: { scope: `owner.${owner}`, rowId: input.id, version: 1, state: "active", shape: 1 },
      secureBody: new TextEncoder().encode(JSON.stringify({ id: input.id, ...scope, text, origin: "Historical suggestion", tags: [],
        meta: { kind: "convention", ...input.meta, ...(session ? { sessionRef: session.ref } : {}) }, state: "pending", createdAtMs: input.at })) });
  } finally { await runtime.shutdown(); }
  const adoption = await openPrologueMemoryAdoption({ appVersion: "1.0.0", storageRoot: input.storageRoot,
    scopes: [scope], policy: memoryRuntimePolicy(() => undefined).policy });
  try {
    const result = await adoption.adopt({ kind: "memory-candidate", ...scope });
    assert.deepEqual(result.issues, []); assert.ok(result.items.every(item => item.outcome !== "needs-reconcile"));
  } finally { await adoption.close(); }
  const ledger = openMemoryLedger({ homeDirectory: input.home });
  try {
    if (input.character) ledger.noteOwner({ scope: "character", owner: scope.owner, project_id: input.project, title: input.character.title, subject: input.character.id });
    ledger.saveCandidate({ actor_id: LOCAL_PERSON_ACTOR_ID, ...scope, scope: input.personal ? "personal" : scope.scope as "project" | "character", project_id: input.personal ? null : input.project,
      candidate_id: input.id, version: 1, kind: "convention", text, applies: {}, basis: "inferred", why: "Historical note, not source evidence",
      from: "extraction", work: input.work ?? null, hold_reason: null, supersedes: input.supersedes ?? null, state: "pending",
      created_at: new Date(input.at).toISOString(), memory_id: null,
      ...(input.formalExpiry === undefined ? {} : { formal_expires_at: input.formalExpiry }) });
  } finally { ledger.close(); }
  return text;
}
