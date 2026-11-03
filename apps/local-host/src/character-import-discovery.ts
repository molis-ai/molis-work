import { constants, accessSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { RUNTIME_DISPLAY_NAMES } from "@molis-ai/molis-work-contracts/platform/app-host";
import { CHARACTER_IMPORT_RUNTIMES, characterErrors, parseCharacterImportSnapshot,
  type CharacterImportCandidate, type CharacterImportRuntimeId, type CharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";
import { confirmedDirectory, directory, discoveryRoots, type CharacterDiscoveryInput } from "./character-import-paths.js";
import { scanRuntime } from "./character-import-runtimes.js";
import { CharacterScan } from "./character-import-scan.js";

interface CharacterDiscoveryOptions { userHome: string; env?: NodeJS.ProcessEnv; now?: () => string }
// The four Runtimes Molis also runs take their names from the shared table; Cursor is import-only, so its name stays here.
const LABELS: Record<CharacterImportRuntimeId, string> = { codex: RUNTIME_DISPLAY_NAMES.codex, "claude-code": RUNTIME_DISPLAY_NAMES["claude-code"],
  cursor: "Cursor", opencode: RUNTIME_DISPLAY_NAMES.opencode, "grok-build": RUNTIME_DISPLAY_NAMES["grok-build"] };

/** The browser submits only a candidate id. Captured file contents never come from a browser request. */
export function createCharacterDiscovery(options: CharacterDiscoveryOptions) {
  const home = confirmedDirectory(options.userHome, "用户目录"), env = options.env ?? process.env;
  const captures = new Map<string, CharacterImportSnapshot>(), captureSizes = new Map<string, number>();
  let capturedBytes = 0;
  const executable = (runtime: CharacterImportRuntimeId): string | null => {
    const names = { codex: ["codex"], "claude-code": ["claude"], cursor: ["cursor-agent", "agent"], opencode: ["opencode"], "grok-build": ["grok", "agent"] }[runtime];
    const dirs = [...(env.PATH ?? "").split(delimiter).filter(path => path && isAbsolute(path)), join(home, ".local/bin"), join(home, ".codex/bin"), join(home, ".grok/bin"), join(home, ".cursor/bin")];
    for (const name of names) for (const dir of dirs) {
      try {
        const path = realpathSync(join(dir, name));
        if (!statSync(path).isFile()) continue;
        accessSync(path, constants.X_OK);
        // Both vendors have shipped `agent`; the basename alone is never sufficient evidence.
        if (name === "agent" && !(runtime === "cursor" ? /(?:^|[/\\])\.cursor(?:-agent)?[/\\]|cursor-agent/i : /(?:^|[/\\])\.grok[/\\]|grok/i).test(path)) continue;
        return path;
      } catch { /* An absent executable does not prevent importing configuration. */ }
    }
    return null;
  };
  /** Keeps what a preview captured, bounded in both count and actual resource bytes (base64 expansion included), until its candidate id is used. */
  const remember = (snapshot: CharacterImportSnapshot): string => {
    const candidate_id = randomUUID();
    captures.set(candidate_id, structuredClone(snapshot));
    const capturedSize = snapshot.rules.reduce((sum, rule) => sum + Buffer.byteLength(rule.content), 0)
      + snapshot.skills.reduce((sum, skill) => sum + skill.files.reduce((size, file) => size + Buffer.byteLength(file.content), 0), 0);
    captureSizes.set(candidate_id, capturedSize); capturedBytes += capturedSize;
    while (captures.size > 25 || (capturedBytes > 96 * 1024 * 1024 && captures.size > 1)) {
      const oldest = captures.keys().next().value!;
      capturedBytes -= captureSizes.get(oldest)!; captureSizes.delete(oldest); captures.delete(oldest);
    }
    return candidate_id;
  };
  return {
    executable(runtime: CharacterImportRuntimeId): string | null {
      if (!CHARACTER_IMPORT_RUNTIMES.includes(runtime)) throw characterErrors.invalid("不支持的 Agent 来源");
      return executable(runtime);
    },
    get(candidateId: string): CharacterImportSnapshot | null {
      const snapshot = captures.get(candidateId); return snapshot ? structuredClone(snapshot) : null;
    },
    discover(input: CharacterDiscoveryInput = {}): CharacterImportCandidate[] {
      const { manualRoot, projectRoot, runtimes, roots } = discoveryRoots(home, env, input);
      const candidates: CharacterImportCandidate[] = [];
      for (const runtime of runtimes) {
        const initialRoot = manualRoot ?? roots[runtime], root = directory(initialRoot) ? realpathSync(initialRoot) : initialRoot;
        const binary = executable(runtime), scan = new CharacterScan(runtime);
        scanRuntime(runtime, scan, { home, root, manualRoot, projectRoot }, LABELS[runtime], binary);
        if (!manualRoot && !directory(root) && !binary && !scan.rules.length && !scan.skills.length) continue;
        const snapshot = parseCharacterImportSnapshot({ runtime_id: runtime, config_root: resolve(root), ...(projectRoot ? { project_root: projectRoot } : {}),
          captured_at: (options.now ?? (() => new Date().toISOString()))(), rules: scan.rules, skills: scan.skills });
        candidates.push({ candidate_id: remember(snapshot), label: LABELS[runtime], executable: binary, snapshot, warnings: scan.warnings });
      }
      return candidates;
    },
  };
}
