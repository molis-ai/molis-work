# PG-095：Images、Jelly 合同归各自插件

状态：工程验证通过，待独立评审、TEST 核收与合入（2026-10-24）。负责人：Codex 实现 1。本片目标是工程完成，真实产品体验和整条 PG-095 的收尾不在本片判定。

## 已接受范围与方案

本片执行统筹 [7aa12923 的 C4 PG-095 工单](https://github.com/molis-ai/molis-work/blob/7aa12923ef7720d59119529bd3973d31f2459430/coordination/2026-10-14/CODEX-TASKS.md)，沿用 [ac-registry 09555b064 的 W5-02 设计 §7](https://github.com/molis-ai/molis-work/blob/09555b064/specs/repository-anti-corruption/slices/w5-02-registry.md)。验收号 RAC-620～624，待办 BL-617；同名 C4 的 OAuth 工单独立保留。

基线是 main `df5527f278fa8e631919794d15c52cfd3f364155`。现有两份合同只声明本插件的常量和记录类型，没有平台职责。将 `packages/contracts/src/modules/images.ts` 与 `jelly.ts` 原样移到对应插件的 `src/contract.ts`，各包公开 `./contract`；插件原有根入口继续导出自己的这组名字。包内使用相对导入，包外和测试经插件公开入口，删除平台旧导出与对应 API 快照，不保留转发层。

类型字段、运行时常量、动作 id、版本、权限、输入输出 schema、存储和恢复行为均保持。Shelf 与 Alchemist 的合同、其他作者的 Images/Jelly 功能、Runtime 安装信任及登记生成不在范围。输入输出仍是同一组记录和动作数据，仅 TypeScript/JavaScript 的导入路径改变；无新依赖、权限、数据维护或真实 Home 操作。

开工前已补齐 24 个开放 PR 的完整文件列表（含 #734），并核对 ac-registry 当前 `5ee84a870` 及共享 LINES：该作者保有 W5-02，其 §7 单独交出本片。相同文件的在途改动为 contracts 导出表新增 plugin-trust/plugin-attention，以及 T1 对 Jelly 模型测试安装参数的修改；本片只删 images/jelly 导出和改合同导入，不改这些 hunk，由统筹载体合成。

## 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-620 | Images 合同由插件 `./contract` 导出，原声明不变；公开入口测试验证常量，原 Images 业务测试继续使用迁后的类型。 |
| RAC-621 | Jelly 合同由插件 `./contract` 导出，原声明不变；公开入口测试验证常量，原日历、笔记测试继续使用迁后的类型。 |
| RAC-622 | 平台两个旧子路径不能导入，源码和调用方不再依赖旧位置；公开入口测试断言拒绝，health/boundary 检查包边界和测试引用。 |
| RAC-623 | 动作 id、版本与 schema 不变；整体构建后 `pnpm actions:update` 对 `tooling/gates/actions/` 无差异，直接业务测试保留原断言。发现真实动作差异时只暂停该差异并交统筹。 |
| RAC-624 | `pnpm api:update` 仅移除两个平台 subpath 快照，其他快照无变化；README 与 SSOT 指向插件合同，contracts 无反向插件依赖。 |

## 验证与交付

按本单只在独立工作树执行必要 `pnpm build`（公共 build 槽）、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、fresh-fetch 后 `pnpm secrets:check`，并跑直接相关的少量非浏览器用例。API 和动作快照分别用上述命令验证；源码搬移还与基线逐字比对。`affected-tests` 的 full 建议和未跑的 README/browser 用例写入最终 PR，full/批 PR 由 Claude 组织。本片没有视觉或交互变更。

一个完整非 Draft PR交固定头、scoped diff、原始验证日志与未验证项，由 PIPE 安排 ac-review FIRST 和 TEST 核收。实际 merge、用户验收与整条 PG-095 完成分别记录。

## 作者验证结果

- RAC-620、RAC-621：两合同与基线逐字相同；其他既有 TypeScript 文件归一化后仅有合同 import/export 路径差异。整体构建通过，两个插件均生成公开入口的 JS 与类型声明。
- RAC-622：新增公开入口正向与旧平台入口拒绝断言通过；包边界检查 70 包、0 错误；health 对照 `df5527f2` 通过，没有新增测试内部引用或源码/构建混用。
- RAC-623：`pnpm actions:update` 实报快照未变；直接修改和新增的 4 个非浏览器文件共 34 项通过，失败、取消、跳过均为 0。包括 Images 的隔离 Host HTTP 调用、图片读回和保存 Shelf，以及 Jelly 日历、笔记、计划和撤销。
- RAC-624：`pnpm api:update` 为 0 written、2 removed、其余不变。README、SSOT 和 PG-095 的代码位置指针已更新，PG 状态列保持原样；页面资源检查 27 个资源通过。
- 原件在 `/tmp/molis-pg095-20261024/`。选择器选出 79 个文件（66 非浏览器、13 浏览器），full 命中 shared-core、spans-packages；其余 62 个非浏览器与 13 个浏览器及整批 full 按工单交统一验证窗口。静态选择器未直接映射的 Images search/service-job 与 Jelly search 同样只有合同导入替换。
