# 批39首评两项测试收尾

状态：本地工程验证通过、待独立复核与 carrier 承接（2026-10-25，负责人 Codex）。目标为测试工程收尾，不改变产品行为；固定基点 `6371db8107106897af31b7db74244ab42bb984e2`。

来源：[批39 FIRST 首评](https://github.com/molis-ai/molis-work/pull/1307#issuecomment-6401887765) 的 nonblock 2、3。资源预算项由批次 carrier 处理，不在本项范围。

Host 的 `homeDockScene` 只在内部 `home-actions.ts` 声明，包入口没有公开导出。将两个测试中相同的场景输入移到 `tests/fixtures/home-dock-scene.ts`，明确这是当前合同的人工维护测试输入；不新增生产导出，不改变默认规则及原断言。

在 `tests/plugin-platform-home.test.ts` 使用真实 Home 目录、目录服务创建的两个真实项目、各自数据库与 `createPluginPlatform`，通过正常启动入口登记有效插件安装和成果声明。直接关闭第一个项目数据库，保持其平台尚未正常关闭；另一个项目随后读共用成果目录，应只剩仍开放项目的声明且其动作仍可调用。完成后释放平台协调、仍开放的插件和库，验证共用目录恢复原状。不 mock `db.open`，不以源码断言代替运行，不修改缺 Manifest 的拒绝路径。

## 验收标准

- **BFTC-01** 两个场景播种测试共用一份 fixture；原播种、生命周期和用户修改 instructions 保留断言不变。
- **BFTC-02** 两项目先均有有效安装和成果声明；单独关闭一个库后，真实目录读取不抛，关闭项目的 effective/known 声明消失，另一项目的目录声明与动作可用。
- **BFTC-03** 测试清理平台、临时 Home 与库，目录不残留本次安装；开放视图的其他错误仍由现有 RAC-415 回归拒绝。

## 验证与交付

独立工作树先离线安装、经机器公共 build FIFO 同源构建并核对源码/构建指纹。定向运行上述三个测试文件及现有成果声明 RAC-415 拒绝回归，最多两份非浏览器测试并发；不跑全量和浏览器批次。检查 diff、导入与健康门禁，保留完整原始日志；候选普通推送前 fetch main 并 secrets 检查。将固定 SHA、diff、指纹及日志交 REVIEW 和 TEST 独立复核，通过后交 PIPE 唯一 carrier 采用并回 Root。

未验证：批39整批全量、资源预算实测、真实产品体验及用户验收，均不由本测试收尾证明。

### 2026-10-25 本地证据

- 离线安装、公共 FIFO 中的 `pnpm build`：退出 0。源码摘要与 `dist/.molis-work-build.json` 均为 `46ce94910499af7ae5d8bb360ac6153f63e7ef77d847bb43f1c814879f0cd16e`；未借用其他树的 dist。
- 三个目标文件：29/29 通过，含用户修改 instructions 保留的原断言（BFTC-01）和新双项目关闭路径（BFTC-02、BFTC-03）。
- RAC-415 目录随安装变化、关闭视图、开放视图错误传播：3/3 通过。缺失准确 release/安装表不可读、已装 Manifest 缺失的拒绝：2/2 通过。
- 负控只临时去掉本树 `dist/plugin-platform.js` 的 `db.open` 条件：新用例退出 1，真实 `Database.prepare` 抛 `The database connection is not open`。在 finally 原样恢复 dist；恢复后新用例退出 0。
- `test-imports --check --chains`：1514 个测试进程中 0 个混用源码与构建。固定基点的健康门禁与 `git diff --check` 通过，无门禁或基线修改。
- 完整原始日志：`/private/tmp/molis-b39-first-test-closeout-20261025/`，含 `install.log`、`build.log`、`fingerprint.log`、`targeted.log`、`artifact-refusal.log`、`mutation.log`、`restored-and-refusals.log`、`test-imports.log`、`health-fixed-base.log`。候选推送与独立收据另由本入口交付；本记录不声称已合入或全线完成。
