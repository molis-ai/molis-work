# WI7：挂 Goal、Promote、Extractor

depends_on：01、05（任务卡）。完成等级：**3 功能可用**（整期 4 仍要端到端 UI 审计）。

## 背景目标

文档能挂到当前项目的 Goal；能 Promote 成 Artifact（并带上所挂 Goal）；能从正文抽取任务卡，以及把成段知识抽成新文档。

## 当前行为与问题证据

Pages 记录没有 `goal_id`。没有 Artifact 生产。没有抽取。README 仍写「不发 Artifact」。

## 范围

1. A12 挂 Goal：编辑顶栏选择当前项目 Goal（可清空）；字段 `goal_id` 落库。不创建 Goal，不改 Goal 树事实。
2. N1 Promote：把当前文档登记为个人 Artifact（type `io.molis.work.pages.document`），metadata 含 `page_id` 与 `goal_id`；同一篇再 Promote 升 version。无 Artifacts 端口时说明原因，仍可只挂 Goal。
3. N2 Extractor：任务清单 → 本篇追加任务卡；H2 段落知识 → 新文档（标题用原题 · 小节名）。不发明 Knowledge 宿主。

## 非目标

升格为新 Goal（那是 Feed 的 Promote）、Team 分享、抽成 Form/Dataset。

## 使用场景

周报挂到「Q3 发布」→ Promote → Artifacts 能读到。点抽取，清单变成任务卡，各 H2 变成新文档。

## 方案与关键决策

- `goal_id` / `artifact_id` / `artifact_version` 在 pages 表。
- Promote 经 Host 注入的 `registerVersion`；测试用假端口。
- 抽取是纯函数，HTTP `POST /api/pages/:id/extract`。
- 客户端 Goal 列表读 `GET /api/board` 的 `goals`，不复制 Goals 模块。

## 输入输出与依赖

允许：contracts pages 字段；pages store/routes/mcp/ui/client；local-host pages HTTP 注入 artifacts；manifest `artifacts.produces`；测试与 README。允许登记 Artifact，不改 Goal 生命周期。

## 验收标准

1. 挂 Goal 后读回 `goal_id`；清空后为空。
2. 注入 artifacts 端口时 Promote 得到 `artifact_id`+version，再 Promote version+1；metadata 含 page_id 与 goal_id。
3. 抽取后本篇出现 task_card；知识小节变成新文档。
4. MCP 可 update goal_id、promote、extract。
5. `save()` 仍不重挂。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

## handoff

整期随后做 UI 审计：视觉/动效/交互/布局与工作台一致，Notion-like 能实际写。
