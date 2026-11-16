import {
  readHeldSecretMaterialInMemory,
  stagePreparedHeldSecretReference,
  type PreparedHeldSecretInMemory,
} from "./context-onboarding-documents.js";
import { includedContextFiles } from "./context-onboarding-sources.js";
import type {
  ContextJourney,
  ContextModelFailureKind,
  ContextReference,
  ContextSource,
  HeldSecretMaterial,
  SecretSendDecision,
} from "./context-onboarding-store.js";

/** Classifies model/provider failures into actionable categories while preserving the raw bounded `error` message (`ONB-41`, `C9`). */
export function classifyContextModelFailure(error: unknown, needsModel = false): ContextModelFailureKind {
  if (needsModel) return "auth";
  const rec = error && typeof error === "object"
    ? error as { code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown; message?: unknown }
    : null;
  const status = typeof rec?.status === "number" ? rec.status : typeof rec?.statusCode === "number" ? rec.statusCode : 0;
  const code = typeof rec?.code === "string" ? rec.code : "";
  const name = typeof rec?.name === "string" ? rec.name : "";
  const msg = error instanceof Error ? error.message : typeof rec?.message === "string" ? rec.message : "";
  if (status === 401 || status === 403 || /\b(?:401|403|unauthorized|forbidden|invalid[_ -]?api[_ -]?key|authentication|api[_ -]?key)\b|密钥无效|鉴权|未授权|权限不足/iu.test(code + " " + msg)) {
    return "auth";
  }
  if (status === 429 || status === 402 || /\b(?:429|402|rate[_ -]?limit|quota|billing|insufficient[_ -]?quota|too many requests)\b|额度|限流|配额|频率|余额/iu.test(code + " " + msg)) {
    return "rate_limit";
  }
  if (code === "agent.inference.empty" || code === "MODEL_STRUCTURED_INVALID" || /^(?:模型没有返回(?:有效摘要|正文|文字)|模型返回的结构不符合要求|摘要缺少有效来源)/u.test(msg)) {
    return "invalid_output";
  }
  if (name === "AbortError" || name === "TimeoutError" || /\b(?:ETIMEDOUT|UND_ERR_HEADERS_TIMEOUT|timeout|timed[_ -]?out|deadline)\b/iu.test(code + " " + msg) || (msg.includes("超时") && !msg.startsWith("模型请求失败或超时"))) {
    return "timeout";
  }
  if (/\b(?:ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|network error)\b|无法连接|连接失败|网络错误/iu.test(code + " " + msg)) {
    return "connection";
  }
  if (/\b(?:context[_ -]?length|maximum context|token limit|prompt is too long)\b|分批整理结果过长|未能归纳长材料|上下文过长|超出.*窗口/iu.test(code + " " + msg)) {
    return "context_limit";
  }
  return "unknown";
}

function cleanReusedReference(ref: ContextReference): ContextReference {
  const copy = { ...ref };
  delete copy.duplicate_of;
  delete copy.used_in_summary;
  return copy;
}

/** Retains staged upload digests and unchanged already-read file references across scope edits (`ONB-36`, `ONB-40`, `C6`, `C7`). */
export function mergeSourceIncrementally(previous: ContextSource | undefined, next: ContextSource): ContextSource {
  if (!previous) {
    const firstDigests: Record<string, string> = { ...(next.staged_digests ?? {}) };
    for (const item of next.files ?? []) {
      if (item.staged) firstDigests[item.path] = item.staged;
    }
    return Object.keys(firstDigests).length ? { ...next, staged_digests: firstDigests } : next;
  }
  const mergedDigests: Record<string, string> = { ...(previous.staged_digests ?? {}), ...(next.staged_digests ?? {}) };
  for (const item of [...(previous.files ?? []), ...(next.files ?? [])]) {
    if (item.staged) mergedDigests[item.path] = item.staged;
  }
  for (const r of [...(previous.references ?? []), ...(previous.reused_references ?? [])]) {
    if (r.original?.sha256) mergedDigests[r.path] ??= r.original.sha256;
  }
  const prevMeta = new Map((previous.metadata?.files ?? []).map(f => [f.path, f]));
  if (next.metadata) {
    const nextMeta = new Map(next.metadata.files.map(f => [f.path, f]));
    for (const p of Object.keys(mergedDigests)) {
      const nf = nextMeta.get(p);
      const pf = prevMeta.get(p);
      if (!nf || (pf && (pf.size !== nf.size || pf.modified_ms !== nf.modified_ms))) {
        delete mergedDigests[p];
      }
    }
  }
  const withDigests = Object.keys(mergedDigests).length ? { ...next, staged_digests: mergedDigests } : next;
  const scope = (s: ContextSource) => JSON.stringify([s.path, s.files, s.text, s.url, s.connection_id, s.days, s.metadata?.files, s.excluded]);
  if (scope(previous) === scope(next)) {
    return { ...previous, ...withDigests };
  }
  if (next.kind === "browser" || next.kind === "gmail" || (previous.path && next.path && previous.path !== next.path)) {
    return withDigests;
  }
  const knownRefs = [
    ...(previous.references ?? []),
    ...(previous.reused_references ?? []),
    ...(previous.reading?.references ?? []),
  ];
  if (!knownRefs.length) return withDigests;
  if (withDigests.metadata) {
    const targets = includedContextFiles(withDigests);
    const matched: ContextReference[] = [];
    let allMatched = targets.length > 0;
    for (const t of targets) {
      const digest = withDigests.staged_digests?.[t.path];
      const pf = prevMeta.get(t.path);
      const unchangedMeta = !pf || (pf.size === t.size && pf.modified_ms === t.modified_ms);
      const found = unchangedMeta ? knownRefs.find(r => r.path === t.path && (digest ? r.original.sha256 === digest : r.original.size_bytes === t.size)) : undefined;
      if (found) matched.push(cleanReusedReference(found));
      else allMatched = false;
    }
    const keptIssues = (previous.issues ?? []).filter(iss => targets.some(t => t.path === iss.path));
    const keptSecrets = (previous.held_secrets ?? []).filter(h => targets.some(t => t.path === h.path));
    if (allMatched && keptSecrets.length === 0 && keptIssues.length === 0) {
      return { ...withDigests, references: matched, issues: [], skipped: 0, files: undefined, reused_references: undefined };
    }
    if (matched.length > 0 || keptSecrets.length > 0) {
      return {
        ...withDigests,
        ...(matched.length > 0 ? { reused_references: matched } : {}),
        ...(keptSecrets.length > 0 ? { held_secrets: keptSecrets } : {}),
      };
    }
    return withDigests;
  }
  if (withDigests.files?.length) {
    const matched: ContextReference[] = [];
    let allMatched = true;
    for (const f of withDigests.files) {
      const found = f.staged ? knownRefs.find(r => r.path === f.path && r.original.sha256 === f.staged) : undefined;
      if (found) matched.push(cleanReusedReference(found));
      else allMatched = false;
    }
    if (allMatched) {
      return { ...withDigests, references: matched, issues: [], skipped: 0, files: undefined, reused_references: undefined };
    }
    if (matched.length > 0) return { ...withDigests, reused_references: matched };
  }
  return withDigests;
}

export function readScopePathTags(sources: readonly ContextSource[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    if (!s.selected) continue;
    if (s.kind === "gmail") {
      if (s.connection_id || s.references?.length || s.issues?.length || s.held_secrets?.length) {
        out.push(`gmail:Gmail（最近 ${s.days === 7 ? 7 : 30} 天）`);
      }
    } else if (s.kind === "browser") {
      if (s.text?.trim() || s.references?.length) {
        out.push("browser:网页内容.md");
      }
    } else if (s.metadata) {
      for (const f of includedContextFiles(s)) out.push(`${s.kind}:${f.path}`);
    } else if (s.files?.length) {
      for (const f of s.files) out.push(`${s.kind}:${f.path}`);
    } else if (s.references?.length || s.held_secrets?.length || s.issues?.length) {
      const seen = new Set<string>();
      for (const p of [
        ...(s.references ?? []).map(r => r.path),
        ...(s.held_secrets ?? []).map(h => h.path),
        ...(s.issues ?? []).map(iss => iss.path),
      ]) {
        if (!p || seen.has(p)) continue;
        seen.add(p);
        out.push(`${s.kind}:${p}`);
      }
    }
  }
  return out;
}

/** Computes the incremental scope delta card payload (`ONB-40`, `ONB-42`, `C7`). */
export function computeScopeDelta(journey: ContextJourney): ContextJourney["scope_delta"] {
  const prev = journey.last_read_paths;
  if (!prev?.length) return null;
  const prevSet = new Set(prev);
  const current = readScopePathTags(journey.sources);
  const currSet = new Set(current);
  const stripKind = (tag: string) => tag.slice(tag.indexOf(":") + 1);
  const added = current.filter(t => !prevSet.has(t)).map(stripKind);
  const removed = prev.filter(t => !currSet.has(t)).map(stripKind);
  const reused = current.filter(t => prevSet.has(t)).length;
  if (!added.length && !removed.length && !journey.summary && !journey.stale_summary) return null;
  return {
    added: added.slice(0, 20),
    added_count: added.length,
    removed: removed.slice(0, 20),
    removed_count: removed.length,
    reused,
    previous_model: journey.model,
  };
}

/** Deduplicates identical extracted text across overlapping sources while tagging duplicate copies (`ONB-35`). */
export function deduplicateSelectedReferences(selectedSources: readonly ContextSource[]): ContextReference[] {
  const seenContent = new Map<string, ContextReference>();
  const unique: ContextReference[] = [];
  for (const source of selectedSources) {
    for (const ref of source.references ?? []) {
      const contentDigest = `${ref.text.sha256}:${ref.secret_mode ?? ""}`;
      const first = seenContent.get(contentDigest);
      if (first) {
        ref.duplicate_of = first.path;
        ref.label = first.label;
      } else {
        delete ref.duplicate_of;
        const labeled = { ...ref, label: "S" + (unique.length + 1) };
        ref.label = labeled.label;
        seenContent.set(contentDigest, labeled);
        unique.push(labeled);
      }
    }
  }
  return unique;
}

/** Prepares stripped/raw material in memory without disk or store writes so cancelled callers leave zero trace (`S-onboarding-secret-hold`). */
export async function prepareHeldSecretDecision(
  home: string,
  journey: Readonly<ContextJourney>,
  secretKey: string,
  decision: SecretSendDecision,
  signal?: AbortSignal,
): Promise<{ readonly prepared?: PreparedHeldSecretInMemory }> {
  signal?.throwIfAborted();
  let heldItem: HeldSecretMaterial | undefined;
  for (const s of journey.sources) {
    heldItem = s.held_secrets?.find(h => h.key === secretKey) ?? s.reading?.held_secrets?.find(h => h.key === secretKey);
    if (heldItem) break;
  }
  if (!heldItem || decision === "exclude") return {};
  const prepared = await readHeldSecretMaterialInMemory(home, journey.id, heldItem, decision, signal);
  signal?.throwIfAborted();
  return { prepared };
}

export async function stageHeldSecretDecision(
  home: string,
  journeyId: string,
  prepared: PreparedHeldSecretInMemory,
): Promise<Awaited<ReturnType<typeof stagePreparedHeldSecretReference>>> {
  return stagePreparedHeldSecretReference(home, journeyId, prepared);
}

/** Commits a user's `strip` | `raw` | `exclude` choice to a held secret material (`C2`, `S-onboarding-secret-hold`). */
export function commitHeldSecretDecision(
  journey: ContextJourney,
  secretKey: string,
  decision: SecretSendDecision,
  staged?: Awaited<ReturnType<typeof stagePreparedHeldSecretReference>>,
): void {
  journey.secret_decisions = { ...(journey.secret_decisions ?? {}), [secretKey]: decision };
  let heldSource: ContextSource | null = null;
  for (const s of journey.sources) {
    const idx = s.held_secrets?.findIndex(h => h.key === secretKey) ?? -1;
    if (idx >= 0 && s.held_secrets) {
      s.held_secrets.splice(idx, 1);
      if (!s.held_secrets.length) s.held_secrets = undefined;
      heldSource = s;
      break;
    }
    const rIdx = s.reading?.held_secrets?.findIndex(h => h.key === secretKey) ?? -1;
    if (rIdx >= 0 && s.reading?.held_secrets) {
      s.reading.held_secrets.splice(rIdx, 1);
      heldSource = s;
      break;
    }
  }
  if (!heldSource || decision === "exclude" || !staged) return;
  if ("reference" in staged) {
    if (heldSource.references) heldSource.references.push(staged.reference);
    else if (heldSource.reading) heldSource.reading.references.push(staged.reference);
    else heldSource.references = [staged.reference];
  } else if ("issue" in staged) {
    (heldSource.issues ??= []).push(staged.issue);
    heldSource.skipped = heldSource.issues.length;
  }
}
