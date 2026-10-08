## 做了什么

<!-- 一两句：解决什么问题，用户或调用方看到的变化。对应的 spec / 问题编号。 -->

## 验证

CI 跑包边界与 workspace 校验、健康门禁（对照 merge-base）及其变异用例、Goal 边界与存储基线、启动器类型检查、动作与插件合同（`pnpm test:contracts`）、单一外壳与成果声明门禁、密钥扫描（推送前先跑 `pnpm secrets:check`）、炼金术士测试。产品用例的全量回归在本机跑，写明结果；排时段、集成分支、基线比对的做法见 `docs/system/PARALLEL-DEVELOPMENT.md`：

- [ ] 改过 `*/src`、`scripts` 或 `package.json` 后已整体 `pnpm build`
- [ ] 健康门禁对照 merge-base 通过：`node scripts/check-health-gates.mjs --base origin/main`（CI 也这样比，在 PR 里 `--update` 放不过变大的）；数字变小就用 `--update --base origin/main` 在本 PR 更新 `tooling/gates/baseline.json`
- [ ] 全量非浏览器：`node scripts/run-tests.mjs` → 通过 / 失败数：
- [ ] 浏览器用例（界面改动时）：跑了哪些文件、结果：
- [ ] 失败逐项说明：与基线（`git worktree add --detach <base>`，同一批文件）对比，哪些是本 PR 引入的、哪些基线就有
- [ ] 界面改动：浅色 / 深色，1440 / 1024 / 390 宽度的截图或走查记录

## 公开合同与 API 影响

<!-- 合同怎样变更见 docs/system/CONTRACT-CHANGES.md：起点之前不留兼容期，同一个 PR 改完所有消费者。 -->

- [ ] 没有改 `packages/contracts` 的导出、`packages/plugin-sdk` 的出口、动作的输入输出 schema、插件 Manifest 格式、MCP 工具名或对外合同 id
- [ ] 改了：写明改了哪几项、版本号怎么变、消费者清单（仓库内、外部）和是否都在本 PR 改完；公开 API 快照可用后（路线图 W1-04）贴快照的 diff 与兼容影响：

## 只许减少的数字

<!-- 巨大单元、测试引用包内部、兼容标记、就地补表、vendored SDK 份数。通过与否、怎样更新 baseline.json 看上面「验证」里的健康门禁一项；这里只写变化的数字。变大的放不过；要放宽只能另开 PR 改门禁本身（脚本、limits.json、CI），那个 PR 会请求 @yijunw0212 评审（`.github/CODEOWNERS` 只请求，不强制）。 -->

- [ ] 相对 merge-base 变小的项（项目、旧值 → 新值），没有变大的；不涉及就写“无变化”：

## 基本合同检查

<!-- 改动能力、插件、MCP 工具、动作时勾；规则出处 specs/action-architecture/spec.md §3「基本合同」与 AGENTS.md 硬约束。无关就写“不涉及”。 -->

- [ ] 能力只在自己的声明与实现里注册一次，没有为它改宿主支持名单、工作流程分支、首页动作分支、函数场景枚举或 MCP 工具总表
- [ ] 身份（actor、项目、安装）取自调用上下文，不读输入；密钥只给引用
- [ ] 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再提交；被取消、撤权、停用的调用不写任何记录
- [ ] 插件没有 import 另一个插件的实现；模型调用只经 `horizontal/agent-host`

## 没做 / 待定

<!-- 有意留下的范围、需要别人决定的事、未验证的部分。 -->
