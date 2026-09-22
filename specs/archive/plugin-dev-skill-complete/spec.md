# 完整插件开发 Skill

## 背景目标

把 `molis-plugin-dev` 从「选要素、排顺序」补成跟着手能把一个插件做完：声明、UI、HTTP、客户端、Host 装配、SDK/CLI、接入、测试。Agent 不再只停在 Manifest。

## 当前行为与问题证据

第一刀补了路径、四槽、Host 文件、CLI、对照物。第二刀对照合同和现有插件，Function / Event 仍停在 Manifest 字段，Agent 会以为写完就能用：

- `function_scenes` 不会自动出现在 Functions「用在哪」；`functionAuthoringDestinations()` / `sceneBehaviorIds()` 写死三个去向。
- 行为总表还要进 `NATIVE_BEHAVIOR_MANIFESTS`；落地要调 `JudgmentPort`，画面要吃 `suggested_behavior_ids`。
- 插件事件要 `event_types` + `services.events.publish` + `onEvent`；事件 id 放合同。Native 今天没有总线，只有 Coding 族的 `createPluginPlatform`。
- 「事件去向」（首页/Inbox/Feed）≠ 插件事件总线 ≠ Integration Signal。
- Native 完整装配还缺：合同模块与 contracts export、`workspace-packages.mjs` 的 workbench/local-host 依赖、`i18n/en.ts` 合并、`personal-native-plugin-http.ts` 分发、`plugin-declarative-mounting` 一类名单测试、列表无感刷新、`dialog.mw-dialog`。
- 第三刀：硬编码名单测试不止 mounting、`data-<id>="workbench"`、包内 README/tsconfig/index 再导出、图标必须是已有 `MolisWorkIcon`、IIFE 要挂 `web-assets.ts`、`project_id` 由 Host 注入。

## 范围

- 重写 `skills/molis-plugin-dev/`：`SKILL.md` 作完整路径；`elements.md` / `ui.md` / `examples.md` 补全；新增 `host.md`、`authoring.md`、`integrations.md`。
- 第二刀：补 Function 场景接线、插件事件总线、Native 仓库清单、i18n/搜索/列表刷新/命令菜单。
- 第三刀：硬编码测试名单、`data-<id>="workbench"`、包文件与 index 再导出、图标名、IIFE 资产路径、`project_id` 注入。写进 `host.md` / `ui.md` / `elements.md`，不新开文件。
- 手册 `PLUGIN-DEVELOPMENT.md` 仍管命令原文与录取四问细则；Skill 引用，不整页复制。
- 更新 rule、安装测里对本 Skill 文件的存在断言。

## 非目标

- 不新开 CLI、不改 Runtime 接入、不把 PLUGIN-DEVELOPMENT 粘进 Skill。
- 不把每个插件的实现细节写成第二份源码。
- 不把 Goals 画布、Functions 三栏的视觉规范扩成独立设计系统。

## 使用场景

1. 在本仓库加一等 Native / app / integration。
2. 仓库外用 Plugin CLI 跑本地样例并打包。
3. 改平台合同时按 SKILL.md 末节同步手册。

## 方案与关键决策

- 渐进披露：SKILL.md 不超过约 250 行，按 kind/家族分流到 reference。
- 一等产品入口和第三方 Runtime 插件分开写装配清单，避免把 `/api/pages` 抄成第三方合同。
- 对照物按「抄最近的同类」，补上最小完整插件 Text stats。

## 输入输出与依赖

- 输入：现有 Skill、Plugin Manifest 合同、Workbench catalog、Local Host HTTP、Plugin SDK/CLI。
- 输出：完整 Skill 目录、手册入口句、测试断言。
- 依赖：不改插件运行时代码。

## 文件 / 模块边界

- 改：`skills/molis-plugin-dev/**`、`.cursor/rules/plugin-dev-skill.mdc`
- 改：`docs/platform/PLUGIN-DEVELOPMENT.md`、`docs/platform/README.md`（入口句）
- 改：`tests/install.test.ts`、`tests/npm-package.test.ts` 的 Skill 文件断言
- 不改：installer、Runtime adapters、插件实现

## 验收标准

1. SKILL.md 能单独走完：四问 → kind → 家族 → 声明顺序 → 对应装配清单。
2. 合同四槽、HTTP 两条前缀、personal/project、agent 不只 Coding，都写对。
3. host.md 列出 Native / app / integration / CLI 样例各自要改的文件；含接到 Functions 与插件事件总线的步骤。
4. examples.md 覆盖舞台列表、本机创作、判断、岛、定时、端口消费者、Coding、接入。
5. authoring.md 有 SDK `start` 兑现规则和 `plugin create/dev/pack`；含 `onEvent` / 命令 / 上游端口回调。
6. `quick_validate.py skills/molis-plugin-dev` 通过。
7. 安装测试断言新 reference 文件存在。
8. Skill 写明：Native 没有插件事件总线；新 Functions 去向是平台改动，不是只改 Manifest。

## 验证命令

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/molis-plugin-dev
node --import tsx --test --test-concurrency=1 tests/install.test.ts
```

`tests/npm-package.test.ts` 在构建指纹新鲜时再跑；与本任务无关的 `prosemirror-transform` 解析失败不作为本 Skill 正文失败。

## 假设与开放问题

- 一等 Native 仍是构建期装配，标 `app` 仍要求真跑在 Plugin Runtime。
- Plugin CLI 脚手架今天生成的是 integration 样例，不是 Native 产品入口。
