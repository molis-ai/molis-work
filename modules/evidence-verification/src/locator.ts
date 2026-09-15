import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// File and Markdown preflight belongs to Evidence & Verification; callers use the
// module public entrypoint instead of a cross-owner legacy helper.

export const MAX_PROJECT_REFERENCE_BYTES = 512 * 1024;

export class ProjectReferenceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectReferenceError";
  }
}

export interface EvidenceLocatorValidation {
  status: "verified" | "unverified";
  reason: string;
  checked_at: string;
  normalized_locator: string;
  verified_project_root?: string;
  verified_via?: "current_workspace" | "registered_git_worktree";
}

interface ResolvedProjectReference {
  fileName: string;
  realFile: string;
  anchor: string | null;
  size: number;
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function splitProjectLocator(locator: string): { path: string; anchor: string | null } {
  const hashIndex = locator.indexOf("#");
  const locatorPath = hashIndex >= 0 ? locator.slice(0, hashIndex) : locator;
  const encodedAnchor = hashIndex >= 0 ? locator.slice(hashIndex + 1) : "";
  let anchor: string | null = null;
  if (hashIndex >= 0) {
    try {
      anchor = decodeURIComponent(encodedAnchor);
    } catch {
      throw new ProjectReferenceError(400, "Markdown anchor 编码无效");
    }
  }
  return { path: locatorPath, anchor };
}

interface NormalizedAbsoluteProjectLocator {
  locator: string;
  validationRoot: string;
  verifiedVia: "current_workspace" | "registered_git_worktree";
}

function registeredGitWorktreeRoots(realProjectRoot: string): string[] {
  let output: string;
  try {
    output = execFileSync(
      "git",
      ["-C", realProjectRoot, "worktree", "list", "--porcelain", "-z"],
      {
        encoding: "utf8",
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const field of output.split("\0")) {
    if (!field.startsWith("worktree ")) continue;
    const listedPath = field.slice("worktree ".length);
    try {
      const realWorktreeRoot = fs.realpathSync(listedPath);
      if (!roots.includes(realWorktreeRoot)) roots.push(realWorktreeRoot);
    } catch {
      // A stale or removed worktree is not an authorized readable root.
    }
  }
  return roots;
}

function normalizeAbsoluteProjectLocator(
  projectRoot: string,
  locator: string,
): NormalizedAbsoluteProjectLocator {
  const { path: locatorPath, anchor } = splitProjectLocator(locator);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(path.resolve(projectRoot));
  } catch {
    throw new ProjectReferenceError(404, "项目引用根目录不可用");
  }
  let realFile: string;
  try {
    realFile = fs.realpathSync(locatorPath);
  } catch {
    throw new ProjectReferenceError(404, "项目内引用文件不存在");
  }
  let validationRoot = realRoot;
  let verifiedVia: NormalizedAbsoluteProjectLocator["verifiedVia"] = "current_workspace";
  if (!isWithinDirectory(realFile, realRoot)) {
    const registeredRoots = registeredGitWorktreeRoots(realRoot);
    if (!registeredRoots.includes(realRoot)) {
      throw new ProjectReferenceError(400, "Evidence locator 不能指向当前项目范围外的本地文件");
    }
    const matchingRoot = registeredRoots
      .filter((candidate) => candidate !== realRoot && isWithinDirectory(realFile, candidate))
      .sort((left, right) => right.length - left.length)[0];
    if (!matchingRoot) {
      throw new ProjectReferenceError(400, "Evidence locator 不能指向当前项目范围外的本地文件");
    }
    validationRoot = matchingRoot;
    verifiedVia = "registered_git_worktree";
  }
  const relativePath = path.relative(validationRoot, realFile).split(path.sep).join("/");
  const anchorSuffix = anchor === null ? "" : `#${encodeURIComponent(anchor)}`;
  return {
    locator: `project://${relativePath}${anchorSuffix}`,
    validationRoot,
    verifiedVia,
  };
}

export function projectReferenceSegments(locator: string): string[] {
  const { path: locatorPath } = splitProjectLocator(locator.trim());
  const encodedPath = locatorPath.startsWith("project://")
    ? locatorPath.slice("project://".length)
    : locatorPath;
  if (!locatorPath) throw new ProjectReferenceError(400, "项目内引用不能为空");
  if (locatorPath.startsWith("project://") && /^[/\\]/.test(encodedPath)) {
    throw new ProjectReferenceError(400, "项目内引用必须是相对路径");
  }
  if (!locatorPath.startsWith("project://") && /^[a-z][a-z0-9+.-]*:/i.test(locatorPath)) {
    throw new ProjectReferenceError(400, "只有项目内相对路径可以在 Molis Work 中打开");
  }
  if (path.isAbsolute(encodedPath) || encodedPath.includes("\0")) {
    throw new ProjectReferenceError(400, "项目内引用必须是安全的相对路径");
  }
  const segments = encodedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (!segments.length || segments.some((segment) => segment === "..")) {
    throw new ProjectReferenceError(400, "项目内引用不能跳出项目目录");
  }
  return segments;
}

function resolveProjectReference(
  projectRoot: string,
  locator: string,
): ResolvedProjectReference {
  const root = path.resolve(projectRoot);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    throw new ProjectReferenceError(404, "项目引用根目录不可用");
  }
  const candidate = path.resolve(realRoot, ...projectReferenceSegments(locator));
  if (!isWithinDirectory(candidate, realRoot)) {
    throw new ProjectReferenceError(400, "项目内引用不能跳出项目目录");
  }
  let realFile: string;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    throw new ProjectReferenceError(404, "项目内引用文件不存在");
  }
  if (!isWithinDirectory(realFile, realRoot)) {
    throw new ProjectReferenceError(400, "项目内引用不能通过链接跳出项目目录");
  }
  const stat = fs.statSync(realFile);
  if (!stat.isFile()) throw new ProjectReferenceError(400, "项目内引用必须指向普通文件");
  return {
    fileName: (path.basename(realFile) || "evidence.txt").replace(/[\r\n"]/g, ""),
    realFile,
    anchor: splitProjectLocator(locator).anchor,
    size: stat.size,
  };
}

export function readProjectReference(
  projectRoot: string,
  locator: string,
): { content: Buffer; fileName: string; realFile: string; anchor: string | null } {
  const resolved = resolveProjectReference(projectRoot, locator);
  if (resolved.size > MAX_PROJECT_REFERENCE_BYTES) {
    throw new ProjectReferenceError(
      413,
      `项目内引用文件过大，不能在 Molis Work 中打开（上限 512 KiB / ${MAX_PROJECT_REFERENCE_BYTES} 字节）`,
    );
  }
  const content = fs.readFileSync(resolved.realFile);
  if (content.includes(0) || content.toString("utf8").includes("\uFFFD")) {
    throw new ProjectReferenceError(415, "Molis Work 只能打开项目内的文本引用");
  }
  return {
    content,
    fileName: resolved.fileName,
    realFile: resolved.realFile,
    anchor: resolved.anchor,
  };
}

function markdownSlug(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function markdownAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  const lines = markdown.split(/\r?\n/);
  const add = (heading: string) => {
    const base = markdownSlug(heading);
    if (!base) return;
    let duplicateIndex = counts.get(base) ?? 0;
    let candidate = duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`;
    while (anchors.has(candidate)) {
      duplicateIndex += 1;
      candidate = `${base}-${duplicateIndex}`;
    }
    anchors.add(candidate);
    counts.set(base, duplicateIndex + 1);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const atx = lines[index]?.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx) {
      add(atx[1] ?? "");
      continue;
    }
    if (index + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? "")) {
      add(lines[index] ?? "");
      index += 1;
    }
  }
  return anchors;
}

export function validateEvidenceLocator(
  locator: string,
  options: { projectRoot?: string | null; now?: string } = {},
): EvidenceLocatorValidation {
  const value = locator.trim();
  const checkedAt = options.now ?? new Date().toISOString();
  if (/^https?:\/\//i.test(value)) {
    return {
      status: "unverified",
      reason: "外部 URL 已保留，但 Molis Work 不会发起网络请求或保证长期可用性",
      checked_at: checkedAt,
      normalized_locator: value,
    };
  }
  if (/^file:\/\//i.test(value)) {
    return {
      status: "unverified",
      reason: "机器本地 locator 已按原样保留为 UNVERIFIED；Molis Work 不会读取或确认文件存在；调用方提供的 digest 未核验；如需 verified，请从该仓库的受控 workspace 重新提交项目内 locator，或同时提交可读的 sidecar summary。",
      checked_at: checkedAt,
      normalized_locator: value,
    };
  }
  if (/^[a-z]:[\\/]/i.test(value)) {
    throw new ProjectReferenceError(400, "Evidence locator 不能指向项目范围外的本地文件");
  }
  let normalizedLocator = value.startsWith("repo:")
    ? `project://${value.slice("repo:".length)}`
    : value;
  let validationRoot = options.projectRoot ?? null;
  let verifiedVia: EvidenceLocatorValidation["verified_via"];
  if (path.isAbsolute(splitProjectLocator(value).path)) {
    if (!options.projectRoot) {
      throw new ProjectReferenceError(404, "项目引用根目录不可用");
    }
    const normalized = normalizeAbsoluteProjectLocator(options.projectRoot, value);
    normalizedLocator = normalized.locator;
    validationRoot = normalized.validationRoot;
    verifiedVia = normalized.verifiedVia;
  }
  const isOpaqueProtocol =
    /^[a-z][a-z0-9+.-]*:/i.test(normalizedLocator) && !normalizedLocator.startsWith("project://");
  if (isOpaqueProtocol) {
    return {
      status: "unverified",
      reason: "不透明或外部 locator 已保留为 UNVERIFIED；Molis Work 不会调用自定义协议",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }
  if (!validationRoot) {
    return {
      status: "unverified",
      reason: "当前入口没有可用的项目目录，项目内 locator 尚未验证",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }

  const resolved = resolveProjectReference(validationRoot, normalizedLocator);
  if (resolved.size > MAX_PROJECT_REFERENCE_BYTES) {
    const anchorBoundary = resolved.anchor === null ? "" : "Markdown anchor 未校验；";
    const worktreeBoundary = verifiedVia === "registered_git_worktree"
      ? "路径属于当前 canonical 仓库正式登记的隔离 worktree；"
      : "";
    return {
      status: "unverified",
      reason: `项目内文件路径已确认；${worktreeBoundary}但文件大小 ${resolved.size} 字节超过可全文打开上限 512 KiB（${MAX_PROJECT_REFERENCE_BYTES} 字节）；内容未全文预检；${anchorBoundary}如有 digest，它只会按原样记录，Molis Work 未核验。建议同时提交小型 sidecar summary。`,
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
    };
  }
  const reference = readProjectReference(validationRoot, normalizedLocator);
  if (reference.anchor !== null) {
    if (!/\.(?:md|markdown)$/i.test(reference.realFile)) {
      throw new ProjectReferenceError(400, "只有 Markdown 文件可以校验章节 anchor");
    }
    const requestedAnchor = markdownSlug(reference.anchor);
    if (!requestedAnchor || !markdownAnchors(reference.content.toString("utf8")).has(requestedAnchor)) {
      throw new ProjectReferenceError(400, `Markdown anchor 不存在: #${reference.anchor}`);
    }
    return {
      status: "verified",
      reason: verifiedVia === "registered_git_worktree"
        ? "同一 Git 仓库正式登记的隔离 worktree 内 Markdown 文件与 anchor 已完成只读预检"
        : "项目内 Markdown 文件与 anchor 已完成只读预检",
      checked_at: checkedAt,
      normalized_locator: normalizedLocator,
      verified_project_root: validationRoot,
      verified_via: verifiedVia,
    };
  }
  return {
    status: "verified",
    reason: verifiedVia === "registered_git_worktree"
      ? "同一 Git 仓库正式登记的隔离 worktree 内文本文件已完成只读预检"
      : "项目内文本文件已完成只读预检",
    checked_at: checkedAt,
    normalized_locator: normalizedLocator,
    verified_project_root: validationRoot,
    verified_via: verifiedVia,
  };
}
