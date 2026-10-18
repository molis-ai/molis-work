# C4 Molis 半边：48 次的原始结果（2026-10-18）

采用线。规则在 `specs/ai-development-handbook/spec.md` §9.5「C4 Molis 半边」（分支 `adoption/c4-tool-usage` 的第一笔 1c44d9284，统筹 10-18 批）；spec 里只写汇总与判定。

- 改前：main `6aa8459ac`（coding-base v11），在另一个工作树里整体构建。改后：本分支 6878d8980（coding-base v12，宿主那句删掉）。两版都用 vendored SDK after-write-check（Prologue 94ee1ea4）。
- 每次开跑，脚本先核对这一版的 coding-base 版本号和三句在不在：改前 v11、三句都在，改后 v12、三句都不在。48 次都过了。
- MiniMax-M3（anthropic-messages），每次一个进程、一个新的临时项目，不建 Home。审查由脚本代答。
- 重跑：0 次（没有一次是 Provider 5xx/429、网络、超时或 8 分钟封顶）。
- 冒烟（不计入）：T3 改后跑了两次。第一次查出脚本把不透明的 character 引用当成角色 id，判错了 tools 写法；按统筹批的改法修好后又跑了一次，判成 exact。T1、T2 和改前那份构建用假密钥检查了建项目和版本核对（401，没有调到模型）。
- 统筹的建议已加：每次 T3 都记下列给模型的子角色工具，按名字和 manifest 的 host_tools 比较。只记录，48 次里没有不一致。
- 评测脚本：采用线草稿目录里的 `eval-c4/run.mjs`、`judge.mjs`、`drive.sh`，全文在 `adoption-c4-run.mjs`，改动在 `adoption-c4-run-fix.diff`。

## 判定（judge.mjs）

| 题 | 管的那句 | 改后答对 | 改前答对 | 判定 |
| --- | --- | --- | --- | --- |
| T1 按文件名找文件 | search 那句 | 7 | 8 | 界内，删 |
| T2 读大文件的一段 | offset、limit 那半句 | 7 | 5 | 界内，删 |
| T3 点名角色派子任务 | 宿主那句 | 8 | 7 | 界内，删 |

## 没答对的，逐条

| 运行 | 做了什么 | 分类 | 依据 |
| --- | --- | --- | --- |
| T1 改后 #2 | `list` 只看了根目录，`search retry` 落空，就说「没找到文件名带 retry 的文件」，转而用 `ask-user` 问查找范围。两次 `ask-user` 的 options 都写成对象（第一次 `{name}`，第二次嵌套），第一次被拒，提示里写着 options 是纯文字标签；第二次仍不合格，这一轮停下，停的原因读回时显示了。 | 拿不准 | 这正是删掉的那句防的情况：搜不到不代表文件不存在。但 search 自己的说明写着 "(no matches) does not mean a file is absent; to find a file by name, list the directories that may hold it"。8 次里只出现 1 次，改前 0 次，一次看不出是不是删字的后果。`ask-user` 的格式是模型能力：拒绝里给了正确写法的例子。 |
| T2 改前 #1 | 读 offset 2390、limit 20，说「第 11 行即第 2400 行」（算法对），答的却是第 16 行（2405 行）的 ORD-B53B7。 | 模型能力 | 窗口取对了，数窗口里的行数错了。read 的输出不带行号。 |
| T2 改前 #4、#5 | 读 offset 2395、limit 10，说「第 6 行即第 2400 行」（算法对），答的是第 5 行（2399 行）的 ORD-5D3AD，差一行。 | 模型能力 | 同上 |
| T2 改后 #2 | 读 offset 2395、limit 10，说「第 6 行为第 2400 行」，答的是第 3 行（2397 行）的 ORD-B9BAC。 | 模型能力 | 同上 |
| T3 改前 #4 | 没派子任务，自己 `read` 了 src/parse.js，答出 parseDate、parseAmount。 | 模型能力 | 题目明说「请派一个代码调查子任务」，协调者的角色说明也让派。和宿主那句（tools 怎么写）无关。 |

T2 的四次没答对，两版都有（改前 3、改后 1），窗口都取对了，错在数行。read 的输出不带行号，这一点交统筹看要不要算 Prologue read 的设计问题；按「模型能力不打补丁」，这次不在 Molis 里加句子。

## 照实记录

- **T1**：
  - `search` 都落空，只搜过 `retry`：改前 7 次运行里搜过，改后 6 次。
  - 落空后接着 `list` 下去的：改前 7/7，改后 5/6；改后 #2 只看了根目录。
  - 没调 `search`、直接 `list` 找到的：改前 1 次，改后 2 次。
  - 说「不存在／找不到」的：改前 #6，人读过，答对了。那句话是复述改前那句「按文件名找不到并不代表文件不存在」，随后 list 下去找到了。改后 #2 见上表。
- **T2**：
  - 两版都没有不带 offset 就读整个文件的，所以没有一次因为超过 64 KB 被拒，也没有用 `search` 的。
  - 改后 7/8 直接读 `(2400, 1)`。改前只有 2/8 这样读，其余先读一个窗口：(2395, 10) 4 次、(2390, 20) 1 次、(2398, 4) 1 次。
- **T3**：
  - tools 写法：改前 exact 6、fewer 1（["read"]）、没派 1；改后 exact 6、fewer 2（["read"]、["read","search"]）。
  - 写少了的都没有被拒，子任务带着角色的全部工具跑完。没有 empty，也没有 more。
  - 没有被拒的派出，没有让出或后台，都是前台。
  - 列给模型的子角色工具和 manifest 的 host_tools，48 次里都一致。
- **三题都记**：
  - ask-user 只在 T1 改后 #2 出现（2 次调用，都被拒）。
  - 系统文字：reader 一轮 1162 → 1057 字，coordinator 一轮 1966 → 1801 字。

## 逐次表

### T1

| 版本 | 次 | 答对 | search（落空） | list 次数 | read | ask-user | 说「不存在／找不到」 | 停的原因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 改前 | 0 | ✓ | retry（落空）、retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 1 | ✓ | retry（落空）、retry（落空）、retry（落空）、retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 2 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 3 | ✓ | — | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 4 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 5 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改前 | 6 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | 有 | — |
| 改前 | 7 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 0 | ✓ | — | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 1 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 2 | ✗ | retry（落空） | 1 | — | 2 | — | 要向你提的问题连续两次格式不合格，没能交给你，这一轮先停在这里；已完成的保留，可以说明怎么调整后继续 |
| 改后 | 3 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 4 | ✓ | retry（落空）、retry（落空）、retry（落空）、retry（落空） | 10 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 5 | ✓ | retry（落空） | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 6 | ✓ | — | 7 | src/net/policies/retry-policy.js | 0 | — | — |
| 改后 | 7 | ✓ | retry（落空） | 5 | src/net/policies/retry-policy.js | 0 | — | — |

### T2

| 版本 | 次 | 答对 | read（offset, limit） | 回答的订单号（是第几行） | 差一行 | search |
| --- | --- | --- | --- | --- | --- | --- |
| 改前 | 0 | ✓ | (2395, 10)、(2400, 3) | ORD-B7824（2400） | — | — |
| 改前 | 1 | ✗ | (2390, 20) | ORD-B53B7（2405） | — | — |
| 改前 | 2 | ✓ | (2398, 4) | ORD-B7824（2400） | — | — |
| 改前 | 3 | ✓ | (2395, 10)、(2400, 1) | ORD-B7824（2400） | — | — |
| 改前 | 4 | ✗ | (2395, 10) | ORD-5D3AD（2399） | 是 | — |
| 改前 | 5 | ✗ | (2395, 10) | ORD-5D3AD（2399） | 是 | — |
| 改前 | 6 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改前 | 7 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 0 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 1 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 2 | ✗ | (2395, 10) | ORD-B9BAC（2397） | — | — |
| 改后 | 3 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 4 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 5 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 6 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |
| 改后 | 7 | ✓ | (2400, 1) | ORD-B7824（2400） | — | — |

### T3

| 版本 | 次 | 答对 | 派出（tools 写法） | 被拒 | 让出／后台 | 子任务 | 列给模型的工具与 manifest 一致 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 改前 | 0 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 1 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 2 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 3 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 4 | ✗ | 没派 | — | — | — | 一致 |
| 改前 | 5 | ✓ | fewer ["read"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 6 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改前 | 7 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 0 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 1 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 2 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 3 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 4 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 5 | ✓ | fewer ["read"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 6 | ✓ | fewer ["read","search"] | — | 前台 | coding-reader completed | 一致 |
| 改后 | 7 | ✓ | exact ["read","list","search"] | — | 前台 | coding-reader completed | 一致 |

### 每组平均

| 题 | 版本 | 用时（秒） | 模型调用 | 轮数 | 输入 token | 输出 token | 系统文字（字） | ask-user 的运行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 改前 | 17.0 | 6.5 | 1.0 | 1145 | 383 | 1162 | 0 |
| T1 | 改后 | 15.8 | 6.5 | 1.0 | 779 | 398 | 1057 | 1 |
| T2 | 改前 | 12.1 | 2.9 | 1.0 | 624 | 184 | 1162 | 0 |
| T2 | 改后 | 6.9 | 2.8 | 1.0 | 422 | 151 | 1057 | 0 |
| T3 | 改前 | 15.4 | 6.0 | 1.0 | 6010 | 312 | 1966 | 0 |
| T3 | 改后 | 21.3 | 6.9 | 1.0 | 5998 | 405 | 1801 | 0 |
