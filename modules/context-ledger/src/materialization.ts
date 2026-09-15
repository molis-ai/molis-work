import type {
  ContextAccess, ContextEdge, ContextLedgerApi, ContextMaterializationApi, ContextMaterializedNode,
  ContextObjectRead, ContextRebuildRequest, ObjectRef,
} from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ContextLedgerError, sameRef } from "./service.js";

function identity(ref: ObjectRef): string {
  return JSON.stringify([ref.scope.kind, ref.scope.id, ref.module, ref.object_type ?? null,
    ref.project_id ?? null, ref.id, ref.version]);
}

/** No content store or durable cache: every attempt reads the current authorized owners. */
class ContextMaterializer implements ContextMaterializationApi {
  constructor(private readonly ledger: ContextLedgerApi) {}

  rebuild<T>(access: ContextAccess, request: ContextRebuildRequest,
    read: (ref: ObjectRef, access: ContextAccess) => ContextObjectRead<T>) {
    if (!Number.isSafeInteger(request.max_depth) || request.max_depth < 0
      || !Number.isSafeInteger(request.max_nodes) || request.max_nodes < 1) {
      throw new ContextLedgerError("context.invalid_reference", "上下文遍历需要有效的深度和对象数限制");
    }
    // Validate every root before calling any content owner, including mixed-scope requests.
    for (const root of request.roots) this.ledger.query.list(access, { source: root });
    if (!request.roots.length) this.ledger.query.list(access);
    const pending = request.roots.map((ref) => ({ ref, depth: 0 }));
    const visited = new Set<string>();
    const nodes: ContextMaterializedNode<T>[] = [];
    const edges = new Map<string, ContextEdge>();
    let truncated = false;
    for (let index = 0; index < pending.length; index++) {
      const { ref, depth } = pending[index]!;
      const key = identity(ref);
      if (visited.has(key)) continue;
      if (nodes.length >= request.max_nodes) { truncated = true; break; }
      visited.add(key);
      const result = read(ref, access);
      if (result.state !== "resolved") {
        nodes.push({ requested: ref, ...result });
        continue;
      }
      // Identity references allow the current owner version; exact references never silently upgrade.
      if (!sameRef({ ...ref, version: result.ref.version }, result.ref)
        || (ref.version !== null && result.ref.version !== ref.version)
        || (result.ref.version !== null && (!Number.isSafeInteger(result.ref.version) || result.ref.version < 1))) {
        nodes.push({ requested: ref, state: "stale" });
        continue;
      }
      nodes.push({ requested: ref, ...result });
      if (depth >= request.max_depth) continue;
      const adjacent = [
        ...(request.direction === "outgoing" || request.direction === "both"
          ? this.ledger.query.list(access, { source: ref }) : []),
        ...(request.direction === "incoming" || request.direction === "both"
          ? this.ledger.query.list(access, { target: ref }) : []),
      ].filter((edge) => request.relation_types.includes(edge.type));
      for (const edge of adjacent) {
        edges.set(edge.key, edge);
        const next = sameRef(edge.source, ref) ? edge.target : edge.source;
        if (!visited.has(identity(next))) pending.push({ ref: next, depth: depth + 1 });
      }
    }
    return { nodes, edges: [...edges.values()], truncated };
  }
}

export function createContextMaterializer(ledger: ContextLedgerApi): ContextMaterializationApi {
  return new ContextMaterializer(ledger);
}
