import { constants, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ExternalToolPath } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { SessionSourceFailure, type SessionDirectoryEntry, type SessionsPorts } from "@molis-ai/molis-work-service-sessions";

function isInsideRoot(realRoot: string, candidate: string): boolean {
  return candidate === realRoot || candidate.startsWith(realRoot + path.sep);
}

function resolveExistingOrLexical(
  target: string,
  mustStayUnderBase: string | null,
): { root: string; exists: boolean; valid: boolean } {
  try {
    if (!existsSync(target)) {
      try {
        if (lstatSync(target).isSymbolicLink()) return { root: "", exists: false, valid: false };
      } catch {
        // Not present at all.
      }
      return { root: target, exists: false, valid: true };
    }
    const lst = lstatSync(target);
    if (lst.isSymbolicLink() && mustStayUnderBase !== null) {
      return { root: "", exists: false, valid: false };
    }
    const st = statSync(target);
    if (!st.isDirectory()) return { root: target, exists: false, valid: true };
    const resolved = realpathSync.native(target);
    if (mustStayUnderBase !== null && existsSync(mustStayUnderBase)) {
      const realBase = realpathSync.native(mustStayUnderBase);
      if (!isInsideRoot(realBase, resolved)) return { root: "", exists: false, valid: false };
    }
    return { root: resolved, exists: true, valid: true };
  } catch {
    return { root: target, exists: false, valid: true };
  }
}

export function safeResolveEnvRoot(
  spec: ExternalToolPath,
  homeRoot: string,
  env: NodeJS.ProcessEnv,
): { root: string; exists: boolean; valid: boolean } {
  if (spec.segments.some(seg => seg.includes("\0"))) {
    return { root: "", exists: false, valid: false };
  }
  const override = spec.env === undefined ? undefined : env[spec.env]?.trim();
  if (override && !override.includes("\0") && path.isAbsolute(override)) {
    return resolveExistingOrLexical(path.resolve(override), null);
  }
  const rawXdg = env.XDG_CONFIG_HOME?.trim();
  const configHome = rawXdg && !rawXdg.includes("\0") && path.isAbsolute(rawXdg)
    ? path.resolve(rawXdg)
    : path.join(homeRoot, ".config");
  const base = spec.base === "home" ? homeRoot : configHome;
  return resolveExistingOrLexical(path.join(base, ...spec.segments), base);
}

function validateRelativeInput(root: string, relative: string): void {
  if (!root || root.includes("\0") || relative.includes("\0")) {
    throw new SessionSourceFailure("read_error", "拒绝读取非法外部会话路径", false);
  }
  if (relative === "") return;
  if (path.isAbsolute(relative) || /^[A-Za-z]:/u.test(relative)) {
    throw new SessionSourceFailure("read_error", "外部会话路径不能使用绝对路径", false);
  }
  const segments = relative.split(/[\\/]+/u);
  if (segments.includes("..")) {
    throw new SessionSourceFailure("read_error", "外部会话路径不能跳出声明的数据根目录", false);
  }
}

export async function resolveContainedTarget(
  root: string,
  relative: string,
  allowMissing: boolean,
): Promise<{ realRoot: string; realTarget: string } | null> {
  validateRelativeInput(root, relative);
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new SessionSourceFailure("read_error", "外部工具数据目录不存在或无法读取", false);
  }

  const lexical = relative ? path.resolve(realRoot, relative) : realRoot;
  if (!isInsideRoot(realRoot, lexical)) {
    throw new SessionSourceFailure("read_error", "外部会话路径超出了声明的数据根目录", false);
  }

  let lstat;
  try {
    lstat = await fs.lstat(lexical);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new SessionSourceFailure("read_error", "外部会话记录不存在或无法读取", false);
  }

  if (lstat.isSymbolicLink()) {
    let realTarget: string;
    try {
      realTarget = await fs.realpath(lexical);
    } catch {
      throw new SessionSourceFailure("read_error", "拒绝跟随指向无效或根外目标的符号链接", false);
    }
    if (!isInsideRoot(realRoot, realTarget)) {
      throw new SessionSourceFailure("read_error", "拒绝跟随跳出声明根目录的符号链接", false);
    }
    return { realRoot, realTarget };
  }

  let realTarget: string;
  try {
    realTarget = await fs.realpath(lexical);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new SessionSourceFailure("read_error", "外部会话路径无法解析", false);
  }
  if (!isInsideRoot(realRoot, realTarget)) {
    throw new SessionSourceFailure("read_error", "拒绝读取声明根目录之外的路径", false);
  }
  return { realRoot, realTarget };
}

/** S-sessions-read-roots: opens and lists files strictly inside declared `EXTERNAL_TOOLS` local roots. */
export function createHostSessionFilesPort(homeRoot: string, sourceEnv: NodeJS.ProcessEnv): SessionsPorts["files"] {
  return {
    resolveRoot(spec: ExternalToolPath): { root: string; exists: boolean } {
      const resolved = safeResolveEnvRoot(spec, homeRoot, sourceEnv);
      return { root: resolved.root, exists: resolved.exists };
    },
    async list(root: string, relative: string, signal: AbortSignal): Promise<readonly SessionDirectoryEntry[]> {
      signal.throwIfAborted();
      const resolved = await resolveContainedTarget(root, relative, true);
      if (!resolved) return [];
      let entries;
      try {
        entries = await fs.readdir(resolved.realTarget, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
        throw new SessionSourceFailure("read_error", "读取外部工具会话目录失败", false);
      }
      const result: SessionDirectoryEntry[] = [];
      for (const dirent of entries) {
        signal.throwIfAborted();
        const childLexical = path.join(resolved.realTarget, dirent.name);
        let childReal: string;
        try {
          childReal = await fs.realpath(childLexical);
        } catch {
          continue;
        }
        if (!isInsideRoot(resolved.realRoot, childReal)) continue;
        try {
          const st = await fs.stat(childReal);
          if (st.isFile()) result.push({ name: dirent.name, kind: "file", size: st.size, mtime_ms: st.mtimeMs });
          else if (st.isDirectory()) result.push({ name: dirent.name, kind: "directory", size: st.size, mtime_ms: st.mtimeMs });
        } catch {
          // Vanished concurrently.
        }
      }
      result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return result;
    },
    async stat(root: string, relative: string, signal: AbortSignal): Promise<{ size: number; mtime_ms: number } | null> {
      signal.throwIfAborted();
      const resolved = await resolveContainedTarget(root, relative, true);
      if (!resolved) return null;
      try {
        const st = await fs.stat(resolved.realTarget);
        if (!st.isFile() && !st.isDirectory()) return null;
        return { size: st.size, mtime_ms: st.mtimeMs };
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
        throw new SessionSourceFailure("read_error", "读取外部会话文件状态失败", false);
      }
    },
    async open(root: string, relative: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
      signal.throwIfAborted();
      const resolved = await resolveContainedTarget(root, relative, false);
      if (!resolved) throw new SessionSourceFailure("read_error", "外部会话记录不存在", false);
      let lst;
      try {
        lst = lstatSync(resolved.realTarget);
      } catch {
        throw new SessionSourceFailure("read_error", "外部会话记录无法打开", false);
      }
      if (!lst.isFile() || lst.isSymbolicLink()) {
        throw new SessionSourceFailure("read_error", "外部会话记录不是普通文件", false);
      }
      let handle: fs.FileHandle;
      try {
        handle = await fs.open(resolved.realTarget, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      } catch {
        throw new SessionSourceFailure("read_error", "外部会话记录无法安全打开", false);
      }
      try {
        const fst = await handle.stat();
        if (!fst.isFile() || fst.dev !== lst.dev || fst.ino !== lst.ino) {
          await handle.close();
          throw new SessionSourceFailure("read_error", "外部会话记录不是已核实的普通文件", false);
        }
      } catch (error) {
        if (error instanceof SessionSourceFailure) throw error;
        await handle.close().catch(() => {});
        throw new SessionSourceFailure("read_error", "外部会话记录状态核对失败", false);
      }
      const nodeStream = handle.createReadStream();
      signal.addEventListener("abort", () => nodeStream.destroy(), { once: true });
      return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    },
  };
}
