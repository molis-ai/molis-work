import { Buffer } from "node:buffer";
import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOME_PAGE_DRAFT_SCHEMA, HOME_PAGE_LIMITS, type HomePageDraft } from "@molis-ai/molis-work-contracts/services/home";
import { assertMatches } from "./sandbox-schema.js";
import { packagePathProblem } from "./skill-declarations.js";

/** Inspect files and action references in a draft. The Home owner checks their live availability and permissions. */
export function inspectHomePageDraft(value: unknown): readonly PluginDeclarationProblem[] {
  const shapeProblem = draftShapeProblem(value);
  if (shapeProblem) return [shapeProblem];
  const draft = value as HomePageDraft;
  const problems = fileProblems(draft);
  try { parseExactActionReferences(draft.actions); }
  catch (error) {
    problems.push({ path: "$.actions", reason: error instanceof Error ? error.message : "页面动作引用无效" });
  }
  return problems;
}

function draftShapeProblem(value: unknown): PluginDeclarationProblem | undefined {
  try {
    assertMatches(HOME_PAGE_DRAFT_SCHEMA, value, (_kind, reason) => { throw pluginErrors.declaration_invalid(reason); });
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "页面草稿无效";
    const split = message.startsWith("$") ? message.indexOf(": ") : -1;
    return split === -1 ? { path: "$", reason: message } : { path: message.slice(0, split), reason: message.slice(split + 2) };
  }
}

function fileProblems(draft: HomePageDraft): PluginDeclarationProblem[] {
  const problems: PluginDeclarationProblem[] = [], seen = new Set<string>();
  let totalBytes = 0;
  for (const [index, file] of draft.files.entries()) {
    const path = `$.files[${index}]`;
    const problem = packagePathProblem(file.path);
    if (problem) problems.push({ path: `${path}.path`, reason: problem });
    if (seen.has(file.path)) problems.push({ path: `${path}.path`, reason: "文件路径重复" });
    seen.add(file.path);
    const bytes = Buffer.byteLength(file.text, "utf8");
    if (bytes > HOME_PAGE_LIMITS.fileBytes) problems.push({ path: `${path}.text`, reason: "单个页面文件的 UTF-8 正文不能超过 1 MiB" });
    totalBytes += bytes;
  }
  if (totalBytes > HOME_PAGE_LIMITS.totalBytes) problems.push({ path: "$.files", reason: "页面文件的 UTF-8 正文合计不能超过 4 MiB" });
  const entryProblem = packagePathProblem(draft.entry);
  if (entryProblem || draft.files.find(file => file.path === draft.entry)?.media_type !== "text/html") {
    problems.push({ path: "$.entry", reason: entryProblem ?? "入口须指向清单中的 HTML 文件" });
  }
  return problems;
}
