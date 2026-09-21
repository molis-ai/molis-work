# WI4：Pages 备注与评论

depends_on：01、03（块手柄已在）。完成等级：**3 功能可用**。

## 背景目标

Notion 式文档要能在块上留备注、在选区上留评论，刷新还在。不接协作线程、不接外部账号。

## 当前行为与问题证据

内核只有格式标记，没有备注/评论。选区浮动条只有粗斜体等。块手柄只有 + / 上下。

## 范围

1. 块备注：块左侧手柄可写一条备注；有备注的块有可见标记；点开可改可清空；进文档 JSON，随 `save()` 落库。
2. 选区评论：划词后浮动条「评」写下评论；文字有高亮；再点可改可删；进 `comment` mark，随正文保存。
3. 不用 `window.prompt`。内核 overlay，样式走 `PAGES_STYLES`。
4. `save()` 仍不 `fillEditor` / `setDoc`。

## 非目标

多人回复、指派、建议模式、版本对比、行级 git blame。

## 使用场景

写一段，划词评论「这里要改口径」。Callout 上留备注「对外别发」。刷新后两处都在。

## 方案与关键决策

- 备注是块 node attr `note`（默认空串），不另开表。
- 评论是 mark `comment`：`id` / `text`。
- overlay 在 `editor-browser.ts`，不进 factory 字符串。

## 输入输出与依赖

允许：本 spec；`plugins/native/pages` 的 schema / editor-browser / styles / en / 测试。不改 Goals/Artifacts。

## 验收标准

1. 块备注写入后 JSON 含 `note`，刷新仍在。
2. 选区评论写入后 JSON 含 `comment` mark，刷新高亮仍在。
3. 清空备注、删除评论后不再出现。
4. 无 `window.prompt`。
5. `save()` 不含 `fillEditor` / `setDoc`。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-pages --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/pages-plugin.test.ts
```

## handoff

下一切片接 `@` 与卡（WI5）。
