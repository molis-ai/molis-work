# T390：最小 CI 补足裁定

结论：接受 A。只在根 `package.json` 的既有 `test:security` 命令末尾追加 `tests/project-catalog.test.ts`，使该完整文件及其中 RAC-2834/2835/2836 两项现有回归进入 SI。不需要 B、复制/移动回归、另建测试体系或修改 workflow、selector、runner、算法、skip。

审查输入：候选 H=`e326710a1e13e1d51a7c10f7c165a90446edfff0`，基线 M=`db29f18d4f602fa8d9efb689a6a766aa9b07625f`。这是 CI 接入方案的有限只读裁定，不是最终产品二审签字，也不是 Linux 动态通过证明。

## 选择与执行链

- H 的 `package.json` 当前确实未把该文件纳入 `test:security`。
- `scripts/ci-test-selection.mjs:54` 的 `securityList` 从当前 package script 提取测试路径，literal `tests/project-catalog.test.ts` 可直接识别；无需新增名单。`:36–46` 把 `package.json` 列入 `FULL_WHEN.both`，因此此次补足令 PR 的 security 与 product 两个作业各跑其整份清单。这里的 whole 是两项 CI 子集，不是另开 Full suite。
- 已在内存中追加一个 token，调用 H 对应的现有 `securityList`、`decideJob`：追加前包含=false；追加后=true；清单唯一新增文件即 project-catalog；security 决策=`whole`、shards=`[1,2]`、原因为 `package.json`。运行前核对被导入 selector/plan/probe 文件与 H 的 Git blob 完全一致。未写 package.json、未启动测试。
- `.github/workflows/ci.yml` 的 `security-invariants` 在 Ubuntu 上先 `pnpm build`，然后 whole 分支执行 `pnpm test:security --shard k/n`；已有 runner 按文件分片，每个文件独立 Node 测试进程、临时 Home 与 file secret backend。本文件没有测试名过滤，新增两项都随完整文件执行。
- 未来窄选择仍以该清单与 affected-tests 交集为准；无法判定/selector 失败按现有规则回退 whole。此次 package 变更本身已足以避免漏选。

## Mac / live 边界

以 H 原件核对 `tests/project-catalog.test.ts` 及其测试 fixture 闭包四文件：project-catalog、goal-application、goals-modules、governance-sqlite。当前 probe 分类结果 `marks=[]`、`run=true`，无 darwin/live/browser 标记。

源码检查与该分类一致：测试使用临时目录、SQLite、项目目录库和内存/本地业务组合；目录链接用 Node 的 symlink，可在 Linux 使用；没有浏览器、模型/API key、真实服务 opt-in、macOS 命令、Keychain、桌面 App 或用户 Home 依赖。两项新回归只是记录和绑定操作，不启动终端、PTY 或 Codex CLI。desktop 包的 catalog 入口仅提供 SQLite panel schema adapter，并不启动桌面壳。全部测试 fixture 使用包公开入口；既有 CI build/install 已提供这些依赖。

这是没有发现平台禁区的源码结论；本审查未跑 Linux/本地测试，不把无标记当作运行通过。后续 SI 原件负责证明实际运行结果与 skip/failure 状态。

## 同一 WO 的最小收尾

1. 根 fresh 核查 package.json 在途 hunk 后，交原作者追加单个测试文件 token；不改其他命令或锁文件。
2. 同步已修改的 `SECURITY-INVARIANTS.md` S-103：把这两项 project-catalog 回归从本地列移入 CI 列，保留其他现有测试。该文字调整只反映接入位置，不能写成“CI 已通过”。
3. 保持正在运行的 65 文件批次输入冻结，结束后再改 package.json；旧批次证据保留实际 H，不追认成新 H。最终 H/raw 到齐后再做有限差异复核及独立二审；是否补跑检查按实际新增 delta 和现有有效证据决定，不要求这里重开整批或 Full。

SI 当前仍为非阻塞信息作业（continue-on-error），merge_group 不运行；追加名单不会改变这些规则，也不会自动成为 Verify 的必需检查。根原有 SI/采用裁定责任保持不变。无 workflow/门禁算法放宽、无源码或 GitHub 写入、无构建/测试/浏览器/Full 操作；本轮唯一落盘产物为此文件。
