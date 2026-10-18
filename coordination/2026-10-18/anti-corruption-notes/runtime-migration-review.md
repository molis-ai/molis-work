# Images / Jelly Runtime 整合复核

结论：指定范围未发现 Blocker/P1 或当前必须修复的新风险。只读审查，未修改代码、未自行运行构建或测试。

范围：wt-model-selection 的 a9178e5c5..HEAD，以及当前未提交的迁移错误回归 fixture。

- catalog 移除 Images/Jelly 的旧 home_store，Runtime database 声明仍保留，避免双重注册。
- selection / inspect / connections 不再重入完整 authority 检查，仍检查有效安装、声明/授权、当前 action scope 与取消；写操作及真实调用仍经过 beforeEffect 和同步 authority 检查。
- Host 返回派出时的 revision，Runtime 交付前核对当前 revision；Images 按返回 revision 检查文件创建与任务完成，失败记账也受原始或结果 revision 约束，未把事后新版本冒充旧结果版本。
- Home 项目路由从已验证 path project 构造 localWebActionContext，项目可见性在执行控制里再次校验；请求体/query 不给项目身份。
- bytes 响应只允许 PNG/JPEG/WebP 的 MIME 与显式 inline，其他类型仍 attachment/octet-stream；nosniff、sandbox、no-store 由 Host 固定，不采信插件 headers。
- Images routeContext 在 SDK 的 actionErrorResponse 规范化前截获未知错误，保留合法 owner/platform 码。旧日志中的 SQLITE_CORRUPT 路径泄露发生在修复前，不能用来断言当前仍失败；新真实 Runtime 回归已通过。

验证证据：/tmp/molis-runtime-image-http-tests.log 显示 images-plugin 2/2、security-invariants-plugin-route-attachments 6/6、shelf-jelly-cognia-images-error-model 12/12、images-concurrency 1/1，4 个文件全部通过。错误回归 mock ImagesService.start，并经真实 Home/project Runtime route 调用，覆盖未知 Error 的通用错误句；不是只模拟最终已有 code。/tmp/molis-runtime-recursion-fix-build.log 末尾正常完成构建。旧 /tmp/molis-home-project-route-tests.log 含已知修复前失败，不作为当前通过证据。

限制：未重新执行全量/浏览器回归；整体最终验收、公共合同快照与门禁由主会话汇总。
