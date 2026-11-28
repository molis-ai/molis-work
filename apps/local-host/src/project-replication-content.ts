import { createHash } from "node:crypto";
import type {
  ProjectReplicaDefinition,
  ProjectReplicaRows,
  SyncBlobReference,
  SyncContentCodec,
} from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { createSyncJsonContent } from "@molis-ai/molis-work-plugin-sdk";
import {
  createEvidenceContentStore,
  createLazyFileSecretStore,
  PROJECT_SECTIONS_INLINE_ENCODING,
  runWithMolisWorkHome,
  validateProjectReplicaRows,
} from "@molis-ai/molis-work-storage";
import { replicaError } from "./project-replication-errors.js";

const pattern = /^molis-work-evidence\/sha256\/([a-f0-9]{64})$/;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw replicaError("replica_invalid");
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw replicaError("replica_invalid");
  }
}


/** Explicit owner references only. Plain bytes travel; encryption keys and device paths never do. */
export function createProjectEvidenceContent(
  home: string,
  definitions: readonly ProjectReplicaDefinition[],
  kind: string,
  spaceId: string,
  authorize: () => void,
): SyncContentCodec {
  // The evidence bodies sit where storage keeps them for this Home (`security/evidence`, BL-b44-feed-home-dir-and-styles).
  const store = runWithMolisWorkHome(home, () =>
    createEvidenceContentStore({ secretStore: createLazyFileSecretStore(home) }),
  );
  const inspect = (key: string, input: unknown) => {
    authorize();
    const parts: unknown = JSON.parse(key);
    const wire = object(input);
    const project = object(wire.project);
    const facts = object(wire.facts);
    if (
      !Array.isArray(parts)
      || parts.length !== 3
      || parts[1] !== kind
      || parts[0] !== parts[2]
      || typeof parts[0] !== "string"
      || !parts[0]
      || parts[0].length > 80
      || wire.format !== PROJECT_SECTIONS_INLINE_ENCODING.format
      || wire.spaceId !== spaceId
      || project.id !== parts[0]
      || typeof project.title !== "string"
      || !project.title.trim()
      || project.title.length > 120
    ) {
      throw replicaError("replica_scope_mismatch");
    }
    exact(project, ["id", "title"]);
    exact(facts, definitions.map((definition) => definition.id));
    const refs = new Set<string>();
    const validatedFacts: Record<string, ProjectReplicaRows> = {};
    for (const definition of definitions) {
      const rows = validateProjectReplicaRows(facts[definition.id], definition, parts[0]);
      definition.validate(rows, parts[0]);
      validatedFacts[definition.id] = rows;
      for (const ref of definition.contentRefs?.(rows, parts[0]) ?? []) {
        if (!pattern.test(ref)) {
          throw replicaError("replica_references_invalid");
        }
        refs.add(ref);
      }
    }
    return { projectId: parts[0], wire, refs: [...refs].sort(), facts: validatedFacts };
  };
  const codec = createSyncJsonContent({
    spaceId,
    authorize,
    project(key, input, put) {
      const { wire, refs } = inspect(key, input);
      exact(wire, ["format", "spaceId", "project", "facts"]);
      if (!refs.length) return input;
      const evidence = refs.map((reference) => {
        authorize();
        let body: string;
        try {
          body = store.read(reference);
        } catch {
          throw replicaError("replica_content_unavailable");
        }
        authorize();
        const bytes = Buffer.from(body);
        if (bytes.length > 1024 * 1024 || digest(bytes) !== pattern.exec(reference)![1]) {
          throw replicaError("replica_invalid");
        }
        return { reference, blob: bytes.length ? put(bytes) : null };
      });
      return { ...wire, evidence };
    },
  });
  return {
    encode: codec.encode,
    async decode(key, input, read) {
      const decoded = await codec.decode(key, input, read);
      authorize();
      const { wire, refs } = inspect(key, decoded);
      if (!refs.length) {
        exact(wire, ["format", "spaceId", "project", "facts"]);
        return decoded;
      }
      exact(wire, ["format", "spaceId", "project", "facts", "evidence"]);
      if (!Array.isArray(wire.evidence) || wire.evidence.length !== refs.length) {
        throw replicaError("replica_references_invalid");
      }
      let total = 0;
      const entries = wire.evidence.map((value, index) => {
        const entry = object(value);
        exact(entry, ["reference", "blob"]);
        if (entry.reference !== refs[index]) {
          throw replicaError("replica_references_invalid");
        }
        let blob: SyncBlobReference | null = null;
        if (entry.blob !== null) {
          const blobValue = object(entry.blob);
          exact(blobValue, ["digest", "size"]);
          if (
            blobValue.digest !== pattern.exec(refs[index]!)![1]
            || !Number.isSafeInteger(blobValue.size)
            || Number(blobValue.size) < 1
            || Number(blobValue.size) > 1024 * 1024
          ) {
            throw replicaError("replica_references_invalid");
          }
          blob = { digest: String(blobValue.digest), size: Number(blobValue.size) };
          total += blob.size;
        } else if (pattern.exec(refs[index]!)![1] !== digest(new Uint8Array())) {
          throw replicaError("replica_references_invalid");
        }
        return { reference: refs[index]!, blob };
      });
      if (total > 100000000) {
        throw replicaError("replica_limit");
      }
      const bodies: Uint8Array[] = [];
      for (const entry of entries) {
        authorize();
        const bytes = entry.blob ? await read(entry.blob) : new Uint8Array();
        authorize();
        if (bytes.length !== (entry.blob?.size ?? 0) || digest(bytes) !== pattern.exec(entry.reference)![1]) {
          throw replicaError("replica_invalid");
        }
        bodies.push(bytes);
      }
      const texts = bodies.map((bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      authorize();
      for (let n = 0; n < entries.length; n++) {
        authorize();
        if (store.write(texts[n]!).contentRef !== entries[n]!.reference) {
          throw replicaError("replica_invalid");
        }
      }
      authorize();
      const { evidence: _evidence, ...value } = wire;
      return value;
    },
  };
}
