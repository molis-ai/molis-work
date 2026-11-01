## 做了什么

<!-- 一两句：解决什么问题，用户或调用方看到的变化。对应的 spec / 问题编号。 -->

## 验证

CI 跑包边界与 workspace 校验、健康门禁（对照 merge-base，含 Biome 静态检查）及其变异用例、Rust（fmt、clippy）与 Swift 检查（macOS）、shell 脚本检查、Goal 边界与存储基线、启动器类型检查、动作与插件合同（`pnpm test:contracts`）、单一外壳与成果声明门禁、密钥扫描（推送前先跑 `pnpm secrets:check`）、炼金术士测试；安全不变量（`pnpm test:security`）与产品子集（`tests/ci-product-subset.txt`，含 5 个浏览器冒烟，跑用户动线上的一部分产品用例，不稳定的文件记在 `tests/quarantine.json`，见 `docs/system/PACKAGE-BOUNDARIES.md`「产品子集作业」）也挡合并：合并队列里跑整套；PR 上 some 跑选中项，whole 或选择故障仍跑整套，只允许选择成功且对应 mode 明确 none 的跳过；Linux 探针不挡合并，只记录哪些非浏览器测试文件在 Linux 上通过；清单自己的规则由健康门禁检查，重命名或删除清单里的用例要同步改 `tests/ci-product-subset.txt`。产品用例的全量回归在本机跑，写明结果；排时段、集成分支、基线比对的做法见 `docs/system/PARALLEL-DEVELOPMENT.md`：

- [ ] 改过 `*/src`、`scripts` 或 `package.json` 后已整体 `pnpm build`
- [ ] 健康门禁对照 merge-base 通过：`node scripts/check-health-gates.mjs --base origin/main`（CI 也这样比，在 PR 里 `--update` 放不过变大的）；数字变小就用 `--update --base origin/main` 在本 PR 更新 `tooling/gates/baseline.json`
- [ ] 公开 API（contracts 各 subpath、插件 SDK）有变化时：已 `pnpm api:update` 刷新 `tooling/gates/api/`，并在「做了什么」写明对插件和调用方的影响
- [ ] 动作或消费场景（Manifest 声明的，或宿主登记的）的身份、权限、受众、输入输出有变化时：`pnpm build` 后已 `pnpm actions:update` 刷新 `tooling/gates/actions/`（`pnpm test:contracts` 会对照）；同一 `capability@version` 下形状变了的，写明已升版本并改完固定它的引用，或为什么没有固定它的引用会坏
- [ ] 改过样式、客户端脚本或字体：`pnpm workspace:build` 后 `node scripts/gates/page-assets.mjs --base origin/main` 通过（页面资源默认只许变小，变小了用 `--update --base origin/main` 在本 PR 把 `tooling/gates/page-assets.json` 降下来；功能必需、省不回的增长写明理由、字节数与试过的省法，经评审在 `APPROVED_CEILINGS` 一次性放行，见 `AGENTS.md`）
- [ ] 相关用例：`node scripts/affected-tests.mjs` 选出的用例已跑 → 通过 / 失败数（它建议全量时，说明跑了还是按什么理由不跑）：
- [ ] 全量非浏览器：`node scripts/run-tests.mjs` → 通过 / 失败数：
- [ ] 浏览器用例（界面改动时）：跑了哪些文件、结果：
- [ ] 失败逐项说明：与基线（`git worktree add --detach <base>`，同一批文件）对比，哪些是本 PR 引入的、哪些基线就有
- [ ] 界面改动：浅色 / 深色，1440 / 1024 / 390 宽度的截图或走查记录

## 公开合同与 API 影响

<!-- 合同怎样变更见 docs/system/CONTRACT-CHANGES.md：起点之前不留兼容期，同一个 PR 改完所有消费者。 -->

- [ ] 没有改 `packages/contracts` 的导出、`packages/plugin-sdk` 的出口、动作的输入输出 schema、插件 Manifest 格式、MCP 工具名或对外合同 id
- [ ] 改了：写明改了哪几项、版本号怎么变、消费者清单（仓库内、外部）和是否都在本 PR 改完；公开 API 快照（`tooling/gates/api/`）和动作合同快照（`tooling/gates/actions/`）的 diff 与兼容影响：

## 只许减少的数字

<!-- 巨大单元、测试引用包内部、兼容标记、就地补表、vendored SDK 份数、空 catch、`as unknown as`、浮动 promise、显式 `any`、`console`、`debugger`、`biome-ignore`、旧名。通过与否、怎样更新 baseline.json 看上面「验证」里的健康门禁一项；这里只写变化的数字。变大的放不过；要放宽只能另开 PR 改门禁本身（脚本、limits.json、CI），那个 PR 会请求 @yijunw0212 评审（`.github/CODEOWNERS` 只请求，不强制）。 -->

- [ ] 相对 merge-base 变小的项（项目、旧值 → 新值），没有变大的；不涉及就写“无变化”：

## 基本合同检查

<!-- 改动能力、插件、MCP 工具、动作时勾；规则出处 specs/action-architecture/spec.md §3「基本合同」与 AGENTS.md 硬约束。无关就写“不涉及”。 -->

- [ ] 能力只在自己的声明与实现里注册一次，没有为它改宿主支持名单、工作流程分支、首页动作分支、函数场景枚举或 MCP 工具总表
- [ ] 身份（actor、项目、安装）取自调用上下文，不读输入；密钥只给引用
- [ ] 等模型或外部服务的动作声明 `scheduling: "concurrent"`，返回后 `beforeEffect()` 再提交；被取消、撤权、停用的调用不写任何业务记录（处理器开始之前就被拒的，调用记录里只留一行「未执行」诊断行，只记谁、什么动作、结果与错误码，不记内容）
- [ ] 插件没有 import 另一个插件的实现；模型调用只经 `horizontal/agent-host`

## 合并前（统筹 / 合并队列）

<!-- 2026-10-20 复审后补：评审、全量和 main 基线都以最终 head 为准，不以合并后的补跑替代。 -->

- [ ] 最后一轮评审的「要改」已全部落实，或被评审明确豁免；评论里贴出对应提交/验证
- [ ] 共享核心（`packages/contracts`、`packages/kernel`、`plugin-sdk`、`plugin-runtime`、`horizontal/agent-host`、`modules`）在最终 head 上跑完 full-suite，贴运行链接，没有取消/失败分片
- [ ] 在最终 head 上跑过 `pnpm health:check`、`pnpm boundary:check`、页面资源与 `pnpm secrets:check`（或写明由统筹跑）
- [ ] stacked PR 写明父 PR；MERGEED 不等于在 main，父 PR 已合入、目标分支确认后才算完成
- [ ] 合并队列通过后回读 main 上的合并提交，确认文件树与验证过的 head 一致

## 没做 / 待定

<!-- 有意留下的范围、需要别人决定的事、未验证的部分。 -->
