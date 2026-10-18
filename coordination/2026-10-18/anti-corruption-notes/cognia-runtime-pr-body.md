Cognia 知识库、目录导入和生成迁到 Home Plugin Runtime，各项目继续共用原 `cognia/cognia.db`。固定版本、30 分钟预览、导入与草稿采纳幂等保持；移除旧 Host 动作、HTTP 和模型适配。

- 读写经 Runtime 库端口，事务前复核原调用资格。模型仍用共享 Prologue、原提示与用户覆盖、180 秒上限；取消、停用、撤权或领域删除后无晚到草稿。
- 页面经共同请求客户端调用完整插件路由；宿主绑定页面项目。32 MB 原始批次声明 45 MB 请求上限，下载走共同隔离响应。
- 25 个业务动作 id/version/schema、MCP 名、库基线 1 和结构保持。Cognia 客户端 23,963→23,703 B（−260），25 项资源共 7,480,612 B。

最新本地整合证据（2026-10-17）：各候选整体/workspace 构建、公开 API、boundary、对各自前序的 merge-base health 与资源均通过，快查基线已下调。共同包要求、安全与相关消费者在最终后台授权组合 `8a85183297e8d691c7111bfc7621bfd27104b575` 上统一验证：198 个非浏览器文件 1,803 条通过、1 条原有公网 npm 条件跳过；5 个 Chrome 文件 20 条通过。合计 203 文件、1,823 条通过、0 失败。此为组合证据，不能当成每片独立全量；当前安全表门禁已通过。完整日志 `/tmp/molis-platform-combo-{regression,browser}.log`，清单 `/tmp/molis-platform-combo-files.json`。全量及最终 main 整合仍由既定队列推进。

本 Cognia 组合独立定向 18 文件 378 条通过。真实 Chrome 覆盖桌面/窄屏导入、审阅采纳、模型设置与恢复及对象情境。依赖 Cognia 平台前置片；尚未推送，接实际 main 后复核最终 diff 和资源。Spec：RAC-40～44。真实 Home、外部真实模型与一骏本人验收尚未进行。
