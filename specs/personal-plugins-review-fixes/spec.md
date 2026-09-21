# 个人插件复查修复

## 背景目标

复查（不含 Coding 家族）里的缺陷和接线问题一并修掉。完成等级：内部完整——相关测试覆盖真实行为；不把 Native 插件改成 Plugin Runtime 托管。

## 当前行为与问题

见对话旁复查页。会改可见状态的：卸载 `--purge` 漏删 home 库、MCP promote 不发 Artifact、Functions 草稿无锁、内置 seed 改 published、打开 Schedule 目录当成 Goals。结构上 Catalog 承诺和 Host 接线不一致。

复查落地后再看：无 Artifact 口时 Promote 仍写 `goal_id`；Functions CAS 只管 `updateDraft`/`publish` 的并发 require；HTTP 别名、目录面、Workbench 注册仍手写。

## 范围

修复查全部 P1/P2，以及复查残余。Coding 除外。

非目标：把 pages/form/dataset/ppt/lingguang 整包迁成五个 `modules/*`（store 绑着模板/文档解析，单独切片）；不把 Native 插件跑进 Plugin Runtime；不接真实模型。

## 方案

1. 卸载 purge 覆盖 `pages/form/dataset/ppt/lingguang/functions` 目录。
2. Pages MCP promote 与 HTTP 共用 `publishArtifact`。无口时 `requirePromoteArtifactPort` 直接失败，不写文档。
3. Functions 草稿写（`updateDraft` / `publish` / `savePreview` / 样例 / 删草稿）用 `updated_at` CAS；HTTP 与客户端提交自己读到的时间戳；seed 只插入缺失行。
4. 目录面、直达舞台、HTTP 别名从 catalog 推导：有 `summary` 或 `personal` 的插件自动进入；`sources` 仍是 Feed 别名。Coding 家族无 summary，不进目录面。
5. Host 一条个人插件 HTTP 派发：`/api/plugins/<id>/` 改写到现有 `/api/<id>/`，catalog 与 project 共用；project 才注入 Artifact 口。共用 JSON body/响应 helper，dispatcher 按表循环。
6. Manifest 声明 `storage:private`（及 Pages 的 `artifact:write`）。灵光 view slot 改为 `island`，壳按槽渲染。
7. 共用 `openHomeSqliteDatabase`；Host Functions 从 Module 进口 Store/Service。
8. `MolisWorkV1Error` 放到 contracts；Host MCP 从 contracts 进口，Goals 再导出。
9. Dataset CSV 按 RFC4180 保留转义引号；PPT 用色板；webview 缓存指纹含 functions.db。
10. Host 提供唯一 `completeText` 注入点（暂无模型则仍走插件诚实 stub）。舞台壳抽 helper，创作插件改用它。
11. Workbench 贡献、样式、浏览器 factory、搜索行从一份 workbench 装配表注册；`createWorkbenchUiHost` / 样式串 / `initialization` 不再各抄一份插件名单。

## 验收

- purge 会删上述 home 库。
- MCP promote 在已绑定项目时写出 Artifact，与 HTTP 同口；无口 Promote 不改 `goal_id`。
- 并发改草稿+发布：后到者 `functions.conflict` 或保持 published 与正文一致。
- 带着过期 `updated_at` 保存草稿、预览或样例会 `functions.conflict`，已写入的正文不变。
- 再次打开库不改已有 published 内置函数的 instructions。
- 打开 Schedule 时 `currentModuleDirectory` 为 `schedule`；`OWN_DIRECTORY_SURFACES` 含 `sources`，不含 `coding`。
- `/api/plugins/pages` 与 `/api/pages` 都能打到同一 handler；项目路径才 Promote。
- 灵光不在侧栏轨，在岛上；Manifest 含 island 槽。
- `"a""b"` CSV 解析为 `a"b`。
- 无 `input type=color`。
- Host 不再从插件包进口 `openFunctionsStore`。
- Host MCP 源文件不从 Goals 进口 `MolisWorkV1Error`。
- 个人插件 HTTP 别名来自 catalog；`/api/plugins/io.molis.work.shelf` 改写成 `/api/shelf`。

## 验证

`pnpm exec tsx --test tests/functions-plugin.test.ts tests/pages-plugin.test.ts tests/creative-tools-plugins.test.ts tests/lingguang-plugin.test.ts tests/plugin-declarative-mounting.test.ts tests/plugin-outbound-mcp.test.ts tests/schedule-plugin.test.ts tests/personal-plugins-review-fixes.test.ts`
