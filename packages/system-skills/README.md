# 随系统自带的技能（system-skills）

这里放随 Molis Work 一起发行、不用安装的技能包（第 44B 批从 `plugins/content/` 移来；「随系统自带、默认自动」是用户 2026-11-14 定的）。

- 每个子目录是一个技能包，结构与内容包相同（`pack-content.json`、`skills/<技能>/SKILL.md`、`locales/`），`pack-content.json` 必须写 `system.default_state`（`auto` 或 `manual`）。
- `pnpm build` 由 `scripts/build-bundled-drafts.mjs` 把它们打进 `apps/local-host/dist/system-skills/`，宿主（`apps/local-host/src/agent-definitions/system-skill-packs.ts`）启动时读；每个 Home 的技能目录里都有，不签名、不安装、不能移除。
- 普通官方内容包仍在 `plugins/content/`，那里不许写 `system`；两边混放会让构建失败。
- 现有：`planning-methods`（规划与拆解，37 个技能）。

这个目录不是 workspace 包（没有 `package.json`），不被任何包 import。
