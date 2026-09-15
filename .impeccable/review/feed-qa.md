# Feed 信号工作台 QA

日期：2026-08-30
完成等级：4 · 内部完整

## 自动验证

- `npm run typecheck`：通过。
- `npm run build`：通过。
- 共享工作区完整回归 `pnpm test`：285/285 通过，覆盖安装升级、MCP、Goal 生命周期、Web/Desktop、Feed/Inbox、来源连接器、加密与 E2E。
- 本轮定向回归：migration 23、已读幂等与 revision 稳定、Relay 刷新保留本地已读/处置、Feed 动作 API、Desktop 共用壳层、英文词条均通过。
- 最后一处筛选空态修复后重新执行 typecheck、build、相关 Web/i18n/Feed 定向测试，并在真实页面完成交互复核。

## 真实页面复核

项目：`Molis Work 信息流工作台重设计`

- Feed 入口显示 152 条真实订阅信号；可见 Inbox Message 为 0；页面不再提供跨类型筛选器。
- 打开 `feeditem-3c04b879-adde-425b-9473-8194c0bd51e2` 后，列表与详情均从“未读”变为“已读”；刷新页面后仍为“已读”。
- 长内容详情共 1112 个可读字符，正文列宽、来源、时间和原文入口清楚；开始处理、升格 Goal、保存资料、忽略四个动作均在详情就近可见。
- 720×820 下分别检查 Item 列表与详情：标题/摘要正确截断，已读状态可见，四个动作换行为 2×2，无横向溢出。
- 搜索无匹配时，可见 Item 数为 0，提示“没有符合当前条件的 Item”；点击“清除筛选”恢复 152 条，并恢复筛选前选中的 Item。
- 真实来源恢复验证：重复迁移、暂停/恢复后 TechCrunch 仍保留 20 条；失败同步保留旧数据并显示可重试提示；GitHub/Gmail 在服务重启后仍显示已连接。

## AC1-feed-read-state

- [桌面列表与详情已读一致性](feed-read-desktop.png)
- [720px Feed Item 列表与已读状态](feed-list-mobile-720.png)

## AC3-visual-recovery

- [桌面长内容首屏、原文入口和处理动作](feed-long-content-viewport.png)
- [720px 详情正文和四个处理动作](feed-read-mobile-720.png)
- [有数据但筛选无结果时的可恢复空态](feed-filter-empty-desktop.png)

## 未执行的外部写入

- 未向原内容平台写回点赞、评论或状态。
- 未删除 Relay；删除仍需单独明确授权。
