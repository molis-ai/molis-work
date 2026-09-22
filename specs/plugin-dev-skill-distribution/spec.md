# Plugin-dev Skill 正式分发

## 背景目标

把 `molis-plugin-dev` 从本仓库 Cursor 本地目录提升为随 npm 包和 Home 安装一起发布的官方 Skill，让其他人拿到 Molis Work 后能装到自己的 Cursor / Codex / Claude。

## 当前行为与问题证据

Skill 正文只在 `.cursor/skills/molis-plugin-dev/`。根 `package.json` 的 `files` 已包含整个 `skills/`，Home 安装也会整目录复制 `skills/`，但那里目前只有 Runtime 工作协议 `goal-advance`。clone 或 `npm install` / `molis-work install` 都拿不到插件开发 Skill。

## 范围

- 正文唯一来源：`skills/molis-plugin-dev/`。
- 安装源与 owned release 必含 `skills/molis-plugin-dev/SKILL.md`。
- npm pack 含该目录。
- 本仓库 Cursor：`.cursor/skills/molis-plugin-dev` 符号链接到 SSOT，开发本仓库时仍自动发现。
- 手册、SSOT、rule 的链接改到 `skills/molis-plugin-dev`。
- Skill 与手册写明：从 Home release 或 npm 包链到 `~/.cursor/skills`（及 Codex / Claude 同类目录）。

## 非目标

- 不把本 Skill 自动挂进 Runtime 接入（`~/.codex/skills` 等）。那是 `goal-advance` 的 Runtime 工作协议，受众是推进 Goal 的人，不是写插件的人。
- 不新增 CLI 子命令。
- 不把 `PLUGIN-DEVELOPMENT.md` 整份复制进 Skill。

## 使用场景

1. 在本仓库写插件：Cursor 通过符号链接读到同一份正文。
2. 别人 `molis-work install` 后，Home release 的 `skills/molis-plugin-dev` 可 symlink 到自己的 Cursor / Codex。
3. npm 包消费者从 `node_modules/@molis-ai/molis-work/skills/molis-plugin-dev` 拷走或链接。

## 方案与关键决策

- 与 `goal-advance` 同级：放进 `skills/`，靠现有 `files: ["skills"]` 和 `fs.cp(skills)` 分发。
- 安装器把 `skills/molis-plugin-dev/SKILL.md` 列为必有资产，和 `goal-advance` 一样缺了就 `source.asset_missing`。
- Runtime 接入继续只跟踪 `goal-advance`，避免每个用户的 Goal 对话里多出一个插件开发 Skill。
- `.cursor/skills` 不另存一份正文，避免两处漂移。

## 输入输出与依赖

- 输入：现有 `.cursor/skills/molis-plugin-dev` 正文。
- 输出：`skills/molis-plugin-dev/`、安装源/release 校验、手册链接、Cursor 符号链接。
- 依赖：现有 Home 复制整个 `skills/`；不改 Runtime adapter。

## 文件 / 模块边界

- 改：`skills/molis-plugin-dev/**`、`.cursor/skills/molis-plugin-dev`、`.cursor/rules/plugin-dev-skill.mdc`
- 改：`apps/local-host/src/installer/home-contract.ts`、`home-source.ts`、`home-release.ts`
- 改：`docs/platform/PLUGIN-DEVELOPMENT.md`、`PLUGIN-PLATFORM.md`、`README.md`、`SSOT-MATRIX.md`、`docs/cli-and-development.md`
- 改：`tests/install.test.ts`、`tests/runtime-payload.test.ts`、`tests/npm-package.test.ts`
- 不改：`runtime-config-adapters.ts`、`runtime-integration.ts`

## 验收标准

1. 仓库存在 `skills/molis-plugin-dev/SKILL.md` 以及 `elements.md` / `ui.md` / `examples.md`。
2. 安装源缺少该 `SKILL.md` 时 `installMolisWorkHome` 抛 `source.asset_missing`。
3. fixture Home 安装后 `skill_directory/molis-plugin-dev/SKILL.md` 存在。
4. 真实 workspace payload 安装后同上。
5. npm pack 含 `skills/molis-plugin-dev/SKILL.md`。
6. `.cursor/skills/molis-plugin-dev` 是指向 `../../skills/molis-plugin-dev` 的符号链接。
7. 手册与 SSOT 指向 `skills/molis-plugin-dev`，不再把 `.cursor/skills` 当正文来源。

## 验证命令

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/molis-plugin-dev
node --import tsx --test --test-concurrency=1 tests/install.test.ts tests/runtime-payload.test.ts tests/npm-package.test.ts
```

`quick_validate.py` 只验包装。npm pack 测的是真实打包路径；缺构建时该测试会因 `source.build_stale` 失败，需先 `pnpm build`。

## 假设与开放问题

- 安装器仍整目录复制 `skills/`，不必为第二份 Skill 改复制逻辑。
- 本轮不自动写入用户 Runtime Skill 目录；若以后要给插件作者做一键安装，另开任务。
