# GitHub 通知来源 QA

日期：2026-08-30

Goal：`goal-infoflow-github-connector`

## 真实账号 smoke

- 通过已有密封凭据执行真实只读同步；页面识别账号为 `@yijunw0212`。
- GitHub 返回的实际授权为 classic `repo` scope；来源详情明确标注“权限较宽”，并同时显示 Molis Work 只调用 `GET`。
- 首次新通知同步：新增 50、去重 0；GitHub 来源 Item 数从 11 变为 61。
- 第二次同步：新增 0、去重 0；Item 数保持 61，证明条件请求 / Provider 游标没有制造副本。
- 真实 Item 保留仓库、主题、reason、Provider 时间和 GitHub 原链接；`ci_activity` 通知按明确规则进入 Inbox。
- 未读取或记录任何 Token 内容；浏览器、Feed、Inbox 与运行记录只展示非秘密元数据。

## 响应式与可操作性

- 宽屏来源详情、真实运行记录：`github-connector-wide.png`
- 窄屏来源详情：`github-connector-narrow.png`
- 窄屏连接弹窗与权限说明：`github-connector-narrow-connect.png`
- 请求视口 390×844；应用有效宽度 312px，`scrollWidth === clientWidth === 312`，无横向溢出。
- 窄屏来源目录补充了可见的“添加来源”按钮，可进入 GitHub 保存 Token、断开和 Device Flow 入口。

## 自动验证

- TypeScript：通过。
- GitHub adapter：Notifications 标准化、显式 attention、Provider 时间、原链接、提前轮询、Last-Modified / 304、缺 scope、401、网络失败和限流均有定向测试。
- Connector service：可信 cursor、同来源去重、账号/scope 元数据、鉴权故障 Inbox 与恢复、限流不制造 Inbox 噪音均有定向测试。
- Feed / Source / Web 影响面：77/77 通过；窄屏连接入口有静态回归断言。
- 生产构建：通过。
- 全量测试：338/339 通过；唯一失败为仓库既有的静态英文翻译完整性测试，报告的是本次 Goal 之前已存在的整批高保真/Inbox/来源中文标签。GitHub 本轮新增的连接与限流文案已有英文映射。

## 已知边界

- GitHub Notifications API 不支持 fine-grained PAT 或 GitHub App token。
- GitHub 的最小 `notifications` scope 同时包含通知写权限；Molis Work 请求该最小 scope，并在实现中只调用 `GET`。当前已有账号使用更宽的 classic `repo` scope，界面已明确披露；用户可断开并使用 `notifications read:user` 重新连接。
