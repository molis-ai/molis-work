# 05 清理与内部验收

状态：已由主 Session 验收，2026-09-10。完成等级 4（本次改造范围内的内部完整）；不包含安装、发布或真实用户项目迁移。

| 验收项 | 结果与证据 |
| --- | --- |
| 全仓回归基线 | 810 通过、0 失败、0 跳过；`05-final-full-tests.log`，776 秒。基线包含原定义字段迁入与 Session 共用样式修正；其后有限清理另用受影响回归验证 |
| 构建与包边界 | 最后清理后的构建通过，boundary errors=[]、diffcheck 通过；`05-context-primitives-*`。其后仅修改产品文档、设计规范和验收记录 |
| 事件 owner 与旧草稿边界 | 主独立 owner 用例通过：事件 owner 拒绝旧草稿写入且状态不变；未转交草稿真实落库 |
| 长草稿真实操作 | 1440/390 阅读区内滚动、按钮命中、保存与读回通过；`05-final-definition-draft-layout.log` |
| 关系、风险及 Artifact 精确版本 | 深链、移动端阅读、v1 原内容真实点击通过，读取不改变业务记录；`05-final-definition-readers.log` |
| 原约束、输入、输出 | accepted legacy Goal 无草稿编辑器时仍可读原值，读取不转交 owner；`05-final-main-definition.log` |
| 迁入区域视觉 | [独立审查](finish-review.md) `disposition: ship`；8 张真实桌面/390 截图，无阻塞项 |
| 原验收标准完整明细 | 通过。真实 accepted legacy Goal 展开显示原 ID、判定方式、目标值和所需证据；桌面/390 可读，读取不改变 Goal/criteria/owner。`05-context-tail-final-legacy-criteria.log`；主已看两张最终截图 |
| 原目标值与提示准确性 | 通过。HTTP 原值包含附加键时完整保留；原标准提示不误称其不参与 legacy 当前判断。`05-context-tail-final-tests.log`，9/9；构建、boundary 与 diffcheck 通过 |
| 退休 context surface 与精确旧 panel CSS | 通过。五个退休 surface、独占模型、私有辅助函数、多余参数及单数 panel CSS 已删；保留五个实际消费者、回收站复数容器及 Session 共用样式。`05-context-tail-tests.log` 116/116，四个真实浏览器脚本通过；最后无行为变更的参数收口 build、9/9、boundary 与 diffcheck 通过（`05-context-primitives-*`） |
| 生产预览 | 已启动并实际打开：配置好的试用目标与空白目标。浏览器已看到新时间线、当前要求、局部类型及记录入口；最新构建刷新后工作规划可读。使用独立临时 SQLite，未接触真实用户项目 |
| 文档与设计规则 | 通过。PRODUCT、中英文 README/Runtime/MCP、SSOT、模块与 Goal Skill 已同步事件默认入口、可信决定及旧协议边界；75 个本地文档链接检查通过，最后双语事实复核通过。DESIGN.md 与 .impeccable/design.json 已按真实生产样式更新，主已复核时间线、当前概况、阅读器互斥、窄容器和 Runtime 规则；`05-docs-links.log`、`05-docs-final-consistency.log`、`05-documenter-events.ndjson` |

删除与保留的具体理由见 [清理清单](spec.md)。普通报告不会自动完成；历史事实不改写为新批准。原 Claim/Run 协议仍服务未转交旧目标及 Host 实际租约职责，Runtime 终端的 JSON panels 接口仍有消费者。

本项无阻塞验收项。独立视觉审查的三项 P2 保留为后续细节：390px 风险标签换行、草稿辅助入口与因素阅读区相邻、阅读器滚动条主题；不影响本次读写与阅读路径。未运行安装/发布、真实用户项目迁移、真人长期试用与代表任务性能对比，因此不宣称可发布或调用/token 收益。

诊断日志和隔离浏览器脚本位于 `/private/tmp/molis-work-grok/`。全仓命令为 `env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 tests/*.test.ts`；这里只隔离测试进程的 Node 警告与颜色环境，没有放宽业务断言。

本次本地试用：[配置好的目标](http://127.0.0.1:49797/goals/goal-4facb41b-7ac0-41d4-bbd6-588f4a5fec2a)、[空白目标](http://127.0.0.1:49797/goals/goal-09869bf1-26fa-4ca7-8a99-e7f8677f5d95)。这是开发会话的临时服务，不是已安装或已发布的应用。
