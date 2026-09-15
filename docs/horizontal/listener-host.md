# Listener Host

**提供：** 根据 Source intent 启停 listener；保存 cursor/checkpoint/lease/retry/quarantine；调用 Integration Adapter 把 Raw Event 转成 Signal Draft；收到 Signals Receipt 后推进 cursor。

**技术状态：** listener instance、cursor、durable raw delivery、attempt、backoff、health 和 crash recovery。

**不拥有：** Source 配置、正式 Signal、Feed/Attention/Goal/Automation 决定、Provider credential 或 External Action。

**恢复规则：** Draft 未被 Signals 接受前不能推进 cursor；重复投递必须可去重；暂停、进程重启、乱序和 adapter 升级都要有明确恢复结果。

**当前来源与 Goal：** `horizontal/listener-host` 管技术状态；Native Feed SourceScheduler 与 ConnectorSync 编排轮询；Local Host Web timer 管运行生命周期。FD1/Cutover 已完成旧路径退出。

**FD1 当前实现：** `@molis-ai/molis-work-service-listener-host` 已保存独立 cursor、lease、durable delivery、attempt、retry、quarantine 与 Run。Raw Event 先落盘，再交 Adapter 形成 Draft；只有收到 Signals Receipt 后才确认 delivery 和推进 cursor。同 operation 可在重启后恢复，终态 replay 不再调用 Provider。
