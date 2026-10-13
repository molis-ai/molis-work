import fs from "node:fs";
import path from "node:path";

/** Reading a `project://` reference from the project's workspace: bounded, contained in the root, text only. */
const MAX_PROJECT_REFERENCE_BYTES = 512 * 1024;

export class ProjectReferenceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectReferenceError";
  }
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

function projectReferenceSegments(locator: string): string[] {
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
    fileName: (path.basename(realFile) || "reference.txt").replace(/[\r\n"]/g, ""),
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
