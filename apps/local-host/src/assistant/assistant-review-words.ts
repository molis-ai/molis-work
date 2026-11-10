import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantPendingReview } from "@molis-ai/molis-work-contracts/services/assistant";
import { reviewPresentation, reviewText, type ReviewWords } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantReviewDisplay, AssistantReviewField } from "@molis-ai/molis-work-app-workbench";

type Document = AgentReviewRequest["document"];
type RawReview = { summary: string; fields: Array<{ label: string; value: string }> };
const separator = { owner: "workbench", key: "common.list.separator" } as const;

function changedMiddle(before: string | null, after: string) {
  const a = (before ?? "").split("\n"), b = after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const removed = a.slice(head, a.length - tail).map(line => "- " + line), added = b.slice(head, b.length - tail).map(line => "+ " + line);
  const prefix = head ? "@@ 第 " + (head + 1) + " 行起" : "", lines = [...removed, ...added].join("\n");
  const text = prefix ? prefix + (lines ? "\n" + lines : "") : lines, clipped = text.length > 6000;
  return { head, body: lines.slice(0, prefix ? 5999 - prefix.length : 6000), clipped,
    raw: clipped ? text.slice(0, 6000) + "\n…（其余改动见 Coding 页面）" : text || "（内容没有变化）" };
}

/** The original review words the Host reports back to the runtime and keeps on its existing response. */
export function describeReview(document: Document, change = document.kind === "text-edit" ? changedMiddle(document.before_text, document.after_text) : undefined): RawReview {
  switch (document.kind) {
    case "tool-operation": return { summary: document.summary, fields: document.fields.map(field => ({ label: field.label, value: field.value })) };
    case "text-edit": return { summary: (document.exists ? "修改文件" : "新建文件") + " " + document.target_path,
      fields: [{ label: "改动", value: change!.raw }, ...(document.concurrent?.length ? [{ label: "注意", value: "另有会话正在改这个文件：" + document.concurrent.join("、") }] : [])] };
    case "command": return { summary: document.background ? "在后台运行命令" : "运行命令",
      fields: [{ label: "命令", value: [document.command, ...document.args].join(" ") }, { label: "目录", value: document.cwd || "." }, ...(document.escalate ? [{ label: "注意", value: "需要更高权限" }] : []),
        ...(document.grants ? [{ label: "另要访问", value: [...document.grants.paths.map(grant => (grant.access === "write" ? "读写" : "读取") + " " + grant.path), ...(document.grants.network ? ["联网"] : [])].join("；") }] : [])] };
    case "mcp": return { summary: "MCP · " + document.server + " · " + document.tool, fields: [{ label: "参数", value: document.arguments_json }] };
    case "rewind": return { summary: "回退到检查点", fields: document.files.map(file => ({ label: { restore: "恢复", delete: "删除", create: "新建" }[file.change], value: file.path })) };
    default: return { summary: "需要你确认的操作", fields: [{ label: "内容", value: JSON.stringify(document, null, 2).slice(0, 4000) }] };
  }
}

const caption = (key: string) => [reviewText("field." + key)];
const plain = (key: string, value: ReviewWords): AssistantReviewField => ({ label: caption(key), value });
const code = (key: string, value: string, format: "sh" | "diff" | "json"): AssistantReviewField => ({ label: caption(key), value, format });

function grantWords(grants: NonNullable<Extract<Document, { kind: "command" }>["grants"]>): ReviewWords {
  const requests: ReviewWords[] = grants.paths.map(grant => [reviewText(grant.access === "write" ? "grant-write" : "grant-read"), " ", grant.path]);
  if (grants.network) requests.push([reviewText("grant-network")]);
  return requests.flatMap((part, index) => index ? [separator, ...part] : part);
}

function displayReview(document: Document, raw: RawReview, change: ReturnType<typeof changedMiddle> | undefined, titleOf: (value: string) => string | null): AssistantReviewDisplay {
  const own = reviewPresentation(document);
  switch (document.kind) {
    case "tool-operation": return { summary: own?.summary ?? [raw.summary], fields: raw.fields.map((field, index): AssistantReviewField => {
      const projection = own?.fields?.[index], label = projection?.label ?? [field.label];
      if (projection?.format) return { label, value: field.value, format: projection.format };
      const title = projection?.subject ? titleOf(field.value.trim()) : null;
      if (title) field.value = "「" + title + "」";
      return { label, value: projection?.value ?? [field.value] };
    }) };
    case "command": return { summary: [reviewText(document.background ? "run-background" : "run-command")],
      fields: [code("command", raw.fields[0]!.value, "sh"), plain("directory", [document.cwd || "."]),
        ...(document.escalate ? [plain("warning", [reviewText("requires-elevation")])] : []),
        ...(document.grants ? [plain("extra-access", grantWords(document.grants))] : [])] };
    case "text-edit": {
      const before = change!.head ? [reviewText("diff-from-line", { line: change!.head + 1 })] : [];
      const after = change!.clipped ? [reviewText("diff-more-in-coding")] : [];
      const fields: AssistantReviewField[] = [{ label: caption("diff"), value: change!.body, format: "diff", before, after }];
      if (document.concurrent?.length) fields.push(plain("warning", [reviewText("overlap-warning"), " ", ...(own?.concurrent ?? [document.concurrent.join("、")])]));
      return { summary: [reviewText(document.exists ? "edit-file" : "create-file"), " ", document.target_path], fields };
    }
    case "mcp": return { summary: [raw.summary], fields: [code("arguments", document.arguments_json, "json")] };
    case "rewind": return { summary: [reviewText("rewind-checkpoint")], fields: document.files.map(file => plain("rewind-" + file.change, [file.path])) };
    default: return { summary: [reviewText("operation-needs-approval")], fields: [plain("content", [raw.fields[0]!.value])] };
  }
}

const displays = new WeakMap<AssistantPendingReview, AssistantReviewDisplay>();
export const assistantReviewDisplay = (review: AssistantPendingReview) => displays.get(review);

/** Language changes use this view's trusted copy. The review record, its fields and the decision keep their established shapes. */
export function projectAssistantReview(request: AgentReviewRequest, titleOf: (value: string) => string | null): AssistantPendingReview {
  const { document } = request, change = document.kind === "text-edit" ? changedMiddle(document.before_text, document.after_text) : undefined;
  const raw = describeReview(document, change), display = displayReview(document, raw, change, titleOf);
  const pending = { review_id: request.review_id, kind: document.kind, run_id: request.run?.run_id ?? null, ...raw,
    requested_at: request.requested_at, expires_at: request.expires_at };
  displays.set(pending, display);
  return pending;
}
