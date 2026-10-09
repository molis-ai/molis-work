# 系统搜索：让你的内容能被搜到、打开到

工作台 ⌘K、个人助理、工作流和外部 MCP 客户端都用同一个系统动作 `search.query` 找内容。插件不接入搜索服务的代码，也不写索引；你只**声明一个搜索来源**，其余由系统做：首次建立索引、按版本增量更新、删除清理、失败重试、按调用者权限过滤、打开前核对。你的表、业务状态和校验规则不变。

需求与合同：`specs/archive/system-search/spec.md`；协议定义在 `@molis-ai/molis-work-contracts/platform/actions`（`platform/search-sources.ts`），SDK 同名导出。

## 要做的三件事

1. **对象读取器。** 可搜索的每种对象都要有读取器（见 [continuity.md](continuity.md) 第 1 条）。搜索的正文就从它来，所以助理读到的与搜索索引的是同一份。对象不存在、已删除或已归档时抛 `<plugin>.not_found`：搜索据此把旧结果移出，助理显示“已不存在”。

2. **条目列出动作。** 一个来源列出你的全部当前可搜索条目，系统按版本比对：

   ```ts
   import { bindSearchEntriesHandler, defineSearchEntriesAction } from "@molis-ai/molis-work-plugin-sdk";

   export const notesSearchEntries = defineSearchEntriesAction("notes.search.entries",
     [{ kind: "note", title: "笔记", surface: "notes" }],   // 对象种类、给人看的名字、工作台打开它的插件标识
     "笔记", ["notes:read"]);                               // 第五个参数 "home" 表示个人范围（不属于任何项目）

   bindSearchEntriesHandler(notesSearchEntries, caller => store.list(caller.project_id!).map(note => ({
     subject: { kind: "note", id: note.id },
     revision: String(note.version),       // 你自己的版本；任何会被搜到的内容一变，它就必须变
     title: note.title,
     summary: "",                          // 允许明文进入索引的简短文字（可空）
     updated_at: note.updated_at,
     content: "context",                   // 正文经读取器进入索引；"summary" 表示只索引标题与摘要
     open: { surface: "notes", id: note.id },
   })));
   ```

   `bindSearchEntriesHandler` 负责排序、分页和集合版本；你只返回当前完整列表。列表里不要放已删除、已丢弃、已归档的对象——不在列表里，就会从索引里删掉。

3. **能按 id 打开。** `open.surface` 是工作台插件标识，`open.id` 是对象在你页面里的 id。工作台先经 `search.open` 让你的读取器核对对象还在，再打开：支持条目标签的插件用 `molis-work:select-item`；其余在工作台插件表里声明目录行（`searchRow: { selector, idDataset }`），工作台等那一行出现后点它。打开后工作台在你的页面里滚动到命中文字并高亮，前提是正文在页面上是可见文字。

## 哪些内容能进索引

- **可以**：你已经明文存着、也会显示给这个人的文字：标题、正文、题目、单元格、备注。
- **只给摘要（`content: "summary"`）**：正文加密存放或属于别人私下的内容（Feed 保留的原文、会话里的终端输出）；把能公开的标题、来源、摘要放进 `summary`。
- **不要**：密钥、令牌、授权信息；二进制；别人的回答（例如问卷的填写结果）；运行日志。
- **没有“查询时再搜”这种来源。** 内容不能写进索引的，就按“只给摘要”声明，正文留在你手里；系统搜索只列出和读取，不在查询时调用你的搜索（`defineSearchQueryAction` 已删除，Manifest 里这样声明会被拒绝）。

## 权限与范围

- **来源的受众不能比你原有的读取更宽。** 原来只给本机界面看的内容（例如 Shelf 的剪贴板历史，所有剪贴板动作都只对 `user`）单独声明一个来源，第六个参数传 `["user"]`：索引照常建立，助理、工作流与 MCP 客户端发现不到它，授予也不能放宽。来源必须对 `user` 开放（索引以本机用户建立），否则声明检查拒绝。
- 调用者看不到你的来源，就看不到你的结果；正文由读取器提供的条目，还要求调用者能用读取器。这些都由动作目录的现有授权决定（Web 用户、每个 MCP 客户端的授予、助理的单独开关、生成插件的安装授权），不要自己再判断一遍。
- 项目作用域的来源只在该项目里被搜到；`"home"` 作用域的来源在任何项目和项目外都能在“个人”范围搜到。
- 插件在项目里被停用或卸载，系统删掉它的索引内容；重新启用后从你的数据重建。

## 不要做的

- 不要为搜索另建表、另存一份正文，或在你的动作里调用搜索服务。
- 不要让 `revision` 在内容不变时每次都变（每次都会重读正文），也不要在内容变了时不变（结果会过期）。
- 不要在条目里放调用者不该看到的字段：条目是按“能用这个来源”的授权返回的。
- 生成插件（插件创作台）目前还不能声明搜索来源：它们的动作由设计的 operations 派生，不含协议型动作。

## 样例与验证

- 项目内容：Form（`plugins/native/form/src/search.ts`）、Pages（`pages.search.entries`）、Goals（版本与读取器一致）。
- 只给摘要：Feed（`feed.search.entries`，保留正文加密）、Inbox、Sessions。
- 个人范围：Cognia、Jelly（三种对象、三个读取器）。
- 只给本机的人：Shelf 剪贴板（`shelf.clipboard.search.entries`，受众 `user`）。
- Runtime 插件：Characters（`bindOwnerPluginAction`）、Coding（路由兑现）。
- 测试：`tests/system-search.test.ts`（协议、中文与短词、增量、失败、停用、重建）、`tests/system-search-host.test.ts`（真实宿主、项目隔离、MCP 授权、未知插件仅凭声明接入）、`tests/system-search-lifecycle.test.ts`（停用/启用、重启、MCP 进程、助理消费）。
