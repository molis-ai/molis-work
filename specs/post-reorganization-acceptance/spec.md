# 重构后真实使用验收

## 目标与范围
用户确认在目录归拢后验收新构建的安装、首次使用、目标闭环与重启恢复，达到内部完整后再处理日用更新。基准提交 7b00098。使用临时 Molis Work Home、临时 npm consumer 和独立 Web 端口；现用项目、Runtime 配置、4173 服务保持不动。不得公开发布。已有 desktop 图片删除保持未提交。

## 证据与方案
此前已验证 38 包构建、入口回归、Cargo 测试与 debug App 打包，但没有实际新 npm consumer 安装或新 App 启动。
1. 从上一轮生成的独立 tarball 进行真正 npm install，下载 registry/native 依赖，使用正式 CLI 安装到临时 Home；验证源移除后启动。
2. 在隔离 Home 通过正式 CLI/Web/MCP 创建项目、确认目标、执行、证据和完成，检查重启及跨入口状态。复用已存在协议回归作为辅助证据，不将测试等同真实 Runtime 对话。
3. 桌面 App 的健康检查和 URL 固定 4173；临时 MOLIS_WORK_HOME 不隔离端口。先明确可行启动方法，不能将连接旧服务算新构建服务验收。
4. 仅修复能复现并阻塞上述验收的问题，修改前补充此 spec 的根因、文件范围和验证。完成后记录通过、失败和未运行项，再决定是否达到更新门槛。

## 验收
- 新 npm consumer 不借用 workspace node_modules，原生依赖可加载。
- 正式安装器产出可独立运行 CLI/MCP/Web 的 release，安装本身不创建项目、不写真实 Runtime 配置。
- 用户目标从澄清到确认、执行、证据、完成的状态持久化，重启可恢复，Web/MCP 所见一致。
- 新桌面 App 实际启动证据与所连接服务来源明确，首次安装和重启证据分别记录。
- 日用升级仅在上述验收足够后操作，保留已有用户数据；若需要影响现用服务则先说明具体影响。

## 验证与输出
沿用 tests/runtime-skill-flow.test.ts 的领域协议回归；真正 npm install/installed CLI/stdio MCP/HTTP Web 和 UI 检查作为运行证据。验收记录写本目录 acceptance.md。不为测试方便添加产品开关；测试缺口明确保留。
