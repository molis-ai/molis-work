# full35 翻译扫描覆盖回归

执行合同（2026-10-24）：FIX10 只修复固定 `927897a11e6b09fef1fe5fc676cec20f532a800c` 上 `tests/translation-check.test.ts` 的持续失败。完成程度是这项回归的工程验证通过；整批集成、Full suite 和合入仍由原统筹接续。

## 证据与根因

原 Full suite run `40159810466` attempt 1、worker14 job `121068806890` 在 fresh 整体构建后首轮 65/66，原 retry 1 仍失败：第 450 行要求 `summary.entries >= 9000`，实际为 8994。该行前的缺英文与稳定键错误断言通过；后面的调用类别断言尚未执行，不能从原红日志推成已通过。

对固定 main `df5527f278fa8e631919794d15c52cfd3f364155` 的干净工作树与候选使用同一份扫描器比对，旧中文键条目 9204 → 8994，稳定键 3387 → 3649，词典文件 68 → 70。逐文件差异只有 Schedule 的 `en.ts` 88 → 26、增加 96 条稳定键，以及 Shelf 的 `en.ts` 335 → 187、增加 166 条稳定键。旧条目合计减少 210，稳定键增加 262。两侧缺英文、未服务词典与稳定键错误均为零，扫描实现及此测试在两头之间逐字相同。Workflows 的迁移与注释修复已经在固定 main 中，不是本批跨过下限的直接原因。

`entries` 只数原中文键词典，稳定键另计；正常迁移会使它下降。固定总量不能充当词典覆盖合同。仅修测试，生产扫描、翻译数据、门禁脚本、阈值文件和 CI 均不改。

逐项追查这 210 条减项：179 条在本主人的稳定词典保留相同中英文，其余 31 条在候选的扫描范围内没有旧键翻译调用。不把扫描覆盖当成整条英文界面的人工验收，也不宣称全部迁移词条的英文都未变化。

## 方案与边界

从 Git 跟踪的产品源码中，独立按源码里的词典声明名及对象开头发现 `EN`、`*_EN`、`*_MESSAGES`，与真实扫描得到的词典文件逐项比对；不从扫描器输出生成期望路径。另以源码可核的固定键与英文保护普通对象、`Object.assign`、非专用文件中的词典、稳定词典与拆分词典。原缺英文、稳定键规则、每类调用与浏览器脚本、包装函数、英文总表合入断言保留，移除旧条目总量 9000 的假设，不换成另一个总量。

独立发现只读取当前仓库使用的字面对象声明格式，不能声称是通用 TypeScript 解析器；词典改用新声明形式时应同步扩展这个测试的独立期望。受控漏扫通过生产 `scanTree` 的输入跳过一个词典、全部中文键词典或全部稳定词典，独立期望保持不变，覆盖断言必须拒绝。

不改其他六个 full 失败文件、共享 Coding 夹具、S-15、空目录助手、原批分支和 carrier；不启动或取消 full。只提交本测试和本合同，固定候选交独立 REVIEW / TEST 后由 PIPE 交 Claude 吸收。

## 验收

- TSCAN-01：固定 main 与固定候选的差异能归到上述四个词典文件；修复只替换总量覆盖假设，原实质断言保留。原始 CI 日志、对照输出及 scoped diff 留供独立核收。
- TSCAN-02：当前真实产品树的每个独立发现的词典文件都被扫描，普通、追加、内联与稳定/拆分词典的固定翻译事实可读。
- TSCAN-03：受控跳过一个词典、全部中文键词典、全部稳定词典时，同一覆盖断言稳定失败；正常树通过。新增测试直接运行生产扫描器。
- TSCAN-04：正确整体构建后，定向 translation-check、适用 health（对照 origin/main）、boundary 与 fresh-fetch secrets 通过；如有既存失败，固定来源与本次增量分开记录，不放宽门禁。

验证命令：`pnpm build`（公共 machine-slot FIFO）；`node scripts/run-tests.mjs --jobs 1 tests/translation-check.test.ts`；`node scripts/check-health-gates.mjs --base origin/main`；`node scripts/check-package-boundaries.mjs`（`pnpm boundary:check` 的检查入口，test-kit 已在整体构建中重建）；提交后 `git fetch origin main` 再 `pnpm secrets:check`。不复跑原整批。

## 验证记录

- TSCAN-01：固定对照与逐条减项记录已保留。原 CI raw 已复制留存；本机在正确整体构建后恢复原测试定向运行，1/1 按预期因 `dictionaries 70, entries 8994` 失败。scoped diff 只涉及本合同与本测试，原缺英文、stableErrors、所有 callee/embedded/wrapper 与 served-dictionary 断言保留。
- TSCAN-02：完整定向文件 69/69 通过，0 fail、0 skip，131.6 秒。独立声明清点与真实扫描均覆盖 70 个词典文件，7 个固定翻译事实通过；旧失败断言之后的调用类别断言本次也实际执行并通过。
- TSCAN-03：三个永久漏扫拒绝测试通过；另临时只改本测试的真实扫描输入，分别跳过 Schedule 稳定词典、全部中文键词典、全部稳定词典，单独运行正常覆盖用例，三次均 0/1、exit 1，明确报独立词典清点失败。临时修改由 finally 恢复后才运行完整 69 项；未修改生产扫描器。
- TSCAN-04：正确整体 `pnpm build` exit 0（含 test-kit）；health 对 merge-base `df5527f2` exit 0，缺英文与未服务词典仍为零；实际 boundary 检查入口 exit 0、errors 为空。已移除本人仍排队的重复 test-kit 构建请求，没有取消他人的构建或原 full。diff-check 通过；提交后 fresh-fetch secrets 的原始结果随固定候选交付。未运行浏览器或 full，测试改动不涉及产品运行时。

本机原件目录：`/tmp/molis-fix10-translation-20261024/`，包含 `original-worker14.log`、`comparison.json`、`migration-detail.json`、`migration-remaining-consumers.json`、`build.log`、`original-red.log`、三份 `omit-*.log`、`negative-runs.json`、`green.log`、`health.log`、`boundary-direct.log` 与提交后的密钥检查日志。最终固定候选交独立 REVIEW / TEST；两者尚未裁定，本片尚未合入。
