# 侧栏的文件：让人在工作旁边看到你的文件

侧栏的“文件”标签把各插件的文件放在一处：列出、筛选、预览，并能跳回插件继续编辑（specs/side-panel）。插件不写侧栏代码，只**声明一个文件来源**；列出、预览都按调用者（本机用户）的授权经共同动作目录进行，插件停用就从侧栏消失。

协议定义在 `@molis-ai/molis-work-contracts/platform/actions`（`platform/file-sources.ts`），SDK 同名导出。形状仿照[搜索来源](search.md)。

## 要做的事

1. **条目列出动作**：返回你当前全部文件，系统分页。

   ```ts
   import { bindFileEntriesHandler, defineFileEntriesAction } from "@molis-ai/molis-work-plugin-sdk";

   export const notesFiles = defineFileEntriesAction("notes.files.entries",
     [{ kind: "note", title: "笔记", surface: "notes" }], "笔记", ["notes:read"]);

   bindFileEntriesHandler(notesFiles, caller => store.list(caller.project_id!).map(note => ({
     subject: { kind: "note", id: note.id },
     revision: String(note.version),     // 内容或名字一变它就变
     title: note.title,                  // 人认得的名字
     folder: note.folder ? [note.folder] : [],   // 分组用，可空
     media_type: "text/markdown",        // 决定怎么预览：文本、Markdown、图片、PDF
     size: null, updated_at: note.updated_at,
     open: { surface: "notes", id: note.id },    // 与搜索的打开位置一致
   })));
   ```

2. **预览**，二选一：
   - 已有对象读取器（`<plugin>.subject.read`，见 [continuity.md](continuity.md)）：什么都不用加，侧栏用它的正文按条目的 `media_type` 显示。
   - 要预览原文件（图片、PDF、完整文本）：再声明 `defineFileContentAction("<plugin>.files.content", kinds, title, permissions)`，处理器用 `fileContentOf({ subject, revision, title, media_type, text | bytes })` 返回，上限 8 MB；文本超过部分截断并标 `truncated`。

3. **能按 id 打开**：`open.surface` 与搜索相同，工作台经 `openPluginRecord` 打开（支持 `molis-work:select-item`，或在工作台插件表里声明 `searchRow`）。

## 边界

- 来源默认只对本机用户（`FILE_SOURCE_AUDIENCES = ["user"]`）；给 Agent 或 MCP 用要自己放宽，且不能比原有读取更宽。
- 只列当前存在、可读的文件；不要放已删除或归档的。
- 项目作用域的来源只在该项目出现；`"home"` 作用域在个人范围出现。
- 不为侧栏另存一份正文、不在动作里调用侧栏；同一份文件只由一个插件列出（Coding 的工作目录由 Files 列出，它每轮的固定变更经 Artifacts 列出）。

## 样例与验证

- Files（`files.side.entries` / `files.side.content`，工作区文件，文本预览）、Pages（`pages.files.entries`，经 `pages.subject.read` 预览）、Artifacts（`artifacts.files.entries`）。
- 门禁：`inspectActionDeclarations` 校验协议形状（规范输入输出、查询类型、对本机用户开放、与角色一致）；测试 `tests/side-panel-platform.test.ts`。
