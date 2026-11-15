import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { DEFAULT_HOME_DIRNAME, resetSecretStoreCache, resolveHomeDirectory } from "@molis-ai/molis-work-storage";

export class EvaluationCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationCliUsageError";
  }
}

function isSameOrInside(outer: string, candidate: string): boolean {
  const step = relative(outer, candidate);
  return step === "" || (!step.startsWith("..") && !isAbsolute(step));
}

export function resolveRealProductHome(): string {
  return resolveHomeDirectory(join(homedir(), DEFAULT_HOME_DIRNAME));
}

export function assertIsolatedScratchHome(candidate: string): string {
  const resolved = resolveHomeDirectory(candidate);
  const realHome = resolveRealProductHome();
  if (isSameOrInside(realHome, resolved)) {
    throw new EvaluationCliUsageError(
      `REFUSED: 目标路径 ${candidate} 指向真实产品 Home 或其子目录（${realHome}）；评测命令只能在隔离临时目录运行。`,
    );
  }
  if (isSameOrInside(resolved, realHome)) {
    throw new EvaluationCliUsageError(
      `REFUSED: 目标路径 ${candidate} 包含真实产品 Home（${realHome}）；请指定独立的空白临时目录。`,
    );
  }
  if (existsSync(resolved) && readdirSync(resolved).length > 0) {
    throw new EvaluationCliUsageError(
      `REFUSED: 指定的 --home 目录非空（${resolved}）；为防覆盖或误删数据，请传入尚未创建或空白的临时目录。`,
    );
  }
  return resolved;
}

export interface WithIsolatedHomeOptions {
  readonly requestedHome?: string;
  readonly keepHome?: boolean;
}

export function assertEnvEvaluationHomeSafe(requestedHome?: string): void {
  const realHome = resolveRealProductHome();
  const envHome = process.env.MOLIS_WORK_HOME?.trim();
  if (!requestedHome && envHome) {
    const resolvedEnvHome = resolveHomeDirectory(envHome);
    if (isSameOrInside(realHome, resolvedEnvHome) || isSameOrInside(resolvedEnvHome, realHome)) {
      throw new EvaluationCliUsageError(
        `REFUSED: 环境变量 MOLIS_WORK_HOME（${envHome}）与真实产品 Home（${realHome}）重叠；请清理该变量或显式传入 --home <临时目录>。`,
      );
    }
  }
}

export async function withIsolatedEvaluationHome<T>(
  options: WithIsolatedHomeOptions,
  fn: (home: string) => Promise<T>,
): Promise<{ readonly home: string; readonly kept: boolean; readonly result: T }> {
  assertEnvEvaluationHomeSafe(options.requestedHome);
  const home = options.requestedHome
    ? assertIsolatedScratchHome(options.requestedHome)
    : resolveHomeDirectory(mkdtempSync(join(tmpdir(), "molis-eval-home-")));
  if (options.requestedHome && !existsSync(home)) {
    mkdirSync(home, { recursive: true, mode: 0o700 });
  }

  const previousHome = process.env.MOLIS_WORK_HOME;
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_HOME = home;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();

  try {
    const result = await fn(home);
    return { home, kept: options.keepHome === true, result };
  } finally {
    resetSecretStoreCache();
    if (previousHome === undefined) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = previousHome;
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    if (!options.keepHome) {
      rmSync(home, { recursive: true, force: true });
    }
  }
}

export function redactEvaluationValue<T>(
  value: T,
  redactions: { readonly home: string; readonly secrets?: readonly string[] },
): T {
  const secrets = (redactions.secrets ?? []).filter((item) => item.trim().length >= 4);
  const scrubString = (input: string): string => {
    let next = input.split(redactions.home).join("<isolated-home>");
    for (const secret of secrets) {
      next = next.split(secret).join("[REDACTED_SECRET]");
    }
    return next;
  };
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") return scrubString(node);
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        out[key] = visit(child);
      }
      return out;
    }
    return node;
  };
  return visit(value) as T;
}
