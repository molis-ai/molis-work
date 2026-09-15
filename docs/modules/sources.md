# Sources

**白话：** “我在听哪里”。

**拥有：** Source 身份、owner、Project context、provider Plugin reference、显示信息、enabled/paused/disconnected、监听范围、schedule intent、history policy 和 connection reference。

**公开面：** 列表/读取 Source 与连接摘要；create/configure/enable/pause/resume/disconnect/request sync；发布 Source 生命周期事件。

**不负责：** Secret 只保存安全引用；cursor、poll lease、retry 是 Listener 技术状态；外部事件、Feed 处置和 Goal 分别归 Signals、Feed、Goals。

**当前实现与 Goal：** Sources Module 拥有来源配置，Native Feed 管理来源用例，Integration Plugin 解释 Provider；FD1/FD3/Cutover 已退出旧 src/feed。

**FD1 当前实现：** `@molis-ai/molis-work-module-sources` 已提供 Source Query / Command 和独立 Repository。Source record 不含 cursor、lease、retry；旧 `FeedStore` 的 Source 方法只转发到新 owner。公开 RSS/Web Query/YouTube 的 provider 编排和 Web caller 仍按 FD3/FD4 退出。
