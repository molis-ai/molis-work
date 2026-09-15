# Item → Goal Runtime/TUI 验收记录

验收日期：2026-08-30
完成等级：内部完整
验收方式：隔离的临时 Molis Work 项目、真实 Web/PTY、`/bin/sh` Terminal、自动化回归。

## AC1

Start 会把用户带到正确的 Goal Runtime，同时保持 Molis Work 生命周期边界。

- 首次 Start 创建 1 个 Draft Goal、1 个 confirmed `input_binding`，Item 状态变为“处理中”。
- 同一页面重复 Start、刷新和 Web 进程重启后再次 Start 都返回同一个 `goal_id`，`created=false`，revision 不再增加。
- 对账结果：该 Item 的 input binding 数为 1；目标 Goal 的 Run 数为 0。打开 Runtime UI 不会绕过 Claim/Run 规则自动执行。
- 浏览器实测发现并修复了一个真实回归：此前 URL 已进入 Goal，但界面仍停在 Inbox；现在 `feed-start=1` 会显式切换到 Goals 目录、目标 Goal 和 Runtime。

自动化证据：`tests/desktop-tui.test.ts` 中 `Feed start reuses one Draft Goal across repeat clicks and a Web restart`。

## AC2

选定 Runtime 后，上下文只进入 Terminal 输入区，保持可见、可编辑且未发送。

- 隔离 QA 流程：Inbox Item → 开始处理 → 目标 Goal Runtime → 自定义命令 `/bin/sh` → Terminal 自动填入。
- Terminal 状态显示“Item 上下文已填入，检查后再发送。”；屏幕中只有 1 次 Goal prompt 和 1 对 UNTRUSTED 边界。
- 输入行末保留光标，没有追加回车，也没有产生第二个 shell prompt 或命令执行结果。
- 上下文包含类型、Source、作者、原始链接、标题、摘要、正文和选中的 Material。
- 指定 `item_id` 会由服务端核对仍与当前 Goal 绑定；解绑或错配返回 409 和“返回 Inbox 或 Feed 重新开始处理”的恢复说明。
- PTY 会等待 Runtime 首次输出后再填入，避免 shell/TUI 初始化时重复回显同一段上下文。
- 576×656 实测直接进入 Runtime，Terminal 宽 548px，无横向溢出，移动端 Runtime tab 为选中状态。

终态截图：![Runtime TUI autofill](../../.impeccable/review/runtime-tui-autofill-final.jpg)

## AC3

外部内容只作为未信任数据进入 Runtime，凭据和控制边界不会泄漏或升级为指令。

- 上下文中唯一的 `<UNTRUSTED_FEED_ITEM_DATA>` 区块不能被外部正文提前闭合；伪造 marker 会替换成普通文本。
- `Authorization`、`Proxy-Authorization`、Cookie、access/refresh/id token、API key、client secret、password、credential、常见 Provider token、JWT、AWS access key 和私钥块在最终 TUI 边界统一脱敏。
- 实际 QA Item 中的三个假秘密 `qa-runtime-secret`、`qa-url-secret`、`qa-material-secret` 均未出现在 Terminal；对应位置显示 `[REDACTED]`。
- Terminal 写入前移除控制字符；上下文不会自动发送，也不会自动领取 Goal 或创建 Run。

上下文快照（节选）：

```text
<UNTRUSTED_FEED_ITEM_DATA>
来源类型：Inbox Message
来源：QA Connector
原链接：https://example.com/qa?access_token=[REDACTED]
正文事实：版本 2.4 需要人工核对。
Authorization: [REDACTED]
client_secret=[REDACTED]
</UNTRUSTED_FEED_ITEM_DATA>
```

## 自动化结果

- `pnpm typecheck`：通过。
- `node --import tsx --test tests/desktop-tui.test.ts`：29/29 通过。
- `node --import tsx --test tests/web.test.ts`：39/39 通过。
- `pnpm test`：287/287 通过，包含 build、Web、PTY、Feed 安全和发布包回归。
- `git diff --check`：通过。

## 边界

- QA 使用隔离临时项目和假秘密；没有读取或写入真实 Provider 凭据。
- 没有向 GitHub、Gmail 或其他来源写回，没有自动发送 Terminal 输入，也没有删除 Relay。
