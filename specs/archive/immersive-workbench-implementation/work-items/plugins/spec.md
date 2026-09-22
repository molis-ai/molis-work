# Plugins：项目入口与内置市场

depends_on: shell（conversation 按用户要求延期）。

输入：总 spec；Projects catalog、原生 Goals/Work/Feed/Artifacts UI contributions；shell 插件目录。

产出：四种内置插件卡片市场，选择项目添加并持久化；所属项目目录按激活显示；Artifacts 原有目录和精确版本详情同页。

允许修改：Projects module/contract 的插件入口配置；Local Host catalog/HTTP/page model 装配；Workbench 市场/导航/Artifact contribution；对应 tests。不能改变通用 Plugin Runtime 的签名/授权规则，不能下载代码，不删除未显示插件的数据。

方案：存储已知内置插件 ID 与项目关系，唯一性约束防重复；升级的老项目保留全部原有入口，新项目默认 Goals。市场添加调用真实入口，结果读回；不存在项目/未知插件 ID 拒绝。刷新和另一项目独立。插件入口配置不是底层 MCP/API 权限，业务模块仍由 Host 装配。保留既有 Artifact 导出和精确版本链接，在工作区用贡献片段渲染。

验收：添加到另一项目后仅该项目出现、重复无新增、重开 catalog 仍在；搜索/筛选/目标项目选择有效；空项目创建 Goal 只有本项目事实；Artifact 版本选择/导出仍正确且不把版本换成 latest。

验证：模块真实 SQLite 与正式 HTTP tests、双项目浏览器路径、Artifacts 已有业务回归；无真实用户项目写入。

handoff：迁移策略、API/UI 路径、测试结果及已声明的内置市场范围。

交付状态（2026-09-12）：本项已完成；验收证据和已声明的原生 App 未运行边界见 ../../progress.md。对话接入按用户要求延期，不是未完成的必需项。
