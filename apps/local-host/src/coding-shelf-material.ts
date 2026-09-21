import { createHash } from "node:crypto";
import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ShelfArtifactPreview } from "@molis-ai/molis-work-contracts/modules/shelf";
import { codingChangeSetPreview, codingReportPreview } from "@molis-ai/molis-work-plugin-coding";

const literal = (value: string) => {
  const fence = "`".repeat(Math.max(3, ...(value.match(/`+/g) ?? []).map(item => item.length + 1)));
  return `${fence}\n${value}\n${fence}`;
};
/** Host composes producer validation with Shelf's explicit copy import. */
export function codingShelfMaterial(record: ArtifactVersionRecord, boardId: string, projectPath: string): ShelfArtifactPreview {
  if (record.board_id !== boardId || record.lifecycle_state !== "active") throw new Error("原成果已归档或不属于当前项目");
  const report = codingReportPreview(record), changes = codingChangeSetPreview(record);
  if (!report && !changes) throw new Error("这份成果不是可接收的 Coding 固定报告或固定变更");
  const value = report ?? changes!;
  const source = { board_id: boardId, project_path: projectPath, reference: value.reference,
    producer_plugin_id: record.producer_plugin_id, content_hash: createHash("sha256").update(JSON.stringify(record.payload)).digest("hex") };
  const heading = `# ${value.title}\n\n这是 Coding 固定成果的 Shelf 副本，不代表当前工作区状态或目标验收。编辑副本不改变原成果。\n来源：${source.reference.artifact_id} v${source.reference.version}\n保存时间：${value.saved_at}\n\n`;
  const text = heading + (report ? report.body_markdown : changes!.change.files.map((file, index) => {
    const review = file.review;
    const decisions = { pending: "待审", approved: "已批准", rejected: "已拒绝", cancelled: "已取消", expired: "已过期" };
    const executions = { applied: "已执行", failed: "执行失败", unknown: "执行结果未知", "not-applied": "未执行" };
    return `## 修改 ${index + 1} · ${file.path}\n\n` + (review
      ? `批准决定：${decisions[review.decision]}；保存时执行状态：${executions[review.execution]}\n原审查：${review.review_id}\n\n修改前${review.before_text === null ? "（文件不存在）" : ""}：\n${literal(review.before_text ?? "")}\n\n修改后：\n${literal(review.after_text)}`
      : `旧版局部差异（不是完整文件）：\n${literal(file.diff)}`);
  }).join("\n\n") + (changes!.change.files.length ? "" : "这一轮没有可读取的文本审查；命令及外部操作请查看原回执。"));
  const fingerprint = createHash("sha256").update(JSON.stringify({ title: value.title, text, source })).digest("hex");
  return { title: value.title, text, source, fingerprint };
}
