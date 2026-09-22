import { createHash, randomUUID } from "node:crypto";
import { createGitSkillFetcher, DEFAULT_INSTALL_LIMITS, installSkill, MAX_SKILL_BODY_CHARS, type FetchedPackage, type Runtime } from "@prologue/sdk";
import type { AgentSkillCandidate, AgentSkillCatalogEntry, AgentSkillLibrary, AgentSkillOwner } from "@molis-ai/molis-work-contracts/services/agent-host";

const KIND = "molis-coding-method";
interface MethodMeta extends AgentSkillOwner {
  skill_id: string; version: number; name: string; summary: string; source_label: string;
}
const ownerKey = (owner: AgentSkillOwner) => JSON.stringify([owner.board_id, owner.plugin_id]);
const sameOwner = (left: AgentSkillOwner, right: AgentSkillOwner) => ownerKey(left) === ownerKey(right);
const summary = (value: string) => !value.trim() || /^---(?:\s|$)/.test(value.trim()) ? "本地方法；选择前请阅读完整正文。" : value.trim().slice(0, 200);
const entry = (meta: MethodMeta): AgentSkillCatalogEntry => ({ skill_id: meta.skill_id, version: meta.version,
  name: meta.name, summary: summary(meta.summary), tools: [], source: "installed", enabled: true });
function metadata(value: Readonly<Record<string, unknown>>): MethodMeta {
  for (const key of ["board_id", "plugin_id", "skill_id", "name", "summary", "source_label"]) {
    if (typeof value[key] !== "string") throw new Error("已安装方法的记录损坏，不能作为可用方法执行");
  }
  if (value.version !== 1) throw new Error("已安装方法版本不可读");
  return value as unknown as MethodMeta;
}
function assemble(pack: FetchedPackage) {
  const main = pack.files.find(file => file.path.toLowerCase() === "skill.md");
  if (!main) throw new Error("方法包缺少根目录的 SKILL.md");
  const others = pack.files.filter(file => file !== main).slice().sort((a, b) => a.path.localeCompare(b.path));
  const body = main.text + others.map(file => `\n\n## 附件：${file.path}\n\n${file.text}`).join("");
  if (!body.trim() || body.length > MAX_SKILL_BODY_CHARS) throw new Error(`方法正文与附件必须在 ${MAX_SKILL_BODY_CHARS} 字符以内，不能截断安装`);
  return { body, files: [main.path, ...others.map(file => file.path)] };
}

/** SDK store owns immutable packages; discovery only reads an already authorized workspace. */
export function createPrologueSkillLibrary(runtime: Runtime): AgentSkillLibrary {
  const candidates = new Map<string, { owner: AgentSkillOwner; meta: MethodMeta; pack: FetchedPackage }>();
  const generations = new Map<string, number>();
  const list = async (owner: AgentSkillOwner) => {
    const result: AgentSkillCatalogEntry[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const listed = await runtime.store.list({ kind: KIND, limit: 100, ...(cursor ? { cursor } : {}) });
      for (const record of listed.records) {
        if (record.tombstoned) continue;
        // A different project's record does not become a dependency of this project.
        if (record.metadata.board_id !== owner.board_id || record.metadata.plugin_id !== owner.plugin_id) continue;
        result.push(entry(metadata(record.metadata)));
      }
      if (!listed.cursor) return result;
      cursor = listed.cursor;
    }
    throw new Error("方法目录过大，未能完整读取");
  };
  return {
    list,
    async read(owner, ref) {
      const record = await runtime.store.get({ kind: KIND, id: ref.skill_id });
      if (!record || record.tombstoned) throw new Error("这个已安装方法不可用，请重新选择");
      const meta = metadata(record.metadata);
      if (!sameOwner(meta, owner) || meta.skill_id !== ref.skill_id || meta.version !== ref.version) throw new Error("这个方法版本不属于当前项目与插件");
      const bytes = await runtime.store.readSecure({ kind: KIND, id: ref.skill_id });
      const pack = JSON.parse(new TextDecoder().decode(bytes)) as FetchedPackage;
      const { source: _source, enabled: _enabled, ...declaration } = entry(meta);
      return { ...declaration, body: assemble(pack).body };
    },
    async discover(owner, directory, path) {
      if (!directory.realpath_verified || !path.trim() || path.length > 1000 || path.startsWith("/") || /[\\\x00-\x1f]/.test(path) || path.split("/").includes("..")) {
        throw new Error("请填写授权工作区内的相对目录，不能越过工作区");
      }
      const key = ownerKey(owner), generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      for (const [id, captured] of candidates) if (sameOwner(captured.owner, owner)) candidates.delete(id);
      const root = await runtime.workspace.authorize({ path: directory.canonical_path });
      const reader = runtime.workspace.reader(root.ref, runtime.workspace.ignoreFor(root.ref));
      await reader.list({ path }); // Discovery's empty result must not hide a read failure.
      const found = await runtime.discoverSkillsIn(root.ref, { dirs: [path] });
      if (found.candidates.length > 100) throw new Error("候选方法超过 100 个，请选择更具体的目录");
      const result: AgentSkillCandidate[] = [];
      const captured = new Map<string, { owner: AgentSkillOwner; meta: MethodMeta; pack: FetchedPackage }>();
      for (const candidate of found.candidates) {
        const parts = candidate.path.split("/").filter(part => part && part !== ".");
        const folder = parts.slice(0, -1).join("/") || ".";
        const name = (candidate.name || parts.at(-2) || "本地方法").slice(0, 128);
        let bytes = 0;
        const fetch = createGitSkillFetcher({ workRoot: root.ref, stagingDir: "unused", port: {
          runCommand: async () => { throw new Error("安装方法不会执行命令"); },
          listDir: async ({ path: location }) => ({ entries: (await reader.list({ path: location || "." })).entries }),
          readFile: async ({ path: location }) => {
            const file = await reader.read({ path: location || "." });
            bytes += new TextEncoder().encode(file.text).byteLength;
            if (bytes > DEFAULT_INSTALL_LIMITS.maxBytes || file.text.includes("\0")) throw new Error("方法包超出体积上限或包含非文本文件");
            return { path: file.path, text: file.text };
          },
        } });
        const pack = await fetch({ kind: "directory", path: folder === "." ? "" : folder }, DEFAULT_INSTALL_LIMITS);
        const assembled = assemble(pack);
        const candidate_id = randomUUID();
        const skill_id = "installed-" + createHash("sha256").update(JSON.stringify([key, name])).digest("hex").slice(0, 40);
        const meta: MethodMeta = { ...owner, skill_id, version: 1, name, summary: summary(candidate.summary), source_label: folder };
        captured.set(candidate_id, { owner: { ...owner }, meta, pack });
        result.push({ candidate_id, name, summary: meta.summary, source_label: folder, ...assembled });
      }
      if (generations.get(key) !== generation) throw new Error("另一次发现已替换本次结果，请使用最新候选");
      for (const [id, value] of captured) candidates.set(id, value);
      return result;
    },
    async install(owner, candidateId) {
      const captured = candidates.get(candidateId);
      if (!captured || !sameOwner(captured.owner, owner)) throw new Error("候选已失效或不属于当前项目，请重新发现");
      const installed = await list(owner);
      if (installed.some(item => item.skill_id === captured.meta.skill_id)) throw new Error("已经安装过同名方法；安装不会覆盖，请更改方法名称后重新发现");
      await installSkill({ id: captured.meta.skill_id, source: { kind: "directory", path: captured.meta.source_label },
        fetch: async () => captured.pack,
        installed: { has: id => installed.some(item => item.skill_id === id) }, limits: DEFAULT_INSTALL_LIMITS,
        commit: async pack => {
          if (candidates.get(candidateId) !== captured) throw new Error("候选已失效，请重新发现");
          assemble(pack);
          await runtime.store.commit({ kind: KIND, id: captured.meta.skill_id, expectedVersion: 0,
            metadata: { ...captured.meta }, secureBody: new TextEncoder().encode(JSON.stringify(pack)) });
        },
      });
      candidates.delete(candidateId);
      return entry(captured.meta);
    },
  };
}
