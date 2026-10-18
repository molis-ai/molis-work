## 做了什么

Runtime 插件可在 POST 路由声明 `stream: "ndjson"`，经共同动作服务实时报告进度，Host 写唯一的结果或错误末行。Home 与项目共用传输；HTTP 断开、停用、撤权、升级后结束等待，迟到的处理器、模型文字和结果均不能继续交付或写业务记录。对应唯一 spec 的 RAC-20–24。

前置为 #684（Todo Runtime）。本草稿暂以 `feature/w5-01-todo-runtime` 为基线，只展示流式路由这一片，供先行审阅。#684 合入后移到实际 main、改基线并启动正式 CI；不加全量标签、不自行合并。当前目标分支不匹配仓库 CI 的 main 过滤条件，草稿上的本地验证不能代替正式 CI。

## 验证

- [x] 在 Todo `8738385e395f229a72ef473fa67f6bbf757c9f69` 上重放本片四个提交，检查最终差异；业务实现无冲突，需求书状态句保留最新状态。
- [x] `pnpm build`、`pnpm workspace:build`、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main` 通过。
- [x] 页面资源同时对 main merge-base `8fcff0442` 与 Todo 候选检查通过：25 项共 7,479,372 B，本片增量 0 B。
- [x] 当前组合的包要求与安全回归：162 个非浏览器文件、1,538 条通过、1 条原有沙箱环境条件跳过；`tests/plugin-sample.e2e.test.ts` 经真实 Chrome 通过 1 条。合计 163 文件、1,539 条通过、1 条跳过、0 失败。
- [x] `pnpm secrets:check` 通过；推送时复查。
- [ ] 共享核心全量：交统筹在 CI 排，本机不跑全量。
- 先前切片的 150 文件、安全拒绝、真实 HTTP 及 Chrome 结果保留在 spec 中；不将旧基点结果称为当前组合通过。

## 公开合同与 API 影响

三份公开快照随源码更新：`contracts/platform/actions`、`contracts/platform/plugin`、`plugin-sdk/index`。新增可选路由 `stream`、请求 `emit`、共同 NDJSON 行类型、动作客户端第四个 `transport` 参数、模型 `onText` 与 SDK 进度上限常量；现有 JSON 路由与未传新参数的调用保持现行行为。Host、Runtime 与 SDK 同片接通，可信 execution 对象身份保持；无动作 schema、版本或 MCP 工具名变化。浏览器统一读流器在后续灵光迁移片接入。

进度每行至多 65,536 B、最多 10,000 行且总计 1,048,576 B；超限取消并返回 `actions.output_invalid`，插件不能伪造最终结果。按用户已批准决定，只有显式声明 `max_body_bytes` 的路由可用至多 36,000,000 B，未声明的默认上限不变，超一字节先拒绝为 JSON 413。S-03、S-18、插件 Skill 与手册同步。

## 只许减少的数字与基本合同

健康门禁无增长；Runtime 停止请求同步撤销当前 activation 的授权和动作注册，原队列负责清理，巨大类少一行。身份取自 Host 上下文；能力仍只注册一次；等待后的业务写入仍经原 `beforeEffect()`；模型调用沿现有 Agent Host 端口。没有新增页面资源、包、依赖、存储结构或安全编号。

同途 #701 也改 `platform/plugin.ts`、PluginRuntime、SDK Manifest 与 API 快照，但当前改动位置不同。后合一方按实际 main 整合并重建快照；不带入 #701 的功能。最终完整 head 与验证结果在本聊天交用户转达统筹。
