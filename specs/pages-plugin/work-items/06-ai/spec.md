# WI6：Pages AI

depends_on：01、03。完成等级：**3 功能可用**。无模型时诚实 stub，不算失败。

## 背景目标

选区能改写并候选写回；整篇能译成新文档；全文能校对。接不上模型就明说，并给出可审的本地草稿，不装成已调用模型。

## 当前行为与问题证据

浮动条没有 AI。Host 有模型设置，Pages 未接。

## 范围

G0：选区命令出候选，人点「写回」才替换选区。

命令：翻译、改写（四种风格 concise/expand/formal/casual，不单开语调）、扩写、续写、大纲、总结、解释、要点、行动项（写回清单块）、读者视角、写作教练。

整篇翻译成新文档；全文校对（候选写回全文，不直接静默覆盖）。

不要 Companion / Differ / 配图。

## 非目标

流式 token UI、多模型对比、文中聊天、进度条。

## 使用场景

划一段 → AI → 改写/正式 → 看候选 → 写回。无模型时候选标明「未接模型」。

## 方案与关键决策

- `POST /api/pages/:id/ai`，body：`command`、`text`、可选 `style`。
- Host 可注入 `completeText`；没有就走 `stubPagesAi`，文案以「未接模型」开头。
- 行动项：写回 `task_list`，不是纯文本。
- 整篇翻译：服务端 `create` 一篇新文档，不覆盖当前篇。
- overlay 在内核；真正 HTTP 在客户端。

## 输入输出与依赖

允许：pages 路由 / ai 模块 / editor / client / en / 测试。可在 local-host 注入 completeText，不接就 stub。不改 Goals。

## 验收标准

1. 选区命令弹出候选，确认后选区被替换（行动项变成清单块）。
2. 无 completeText 时候选含「未接模型」，HTTP 200。
3. 整篇翻译产生新文档，原篇不动。
4. 全文校对先候选再写回。
5. `save()` 仍不重挂。

## 验证命令

同 WI4。

## handoff

下一切片接挂 Goal / Promote / Extractor。
