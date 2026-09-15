# 生产改造验收

**已达到完成等级 4（本次改造范围内的内部完整），2026-09-10。01–05 均已由主 Session 验收。** 下表汇总已实际执行的证据；安装发布、真实用户项目迁移、真人长期试用与代表任务性能对比未运行，不宣称可发布或调用/token 收益。

| 用户行为 / 约束 | 当前结果 | 证据 |
| --- | --- | --- |
| 无模板创建意图、采用工程规划、追加 Goal 局部类型 | 通过 | 02 Host/MCP 真实集成及 `02-accepted-tests.log`；跨 Goal 默认要求、规划升级后重试的独立复现通过 |
| 类型版本隔离、合法部分报告、多要求支持/反证/未知、历史原文可读 | 通过 | 01 公共 Module + 临时 SQLite；`01-accepted-tests.log`，02 最新报告独立复现 |
| 非法输入整批回滚、同键重放不重复、旧版本不能覆盖 | 通过 | 01 两连接与事务回归；03 正式变更回归；04 HTTP 与浏览器冲突路径 |
| 普通支持不自动完成、可信用户决定、范围内授权复用 | 通过 | 03 真实 Host/MCP/Native；`03-review-{repro,gates,effects}`，Runtime 伪造用户身份被拒绝 |
| Concern、受阻收尾、显式完成、相关反证重开、取消及恢复 | 通过 | 03 状态与门禁独立复现，最新决定及同毫秒接收顺序回归 |
| 父目标记录自身整合，不能由子目标数量自动完成 | 通过 | 03 父目标独立收尾与旧入口门禁回归 |
| 重启接续与非空旧库升级保留事实、判断及来源 | 通过 | 01 重开/升级、02 新 Session 读取、03 `review-upgrade` 独立复现 |
| 时间线读写、历史分页、阅读选择、桌面与窄屏表单 | 通过 | [04 验收](work-items/04-goal-detail/acceptance.md)；六项视觉修正的独立 finish verdict |
| 响应丢失重试不重复、跨 Goal 阅读归属、保存后树与正文同步、刷新不清空冲突草稿 | 通过 | 04 四个真实故障脚本及事件组合路径；最终 40 项相关回归无失败/跳过 |
| 移除旧五 tab、失效 fragment 与监听器，保留有效能力的实际入口 | 通过 | [05 清理映射](work-items/05-cleanup-and-acceptance/spec.md)；退休 context surface、私有参数与精确独占样式已删除，116 项及最后 9 项受影响回归通过 |
| 旧草稿不能改写事件 owner；未转交草稿仍可编辑 | 通过 | 清理后构建；主 `05-independent-owner.log`：精确 owner 错误、所有相关状态不变、legacy 编辑落库 |
| 迁入关系/风险、旧验收覆盖与 Artifact 在桌面/窄屏可用 | 通过 | 长草稿、风险/Artifact、原约束/输入/输出及完整原标准真实浏览器脚本通过，读取状态不变；阅读器与转交表单互斥已修复。独立 [05 finish review](work-items/05-cleanup-and-acceptance/finish-review.md) disposition: ship，范围为8张截图；最后原标准2张截图经主复核 |
| 完整测试、构建、边界检查、文档与可打开的生产预览 | 通过 | 主完整回归810通过、0失败、0跳过（05-final-full-tests.log）。后续有限清理的116项、原值修正9项、私有参数清理9项受影响回归及构建/边界通过；产品双语文档、Skill、DESIGN/sidecar已同步；隔离本地预览已实际打开。详见 [05 acceptance](work-items/05-cleanup-and-acceptance/acceptance.md) |

01–03 的详细命令与验收结论见 [implementation.md](implementation.md)。诊断日志位于 `/private/tmp/molis-work-grok/`。不会将未运行项目写为通过，也不以测试数量宣称可发布。

无阻塞未完成项。三项非阻塞视觉细节保留在 05 finish review。可从 [试用目标](http://127.0.0.1:49797/goals/goal-4facb41b-7ac0-41d4-bbd6-588f4a5fec2a) 或 [空白目标](http://127.0.0.1:49797/goals/goal-09869bf1-26fa-4ca7-8a99-e7f8677f5d95) 体验；使用临时数据库，未改变真实用户项目。代码未提交、推送、安装或发布。
