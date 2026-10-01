# 端到端复查修复结果

2026-09-27。用户“全部修复”授权后的实现与回归记录。原始问题和复现保留在 [report.md](report.md)；本记录覆盖其 4 项 P1、1 项 P2。五项均已修复，目标仍是功能可用的项目讨论切片。

| 原问题 | 实现 | 验证证据 |
| --- | --- | --- |
| 缓存话题漏掉中间消息 | `browser/history.ts` 补齐到已确认的历史边界，分页游标对应最旧覆盖页；发送回执不能推进同步边界 | 浏览器先缓存第 000 条，回主群后第二成员真实发送 115 条；返回 DOM 连续包含 000–115 共 116 条。定向测试另验多页、旧游标、空缓存与发送/同步交错 |
| A 回执删除新草稿 B | `browser/drafts.ts` 按 client_id 条件清理；话题提交持有独立快照，消息草稿也按版本清理 | 真实 POST 已提交但浏览器延迟返回；期间编辑 B，释放 A 后离开并重开 B，标题与正文完整。原有草稿已恢复 |
| 丢失会话后无法恢复成员 | 受既有 local control token、Origin 和真实目录保护的本机桥，使用持久化项目 owner 和共享 Identity bootstrap/connect 恢复匿名会话；具名其他成员仍按 mw_access 校验 | HTTP 验丢 Cookie、过期、宿主重启、同名冒用、无控制凭证、伪造项目与非成员拒绝。浏览器删除测试 Cookie 后自动恢复同一 member ID，话题/回复草稿保留，实际发送成功。恢复后的相同 client_id 不重复写入 |
| 390×400 输入完全被裁掉 | 来源上下文并入会话滚动区；≤300px 可用高度采用紧凑标题、单行可滚动标签与紧凑输入，保留成员入口和发送对象 | 390×400 中 iframe 206px，带引用及多行长草稿时 composer bottom≈200.7px，输入高≈34px，发送可用；另已实际发出短屏回复 |
| 搜索覆盖阅读锚点 | 搜索或无布局区域不采集锚点；返回搜索恢复原位置；点击当前话题也退出搜索 | 读历史→搜索→主群→原话题，恢复同一消息及相同 offset≈47.8px、scrollTop=0；当前话题标签退出搜索且输入重新可见；搜索中收起/重开宿主仍回到同一消息 |

## 模块边界

`client.ts` 仅组装已编译的函数。`browser/controller.ts` 编排页面，`history.ts` 管历史覆盖边界，`drafts.ts` 管草稿与提交版本，`transport.ts` 管 HTTP/SSE/宿主消息。视图与 Markdown 同样使用真实 TypeScript；运行时依赖显式注入，不再把整段逻辑藏在不受类型检查的字符串里。未新增依赖或另建服务。

项目创建留在 `server/src/im/project.ts`，使用已有 ImReads 实例。搜索与读游标查询进入 ImReads；推进读游标进入 ImWrites。contracts 增加 ImSearchResult、ImReadState、ImMarkReadInput。工作台继续只管分屏、主题和可见性，不持有消息事实；共享身份是唯一成员来源。

本地恢复是本机操作者对目录项目的恢复能力；不按名字猜测成员，也不将某个 403 自动改成授权。此桥不挂载到远端共享服务。首次尚无 owner 的项目继续使用名字表单，已有其他具名成员不会被覆盖。

## 工程与实操

- 14/14 定向回归通过（6 项浏览器状态/格式，7 项 IM 领域，1 项本地项目 HTTP 综合场景）。
- contracts、server、im-ui 构建通过；Workbench 与 local-host 类型检查通过。
- 工作区结构检查：70 个包、53 个 contract subpath，无错误。scoped diff 空白检查通过。
- 最终工作台无本轮 IM 控制台 error/warn。临时 fetch 延迟已撤销，视口和主题模拟已恢复，测试草稿恢复。
- 截图已实际打开检查：[桌面浅色](fixed-desktop-light.png)、[桌面深色](fixed-desktop-dark.png)、[390×843](fixed-mobile-light.png)、[390×400 引用与长草稿](fixed-390x400.png)。左侧测试项目未启用部分插件的提示与 IM 无关，未修改或隐藏。

```sh
node --import tsx --test --test-concurrency=1 tests/im-browser-state.test.ts tests/im-domain.test.ts tests/im-local-project.test.ts
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p server/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/im-ui/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/workbench/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/local-host/tsconfig.json --noEmit
node scripts/workspace-packages.mjs
```

所有测试消息与故障注入都在隔离本地项目。自动化与实操证明上述已覆盖路径，不代表用户本人最终验收。实体触屏/软键盘、跨工作站接入同一远端 Server、大规模历史性能，以及既定后续能力仍未验证或未实现；本轮没有将产品声明提高为内部完整或可发布。未提交或发布。
