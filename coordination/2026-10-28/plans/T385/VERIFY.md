# T385 最终本地 H 独立验证核收

**结论：RAC-2820、RAC-2821 和 RAC-2822 的本地工程部分通过；未发现 Blocker/P1 或必须补跑项。** 对象为根冻结的 M=`6729a2d4655caa603daa369f99884e09c4726bde`，H=`44efe84d925b7f01e6f8f837c0bf284471ae7659`，tree=`908622b69189edcfed007efb26290d57a1c148c7`。这是对作者完整原件的**独立回算与核收**，本线没有重新安装、构建、运行测试或触碰 GitHub/真实 Home/Keychain。证据与脚本在本目录 `readback.json`、`check.py`；作者原件在 `/private/tmp/t385-evidence/`。

## 准确差集

本线从 Git 重算：H 的 parents 为第一 merge `bff004fba58912d2ff97cb3b9dd8d8ccc964097a`、T347 H；第一 merge 的 parents 为 M、T346 H。候选 worktree clean，M→H 正好 WO 的 10 路径；十个最终 blob 各与对应原成员头相同，T346/T347 的原补丁和承载投影 stable patch-id 分别同为 `d76419efdb971a58a544e5eaa74ed94da01f1aa7` / `71a4dfa91c991216062670abd3da3c739ffa8bd3`。本线另读生产差集、CHECKLIST/CALL-CHAINS 与 error-owner 行；未见第三项修复或额外路径。T346 的只读 wrapper/776 例外与直接 apply 的边界、T347 锁内坏封条拒写与删坏目标恢复仍按 accepted 范围；两链没有新增互锁/共用事务。

## 匹配构建与 15 个完整文件

本线从当前源码独立重算 build digest=`f115740ff71b5f074c6ec6b9a70fcffb53b322db4c04dd3f7fad5da40856d2db`，与 H 的 `dist/.molis-work-build.json`、两批测试原件一致。作者 offline frozen install、整体 `pnpm build` 原始结果均 exit 0。15 份完整文件恰好等于当前 storage README 的必跑清单、无重叠；本线逐个回算测试 SHA-256、解析 raw Node 计数和 `--jobs 1 --retries 0 --verbose` 命令，未依赖汇总 JSON 的断言：

| 作者原始批次 | 各完整文件通过数 | 本线回算 |
| --- | --- | --- |
| 固定六文件 `raw/six-files.log` | storage-baseline 7；home-store-baselines 26；secret-store-format 5；security-invariants-secret-snapshot 5；secret-store-missing-key 3；home-backup-recovery 1 | 6/6 文件、47/47 例，fail/skip/cancel/todo=0 |
| README 九项 `raw/readme-nine.log` | secret-store-keychain-retry 9；plugin-private-storage 6；system-search 27；feed-local-history-delete 3；project-deletion-owners 4；project-deletion-studios 4；security-invariants-connector-private-state 9；security-invariants-home-payload-purpose 3；security-invariants-connector-private-state-limits 4 | 9/9 文件、69/69 例，fail/skip/cancel/todo=0 |

两批都绑定同一 H、source digest 与构建，result 的每个测试文件 SHA-256 等于现树，exit=0；逐项用途和受控 fixture 见作者 `README-NINE.md`。`home-backup-recovery` 只签离线 Project/Goal/Artifact 回读，不签 vault/原 key。Keychain 文件使用受控 fake `security` 与私有 Home，不证明真实 Keychain。旧 T346 B/H 十一文件各116例与 T347旧独立10例只沿原头/原执行者；旧223和旧Full失败及 UNKNOWN 未改写。作者的 15 文件原件已覆盖本轮约定且绑定有效，故本线不机械重复运行。

## 门禁、资源和清理

本线回读作者 boundary、对准确 M 的 health、test-import graph、diff、冻结 M secrets、page-assets 及实际捕获的 exit 均为0；本线另执行只读 `git diff --check M...H` 为空。根 fresh fetch 后 `pnpm secrets:check` 的 `/private/tmp/t385-root-secrets.log` 记录490新增行无命中。候选与准确 M 的 48 个实际 served 资源 JSON，本线逐路径重算 bytes/SHA-256 全等，各总 7,469,195B；M 原件是 T146 作者在同 M 上的构建/捕获，本线复核本地副本与 provenance SHA 全同，未把它署为 T385 或本线执行。

`cleanup.json` 所列本次九个临时系统 Home/XDG/TMP/MolisHome 路径，本线逐路径确认均不存在；候选树保留且 clean。作者的 Foundation 探针显示 Library/cache 隔离，`NSTemporaryDirectory` 仍为 macOS 系统临时目录，这一限制不外推成全系统 TMP 隔离。作者准备阶段旧 pnpm 私有缓存普通只读连接失败、改 immutable 快照后安装成功；未将这次准备偏差抹掉或称为产品失败。

**未签范围：** PR 尚未发布时无远端 head/Verify；准确 H 的普通 Full、实际适用 SI、独立二审、§8 合并及 main 十路径回读由根继续结算。`full=true` 不降级；本地工程通过不代表真实 Home、产品实操或本人验收通过。
