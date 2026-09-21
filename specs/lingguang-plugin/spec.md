# 灵光：临时灵感池个人插件

完成等级：**4 内部完整**。不宣称可发布。不写 Goal，不发 Artifact，第一刀不接真模型。

## 背景目标

想法还没归类、还没成文、也不知道去哪时，先丢进「灵光」，再由人决定留下、丢掉或以后分发。它是独立 native 个人插件，不是 Inbox / Shelf / Feed / Functions 的皮肤。

旧证据：Adeptify Pagesus 子入口 J 灵光，后来独立为 Lingguang V0；V0 是内存态，刷新丢失。本插件必须 SQLite，重启还在。

## 当前行为与问题证据

- 工作台侧栏没有「灵光」。
- 仓库内无 `lingguang` 插件、合同或 `{home}/lingguang` 库。
- Adeptify V0 刷新丢失；跨工作台接收与文档挂载不迁过来。

## 范围

1. native 个人插件。侧栏名「灵光」。`plugin_id`：`io.molis.work.lingguang`。项目插件 id：`lingguang`。`personal: true`，始终在侧栏，不进项目启用名单。内容按当前 `project_id` 分区。
2. 快记：标题 + 正文，手打或粘贴。
3. 流式列表：`created_at` 倒序，多选、清空选择、看条数。
4. 点行进工作区编辑、丢掉（确认）。丢掉把状态写成 `discarded`，不再出现在池里。
5. 分发：动作栏给出候选（Inbox / Goal / Functions），确认后只把正文复制到剪贴板，**不写**这些系统。
6. 头脑风暴：选中 ≥1 条后打开工作台内对话区；选中正文只读上下文。对话落同一 SQLite（按项目 + 选中 id 集合复用一条会话）。不调用外部 LLM；回复是本地 stub「先记着：…」，文案不假装已接模型。
7. 装配对齐 Form：包结构、`/api/lingguang`、catalog `personal` + `summary`、`initialization.ts` 注入 client factory。侧栏图标用 Host 已有 `idea`（灯炮）。
8. UI：列表页对齐 Forms / Dataset / PPT：`plugin-stage-list feed-stage-list feed-stage-tree`，顶栏 `tree-create`「记下」，空态 `mw-empty`，行是 `feed-stage-entry directory-list-row`（标题 | 灵光 | 摘录 | 时间 | 状态）。点行打开工作区改标题/正文，不在行内展开，不另做居中纸条岛。工作区输入无「标题 / 正文」字段标签。⌘/Ctrl 点行多选；两条及以上时顶栏出现丢掉 / 头脑风暴 / 分发。确认用 `dialog.mw-dialog`。失败 `showNote`。
9. 自动保存标题/正文不重挂正在编辑的 DOM，不丢光标。`save()` 不调用 `fillEditor`。

每条至少：`id`、`project_id`、`title`、`body`、`created_at`、`updated_at`。`source_kind` 只允许 `manual`。状态：`inbox` | `discarded`。

## 非目标

- MCP / `mcp_exports`
- 从 Goals / Feed / Shelf / 文档一键送进灵光
- 分发真正写入 Goal / Inbox / Knowledge / 文档补丁
- 真模型、TypeSafe、Jev
- 归档柜、标签树、搜索进阶
- React / TipTap / Zustand / Adeptify CSS
- 插件市场第三方扩展、协作
- 顺手改 Form / Dataset / PPT

## 使用场景

1. 侧栏打开灵光，空态能看懂「先扔进来」。记下一条，列表出现，重开 store 还在。
2. 再记两条，多选两条，确认丢掉；一条还在。项目 B 看不到项目 A 的。
3. 点开一条进工作区改正文，保存不重置光标；失败有 note。
4. 选中一条开头脑风暴，看到原文，发一句得到 stub「先记着：…」。

## 方案与关键决策

- 个人插件，内容按项目隔离。
- 对话只落库这一种，不当场内存另做一套。
- 分发第一刀停在候选 + 确认 + 复制，避免偷偷写别的系统。
- 清空 = 清选择，不是清空整个池。
- 记下会建一条（可先空着），再打开工作区写。保存只补列表预览，不 `replaceChildren` 编辑器。头脑风暴也在同一 workspace，返回列表。

## 输入输出与依赖

输入：当前项目里的快记、编辑、丢掉、头脑风暴句子。  
输出：`{home}/lingguang/lingguang.db` 记录、列表/编辑/对话 UI、分发时的剪贴板文本。  
依赖：Plugin Manifest、Workbench catalog、Local Host `/api/lingguang`、Design System。

## 文件 / 模块边界

允许：`specs/lingguang-plugin/`；`packages/contracts/src/modules/lingguang.ts`；`plugins/native/lingguang/`；Workbench catalog/壳接线；Local Host HTTP；`scripts/workspace-packages.mjs`；SSOT 一行；`tests/lingguang-plugin.test.ts` 及被个人插件名单断言带出的测试修正。

禁止：Goals/Artifacts 写入；Functions 设置；新建 MCP 包或 `mcp_exports`。

## 验收标准

1. 侧栏有「灵光」，不经项目「添加插件」。市场卡片来自 catalog `summary`，个人插件显示已添加。
2. 创建 → 列表倒序 → 重开 store / 刷新页面仍在；工作台 HTML 含 `data-lingguang=workbench`。主路径由 `tests/lingguang-plugin.e2e.test.ts` 在真实工作台点一遍。
3. 项目 A 的条目不出现在项目 B；缺 `project_id` 的请求失败。
4. 丢掉走 `dialog.mw-dialog`，客户端无 `window.confirm`；丢掉后不再出现在 list。
5. `save()` 源码不含 `fillEditor`。
6. 头脑风暴 stub 回复以「先记着：」开头，不发起外部模型请求。
7. 异步失败 `showNote`。
8. 图标是 catalog 已有的 `idea`，不自运 SVG。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-lingguang --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/lingguang-plugin.test.ts tests/lingguang-plugin.e2e.test.ts tests/creative-tools-plugins.test.ts tests/plugin-declarative-mounting.test.ts
node scripts/workspace-packages.mjs
```

`tests/lingguang-plugin.e2e.test.ts` 需要本机 Chrome；没有则跳过，不以 HTML 断言冒充手动能走通。

## 假设与开放问题

- 落在 Molis Work 个人插件，不搬回 Adeptify。
- 真模型头脑风暴、真分发写入记 later。
- 对外 MCP 另开 `plugin-outbound-mcp` 任务再做。
