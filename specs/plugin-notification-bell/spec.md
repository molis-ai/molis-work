# 标题栏插件通知铃铛

状态：实现中。目标完成等级 **3：功能可用**。不改用户真实库，不发布。

## 背景与问题

插件之间通过事件协作（例如 Coding 发出文件变化，Files 订阅）。一次投递中途中断、结果未知时（例如宿主在处理途中退出），Runtime 把这个订阅游标隔离为「待核对」（`packages/plugin-runtime/src/events.ts` 的 `#deliver`）。隔离期间，这个订阅方不再收到同一来源、同一事件类型的后续事件（`#pending` 跳过 `quarantined` 游标），直到有人决定「跳过这一条」或「重新处理」。

- 这个决定现在只能在插件市场页里的「待核对的插件通知」区做（`apps/workbench/src/plugin-event-recovery.ts`）。用户不打开插件市场，就不知道有通知在等，对应插件的后续事件也一直停着。
- 早期设计稿（`docs/design/immersive-workbench/index.html` 等三份）在项目栏放了一个禁用的铃铛，标着「通知，暂不可用」。生产界面没有这个入口，`apps/workbench/src/i18n/en.ts` 里还留着这两条文案。

## 目标

当前项目有待核对的插件通知时，标题栏右侧出现铃铛和数量。点一下进入插件市场，直接定位到待核对通知。处理完后铃铛消失。

## 范围

- 标题栏（`renderImmersiveHeader`）在「后台任务」按钮后加一个铃铛按钮，只在当前项目有待核对通知时显示。
- 数量来自现有接口 `GET /projects/{id}/api/plugins/runtime/events` 返回的 `pending`。不新增接口、状态或存储。
- 刷新时机：页面打开时读一次；页面可见时每 30 秒读一次；插件市场里的通知列表每次读取成功后把数量同步给铃铛，所以在市场里处理完一条，铃铛立刻更新。
- 点击：走 Dock 菜单里「插件市场」的同一入口打开插件市场；「添加到」切回当前项目；通知区读取完成后滚动到可见位置，焦点落在「待核对的插件通知」标题上。
- 没有项目的页面、嵌入分栏里的页面不显示铃铛，也不轮询。读取失败时保留上次结果，不打扰用户。
- 文案：铃铛的 `aria-label` 与提示都是「插件通知：{count} 条待核对」，英文同步补上。

## 非目标

- 不做通用通知中心，不合并插件更新、后台任务、Inbox 等其他提醒。
- 不在铃铛里直接处理通知。跳过或重试仍在插件市场的核对对话框里完成，保留现有「先核对、明确选择、写明依据」的合同。
- 不改事件恢复的服务端合同、权限和状态机。
- 不做系统通知或声音。

## 用户路径

1. 某个插件的事件处理中断。几秒到 30 秒内，标题栏右侧出现铃铛和「1」。
2. 点铃铛。插件市场打开，页面滚到「待核对的插件通知」，焦点在标题上。之前「添加到」选的是别的项目时，切回当前项目。
3. 核对并确认一条。列表重读，铃铛数量同步减少；清空后铃铛消失。
4. 切到别的应用再回来，页面重新可见时立即重读一次。

## 方案与关键决策

- **只在有待核对时出现。** 和旁边的「后台任务」一致：标题栏保持安静，没有通知时布局不变。铃铛出现本身就说明有事等你，所以它总是带数量和注意点。
- **一条导航路径。** 点击铃铛时触发 Dock 菜单里「插件市场」那一项（⌘K 快捷操作也是这样打开插件市场的），不另写一套打开逻辑。
- **数量同步。** 通知列表每次读取成功后在 `document` 上发出 `molis-work:plugin-events`（`detail.pending` 为条数）。铃铛自己用插件生命周期的 `poll` 读取，页面隐藏时停，重新可见时立即读。
- **定位。** 铃铛发出 `molis-work:plugin-events-reveal`。插件市场把「添加到」切回当前项目；通知区记下这次请求，在下一次读取结束后滚动并聚焦标题。通知区已经可见时直接重读。
- **轮询间隔 30 秒。** 待核对通知来自中断恢复，出现频率低；接口就是插件市场本来在用的那个，页面打开时插件运行平台已经为读取插件更新启动过，轮询不会额外拉起它。

## 文件与模块边界

| 文件 | 改动 |
| --- | --- |
| `apps/workbench/src/immersive-shell.ts` | 标题栏铃铛标记 |
| `apps/workbench/src/scripts/client/plugin-notifications.ts`（新） | 铃铛客户端：读取、显示数量、点击定位 |
| `apps/workbench/src/scripts/client/plugin-event-recovery.ts` | 读取后发出数量；响应定位请求 |
| `apps/workbench/src/scripts/client/plugin-workbench.ts` | 定位时把「添加到」切回当前项目 |
| `apps/workbench/src/scripts/client/initialization.ts` | 装配铃铛客户端 |
| `apps/workbench/src/styles/immersive-navigation.ts` | 铃铛样式，沿用「后台任务」按钮 |
| `apps/workbench/src/i18n/en.ts` | 英文文案 |
| `DESIGN.md` | 标题栏右端状态控件的约定 |

不动 `apps/local-host`、`packages/plugin-runtime`。

## 验收标准

- 没有待核对通知时，标题栏里铃铛隐藏，标题栏布局与现在一致。
- 插入一条真实的待核对通知（SQLite 里的 `quarantined` 游标），铃铛出现，数量为 1，`aria-label` 为「插件通知：1 条待核对」。
- 点铃铛后插件市场打开，「待核对的插件通知」区可见且在视口内，焦点在它的标题上。
- 「添加到」先切到别的项目，再点铃铛，会切回当前项目并显示通知区。
- 在插件市场确认处理后，铃铛立即隐藏，不等下一次轮询。
- 嵌入分栏与没有项目的页面不发出这个读取请求。
- 浅色与深色主题下铃铛可读；390px 宽度下不溢出标题栏。

## 验证命令

- `node scripts/run-tests.mjs tests/plugin-event-recovery.e2e.test.ts`（扩展：铃铛出现、定位、处理后消失）
- `node scripts/run-tests.mjs tests/plugin-notification-bell.test.ts`（新：标记、样式、文案）
- 工作台必跑：`node scripts/run-tests.mjs tests/plugin-declarative-mounting.test.ts tests/builtin-plugin-agent-texts.test.ts tests/builtin-manifests-contract.test.ts tests/builtin-plugin-composition.test.ts tests/workbench-ui-platform.test.ts tests/i18n.test.ts tests/client-script-undeclared.test.ts`
- 界面加跑：`node scripts/run-tests.mjs tests/workbench-tab-workspace.e2e.test.ts tests/immersive-directory.e2e.test.ts`
