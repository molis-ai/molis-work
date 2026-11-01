# R-A4 最小原子命名迁移：独立只读审查

结论：**方向可接受；补齐下面两项必要修订后，可形成 accepted WO。当前仍 WAIT #1654，不开始迁移、不取得共享文件锁。** 不需再问产品命名，不重写另一份方案。

## 审查绑定与证据边界

- 审查输入：本目录 `PLAN.md`、`inventory.json`、`relative-imports.txt`、`locks.json`、`open-prs.json`、`new-pr-files.json`。
- 方案原基点：`717d14f2ab8c9cb1b447003fabb120a70b6d9dd3`。
- 本轮 owning source 以本地已存在的 `origin/main` 对象 `2bd444b45e1809c4bad6776dfc62d96e049ad442` 为准，使用 `git show/git grep` 核对；没有 fetch、ls-remote 或 GitHub 查询，不声称它是审查时远端最新状态。
- 主检出实际是干净的 main `08c9933d57e153d1d59bf2811f203056d4358992`，落后于上述两点，不能把主检出文件当最新实施基线。祖先关系为 `08c9933d → 717d14f2 → 2bd444b4`。
- `717d14f2..2bd444b4` 只变更 artifact-document-import、plugin-projects-service、artifact-actions 及对应两个测试；本片的包名、模块路径、Workbench 路径命中集合未变。下面发现的漏项在原 `717d14f2` 就存在，不是审查期间新增消费者。
- 仅静态审查；未执行安装、build、test、门禁或代码生成，未修改源码、Git refs、协调文件或 GitHub。唯一写入是本报告。

## 必要修订

### R1 / P1：清单遗漏 7 个活动 dist 导入，必须并入同一原子切换

`inventory.json.candidate_reference_union` 及 `relative-imports.txt` 漏掉以下消费者。它们不是历史字符串；移走源码后，干净构建不会再提供旧 dist 文件，留下这些引用会使测试加载失败；旧树残留 dist 则可能掩盖遗漏。

| 文件与行（两个审查基点一致） | 必须更新的 import 路径 |
| --- | --- |
| `tests/contextual-dock-parity.test.ts:11` | `../apps/local-host/dist/functions-host.js` |
| `tests/feed-capture-scenes.test.ts:10` | 同上 |
| `tests/home-offers.e2e.test.ts:10` | 同上 |
| `tests/inbox-automatic-scenes.test.ts:18` | 同上 |
| `tests/inbox-current.e2e.test.ts:11` | 同上 |
| `tests/workflows-judgment-link.test.ts:12` | 同上 |
| `tests/list-silent-refresh.test.ts:8` | `../apps/workbench/dist/functions/client.js` |

在原清单补这 7 文件和映射，Host 改为 `dist/judgment-rules-host.js`，Workbench 改为 `dist/judgment-rules/client.js`。保留全部符号、fixture 业务值、断言和测试 basename；type-only 导入同样要改。重算实际 scoped 清单与锁交集，不再把“143 文件完整并集”作为执行上界。验收继续按引用种类区分，不把 HTTP `/api/functions/`、合同 subpath 或任意 JS `functions.ts` 纳入替换。

同时补一处确实描述现行目录的文档：`docs/platform/LOCAL-HOST.md:82` 的子系统目录 `functions-http/` 应随迁移变为 `judgment-rules-http/`。它不在原候选并集。历史审读、归档、固定 SHA 链接仍不改。

### R2 / 必要验收澄清：RA4-03 不能复用现有 registry 自比作 owner 不变的证据

`tests/home-snapshot-content.test.ts:33` 把实际 manifest 的 path/owner 与当次 `homeStores()` 产生的 path/owner 比较。若误把 `home-stores.ts` 的 owner 一起改成新目录，两边同时变化，该断言仍会通过。因此 PLAN §6 的“新增明确断言或复用可核原断言”，在当前 source 上必须落实为前者。

在现有真实 `createHomeSnapshot` 用例中，对实际 manifest 中 `path === "functions"` 的 store 明确断言 `owner === "modules/functions"`，期望值写独立固定字面量，保留现有实际库内容校验，并标 RA4-03。无需新增测试框架、fixture schema、独立 manifest 或密封实现。

另把 PLAN §2 对密封的说明写准确：owner 确实由 `home-snapshot-capture.ts:31` 写进 manifest，通用 sealed 分支在 `:66` 将 owner 放进 `home-snapshot-file/v1` binding；但当前 Functions 声明在 `home-stores.ts` 采用 ordinary snapshot，并没有 Functions 专属 sealed payload。保持 owner 的结论正确，不应声称已经存在或测试了 Functions 密封恢复路径。

## 经核对可保持的方案边界

1. **37 路径移动和私有包原子换名合理。** 包为 `private: true` / `0.0.0`；全部仓库消费者同片换到新包，不留旧包、alias、桥接 re-export。Host 现有导出符号、Workbench 工厂/DOM/CSS 名称不需顺手改名。只做物理路径变化，不拆职责。
2. **公开合同不改。** 保留 contracts 的 `modules/functions` subpath、源文件、`modulesFunctionsContract`、descriptor id 及 API 快照；注册表实现 path 和包名换新，contract 字段继续指向原公开入口。`functions.*` 动作、权限、provider、MCP 派生名、`function_key`、推荐结果与场景合同不变。私有包迁移不产生第二份公开合同。
3. **数据身份不改。** `FUNCTIONS_HOME_STORE.path`、现行 baseline/DDL/版本、TypeSafe slot `functions`、snapshot owner 字面量都保留。`modules/functions` 作为持久化 owner 与“现行源码目录”是不同含义，不靠全局替换处理，不新增旧值兼容或数据迁移。
4. **package inventory 不放宽。** `workspace-packages.mjs` 的 module entry path、local-host extra dependency，以及各 package.json/lock link 原子换名；层、maturity、contract 和能力声明不改。SSOT/包清单只更新对应路径/生成结果，不改检查算法或将现行模块转成其他类型。CODEOWNERS 若无实际变化就不造 diff。
5. **翻译规则只搬定位。** `translations.mjs:66,705` 的词典路径与所属目录同步换新，`FUNCTIONS_EN` 符号及扫描/拒绝逻辑保留。`tests/translation-check.test.ts:628-635` 的 fixture 路径及预期路径一起更新，仍断言缺失译文归到该词典。不能删用例或绕过扫描。
6. **error owner 仍是 functions。** error-owners.json 只把模块及 Host 三类实现路径映射换新，保留 `packages/contracts/src/modules/functions.ts` 和 owner key `functions`，不加 platform prefix、不扩大匹配范围。现有 `looserOwnership` 对 moved 文件有豁免，不能只凭门禁绿色证明归属保持；评审应对 37 移动中的源码逐一核旧/新归属一致。无需改 gate。
7. **门禁能承接纯 rename。** check-health-gates 现有 `git diff -M` 与 rekey 会迁移逐文件/单元记录；保持高相似度、使用已被 Git 识别的 rename。不能靠调 baseline、giant size/额度或规则让变化过关。

## 验证范围与执行条件

沿用 PLAN §6 的业务/浏览器/装配验证分工，不把候选文本命中数变成必须全跑的文件数。另明确以下点即可，不另立大方案：

- `tests/package-owners.test.mjs:128-145` 必须跟新 SSOT 行路径调整原断言，并运行该完整文件；词典定位改动运行完整 `tests/translation-check.test.ts`。两者都是直接受本片改动影响的已有门禁测试，不应只笼统交给未知 CI。
- R1 新纳入的 7 个测试按最终 diff 明确各自的定向或最终 CI/Full 证据归属，不修改业务断言，不因浏览器昂贵而默默遗漏加载验证。使用新建隔离树/匹配构建，避免旧 dist 掩盖断路。
- API/actions 快照的零差异只证明其覆盖的公共形状；snapshot owner/库 path 用 R2 的真实路径证明。不同来源证据分别记录。
- 本轮审阅到的 `locks.json` 是交集摘要，33 份复用文件清单及 #1101 的 584 行原件不在本目录提供，无法在本轮独立核实其完整性；7 个漏项加入后必须重新计算交集。不得把 `open_count: 36` 当成现在仍有效的排他锁。
- 根先完成 #1654 的 WAIT 调度，再指定单 writer 窗口和最终基点，按最终 scoped diff 更新共享文件的整合归属。#1101 的保护/HOLD 保持，不进入、不改动、不 cherry-pick、不抢锁；其 owner 按根交接的旧→新路径图接续。
- 上述补正写入同一 PLAN/accepted WO、执行前刷新 main/head/dirty/实际锁，并明确构建/浏览器时段后，工程迁移可直接开始；无新增产品问题需要用户再裁。若出现必须改公开值、需要放宽门禁或超资源阈值的实际事实，再只暂停对应扩范围步骤。

本报告接受的是最小方案的技术边界，**不是实施完成、测试通过、锁释放或现在开工的批准**。当前状态保持 WAIT #1654。
