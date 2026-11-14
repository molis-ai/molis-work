import { bindActionHandler, bindArtifactPreview, defineArtifactPreviewAction, nextPinnedVersion, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import { WORK_BRIEF_READ, workBriefActions } from "./actions.js";
import type { BriefPorts } from "./briefs.js";
import { workBriefErrors } from "./error.js";
import { BRIEF_ARTIFACT_SCHEMA_VERSION, BRIEF_ARTIFACT_TYPE_ID, BRIEF_KIND } from "./identity.js";
import type { BriefFixed, BriefVersion } from "./model.js";

export const briefArtifactPreview = defineArtifactPreviewAction("work-brief.artifacts.preview", /* @version action.work-brief.artifacts.preview */ 1, "简报", [...WORK_BRIEF_READ]);

/** What a fixed version keeps: the words and what they stood on then. Everything is stored data; nothing is read again to show it. */
interface FixedPayload { title: string; version: number; as_of: string; claims: Array<{ text: string; cites: Array<{ kind: string; id: string; title: string; revision: string }>; supplied_by?: "owner" }>;
  sources: Array<{ name: string; read: string; read_at?: string }>; attention: Array<{ kind: string; id: string; why: string }>; next: Array<{ text: string; why: string }> }

function payloadOf(title: string, version: BriefVersion): FixedPayload {
  return { title, version: version.version, as_of: version.as_of,
    claims: version.claims.map(claim => ({ text: claim.text, cites: claim.cites.map(cite => ({ ...cite.subject, title: cite.title, revision: cite.revision })),
      ...(claim.supplied_by ? { supplied_by: claim.supplied_by } : {}) })),
    sources: version.sources.map(row => ({ name: row.name, read: row.read, ...(row.read_at ? { read_at: row.read_at } : {}) })),
    attention: version.attention.map(item => ({ ...item.subject, why: item.why })), next: version.next.map(option => ({ text: option.text, why: option.why })) };
}

/** The fixed version as Markdown: sentences with their numbered bases, then what waited and what was proposed. Text only, no markup of its own. */
function markdownOf(payload: FixedPayload): string {
  const lines = [`# ${payload.title}`, "", `as of ${payload.as_of} · v${payload.version}`, ""];
  const notes: string[] = [];
  for (const claim of payload.claims) {
    const marks = claim.cites.map(cite => { notes.push(`${notes.length + 1}. ${cite.title} (${cite.kind}, r${cite.revision})`); return `[${notes.length}]`; }).join("");
    lines.push(`- ${claim.text}${marks ? " " + marks : ""}`);
  }
  if (payload.attention.length) lines.push("", ...payload.attention.map(item => `- ! ${item.why}`));
  if (payload.next.length) lines.push("", ...payload.next.map(option => `- → ${option.text}: ${option.why}`));
  if (payload.sources.length) lines.push("", ...payload.sources.map(row => `- ${row.name}: ${row.read}${row.read_at ? " @ " + row.read_at : ""}`));
  if (notes.length) lines.push("", ...notes);
  return lines.join("\n") + "\n";
}

export const briefArtifactPreviewHandler = bindArtifactPreview(briefArtifactPreview, BRIEF_ARTIFACT_TYPE_ID, artifact => {
  const payload = artifact.payload as FixedPayload | null;
  if (!payload || !Array.isArray(payload.claims)) throw workBriefErrors.not_found("这一版成果的内容不完整");
  return { media_type: "text/markdown", text: markdownOf({ ...payload, sources: payload.sources ?? [], attention: payload.attention ?? [], next: payload.next ?? [] }) };
});

/**
 * Fixes a version: the brief's row and the artifact version commit in one transaction with the project's 成果库 (`artifact_join`), so
 * neither exists without the other. Versions are append-only, so the version read before the transaction is the one fixed in it.
 */
export function createFixHandlers(ports: BriefPorts, database: PluginDatabase, artifacts: PluginArtifactClient | undefined, signature: string): ActionHandlerBinding[] {
  return [
    briefArtifactPreviewHandler,
    bindActionHandler(workBriefActions.fix, async ({ brief_id, version, expected_revision }, caller) => {
      const { brief, shown } = ports.read(store => { const brief = store.get(brief_id); return { brief, shown: store.version(brief, version ?? brief.current_version) }; });
      if (!shown) throw workBriefErrors.not_found("这一版已不存在", { brief_id, version });
      const done = brief.fixed[String(shown.version)];
      if (done) return { brief, version: shown, artifact: { artifact_id: done.artifact_id, version: done.artifact_version } };
      const join = artifacts?.join;
      if (!database.transactionProjectRow || !artifacts || !join) throw workBriefErrors.unavailable("当前环境不能发出成果");
      await caller.beforeEffect();
      const artifactId = "work-brief-" + brief_id, at = ports.now();
      const fixed = await database.transactionProjectRow(brief_id, row => {
        const current = row.read();
        if (!current || Number(current.version) !== expected_revision) throw workBriefErrors.conflict("简报刚被别处更新，请重新读取后再试", { brief_id });
        return join(row, writer => {
          const head = writer.head(artifactId), written = Math.max(Number(current.artifact_version), head?.version ?? 0);
          const previous = written > 0 ? artifacts.readOwn({ artifact_id: artifactId, version: written }) : null;
          if (previous && (previous.artifact_type_id !== BRIEF_ARTIFACT_TYPE_ID || previous.producer_binding_signature !== signature || previous.origin.kind !== "pinned"
            || previous.origin.subject.kind !== BRIEF_KIND || previous.origin.subject.id !== brief_id)) throw workBriefErrors.conflict("成果来源或类型不一致，原记录已保留");
          const next = nextPinnedVersion({ recorded: Number(current.artifact_version), pending: null, head });
          const title = brief.title || "Work Brief";
          const { artifact } = writer.publish({ artifact_id: artifactId, version: next, artifact_type_id: BRIEF_ARTIFACT_TYPE_ID, schema_version: BRIEF_ARTIFACT_SCHEMA_VERSION,
            content: { kind: "inline", payload: JSON.parse(JSON.stringify(payloadOf(title, shown))) }, metadata: { brief_id, brief_version: shown.version, title },
            origin: { kind: "pinned", subject: { kind: BRIEF_KIND, id: brief_id }, revision: String(shown.version) }, title, media_type: "application/json",
            supersedes_version: next > 1 ? next - 1 : null });
          const mark: BriefFixed = { artifact_id: artifact.artifact_id, artifact_version: artifact.version, at };
          if (!row.compareAndSet(expected_revision, { updated_at: at, fixed_json: JSON.stringify({ ...brief.fixed, [String(shown.version)]: mark }) }))
            throw workBriefErrors.conflict("固定时简报已变化，请重新读取", { brief_id });
          return mark;
        });
      });
      const after = ports.read(store => store.get(brief_id));
      return { brief: after, version: { ...shown, fixed }, artifact: { artifact_id: fixed.artifact_id, version: fixed.artifact_version } };
    }),
  ];
}
