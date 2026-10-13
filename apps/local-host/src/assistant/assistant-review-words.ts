import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

/** The changed middle of a text, as - and + lines: what an approval of this edit actually lets happen. */
function changedLines(before: string | null, after: string): string {
  const a = (before ?? "").split("\n"), b = after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const removed = a.slice(head, a.length - tail).map(line => `- ${line}`), added = b.slice(head, b.length - tail).map(line => `+ ${line}`);
  const lines = [...(head ? [`@@ 第 ${head + 1} 行起`] : []), ...removed, ...added];
  const text = lines.join("\n");
  return text.length > 6000 ? `${text.slice(0, 6000)}\n…（其余改动见 Coding 页面）` : text || "（内容没有变化）";
}

/** A held effect in the person's words, by what it is: a business change, a file edit, a command, an MCP call, a rewind. */
export function describeReview(document: AgentReviewRequest["document"]): { summary: string; fields: Array<{ label: string; value: string }> } {
  switch (document.kind) {
    case "tool-operation": return { summary: document.summary, fields: document.fields.map(field => ({ label: field.label, value: field.value })) };
    case "text-edit": return { summary: `${document.exists ? "修改文件" : "新建文件"} ${document.target_path}`,
      fields: [{ label: "改动", value: changedLines(document.before_text, document.after_text) }, ...(document.concurrent?.length ? [{ label: "注意", value: `另有会话正在改这个文件：${document.concurrent.join("、")}` }] : [])] };
    case "command": return { summary: document.background ? "在后台运行命令" : "运行命令",
      fields: [{ label: "命令", value: [document.command, ...document.args].join(" ") }, { label: "目录", value: document.cwd || "." }, ...(document.escalate ? [{ label: "注意", value: "需要更高权限" }] : []),
        // Extra access the command names is shown exactly; it is approved for this command only.
        ...(document.grants ? [{ label: "另要访问", value: [...document.grants.paths.map(grant => `${grant.access === "write" ? "读写" : "读取"} ${grant.path}`), ...(document.grants.network ? ["联网"] : [])].join("；") }] : [])] };
    case "mcp": return { summary: `MCP · ${document.server} · ${document.tool}`, fields: [{ label: "参数", value: document.arguments_json }] };
    case "rewind": return { summary: "回退到检查点", fields: document.files.map(file => ({ label: { restore: "恢复", delete: "删除", create: "新建" }[file.change], value: file.path })) };
    default: return { summary: "需要你确认的操作", fields: [{ label: "内容", value: JSON.stringify(document, null, 2).slice(0, 4000) }] };
  }
}
