Jelly 保存了独立的供应商和模型选择，但 Runtime 模型服务此前只调用默认模型。新增 `PluginModelSelection`，使 `services.model.complete(prompt, { selection })` 和 `availability(selection)` 使用同一目标；不指定时保留默认行为，明确选择无效或不可用时拒绝，不改用另一供应商。地址、凭据、配置和连接检查仍由 Host 的现行推理入口负责。

Runtime 在首次等待前校验并复制两个 ID，调用方之后修改对象不能改变这次目标；生成期间连接失效，结果不会交给插件。API 快照、Runtime README、Prologue Skill/手册及插件开发说明同步。此片仅补模型调用入口，不迁移 Jelly 的偏好文件、专用配置或界面。

验证：整体构建、API、boundary、merge-base health 和页面资源通过；25 资源共 7,480,612 B，本片增量 0。5 文件 51 条与相关包补充 83 文件 954 条全部通过，共 88 文件、1,005 条，0 失败/跳过。新增测试经隔离 Home 的公开配置 HTTP、真实 Runtime 和本机模型替身，证明目标路由、不可用拒绝、异步选择快照及连接变化后零结果/零写入；已加入 CI 产品子集。未运行本机全量，未验证外部真实模型；共享核心全量与 Linux 新用例仍待 CI。

本地候选 `e8925f8eaf5d9ad0152b16c3441a79bd7d3b875b`，基于后台授权候选 `46058ab7b`；实际发布前按前序与 main 整合复核。当前仅本地准备，不增加第三个在途 PR。
