Cognia 迁到 Home Plugin Runtime 前，平台补齐三项现有行为：32 MB 原始文件批次的 Base64 上传、原字节附件下载和实际模型名称。插件迁移另片交付。

- 显式 `max_body_bytes` 封顶为 45,000,000（用户已批准）；项目默认 256,000、Home 默认 12 MiB 与其他路由声明保持。
- 普通 Runtime HTTP 落实现有 bytes 合同，Host 固定 attachment、octet-stream、nosniff、sandbox、no-store。
- `availability()` 增加可选 `runtime_label`，只读当前配置元数据；失效或无授权不返回标签，不解密或请求模型。公共 API 与手册同步，业务动作合同不变。

最新本地整合证据（2026-10-17）：各候选整体/workspace 构建、公开 API、boundary、对各自前序的 merge-base health 与资源均通过，快查基线已下调。共同包要求、安全与相关消费者在最终后台授权组合 `8a85183297e8d691c7111bfc7621bfd27104b575` 上统一验证：198 个非浏览器文件 1,803 条通过、1 条原有公网 npm 条件跳过；5 个 Chrome 文件 20 条通过。合计 203 文件、1,823 条通过、0 失败。此为组合证据，不能当成每片独立全量；当前安全表门禁已通过。完整日志 `/tmp/molis-platform-combo-{regression,browser}.log`，清单 `/tmp/molis-platform-combo-files.json`。全量及最终 main 整合仍由既定队列推进。

Cognia 组合的独立定向 18 文件 378 条通过，包括真实请求体边界、强制附件、模型切换与权限失效；该 18 文件也含插件迁移用例。此平台片资源增量为零，后接插件片才减少 Cognia 客户端 260 B。尚未推送；按 Todo、流式、材料、灵光、平台前置、Cognia 的顺序接实际 main 后交付。Spec：RAC-37～39。
