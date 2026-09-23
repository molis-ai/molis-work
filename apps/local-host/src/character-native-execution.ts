import { mkdirSync, mkdtempSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { CharacterContent, CharacterImportRuntimeId } from "@molis-ai/molis-work-contracts/modules/characters";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { WorkSessionRecord, WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { CharactersImportPorts, CharacterNativeRun } from "@molis-ai/molis-work-plugin-characters";
import { openWorkSessionRegistry } from "./session-registry.js";
import type { PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";

export const CHARACTER_NATIVE_NOTICE = "原生 Agent 使用自己的登录、模型和权限，仍会读取本机实时规则、插件与 MCP。Molis 会提供本次固定角色包及补充指令；请在终端中处理授权和提问。内置工具限制只适用于 Molis 内置引擎。";

/** Interactive invocations deliberately preserve the original trust and permission prompts. */
export function characterNativeArgs(runtime: CharacterImportRuntimeId, cwd: string, prompt: string): string[] {
  return runtime === "opencode" ? [cwd, "--prompt", prompt] : [prompt];
}

export function writeCharacterBundle(home: string, character: CharacterContent): { path: string; prompt: string } {
  const root = join(home, "characters", "runs");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = mkdtempSync(join(root, "character-"));
  const snapshot = character.import_snapshot!;
  const rules = snapshot.rules.map((rule, index) => {
    const name = `rules/${index + 1}.md`;
    mkdirSync(dirname(join(path, name)), { recursive: true, mode: 0o700 });
    writeFileSync(join(path, name), rule.content, { mode: 0o600 });
    return { ...rule, content: undefined, file: name };
  });
  const skills = snapshot.skills.map((skill, index) => {
    const directory = `skills/${index + 1}`;
    for (const file of skill.files) {
      // Snapshot parsing at the Artifact boundary has already checked every relative path.
      const target = join(path, directory, file.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content, { mode: 0o600 });
    }
    return { name: skill.name, description: skill.description, source: skill.path, directory };
  });
  const guide = [
    `# Character: ${character.title}`,
    "这是用户选定的固定角色包。先阅读所列规则文件，再按任务需要阅读技能的 SKILL.md 和相对资源。规则必须保留原目录范围与条件，不增加操作权限。若包内规则与本机实时配置冲突，应告知用户，不默默丢弃。",
    `## 导入来源\n${JSON.stringify({ runtime: snapshot.runtime_id, config_root: snapshot.config_root, project_root: snapshot.project_root, captured_at: snapshot.captured_at })}`,
    `## 规则清单\n${JSON.stringify(rules, null, 2)}`,
    `## 技能目录\n${JSON.stringify(skills, null, 2)}`,
    `## 用户补充指令\n${character.instructions || "（无）"}`,
  ].join("\n\n");
  writeFileSync(join(path, "CHARACTER.md"), guide, { mode: 0o600 });
  writeFileSync(join(path, "character.json"), JSON.stringify(character), { mode: 0o600 });
  return { path, prompt: `请使用用户选择的 Character「${character.title}」。开始前必须读取 ${JSON.stringify(join(path, "CHARACTER.md"))}，并读取其中列出的规则、按任务需要使用所列 Skills 的固定文件和附件。不要以原配置目录的实时文件替换这个快照；原生权限、信任和授权机制照常生效。` };
}

export function characterNativeExecution(options: { home: string; actorId: string; boardId: string; workspaces(): Promise<readonly ProjectWorkspaceRef[]>; spawn(request: PtySpawnRequest): PtySpawnResult; executable(runtime: CharacterImportRuntimeId): string | null }): Pick<CharactersImportPorts, "execution" | "launch" | "runs"> {
  const run = (session: WorkSessionRecord, registry: WorkSessionApi): CharacterNativeRun => ({
    session_id: session.session_id, panel_id: session.surface_id!, title: session.title ?? "Character", created_at: session.created_at,
    reference: session.metadata.character_reference as CharacterNativeRun["reference"], workspace_path: session.workspace_path!,
    output: registry.events(session.session_id).map(event => event.content ?? "").join("\n"),
  });
  const owned = (session: WorkSessionRecord, characterId: string) => session.metadata.character_id === characterId && session.metadata.character_actor === options.actorId && session.metadata.character_board === options.boardId;
  return {
    execution: async content => ({ executable: content.import_snapshot ? options.executable(content.import_snapshot.runtime_id) : null,
      workspaces: (await options.workspaces()).map(({ workspace_id, canonical_path }) => ({ workspace_id, canonical_path })), notice: CHARACTER_NATIVE_NOTICE }),
    async runs(characterId) {
      const registry = await openWorkSessionRegistry({ homeDirectory: options.home });
      try { return registry.list().filter(session => owned(session, characterId)).map(session => run(session, registry)).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
      finally { registry.close(); }
    },
    async launch(content, reference, input) {
      if (!content.import_snapshot) throw new Error("此角色没有本地 Agent 来源");
      const incomplete = content.import_snapshot.skills.filter(skill => skill.reason?.startsWith("部分资源未读取"));
      if (incomplete.length) throw new Error(`这些技能的资源未完整导入：${incomplete.map(skill => skill.name).join("、")}。请检查来源更新，修复读取问题或取消选择后重新导入；不会用残缺的包启动任务。`);
      if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 20_000) throw new Error("请填写本次任务（最多 20000 字）");
      if (typeof input.request_id !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(input.request_id)) throw new Error("执行请求标识无效");
      const workspace = (await options.workspaces()).find(item => item.workspace_id === input.workspace_id);
      if (!workspace) throw new Error("请选择当前项目已绑定的工作目录");
      const cwd = realpathSync(workspace.canonical_path);
      const source = content.import_snapshot.project_root;
      if (source) {
        const path = relative(realpathSync(source), cwd);
        if (path === ".." || path.startsWith("../") || isAbsolute(path)) throw new Error("此角色包含项目范围内容，不能在其他项目执行");
      }
      const executable = options.executable(content.import_snapshot.runtime_id);
      if (!executable) throw new Error("未发现对应 Agent CLI，请安装后重新检查；不会替换为其他引擎");
      const registry = await openWorkSessionRegistry({ homeDirectory: options.home });
      try {
        const panelId = `character-${input.request_id}`;
        const previous = registry.findBySurface(panelId);
        if (previous) {
          if (!owned(previous, content.character_id) || JSON.stringify(previous.metadata.character_reference) !== JSON.stringify(reference) || previous.metadata.character_task !== input.task || previous.workspace_id !== input.workspace_id) throw new Error("该执行请求已用于其他任务，请创建新请求");
          // A lost HTTP response can only reattach; it never reruns a completed task.
          return { run: run(previous, registry), spawn: { panelId, sessionId: previous.session_id, attachOnly: true } };
        }
        const bundle = writeCharacterBundle(options.home, content);
        const session = registry.createSession({ runtime_id: content.import_snapshot.runtime_id, actor_id: options.actorId, user_confirmed: true,
          surface_id: panelId, workspace_id: workspace.workspace_id, workspace_path: cwd, title: content.title,
          metadata: { character_id: content.character_id, character_actor: options.actorId, character_board: options.boardId,
            character_reference: reference, character_bundle: bundle.path, character_task: input.task, native_config: "live-with-frozen-character" } });
        registry.appendEvent({ session_id: session.session_id, source: "molis_work", source_id: "character-start", kind: "user_message",
          content: input.task, metadata: { reference, character_bundle: bundle.path, configuration_notice: CHARACTER_NATIVE_NOTICE } });
        try {
          options.spawn({ panelId, sessionId: session.session_id, command: executable,
            args: characterNativeArgs(content.import_snapshot.runtime_id, cwd, bundle.prompt + "\n\n本次任务：\n" + input.task), cwd });
          registry.appendEvent({ session_id: session.session_id, source: "molis_work", source_id: "native-dispatched", kind: "status", content: "原生进程已派发。固定角色包读取指令已提供；实际加载与执行结果以终端输出为准。" });
        } catch (error) {
          registry.appendEvent({ session_id: session.session_id, source: "molis_work", source_id: "native-dispatch-failed", kind: "status", content: `原生进程启动失败：${error instanceof Error ? error.message : String(error)}。修复后可明确创建新任务重试。` });
          throw error;
        }
        return { run: run(session, registry), spawn: { panelId, sessionId: session.session_id, attachOnly: true } };
      } finally { registry.close(); }
    },
  };
}
