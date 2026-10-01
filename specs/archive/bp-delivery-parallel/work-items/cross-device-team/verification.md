# 跨设备与团队接续验证

2026-09-26。本工作树专属范围已实现，并通过隔离业务集成、原 Gateway 授权、编译 CLI 与真实浏览器实操。公共 core 已交主树接入；统一工作台导航/主入口由 Thread owner 验证，本文不替其宣称完成。

## 自动化证据

| 路径 | 结果与有效证据 | 日志 |
| --- | --- | --- |
| 原 Goal/Artifact + 隔离 HTTP 多客户端 | PASS，测试主体 102.6 秒。桌面/手机同成员、第二成员与viewer、响应提交后丢失、重启后查原回执、同键并发只写一次、异参409、CAS409、等待中撤权不再写、设备撤回、私人目标不投影、同源保护、正式 Catalog 换目录恢复、重复导入、摘要篡改及路径拒绝 | `logs/continuity.log` |
| 实际受保护 Host 管理 endpoint + LocalActionGatewayClient | PASS，主体114.2秒。未授权拒绝、editor/viewer精确grant、原 Goal 写入和receipt、成员actor隔离、撤grant后拒绝 | `logs/gateway.log` |
| 公共 HTTP / SSE | PASS。同浏览器多端口cookie隔离、同DB重启名称稳定、IM非成员SSE403、ready/change、close断流、LAN缺HTTPS拒绝 | `logs/http.log` |
| 原浏览器脚本回归 | PASS 3项。VM执行实际client.js；退出后的迟到GET/POST不恢复内容、项目切换忽略旧响应、SSE重连403清理而普通断网保留草稿 | `logs/client.log` |
| 编译后的 headless CLI | PASS，最终6.4秒。真实serve读取页面与session及IM→SIGTERM正常退出；restore正式Catalog项目→独立read-assets进程读取原Artifact正文→所有进程正常退出。缺插件提示读取原Plugin Runtime安装记录，含所需版本；配置移除后重启，旧cookie的read/write/assets/SSE均403、旧邀请401，重新加入仅owner恢复 | `logs/launcher.log` |
| server / apps-server TypeScript | 定向build通过，产出实际CLI用于上述试验；不等于全仓build通过 | 终端命令见下 |
| 聊天领域 | 交叉兼容回归5/5通过；领域代码与正式UI接入仍属Thread owner | `tests/im-domain.test.ts` |

前四份日志为本任务工具执行原输出的提取，包含来源任务记录与时间；最后一份为原始 stdout/stderr 重定向。没有用fixture结构检查代替业务结果。

复现（依赖包已构建，Node 24+）：

```sh
node node_modules/typescript/bin/tsc -p server/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
node --import tsx --test tests/cross-device-continuity.test.ts
node --import tsx --test tests/cross-device-gateway.test.ts
node --import tsx --test tests/cross-device-http.test.ts tests/cross-device-client.test.ts
node --import tsx --test tests/cross-device-launcher.test.ts
```

一次中间实现为每次本地资产读写初始化完整Action Host，AJV schema编译导致120秒业务测试超时。经Node inspector定位后，改用原Host公开数据库/领域API完成确定性资产恢复；最终保持原测试120秒上限通过，未放宽业务断言。Gateway路径仍走原Host。

## 真实浏览器

IAB 浏览器实际打开 `http://127.0.0.1:4189/continuity`，使用专用 `/tmp/molis-continuity-browser-20260926` 数据。读取原Goal与固定成果；保存『浏览器已核对固定成果，测试保存后响应丢失。』时，QA工具在原业务提交后丢弃响应。页面正确保留待核对，点击『核对并重试』恢复成功；独立查询原Goal事件只出现1条对应摘要。最新客户端再次读取后退出，页面清除项目内容，刷新后仍保持退出。

窄屏设置390×844，受浏览器当前缩放影响实际CSS视口433px；DOM clientWidth与scrollWidth均433，无横向溢出。验证了窄屏下成果、提交与退出入口可用。此证据不是物理手机、移动系统浏览器或触摸键盘的验收。

可复现隔离实操：

```sh
node --import tsx server/tooling/continuity-demo.mts /tmp/molis-continuity-isolated-qa
```

在输出的本机地址连接，配对代码在显式QA目录的connect.json。测试响应丢失仅在QA工具中：创建该目录的lose-next-response文件，然后保存一条进展；该工具提交后删除此文件并返回未知结果，正常生产handler无测试开关。

## 完成口径与边界

- 已证实：单机部署的真实持久化Server、模拟多设备/成员HTTP客户端、原Gateway实际授权、真实IAB网页操作、无桌面窗口的正式Catalog成果迁移与资源关闭。
- 未验证：真机手机、受信任LAN HTTPS/外部云环境、两台物理设备、生产Home上的主工作台入口、用户本人验收。未公开部署，未读取私人账号。
- 资产范围：固定Artifact内容、来源身份、必要插件版本/来源凭据提示，以及Goal接续摘要。目标项目采用独立恢复ID并保存source_project_id映射；未恢复完整Goal历史、权限、完成验收或自动安装插件。
- 本工作树含大量继承的未提交基线。没有以本线定向通过宣称全仓构建通过；没有覆盖原主树。所有接入使用两份精确交接清单。

实操结束后已正常关闭4189真实QA服务，终止4188静态预览，并恢复浏览器默认视口；隔离数据保留在已记录的QA目录，可按命令重启。

## 主目录接入检查

统筹按两份冻结清单分批接入：公共core及独立apps/server均已进入主目录，Thread领域和adapter保留其owner版本。apps/server本批20新路径、README内容更新、子spec追加；7个既有workspace依赖已链接，锁只新增本app importer。主目录 `pnpm --filter @molis-ai/molis-work-app-server typecheck` 通过。统筹没有改动dist；当前主树编译CLI复验交统一构建owner安排，子树已通过证据不作为该项替代。

统一构建后，动作owner在主目录运行 `node --import tsx --test tests/cross-device-launcher.test.ts`，compiled CLI 1/1通过，0失败/跳过，约9.38秒。原始日志 `/tmp/action-cross-device-launcher-main.log` 已由统筹读取核对。此结果补齐主目录编译启动器的启动/退出、配置撤权、正式Catalog资产恢复检查；真机、LAN/云、统一主界面与用户验收仍保留原未验证边界。
