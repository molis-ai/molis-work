# 新插件列表对齐旧舞台行

完成等级：**3 功能可用**。不改数据、不提交、不发布。

## 背景目标

Forms / Dataset / PPT / Functions / Pages 的列表页要和 Inbox / Feed 同一套行高，而且**跨行内容对齐**：类型、key、说明、状态各占固定栏，不要跟着标题长短左右晃。函数类型用彩色标签区分；行上要有够用的信息，不能只剩标题 + 一坨灰字。

## 当前行为与问题证据

2026-09-21 工作台 Functions 截图：

- 行已接到 `feed-stage-entry`，但每行是独立 grid，中间列 `max-content` 按该行「Choice · key」长度定宽，标题一长，类型/key 起点就跳。
- 类型（Noul / Choice / Score）和 `function_key` 拼成一列灰字，不是标签。
- Form / Dataset / PPT / Pages 同样只有标题 + 一句 caption，说明、题数、更新时间没有分栏。

## 范围与非目标

做：五个插件列表行改成共享栏位（标题 | 类型标签 | 主事实 | 次事实 | 状态）；Functions 类型用非 plain 的彩色 `mw-status`；状态芯片去掉 `mw-status--plain`。

不做：不改 Inbox/Feed/Schedule/Artifacts/Shelf/Goals 行实现；不把灵光快记流收成目录行；不改编辑器、保存、MCP。

## 使用场景

打开 Functions：六行标题左对齐，Choice / Score / Noul 标签同列同色，key 一列，说明摘要一列，草稿/v1 在最右。打开 Forms：问卷标签 + 题数 + 说明 + 草稿/已发布，列轨与 Functions 相同。

## 方案

1. 带 `.plugin-stage-kind` 的行用固定五栏：`minmax(10rem, 1.2fr) 4.75rem minmax(8rem, 0.9fr) minmax(10rem, 1.1fr) 4.5rem`。行宽相同则列起点相同，不依赖 subgrid。
2. 类型是填充色 `mw-status plugin-stage-kind`，`data-kind` 上色：Choice indigo、Score orange、Noul cyan；问卷/数据表/演示稿/文档用对应 plugin tint。
3. Functions：标题 | 类型 | `function_key` | 说明首行（可附选项数/样例/试过） | 草稿或 vN。
4. Form：问卷 | N 题 | 说明 | 草稿/已发布。Dataset：数据表 | 列×行 | 说明 | 草稿/已就绪。PPT：演示稿 | N 页 | 说明 | 空状态格。Pages：星标+标题 | 文档 | 文件夹 | 更新日。
5. 展开侧栏和窄屏藏主/次事实，留标题 | 类型 | 状态。

## 文件边界

允许：`specs/plugin-list-row-align/`；`plugins/native/{form,dataset,ppt,functions,pages}/src/{client,en}.ts`；`apps/workbench/src/styles/plugin-stage.ts`；对应测试。

禁止：改 Host、MCP、旧插件列表实现、编辑器工作区。

## 验收

1. 五个插件客户端画出 `plugin-stage-kind`，Functions 按 primitive 写 `data-kind`。
2. 不再把类型和 key 拼成 `Choice · system_…`。
3. 列表状态芯片不再带 `mw-status--plain`。
4. 工作台 CSS 含五栏固定轨和 Choice/Score/Noul 的 `--status-tone`。
5. 4184 打开 Functions：类型标签分色，key 与标题分列且跨行对齐。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/creative-tools-plugins.test.ts tests/functions-plugin.test.ts tests/pages-plugin.test.ts tests/visual-foundation.test.ts
```

4184 打开示例项目，对照 Inbox 与 Functions / Forms 列表。
