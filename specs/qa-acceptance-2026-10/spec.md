# 2026-10 独立 QA 与验收

状态：独立验收进行中；交互线已完成首批工程验证与部分真实模型实走，发现 QA-001～012；采用线已完成本轮逐项核对和部分实走，手册线已完成首轮核对与 Pages 真模型实走；Computer Use 首轮已记录工程结果与真机权限缺口；回执首轮82项与真实模型路径已记录，情境、防腐继续。尚不满足完成标准，七条线均不据此归档。

验收编号：不适用（独立验收记录，判定的是各线 spec 的编号）。

## 1. 范围与基线

- 初始被测 main：`b016513df6196ced8f12952d58268cc0dc278e07`。从 `origin/main` 新建 detached 工作树；每条线开始前重新 fetch 并固定该线 SHA，结论逐项标注。
- 本次只测试、判定和写报告；仓库改动仅本文件及 `specs/README.md` 的索引。报告走文档草稿 PR；不修改实现、测试、其他 spec 或 BACKLOG，不合并、批准、关闭或入队任何 PR。
- 机器：本次会话所在 macOS 26.6.2 / Darwin arm64，Node 25.9.0、pnpm 11.9.0（CI 使用 Node 24）；用户已确认它不是要求避开的开发 Mac，可以运行 QA。测试并发 1，浏览器并发 1，构建与浏览器使用仓库机器槽位；本机不跑全量。
- Home：每次动态验证显式设置 `MOLIS_WORK_HOME` 为新建临时目录；不读取或写入真实 Home，不连接 4207。清理前核对目录确为本次创建。只按 PID 停本次启动的进程。
- 模型：MiniMax-M3，Anthropic 兼容端点 `https://api.minimax.cn/anthropic`。经用户指示复用本机 appkey 的 minimax 项，在内存中复制到本次 QA 专用钥匙串项。运行时同一 Python 程序经 Security.framework 读取、仅以内存环境注入 `MINIMAX_API_KEY`；不输出明文密钥、不改钥匙串访问权限。用户后续允许一次性 Home 保存密文，见 §9。`security` 命令曾触发系统读取确认，已停止使用此方式；同一程序读取无需弹窗。
- 交互动态基线：每线前 fetch 后固定 `ebad9a223b84d28937df03393231381587b3193a`（下文简称 `ebad9a223`，均指此完整 SHA）。相对初始基线仅新增 Computer Use #773；交互代码未变。安装与完整构建成功，被测源码保持干净；报告分支与被测 detached 树分离。
- 真实模型边界：Form 单次文字生成支持空模型目录下的开发环境变量入口，走生产 Runtime / Agent Host / SDK；助理 Agent 的正式配置仍从模型目录读取，不能用 Form 的成功证明其已配置。实际请求计数包装只放行原始真实请求，不伪造响应；第 13 次 MiniMax 请求在发送前拒绝。
- 交接仅作只读材料：`origin/coordination/handoff-2026-10-14`；验收要求仍以用户指定的各线 spec 为准，交接中的开发、合并和修改授权不适用于本次 QA。

## 2. 计划

按下表顺序执行和更新 PR。先逐条对照需求、测试断言及已知问题，再定向运行，最后实走可见动线；三级用户体验由用户验收。先写计划，不以抽样代替逐编号判定。

| 顺序 / 线 | 编号与唯一需求源 | 验证方法 | 真实模型请求上限 |
| --- | --- | --- | ---: |
| 1 交互 | `ai-interaction-experience/spec.md` AC-01～28、AC-27-1～6、AC-28-1～6，共 40 行；当前状态表为 §20.15，§17 是原计划 | 审读引用编号的测试及生产调用链；按编号定向跑；卡片、Coding、键盘、异常、三宽度与深色实走 | 12 |
| 2 采用 | `prologue-adoption/spec.md` PA-01～PA-39，§5.3、§6.0p.7 | SDK 接线、执行/取消/授权/恢复的测试与持久化；在临时 Home 实走 TaskBoard 和多 Agent 场景，查历史真模型记录 | 20 |
| 3 手册 | `ai-development-handbook/spec.md` ADH-01～ADH-23 | 文档与实现、引用和约束核对；定向验证手册承诺；按已定规则核查评测证据及少量真实调用 | 12 |
| 4 Computer Use | `computer-use/` 四份指定文档，CU-G01～CU-G15 | 按 runbook 二十步真机验收；拒绝断言逐条读与跑；Molis 操作时 QA 不输入；独立进程面板按已定决定拒绝 | 30 |
| 5 回执 | `ai-input-receipts/spec.md` 全部 62 个 RCPT-*，以及 §11 的 RC-01～19、G13；§20 | 对每阶段的输入、处理、改变和缺口核对真实事实；取消/重试/超时/重启；回执实走与视觉键盘矩阵 | 16 |
| 6 情境 | `context-program/spec.md` AC-P01～06；`context-toolbar` T01～09；`quick-create` Q01～10；`side-shelf` AC-S01～15，共 40 条，按 §9、§16 分已合入与后续 | 动作目录→浮条→创建/放置→侧栏；选区变化、双页签、无权限、关闭项目；三宽度/深色/键盘/中英文 | 12 |
| 7 防腐 | `repository-anti-corruption/` spec、roadmap、privileges 与 `RUNTIME-MIGRATION.md` 的已合入验收项 | 逐项对照已定决定、实现与拒绝测试；复核 PG-001～PG-109 去处；机器门禁；尚未实现的核对 BL 或决定 | 0 |

预算按实际发往模型端点的请求计，含重试与 Agent 内部轮次，总上限 102；每条线计数独立，不挪用，不够则记录未验证及原因，扩大前需用户授权。模型没有请求计数或可靠硬上限的入口不开跑。先核对现有评测规则，优先复用有效记录；模型能力弱不靠修改提示词来修。

所有 UI 条目均核对 1440 / 1024 / 390 宽度、深色、键盘、中英文、空/加载/出错/无权限/撤销状态；未覆盖逐项写明。截图只存已忽略的 `.impeccable/qa/review/`，关键截图上传报告 PR 评论并链接。

机器检查：`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm test:security`、`pnpm lint`；先读脚本确认隔离与副作用。`node scripts/check-spec-coverage.mjs` 仅作引用定位，不能证明断言充分或执行通过。定向测试运行器使用 `node scripts/run-tests.mjs <文件> --test-name-pattern=<编号>`；须核对实际匹配到的测试数，注释引用和测试名不一致时明确记录并运行对应测试名，不能把 0 个匹配当通过。

已知问题去重：先查 BACKLOG、防腐 §10.27～§10.29、PG 清单、各 spec 待补浏览器验证、在途 PR。已有编号保留「已知（编号）」；只有新增且可复现的问题分配 QA-xxx。失败按产品回归/预期变化/测试缺陷/环境时序分类；已知偶发只重跑一次，持续失败再以旧 SHA 的干净工作树跑同文件对照。

## 3. 总览

交互首批判断为通过 7、部分通过 32、不通过 1、未验证 0、按决定不做 0（40 行，含 AC-27/28 汇总及子项，不能视为 40 个互不重叠的能力）。采用为 2 通过、22 部分通过、15 未验证；手册为11通过、10部分通过、1不通过、1未验证；Computer Use 为1通过、9部分通过、1不通过、4未验证；回执为27通过、50部分通过、5未验证；其余线尚未完成逐条动态验证，不以库存审读代替运行结果。

| 线 | 能否归档 | 当前主要缺口 |
| --- | --- | --- |
| 交互 | 不能 | QA-001～003、已知 #709（修复在途 #759）/#775、P5 与 H4 2c 续做、完整产品状态矩阵及 BL-016 真人验收 |
| 采用 | 不能 | 2 通过／22 部分／15 未验证；QA-004/005、BL-104/091、A2-2/A2-3、A3 structured、A5、P5/P6 与完整产品实走 |
| 手册 | 不能 | 11通过／10部分／1不通过／1未验证；QA-006/007、ADH-19～23开发者实作、Coding小跑与真人验收 |
| Computer Use | 不能 | 1通过／9部分／1不通过／4未验证；Helper三项权限未授予，真机未跑，QA-008 |
| 回执 | 不能 | 27通过／50部分／5未验证；QA-009～012、Coding真模型/强杀/异常矩阵及R1、3e后续、阶段4～6 |
| 情境 | 不能据本报告归档 | 生产矩阵尚未实走；W4 后续、W5～W7 尚未交付 |
| 防腐 | 不能据本报告归档 | 仍有大量在途切片；最后按新的 main 核对已合入部分 |

## 4. 各线逐条验收

逐条表列：编号、判定（通过/部分通过/不通过/未验证/按已定决定不做）、实际证据等级、证据、问题编号、SHA。每条线另列「轻做」清单、代码质量结论和归档缺口。准备期间不把未运行写成工程通过。

### 4.1 交互

本节 SHA 均为 `ebad9a223b84d28937df03393231381587b3193a`。`E1`：14 个定向工程文件，模式 `AC-|D25`，实际 64 项通过、0 跳过；`E2`：5 个浏览器文件，模式 `AC-`，28 项通过、0 跳过。浏览器使用脚本 provider 或独立组件页，仍标一级。`E3`：`form-draft-questions.test.ts --test-name-pattern=LOGIC-05`，两项保存失败恢复通过。日志在被测树已忽略的 `.impeccable/qa/review/interaction-{engineering,browser,form-save}.log`，摘要见本表；关键截图见[二级证据评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6264854212)。`E4`：I0 两文件 `--test-name-pattern=AC-`，21 个单元及浏览器 1 父/9 子（TAP 10）通过；是 spec 明确的模拟原型，模型调用 0，不能冒充生产。

`U1`：真实生产 Web Host、新临时 Home、示例项目，无模型；仅键盘进入项目、Tab 到助理、发送后输入保留并提供设置入口。1440/1024/390 浅色中文、深色英文已目视，英文新工作复现 QA-001。

`U2`：另一新临时 Home，MiniMax-M3 真模型 Form 补问。第一次请求产生三道单选；空答卷被逐字段拒绝，无第二次模型请求；仅用 Tab/Space/Return 选择内部员工、总体满意度、3～4 题，再提交后第二次请求生成 4 题。刷新仍有同样 4 题。另一次培训问卷提示返回不完整补问，被产品拒绝；原提示及已有 4 题保留。同一培训要求重试后，第四次请求给出合法三题卡，但旧错误仍显示（QA-002）；未回答新卡，试填仍只有原 4 题。本线真实请求总计 4/12，服务已按本次 PID 停止，不据此推断稳定性。助理/Coding 真模型问卷、完整 Host 重启与所有异常状态尚未二级覆盖。

以下测试名可在对应日志逐项查；文件均为 `tests/` 下的 `.test.ts`，`e2e` 明写。表内一级的“通过”只用于工程合同标准，不代表产品或用户整体通过。

| 编号 | 判定 | 证据等级 | 证据与边界 | 问题编号／去处 | SHA |
| --- | --- | --- | --- | --- | --- |
| AC-01 | 部分通过 | 一级（文审） | §14.3 有入口分组；无精确测试引用，P5 的逐插件接入盘点未完 | 已知：P5；在途 #785 | ebad9a223 |
| AC-02 | 部分通过 | 一级 | E2 助理输入仅进问卷草稿、Coding 同排入口复用卡片；完整焦点与阅读位置未验 | 已知：D24／情境线 | ebad9a223 |
| AC-03 | 部分通过 | 一级、二级（Form） | E2 填草稿不提交、点卡才建一次 Goal；U2 补问未答不新增题目 | 批准与专业路径未全验 | ebad9a223 |
| AC-04 | 部分通过 | 一级 | E1 interaction-examples、E2 typed questions：混合字段错误不调模型、修正后原 Run 收答案；真实四类字段未实走 | — | ebad9a223 |
| AC-05 | 部分通过 | 一级 | E2 interaction-no-crosstalk：会话草稿、跨项目拒绝、固定选区；尚未按 #709 原步骤实走 | 已知 #709；§18 H4 2c | ebad9a223 |
| AC-06 | 部分通过 | 一级 | E1 interaction-components；E2 Coding 卡提交修改后的标题且只建一次 Goal；完整预览多入口未验 | 已知 §18 H4 2c | ebad9a223 |
| AC-07 | 部分通过 | 一级 | E1 parked-answer：停放、重开 adapter、开轮失败留队、新消息保稿；同一内存 AssistantStore 不能证明完整 Host 重启 | 完整重启未验证 | ebad9a223 |
| AC-08 | 部分通过 | 一级 | E1 recovery/parked、E2 双页签确定交错：只一份答案胜出、另一份明确拒绝且 Runtime 文件不变；未全面实走 | — | ebad9a223 |
| AC-09 | 部分通过 | 一级、二级（Form） | E1 Form 接续及冲突/重复拒绝，U2 真模型生成并刷新保存；Coding Diff/命令审查/报告未全跑 | 已有 S1；专业流程未验证 | ebad9a223 |
| AC-10 | 部分通过 | 一级、二级 | E2 仅局部尺寸/键盘；U1 英文错误仍中文。U2 Form 问卷纯键盘路径通过；完整 UI 矩阵与真人体验仍缺 | QA-001；已知 #775、BL-016/138/141 | ebad9a223 |
| AC-11 | 部分通过 | 一级 | E1 agent-question-types 与 E2 使用实际 Runtime 和 provider schema；无本轮上游源码/打包独立复核 | 历史读取兼容按现行合同不做；整条仍须验 | ebad9a223 |
| AC-12 | 部分通过 | 一级、二级（Form） | E1 interaction-examples、Coding 卡及 Form；U2 完成例3；生成插件文档接入未完成 | 已知 BL-245；在途 #785 | ebad9a223 |
| AC-13 | 部分通过 | 一级 | E4 完整字段纠错、明确回答、预览、执行、结果及输入框/日历模拟路径通过 | I0 模拟范围；人工实走与主观判断未完成 | ebad9a223 |
| AC-14 | 部分通过 | 一级 | E4 收起/切布局/最小化/刷新/过期保稿，未知只对账、失败显式重试通过 | I0 模拟范围；人工实走未完成 | ebad9a223 |
| AC-15 | 部分通过 | 一级 | E4 键盘不隐式提交、合成 composition 保位、两布局/三宽/明暗/减动画通过 | BL-016：合成事件不代替真实 IME / VoiceOver | ebad9a223 |
| AC-16 | 部分通过 | 一级 | E4 Coding 复用交互与保留专业接续、明确标示模拟范围 | I0；未作为生产交付证据 | ebad9a223 |
| AC-17 | 部分通过 | 一级、二级（Form） | E1 components 10 项、mapping 3 项及 E2；U2 共享卡实走；可选单选不能清空仍待修 | 已知 #775 | ebad9a223 |
| AC-18 | 部分通过 | 一级、二级（Form） | E2 interaction-client 15 项为独立页面；U2 问卷空答纠错、键盘填写/提交通过；全部控件未实走 | 已知 #775 | ebad9a223 |
| AC-19 | 通过 | 一级 | E1 agent-typed-questions：snake_case、默认值复制、六题型与 19 原因闭集 | 合同工程结论 | ebad9a223 |
| AC-20 | 通过 | 一级 | E1 显式投影、逐字段拒绝；agent-question-types 核真实 provider schema | 合同工程结论 | ebad9a223 |
| AC-21 | 部分通过 | 一级 | E1 assistant-interaction-html 与 E2：草稿、转义、不可答、混合字段与输入框回答；U1 的无模型失败不经过问卷卡，不能作为本条失败依据 | 真模型问卷未实走 | ebad9a223 |
| AC-22 | 部分通过 | 一级 | E2 Coding 卡不预选、存草稿、答案入 provider、答后结束；英文/全键盘矩阵未覆盖 | 已知 #775、BL-141 | ebad9a223 |
| AC-23 | 部分通过 | 一级 | E1 assistant-interaction-html：状态、输入转换、步骤派生；E2 固定选区；完整卡生命周期未全验 | — | ebad9a223 |
| AC-24 | 部分通过 | 一级 | E1 search-references；E2 跨项目拒绝；安全批 S-26 删除/撤权/错种类/无复核端口明确拒绝且不继续模型 | 二级引用路径未验证 | ebad9a223 |
| AC-25 | 部分通过 | 一级 | E1 D25 五项与 E2：幂等/CAS/撤权不落卡、精确输入、只建一次 Goal；安全批 S-28/29 通过 | 已知 §18 H4 2c；不推断 owner 接受旧写入 | ebad9a223 |
| AC-26 | 不通过 | 一级、二级 | E1 needs_input/逐字段/版本/伪ID/重复拒绝；E3 保存失败可恢复；U2 真模型补问→4题→刷新正常，但失败后重试出现合法补问时旧错误未撤下 | QA-002（P2，功能可继续，恢复状态错误） | ebad9a223 |
| AC-27 | 部分通过 | 一级 | 四类题型及两个产品浏览器入口见下六项；真模型与完整实走缺失 | 汇总项 | ebad9a223 |
| AC-28 | 部分通过 | 一级 | schema、搜索、草稿、数量/项目边界、owner 标题与 Coding 提交；二级与读屏仍缺 | 汇总项 | ebad9a223 |
| AC-27-1 | 通过 | 一级 | E1 actual provider schema 列六题型及 min/max/integer/unit；E2 再核 enum | — | ebad9a223 |
| AC-27-2 | 部分通过 | 一级 | E1/E2 数字超限逐字段报错、ARIA/焦点、其他字段不报错 | 二级及完整边界未验证 | ebad9a223 |
| AC-27-3 | 通过 | 一级 | E1 数字伪作文字被拒、不结算等待；日期时间带偏移且与本机时刻一致 | — | ebad9a223 |
| AC-27-4 | 通过 | 一级 | E1 coding-run-control-contract 原值→SDK→现行动作 schema，E2 typed HTTP 提交 | 按现行 v6，不拿历史 v4 判失败 | ebad9a223 |
| AC-27-5 | 部分通过 | 一级 | E2 两入口填错→定位→修正→provider 收到四类值 | 脚本 provider；二级未验证 | ebad9a223 |
| AC-27-6 | 部分通过 | 一级 | E1/E2 单位旁显、描述关联、错误含“120分钟” | BL-016：ARIA 不代表读屏听感 | ebad9a223 |
| AC-28-1 | 通过 | 一级 | E1 实际 schema enum，非法 kind 不产生可答等待；S-32 按已定 D38 过滤非法条目 | — | ebad9a223 |
| AC-28-2 | 部分通过 | 一级 | E1/E2 初始无候选，输入后只搜声明种类；产品浏览器补真实搜索 | 二级未验证 | ebad9a223 |
| AC-28-3 | 部分通过 | 一级 | E1 references 与 E2：草稿芯片、空可选引用、多选上限、失败保留值 | 不可拿“引用清空”替代 #775 的 choice | ebad9a223 |
| AC-28-4 | 部分通过 | 一级 | E1 owner 当前标题替换页面伪标题；E2 与 S-26 真实对象/跨项目/删除/撤权拒绝 | 二级未验证 | ebad9a223 |
| AC-28-5 | 通过 | 一级 | E1 对象数组/超限/缺字段拒绝，E2 真实 Coding 引用提交路由 | 合同与路由工程结论 | ebad9a223 |
| AC-28-6 | 部分通过 | 一级 | E2 状态个数、ARIA、方向键；仍有鼠标 click/remove；断言 textContent 不能证明读屏 | BL-016；完整键盘/矩阵未验证 | ebad9a223 |

**轻做／证据不足清单。** parked-answer 重开 adapter 没有重启整个 Host；interaction-client 是组件页面；Coding 卡已有截图是 1360 浅/深及 390 浅，不能写成 1440/1024/390 全矩阵；“count is spoken”只断言状态文字；只有 `AC-` 模式会漏掉 D25 及 LOGIC-05，本轮已补实际匹配；生成插件接入、P5 与 H4 2c 已有去处，不新报无去处。没有精确测试引用的 AC-01/09/10/11 仍逐项查相关测试，不以 coverage 脚本退出 0 判全覆盖。

**代码质量与安全。** 未改任何产品或测试。S-26/28/29/32/33 读到真实拒绝／过滤及零调用、零写入断言，并已在安全批运行。S-32 的过滤是已定 D38，不要求拒绝整轮。Coding action-cards 的 `readSubject: null` 缺预先改版失效，属于 §18 H4 2c 明确续做，不能推断最终 owner 写入也越权。状态表仍有“Coding 没卡”“S1没有”与 AC-25/26 已实现行矛盾，这是交接已知的文档收尾，不重复立项。

**机器结果（本 SHA）。** `pnpm boundary:check`：errors=[]；health 对照同一 main 的 merge-base 通过，表示未增加基线计数，不表示不存在旧违规；`pnpm test:security`：113 个执行条目通过、112 个不同文件（Alchemist resumption 重复一次），包含环境跳过项（例如 plugin-sandbox-network 6/7），不能称全安全场景都运行；`pnpm lint`：3711 文件、722 errors、exit 1，既有基线包括空 catch/unknown cast/any 等。第一次 lint 因沙箱 fetch 失败未运行，获准重跑后才得到上述实测结果。原生桌面、Seatbelt、真机 Computer Use 等本机专项未被此安全集合完整覆盖。

**归档结论：不能。** 工程通过范围如表；完整实走、已知核心问题、续做项和三级用户验收仍未收口。

### 4.2 采用

本节 SHA 均为 `f31801f5b53c9b520a6b86e12023e5dcdba7c1a9`。每线前重新 fetch，新 detached 树离线安装、整体构建通过；本线 MiniMax-M3 上限 20，实际 **18/20**（含正常连接检查一次）。正式模型配置仅在一次性 Home 保存密文，运行期间扫描未发现明文密钥文件；本次服务已按 PID 停止，Home 已核对并删除。

工程证据均为一级：`A1`＝`adoption-core.log`，7 文件 32 项；`A2`＝`adoption-collaboration.log`，14 文件 91 项；`A3`＝`adoption-integration.log`，12 文件 89 项；`A4`＝`adoption-gateway.log`，网关筛选 15 项；`A5`＝`adoption-vendor.log`，当前包记录 5 项。以上均通过。`AB`＝`adoption-browser.log`，model-controls / taskboard / handback / follow-live / timeline 五个浏览器文件 7 项通过；脚本 provider 与组件渲染仍属一级。日志在被测树已忽略的 `.impeccable/qa/review/`。除表内具名 PA 测试外，按真实测试名筛选；没有编号引用的已有行为不能冒充按编号追溯已经齐备。

`AU` 二级实走：生产助理、示例项目，要求并行只读复盘 Goals 与项目待办，每子任务最多两次业务读取。两个子工作完成并返回，父工作在同一轮核对并汇总三点建议；Goal 子报告列出 17 个 Goal，待办子报告明确项目待办为空。公开详情父与两个子工作各只有一轮，故没有证明“父让出→Host 自动新起唯一一轮”。父已完成、子任务 2/2，而三个步骤仍 pending／0/3，按**已知（BL-104）同类现象**记录，根因尚未确认与旧 PMR-32 相同，不重复立项。模型自行称“轮询”不是实现事实，实际等待端口用图变更通知加最长 50 秒等待。内部工具/字段过程展示归已知 BL-091。

AU 已目视 1440/1024/390 浅色中文与深色英文；键盘可重开工作、展开主区、打开子任务并返回父任务，刷新/语言切换后结果仍在。关键截图与边界见[采用二级证据评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6265159546)。未完成整条 Coding 真模型协作、兄弟问答、整合批准/拒绝及所有 UI 异常状态；没有以这组完成态截图替代全矩阵。

| 编号 | 判定 | 证据等级 | 证据与边界 | 问题编号／去处 | SHA |
| --- | --- | --- | --- | --- | --- |
| PA-01 | 通过 | 一级（文审） | §3～5 明确两仓 owner、切换与分阶段边界；文档结论不等于产品验收 | 状态句 A4 旧文字已知，见统筹评论 | f31801f5b |
| PA-02 | 部分通过 | 一级 | A1 project-board/coordinator、A2 taskboard、A3 delegation 核节点和图；“任何协作”、扩大任务提议、无节点全入口拒绝未全覆盖 | 无精确编号引用；spec 既有追溯缺口记录 | f31801f5b |
| PA-03 | 部分通过 | 一级 | A2 taskboard 真实两 Session 交错/CAS、来源 Run 不改；完整跨 Run 接管代次/旧回调组合未证全 | P3/P4 后续 | f31801f5b |
| PA-04 | 部分通过 | 一级 | A2 subagents 真实 SDK 有根子 Run；A3 delegation 无根子工作不带浏览器且一层限额；全部工具/角色交集攻击矩阵未全验 | 无精确编号引用；P2/P4 | f31801f5b |
| PA-05 | 部分通过 | 一级 | A2 session-messages/collab-handoff 核兄弟交接、跨项目与循环等待拒绝；伪身份/伪回复全部交错未全证 | P2/P4 | f31801f5b |
| PA-06 | 部分通过 | 一级 | A2 work-waits、A3 background-wait：先派后等、早到、取消/失败及真实后台进程；all/any/超时完整组合未全证 | P2/P4 | f31801f5b |
| PA-07 | 部分通过 | 一级 | A3 sdk-effects/action-tools/start-authority/budget 与 A4：当前授权复核、零新派发/零迟到写真实断言 | §4.6.10 共享预算预留留 P4；不称完整 | f31801f5b |
| PA-08 | 部分通过 | 一级 | A2 handback 有真实 SIGKILL 后恢复一次；A3 有单子结果与人工轮屏障；两结果＋人工三方组合缺失 | QA-004；不是已复现双执行 | f31801f5b |
| PA-09 | 部分通过 | 一级 | A1 coordinator-board 与 A2 writer-authority：真实隔离目录/只读父/角色；AB 页面只证实际覆盖部分 | Coding 全产品批准/拒绝未二级实走 | f31801f5b |
| PA-10 | 部分通过 | 一级、二级（部分） | A3 delegation/jobs/work-view 核唯一图与视图，AU 真子工作定位；App→Coding 目标授权端到端未走 | 无精确编号引用；P4 | f31801f5b |
| PA-11 | 部分通过 | 一级、二级（部分） | A2 handback/PA-23、AB 自动交回；AU 同轮等结果并汇总，仅一父轮，不能证明自动续接 | 已知 BL-104/091；两产品完整动线仍缺 | f31801f5b |
| PA-12 | 部分通过 | 一级 | A1/A2 model-controls/stream/status、A3/A4 预算/副作用/观察；整体承诺包含尚未实现部分 | A2-2/3、A3 structured、A5；§4.7 已定无产品入口的项不扩做 | f31801f5b |
| PA-13 | 未验证 | 一级（范围核对） | 当前没有本轮输入键→节点→消息→Run→成果的联合生产样本 | P5；输入回执联合线已有去处 | f31801f5b |
| PA-14 | 未验证 | 一级（范围核对） | work-view 已拒旧字段进入投影，不能替代存量维护与旧链退出演练；本次不取真实 Home | P6、BL-157／维护八 | f31801f5b |
| PA-15 | 未验证 | 一级（范围核对） | 两仓工程/当前 SHA 全量/完整重启实走尚未齐备；不标内部完整 | P6；用户验收另列 | f31801f5b |
| PA-16 | 通过 | 一级 | A1 external-checks + S-27：外部条件的身份/字段、未授权脚本、写/AI 检查器、软链拒绝；A3 jobs 同图绑定 | 工程合同通过，不代替两产品实走 | f31801f5b |
| PA-17 | 部分通过 | 一级 | A1 多次检查无新增请求、eligible；A3 后台真进程并手动下一轮；历史 MiniMax 记录存在 | QA-005：缺实际用量增量与恰好一次接续组合 | f31801f5b |
| PA-18 | 部分通过 | 一级 | A1 四态/旧文件/缺标记/无效输出、A3 jobs；错误退避/截止/重复回调＋人工的完整组合未全证 | P2/P3；不把 unknown 当成功 | f31801f5b |
| PA-19 | 部分通过 | 一级 | S-27 撤权/停用拒绝检查，A3 jobs 每次取工作授权，A4不可读保持未知；检查中及结果后全部交错未全证 | P3、共享预算后续 | f31801f5b |
| PA-20 | 部分通过 | 一级 | A1 external-checks、A3 jobs、AB TaskBoard；两产品真实后台任务及提前继续/未读输入策略未全实走 | P4 | f31801f5b |
| PA-21 | 部分通过 | 一级 | A2 真实子进程被杀/重开一次、A3 adapter 重开后后台命令不复活 | P6；完整宿主、关闭窗口与真实休眠未验证 | f31801f5b |
| PA-22 | 部分通过 | 一级 | A3 显式预算优先/原授权/副作用、A4 微压缩保留写回执、A5 实际包哈希与来源；未独立重建上游或覆盖全部干净消费者 | A0/A5；不把 provenance 等同重建证明 | f31801f5b |
| PA-23 | 部分通过 | 一级 | A1 两图真实 SDK 接续、撤权拒绝与重开；按现行 §4.6.10 允许正式 SDK yield，旧拒绝文字不再作为标准 | 其余旧私路退出归 P6；不重新讨论已定边界 | f31801f5b |
| PA-24 | 部分通过 | 一级 | A1 model-controls、A3 六个换模交错及撤权、AB 模型控件与时间线；实际模型只有 M3，未二级换模 | A1；真实全状态矩阵未验证 | f31801f5b |
| PA-25 | 部分通过 | 一级 | A1 coding-checkers-settings：版本/CAS、非 user 受众拒绝；生产设置页面未交付 | A2-1 已合；A2-3 页面 | f31801f5b |
| PA-26 | 部分通过 | 一级 | A1 保存只收当前真实授权目录、撤回拒绝；写后观察/零审查与进程部分尚未实现 | A2-2 | f31801f5b |
| PA-27 | 未验证 | 一级（范围核对） | argv 只由配置与写回执组成的真实执行尚未交付 | A2-2；非已宣称完成的缺陷 | f31801f5b |
| PA-28 | 部分通过 | 一级 | A1 配置非法字段/参数/cwd 拒绝及合法反例；实际前导连字符转义和单 argv 运行尚未交付 | A2-2；BL-220/221 为配置已有问题 | f31801f5b |
| PA-29 | 未验证 | 一级（范围核对） | 写后检查准确命令卡及拒绝零进程未交付 | A2-2 | f31801f5b |
| PA-30 | 未验证 | 一级（范围核对） | 检查器接入完整命令 standing rule 尚未交付 | A2-2；按检查器规则首刀不做，BL-160 | f31801f5b |
| PA-31 | 未验证 | 一级（范围核对） | 检查超时与审查计时分离的执行器尚未交付 | A2-2 | f31801f5b |
| PA-32 | 未验证 | 一级（范围核对） | 写后检查输出截断/完整回执尚未交付 | A2-2 | f31801f5b |
| PA-33 | 未验证 | 一级（范围核对） | 一轮十次和下一轮复位尚未交付 | A2-2；一次只用首个适用检查器由 BL-171 接后续 | f31801f5b |
| PA-34 | 未验证 | 一级（范围核对） | 写后检查观察的事实快照尚未交付 | A2-2 | f31801f5b |
| PA-35 | 未验证 | 一级（范围核对） | 未检查/检查结果的真实时间线尚未交付 | A2-2、A2-3 | f31801f5b |
| PA-36 | 未验证 | 一级（范围核对） | 检查执行器取消后零迟到结果尚未交付 | A2-2；不拿通用命令取消代替本条 | f31801f5b |
| PA-37 | 未验证 | 一级（范围核对） | 启动失败保留写入事实、写入失败不检查尚未交付 | A2-2 | f31801f5b |
| PA-38 | 未验证 | 一级（范围核对） | JS/Python 真实语言检查样本尚未交付 | A2-2；不安装语言服务 | f31801f5b |
| PA-39 | 未验证 | 一级（范围核对） | §6.0p.6 明确随执行器实现新增安全行；仅已存配置的拒绝已运行 | A2-2；未实现边界不报为现行安全测试遗漏 | f31801f5b |

**轻做／证据不足。** QA-004 的 handback 用例先放行一个孩子，等 400ms 后才放另一个，却注释“同时”；不能证明三方并发。QA-005 的外部等待停在 eligible，非 live fixture 的 usage 根本不更新，直接断言它为零会产生假证据。A3 jobs 的“重启”是 adapter 重开，A2 handback 则确有独立进程 SIGKILL，二者不可混写。PA-02/04/08/10 无精确编号引用；spec 既有“新增方案 23 项引用缺口”记录已含这些项，需随现行实现收口，不新报未实现。浏览器切片/脚本 provider 保持一级。

**代码质量。** 未引入新私路或修改代码。当前真实执行仍经 Agent Host；有原调用方、当前授权、拒绝本身和零副作用断言。已知 shared budget 预留未齐、旧数据维护/私有路径退出、普通 Error 及 APFS 路径配置问题分别沿 P4/P6、BL-220/221，不以本轮定向全绿宣称清零。模型报告只当内容；业务事实/状态由公开详情和测试独立核对。

**归档结论：不能。** 2 通过、22 部分通过、0 不通过、15 未验证、0 按决定整条不做。QA-004/005、BL-104/091、完整两产品动线和上述 A2/P5/P6 等续做仍缺。未来已排切片不是“按已定决定不做”。

### 4.3 手册

本节基线为 `8eedf222268eabb69a191ee726b11b62fa2d5ecb`，重新 fetch 后 detached 检出、离线安装和整体构建通过。`H1`：8 个文件的 19 项定向用例全部通过，日志 `.impeccable/qa/review/handbook-engineering.log`。运行文件为 agent-definitions、assistant-undo、assistant-business-gateway、assistant-work-continuity、assistant-delegation、assistant-methods、assistant-memory、announce-guard；按实际测试名筛选，编号只在注释的不漏算。测试使用真实宿主/SDK 与受控 provider，仍是一级。

`H2`：文档与源码逐项核对。手册仍有唯一入口；按场景分开固定合同、模型判断、材料和方法，不把权限交给 prompt；第 15 节有有界调用、Skill 和多步协作实例，第 16 节分清机制/真实 SDK/真实模型/人工质量。§9.5 的 A3②和 D1②确有任务、次数、成本、前后比较及设计/能力/拿不准分类，不能说没有记录；历史记录未在本机全量复跑。外部一手资料包括 [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)、[building effective agents](https://www.anthropic.com/engineering/building-effective-agents)、[OpenAI harness engineering](https://openai.com/index/harness-engineering/)，本次已打开核对其相关主题；引用不覆盖仓库现行合同。

`HU`：一次性个人 Home，正式目录配置 MiniMax-M3，真实请求 **7/12**（连接检查 1，业务轮 6）。[HU 截图评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6265432912)包括1440浅色英文、1024/390深色中文；另留存其余宽度图，键盘打开结果与收起助理已实走，未验证完整错误/无权限/撤销状态矩阵。用户动线：Pages 空列表 → 助理输入三条虚构会议事实并指定“会议纪要整理” → 读取方法 → 创建文档 → 键盘打开结果 → 页面刷新后再从 Pages 打开。工作 `work-a3f6b41f-3301-4e88-ae75-faa1fed102c3`，Run `c-8x9e2`，文档 `6e347b64-fba8-4f5e-85bb-ca5511b6d579` revision 1。第一次读取方法误把 input 写成字符串，被合同拒绝；下一次改为对象成功，随后 pages.create 成功，无多余确认。文档确有结论、林青/2026-10-23 待办、预算待定和原文缺项；未擅自创建 Todo。实际用量 input 38,386、output 871、cached input 51,968；不能把三项简单相加当独立消耗。先有失败再成功，步骤中保留“1 did not finish”是本次调用事实，不作为重复执行缺陷。

| 编号 | 判定 | 证据等级 | 证据与边界 | 问题编号／去处 | SHA |
| --- | --- | --- | --- | --- | --- |
| ADH-01 | 通过 | 一级（文审） | H2 唯一手册入口、Skill 导航、接入合同仍在；结论限文档结构 | — | 8eedf2222 |
| ADH-02 | 通过 | 一级（文审） | H2 §12 职责与判断依据、按不确定性选择固定步骤/Agent | — | 8eedf2222 |
| ADH-03 | 通过 | 一级（文审） | H2 §13 稳定指令/动态材料/合同/示例及实际注册路径；未评测示意有标注 | — | 8eedf2222 |
| ADH-04 | 通过 | 一级（文审） | H2 §15.2 按适用范围读方法，工具权限仍由宿主；不复制路由 | — | 8eedf2222 |
| ADH-05 | 通过 | 一级（文审） | H2 来源、纠正、预算、摘要、交接案例及补材料原则 | — | 8eedf2222 |
| ADH-06 | 通过 | 一级（文审） | H2 与安全合同一致：校验/幂等/取消/撤权/恢复保留在工程层 | — | 8eedf2222 |
| ADH-07 | 不通过 | 一级（文审、源码） | H2 §14 的现状/证据/在途标记与本表及代码互相矛盾 | QA-007；control 版本另属已知 #793 | 8eedf2222 |
| ADH-08 | 部分通过 | 一级、二级（一个方法） | H2 三类实例有解释；HU 复现 Pages 方法，尚非全部开发案例 | 独立开发者走读未完成 | 8eedf2222 |
| ADH-09 | 通过 | 一级（文审） | H2 §16.3 记录任务效果、适应性、方差和证据类型，历史样例不宣称一次稳定 | — | 8eedf2222 |
| ADH-10 | 通过 | 一级（文审） | H2 诊断分上下文/工具/prompt/模型/运行时；手册范围没有新增强制审批/评分 | 不是整仓无违规结论 | 8eedf2222 |
| ADH-11 | 通过 | 一级（文审） | H2 一手来源可查，具体版本仍以仓库实际实现核验 | — | 8eedf2222 |
| ADH-12 | 部分通过 | 一级 | H1 材料事实与角色规则有断言；once helper 只证规则所在层，不数同层重复次数 | 完整每节/重复次数证据不足 | 8eedf2222 |
| ADH-13 | 部分通过 | 一级 | H1 base 单句且无类别路由；A3②有 48 跑历史对比 | 本轮未重复真实模型“记一下”矩阵 | 8eedf2222 |
| ADH-14 | 通过 | 一级、二级 | H1 v2 声明/正文无确认；HU 真读取并成功建 Pages，页面刷新后内容仍在 | 单任务实走，不推断稳定成功率 | 8eedf2222 |
| ADH-15 | 通过 | 一级（记录核查） | A3②完整前后记录与分类存在，符合本条记录标准 | 不冒称本次独立复跑 | 8eedf2222 |
| ADH-16 | 部分通过 | 一级 | H1 无工具核对、事实围栏、各种失实每轮拦一次、无效JSON放过；错误/超时未找到故障断言 | QA-006 | 8eedf2222 |
| ADH-17 | 部分通过 | 一级 | H1 只认给过标识、子任务不查、主工作仍查；真实各种内容未全走 | 用户可见结果仍缺二级矩阵 | 8eedf2222 |
| ADH-18 | 部分通过 | 一级（记录核查） | D1②真模型对比及单次核对记录存在；把超时说成已有确定性证明不成立 | QA-006 | 8eedf2222 |
| ADH-19 | 部分通过 | 一级（文审） | #787 已有渐进披露与选择字段说明；没有本次独立作者实作 | 手册后续开发情境走读 | 8eedf2222 |
| ADH-20 | 部分通过 | 一级（文审） | 正文含真实过程→固定/可变/判断点→回放→注册不自动启用 | 生成实际 Skill 并回放未做 | 8eedf2222 |
| ADH-21 | 部分通过 | 一级（文审） | 有多次运行、触发率/质量、description/正文迭代评测方法 | 独立 Skill 前后评测未做 | 8eedf2222 |
| ADH-22 | 部分通过 | 一级（文审） | 校验清单区分拒绝与报告；本次未逐个跑作者失败样例 | 作者侧失败样例未验证 | 8eedf2222 |
| ADH-23 | 未验证 | 无动态证据 | 技能包在个人助理与 Coding 各用一次并改进的完整开发者记录未完成 | skill-packs 与本 spec 后续；不是永久不做 | 8eedf2222 |

**轻做与代码质量。** QA-006/007 按新问题列出；ADH-12 的“只写一次”现有 helper 只能确认唯一层，不能证明同层不重复。H1 的方法测试只断言 v2 文字，实际建页面由 HU 补齐。没有用历史真实模型评测代替本次执行，也没有因模型第一次参数错误修改提示词。唯一模型接线在 agent-host，方法由插件声明注册；收尾核对的 catch 放过是明确已定行为，不能当空 catch 随意改。现有宿主私路与权限去向继续沿用防腐已登记项目。

**归档结论：不能。** 11 通过、10 部分通过、1 不通过、1 未验证。QA-006/007、ADH-19～23 的开发者实作、Coding 真实模型小跑及三级体验仍未收口；HU 仅补齐 ADH-14 的这条完整路径。

### 4.4 Computer Use

开线前再次 fetch，main 仍为 `8eedf222268eabb69a191ee726b11b62fa2d5ecb`；复用该干净 detached 树及同 SHA 构建。`C1`：reliability 13、act-loop 5、evaluation 1、gaps 9、task-done 2、S-25 selector 2/own-window 1，共33项通过；`C2`：local-entry 的 computer socket 与三入口合法本机名2项、gateway 60步上限1项、assistant-tool-words1项通过。日志 `.impeccable/qa/review/computer-{engineering,gateway-security}.log`。全部为一级，Helper/桌面树/图片/供应商是夹具，不能记作真机操作。

`CU0`：新临时 Home，随机回环57506，真实 Helper经生产 GET `/api/computer/permissions` 启动并返回 `screen_recording=false, input_monitoring=false, accessibility=false`。只读检查没有请求权限；没有打开系统设置、操作密码框、启动真实桌面任务或配置模型，实际请求 **0/30**。网页实走个人空间→侧栏→电脑，显示“助理使用电脑：已关闭”，设置页总开关也未打开；界面观察本身不证明二十步或拒绝。没有 work/record/item id、操作步数、真实任务 token，原因是先决权限未满足，不伪造这些数据。三宽度/深色/中英文完整矩阵及运行、暂停、失败、撤销均未验；只留存1440浅色中文关闭态图，见[先决检查与截图评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6265582085)。

| 编号 | 判定 | 证据等级 | 证据与边界 | 问题编号／去处 | SHA |
| --- | --- | --- | --- | --- | --- |
| CU-G01 | 通过 | 一级、二级（仅先决检查） | 已固定基线、检查在途/要求、运行C1/C2并记录CU0阻塞；满足本条允许记录阻塞原因的标准 | 三项系统权限未授予 | 8eedf2222 |
| CU-G02 | 未验证 | 一级辅助；无二十步实走 | task-done的窗口/文件/记录判定是Helper夹具；CU0无权限，不能执行runbook | 既定待真机 | 8eedf2222 |
| CU-G03 | 未验证 | 一级辅助；无真机 | C1 W3-10-4-01跑真实页面函数，但Shelf请求与PNG为假；无真实item/PNG/回滚记录 | 既定待真机；PG-057私路 | 8eedf2222 |
| CU-G04 | 未验证 | 一级辅助；无真机 | C1拒绝终端输入、禁区、遮挡、密码、自身；真机五类未执行。系统设置/密码框还受用户禁止范围约束 | 无权限；锁屏/在场不重复制造 | 8eedf2222 |
| CU-G05 | 部分通过 | 一级 | C2 60步上限后保留并可续；无真实20步token/与24轮对照 | 真机成本未验证 | 8eedf2222 |
| CU-G06 | 部分通过 | 一级 | C1 100个无名组删去，有名组/密码框保留，原节点103仍点到30,20；仅合成树字符<1500 | 真大树/滚动成本未验证 | 8eedf2222 |
| CU-G07 | 部分通过 | 一级 | C1 三次无变化后第四次拒绝、树变更重置、按键与交替动作例外；无实际加载慢/焦点丢 | 按现行§9语义，不重议已定边界 | 8eedf2222 |
| CU-G08 | 部分通过 | 一级 | C1自动400×300/2x裁剪参数、密码拒绝；未验证真实裁剪像素/密集UI | 主动zoom按open-decisions§2暂不做，等真机证据 | 8eedf2222 |
| CU-G09 | 部分通过 | 一级 | C1窗口菜单/长标题/sheet树；无真实打开保存打印导出 | 已定A：不同PID面板继续拒绝；同PID待实走 | 8eedf2222 |
| CU-G10 | 部分通过 | 一级 | C1稀疏/截断树OCR、失败退回/密码不读、结果不可信；OCR词为预设 | Electron/canvas/游戏/远程桌面真实Vision未验证 | 8eedf2222 |
| CU-G11 | 部分通过 | 一级 | C1名字/角色/部分名称与歧义拒绝、原始节点定位；S-25正则不编译、超时/600节点边界拒绝且零输入 | 真机同名/滚动/切窗未验证 | 8eedf2222 |
| CU-G12 | 部分通过 | 一级 | C1十场景框架可运行，指标与拒绝有断言；回调人工改文件/窗口，tokens为字符估计 | 真实模型三个代表场景仍待跑，非成功率证据 | 8eedf2222 |
| CU-G13 | 部分通过 | 一级 | 本SHA构建+C1/C2通过；boundary/health/security在ebad有运行，夜间全量为旧SHA | 当前SHA完整CI/门禁在防腐节收口；本机不跑全量 | 8eedf2222 |
| CU-G14 | 不通过 | 一级（文审） | spec状态诚实留真机缺口，但runbook还把已选A称待定，open-decisions还称#721 draft | QA-008；不能归档 | 8eedf2222 |
| CU-G15 | 未验证 | 无动态证据 | 可选文件/延迟/多显示器切片仍后续；不是已实现，也不是永久不做 | goal-prompt-wrapup阶段5；BL-021 | 8eedf2222 |

**轻做与代码质量。** C1的task-done只改夹具窗口/文件列表，不能证明文件真实存在；OCR预设字和图片参数断言不能证明Vision实际识别与像素裁剪；evaluation不是真机成功率；Shelf回滚测试读生产函数但网络/条目全是假。以上在spec现行状态里明确待真机，不另立“没做也没有去处”。S-25 selector与own-window、S-04 socket已找到并跑过拒绝本身；不会把Helper输入0的夹具证据扩大到系统授权/真实注入。Shelf私路沿用PG-057，发布身份/多机沿用BL-021。D16旧“不进模型”及旧无OCR描述未清楚标记已被后续切片替代，纳入QA-008文档收口。

**归档结论：不能。** 1通过、9部分通过、1不通过、4未验证；CU-G02～04真机证据、G05/06/08/09/10/12实测数据、QA-008及用户体验仍缺。仅权限先决检查可以据实完成，不以它判CU功能通过。

### 4.5 回执

本线开始前 fetch 固定 `8eedf222268eabb69a191ee726b11b62fa2d5ecb`。范围82行：RC-01～19、G13、54个数字 RCPT 与8个 RCPT-R0 编号；R0是明确的模拟预览，单列但不当生产。后来的 #795 不倒算到本节。

工程证据：`R1` receipts-core.log，10文件38项；`R2` receipts-render-report.log，6文件39项；`R3` receipts-ports.log，13文件21项；`R4` receipts-browser.log，6文件28项（18浏览器、10原型单元）；`R5` receipts-projections.log，2文件7项。共133项通过，无失败、跳过或时序重跑；日志均在被测树忽略的 `.impeccable/qa/review/`。测试名有编号的按编号筛选，只有注释编号的按日志中的实际标题筛选，所有文件匹配非零。脚本供应商、VM/组件浏览器均为一级。R0合计12单元和10浏览器，不是生产22条。

`RU`：一次性 Home 正式配置 MiniMax-M3，实际 **7/16** 请求（含连接检查）。工作 `work-8309b579-1f7b-4fff-bcf9-b2a355020be6`，Run `c-5txlp`。先要求建虚构读书会文档并提问日期；问题等待时发送补充，键盘撤回未读输入 `steer-f-2xoux`，问题仍在；再补充地点“星河阅览室”、预算待定，回答日期后真模型读到并自述处理方式。实际 Pages 文件预览确认2026-10-28、星河阅览室、预算待定；不是仅相信模型“已完成”。已读后只能更正，键盘发出更正 `input-k-9rpku` 指向 `steer-g-xr1e`，只排下一轮；另一Chrome页签撤回后公开详情 queue=[]、state=completed、仍仅原Run，没有自动开轮。主路径25,343 tokens；模型首次方法版本参数错误后自行纠正，不修改提示词或实现。

RU目视1440/1024/390浅色中文及深色英文，分别核对真实DOM视口宽度、页面无横向溢出；覆盖问题等待、未读撤回、已读详情、更正排队、完成结果。键盘完成撤回、答题、更正与托盘操作；不声称所有导航和状态都能纯键盘完成。[关键截图评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6265884724)。独立Chrome后台页在另一页撤回后仍显示旧项；当前工具未可靠触发真正前台焦点恢复，现实现完成后停止持续跟随，故只记待复验，不报已确认同步缺陷。RCPT-337/348的“两面”指同页展示容器，不能偷换为两个浏览器页签。

| 编号 | 判定 | 证据等级 | 证据与边界 | 问题编号／去处 | SHA |
| --- | --- | --- | --- | --- | --- |
| RC-01 | 通过 | 一级 | R3 coding-run-control-contract：现行v6 schema拒绝非法键/方式，回执原值透传 | 现行版替代历史v3 | 8eedf2222 |
| RC-02 | 部分通过 | 一级 | R1 agent-input-delivery传参正确，幂等Map却在替身内；历史SDK去重记录不等于当前Coding端到端 | QA-009 | 8eedf2222 |
| RC-03 | 部分通过 | 一级、二级（RU范围） | R1结束/after-run/边界结束排队与撤权拒绝；RUN_NOT_RUNNING为替身制造 | 真实交错仍缺 | 8eedf2222 |
| RC-04 | 通过 | 一级 | R1 agent-input-delivery：状态前进改变runViewVersion | 工程合同 | 8eedf2222 |
| RC-05 | 通过 | 一级 | R1真实动作schema及处理器拒绝非法/取消/撤权/别会话，零运行和排队调用 | 拒绝工程证据 | 8eedf2222 |
| RC-06 | 部分通过 | 一级、二级（RU范围） | R3 assistant-coding-executor保键/queued/carry/版本，端口为替身；RU补充保留问题 | Coding真模型待验；BL-144 | 8eedf2222 |
| RC-07 | 通过 | 一级 | R3 coding-continuation列原任务与补充、明确未逐项核对 | 工程投影 | 8eedf2222 |
| RC-08 | 部分通过 | 一级 | R3 prologue-recovery重开adapter读队列，R2面板区分未知与空 | 没有强杀整个Host | 8eedf2222 |
| RC-09 | 通过 | 一级 | R1/R3下一轮carry消费一次、第三轮不重复，读取真实SDK队列 | 工程接续 | 8eedf2222 |
| RC-10 | 部分通过 | 一级 | R4 coding-input-receipts.e2e发送菜单/方式复位/回执提示 | Coding实走矩阵待验 | 8eedf2222 |
| RC-11 | 部分通过 | 一级 | R2/R4气泡保稿/同键重试；网络故障发生在真实fetch之前 | QA-009 | 8eedf2222 |
| RC-12 | 部分通过 | 一级、二级（RU范围） | R2/R4事实与Host说明分开；RU已读与模型自述可见且未称已生效 | 完整Coding二级仍缺 | 8eedf2222 |
| RC-13 | 部分通过 | 一级 | R4 Coding Esc后轮次仍运行，停止须按钮 | 二级Coding键盘待验 | 8eedf2222 |
| RC-14 | 部分通过 | 一级、二级（RU范围） | R1 assistant-input-correct与R4真实问题/补充路由；RU补充两次不回答日期 | 全部题型二级待验 | 8eedf2222 |
| RC-15 | 部分通过 | 一级、二级（RU范围） | R2 aria-live/节点复用、R4状态；RU键盘撤回与更正 | BL-016真人读屏 | 8eedf2222 |
| RC-16 | 部分通过 | 一级 | R4助理先真实收下再丢响应，刷新同键只收一次；Coding淡化为页面态 | 整条Coding实走未覆盖 | 8eedf2222 |
| RC-17 | 部分通过 | 一级 | R2 coding-input-receipts-client按键对账、保改稿、新发送换键 | VM非完整产品实走 | 8eedf2222 |
| RC-18 | 部分通过 | 一级、二级（RU范围） | R2/R4无活跃轮时读托盘、保展开，RU完成后队列无新轮 | 已知BL-148跨轮 | 8eedf2222 |
| RC-19 | 部分通过 | 一级 | R3 G13/remember内容归属与R4候选卡；未实走真实记忆审批 | 后续二级 | 8eedf2222 |
| G13 | 通过 | 一级 | R3 assistant-memory从真实运行输入抽本人原话并交学习，Host材料排除 | Coding部分按§11明确后续 | 8eedf2222 |
| RCPT-101 | 通过 | 一级 | R1 coding-history-requirements真实供应商请求内六条补充仍在 | 一级，未重复质量评测 | 8eedf2222 |
| RCPT-102 | 部分通过 | 一级 | R1摘要失败/空值回退，没制造摘要真实超时 | QA-010 | 8eedf2222 |
| RCPT-103 | 未验证 | 无动态证据 | §20 D20质量/长会话后续；本轮未构造该完整场景 | §20后续，有去处 | 8eedf2222 |
| RCPT-104 | 未验证 | 无动态证据 | §20后续尚未声称交付；本轮无动态证据 | §20 D20 | 8eedf2222 |
| RCPT-105 | 未验证 | 无动态证据 | §20后续尚未声称交付；本轮无动态证据 | §20 D20 | 8eedf2222 |
| RCPT-106 | 未验证 | 无动态证据 | §20后续尚未声称交付；本轮无动态证据 | §20 D20 | 8eedf2222 |
| RCPT-107 | 未验证 | 无动态证据 | §20后续质量验收未跑，不能借一次Pages成功替代 | §20 D20；§12.3评测另缺 | 8eedf2222 |
| RCPT-301 | 通过 | 一级 | R1 prologue-input-claims真实SDK保存两次声明与revision，关闭重开仍在 | 不等于强杀Host | 8eedf2222 |
| RCPT-302 | 通过 | 一级 | R1 claims在开放轮次写入、结算后拒绝，事实状态不随自述改 | 工程合同 | 8eedf2222 |
| RCPT-303 | 通过 | 一级 | R1 collaboration-revise/prologue-board-origins输入来源与报告投影 | 工程合同 | 8eedf2222 |
| RCPT-304 | 通过 | 一级 | R5 prologue-input-receipts状态单调/Host说明；R1 SDK原始事实核对 | 投影工程证据 | 8eedf2222 |
| RCPT-311 | 通过 | 一级、二级（RU范围） | R1 prologue-input-withdraw真实SDK未读撤回且下一轮排除；RU首次补充撤回 | 一级、二级 | 8eedf2222 |
| RCPT-312 | 通过 | 一级、二级（RU范围） | R1已读/已放上下文拒绝；RU已读仅更正、无撤回按钮 | 一级、二级 | 8eedf2222 |
| RCPT-313 | 通过 | 一级、二级（RU范围） | R1排队撤回未知/已消费拒绝；RU另一页签撤回后队列为空 | 一级、二级 | 8eedf2222 |
| RCPT-314 | 通过 | 一级 | R1 about原值进入真实SDK输入，不伪造被引用项 | 工程合同 | 8eedf2222 |
| RCPT-315 | 通过 | 一级 | R1实际处理器取消/撤权/别会话拒绝，目标端口零调用 | 拒绝工程证据 | 8eedf2222 |
| RCPT-321 | 通过 | 一级 | R3控制动作现行v6、专属person，旧版/非法输入拒绝 | 历史版本不作当前要求 | 8eedf2222 |
| RCPT-322 | 通过 | 一级 | R1 coding-input-correct-http真实路由与SDK撤回/更正/409队列 | 工程集成 | 8eedf2222 |
| RCPT-323 | 通过 | 一级、二级（RU范围） | R1 assistant-input-correct真实Service/SDK更正排队不启轮；RU同样 | 一级、二级 | 8eedf2222 |
| RCPT-324 | 部分通过 | 一级、二级（RU范围） | R2 VM更正表单方式/保稿/重试键/Esc；RU键盘完成更正 | 完整UI异常矩阵缺 | 8eedf2222 |
| RCPT-325 | 部分通过 | 一级、二级（RU范围） | R2引用双向连接与R4 Coding；RU更正指向原输入 | 已知BL-148跨轮 | 8eedf2222 |
| RCPT-326 | 部分通过 | 一级、二级（RU范围） | R2两入口端口、R4助理真实提交，RU已读更正 | 完整Coding二级缺 | 8eedf2222 |
| RCPT-331 | 部分通过 | 一级、二级（RU范围） | R2四类未完成托盘、R4 Coding；RU真实下一轮队列 | 完整状态矩阵缺 | 8eedf2222 |
| RCPT-332 | 部分通过 | 一级、二级（RU范围） | R4撤回焦点/下一轮排除；RU键盘撤回后服务queue为空 | Coding完整二级缺 | 8eedf2222 |
| RCPT-333 | 部分通过 | 一级、二级（RU范围） | R2相同数据保节点/展开/播报；RU展开与键盘动作 | 真人读屏BL-016 | 8eedf2222 |
| RCPT-334 | 部分通过 | 一级 | R2 unknown与empty分支及换轮不播报 | VM，产品异常未实走 | 8eedf2222 |
| RCPT-335 | 部分通过 | 一级、二级（RU范围） | R2 assistant-receipts-client及R4托盘；RU真实完成态 | 助理完整状态矩阵缺 | 8eedf2222 |
| RCPT-336 | 部分通过 | 一级、二级（RU范围） | R1真实队列撤回与R4端口；RU更正不启轮/撤回无新轮 | 其他失败与恢复缺 | 8eedf2222 |
| RCPT-337 | 部分通过 | 一级 | R2两owner各自托盘且不串节点 | 同页面两展示面；非两个Chrome同步承诺 | 8eedf2222 |
| RCPT-341 | 部分通过 | 一级 | R2真实保存报告，但夹具四状态/含终态applied，与spec五态不符 | QA-011 | 8eedf2222 |
| RCPT-342 | 通过 | 一级 | R2 coding-report-persistence真实保存围栏/HTML恶意片段仍为数据 | 不扩大到全链安全 | 8eedf2222 |
| RCPT-343 | 部分通过 | 一级 | R2已存报告→格式器，R3泛材料→真实provider，未连成报告下一轮 | QA-012 | 8eedf2222 |
| RCPT-344 | 部分通过 | 一级 | R2板报告引用/缺板不画/复用节点 | VM；真实板二级缺 | 8eedf2222 |
| RCPT-345 | 部分通过 | 一级、二级（RU范围） | R2 link先调用方再聚焦summary，无回执不给按钮；RU当前约定定位 | Coding对话二级缺 | 8eedf2222 |
| RCPT-346 | 部分通过 | 一级 | R2固定报告步骤引述围栏转义 | 未在真实报告界面核对 | 8eedf2222 |
| RCPT-347 | 部分通过 | 一级 | R2 coding-step-receipt-link对话框先关再定位 | VM，真实焦点待验 | 8eedf2222 |
| RCPT-348 | 部分通过 | 一级 | R2两个面各自元素/更正/链接/播报隔离 | 未二级同时展示两面 | 8eedf2222 |
| RCPT-349 | 通过 | 一级 | R1实际schema/Host非法origin拒绝且零revise | 工程拒绝 | 8eedf2222 |
| RCPT-350 | 通过 | 一级 | R1真实SDK人工插入带来源且板保存 | 工程集成 | 8eedf2222 |
| RCPT-351 | 通过 | 一级 | R1真实SDK拒AI自行插入且板不变 | 工程拒绝 | 8eedf2222 |
| RCPT-352 | 部分通过 | 一级 | R4 coding-board-origins真实浏览器，板API为夹具 | 生产板二级缺 | 8eedf2222 |
| RCPT-353 | 部分通过 | 一级 | R4计划卡/TaskBoard定位，R2链接共用 | 生产板二级缺 | 8eedf2222 |
| RCPT-354 | 部分通过 | 一级 | R2展示来源；人工改步骤仍可能沿旧AI归属 | 已知防腐§10.27/28；#778 | 8eedf2222 |
| RCPT-355 | 部分通过 | 一级 | R2坏/缺引用不冒出空链接 | VM；生产边界缺 | 8eedf2222 |
| RCPT-356 | 部分通过 | 一级 | R2共享状态文案与R4状态环 | 已知BL-164 | 8eedf2222 |
| RCPT-357 | 通过 | 一级 | R1 prologue-origin-withdraw-race真实beforeEffect竞争，拒绝后板版本/节点不变 | 工程安全交错 | 8eedf2222 |
| RCPT-358 | 部分通过 | 一级 | R2约定过滤约束/当前轮，非事实不升格 | 二级完整条件缺 | 8eedf2222 |
| RCPT-359 | 部分通过 | 一级、二级（RU范围） | R2约定链接/轮次条件；RU当前约定回到已读补充 | 完整Coding二级缺 | 8eedf2222 |
| RCPT-360 | 部分通过 | 一级、二级（RU范围） | R2助理回执接入；RU真实补充/读到/自述 | 全矩阵缺 | 8eedf2222 |
| RCPT-361 | 部分通过 | 一级、二级（RU范围） | R4助理真实ack工具链；RU模型声明及约定可定位 | 重复/错误声明二级缺 | 8eedf2222 |
| RCPT-362 | 通过 | 一级 | R3 assistant-business-gateway真实ack工具保调用id、不改输入事实 | 工程合同 | 8eedf2222 |
| RCPT-363 | 通过 | 一级 | R3 prologue-workspace-parent-tools六种伪输入拒绝且0模型 | 工程拒绝 | 8eedf2222 |
| RCPT-364 | 通过 | 一级 | R1 coding-input-acknowledge-http真实HTTP与SDK声明 | 工程集成 | 8eedf2222 |
| RCPT-365 | 部分通过 | 一级 | R3 prologue-start-refusal零请求但来源错误码仍待整改 | 已知§10.28；#778 | 8eedf2222 |
| RCPT-R0-01 | 部分通过 | 一级 | R4/R5两种布局同状态同文案，Host说明无回执 | R0明确模拟，不能当生产 | 8eedf2222 |
| RCPT-R0-02 | 部分通过 | 一级 | R4/R5展示状态逐个追到账上依据，模拟依据有标记 | R0；二级未验 | 8eedf2222 |
| RCPT-R0-03 | 部分通过 | 一级 | R4/R5托盘计数与两检查点事实一致，结束卡走录好的分支 | R0；二级未验 | 8eedf2222 |
| RCPT-R0-04 | 部分通过 | 一级 | R4/R5读前撤回/读后更正、about新输入与回显 | R0；二级未验 | 8eedf2222 |
| RCPT-R0-05 | 部分通过 | 一级 | R4/R5问题目标芯片/回答后补充/无题正常发送 | 写进问卷仍灰，既定后续 | 8eedf2222 |
| RCPT-R0-06 | 部分通过 | 一级 | R4/R5中断横幅/逐条未读状态/带到下一轮不自动起轮 | R0；二级未验 | 8eedf2222 |
| RCPT-R0-07 | 部分通过 | 一级 | R4/R5三宽明暗两布局四场景48格、键盘/44px/减动画 | 合成IME不代替真人 | 8eedf2222 |
| RCPT-R0-08 | 部分通过 | 一级 | R4/R5常驻模拟标识、录制提交一致、无已生效、不出网 | R0；不当生产成功率 | 8eedf2222 |

**轻做／证据不足。** QA-009～012分别是当前Coding收下后丢回包去重、摘要真实超时、固定报告终态、固定报告再入模型链的证据或文档缺口。助理RC-16确有真实收下后丢响应、刷新重试反证，不能说所有回包丢失都没测；SDK历史真实去重记录也存在。R0的48格与合成IME仅证明预览，RCPT-R0-07回执更新时保阅读位置只验证非播放重绘，这是已知预览边界。完整Host强杀、网络超时、生产Coding真实模型、全部视觉异常状态及§12.3两组各10次评测未执行；预算16不支持该完整重复矩阵，不借用其他线预算。阶段3e后续及4～6已有明确决定，不算无去处。

**代码质量与安全。** 模型声明与运行事实分开；已读不等于遵循。真实SDK/Host路径已断言伪origin、撤回后竞争、非法ack、取消/撤权拒绝与板零改动；没有把处理器替身的零调用外推成业务持久化全链。共享回执按owner的WeakMap隔离，未给某插件新增名单。PG私路、BL-148/164、人工步骤归属与来源错误码沿用已知§10.27～29及#778；#793/#795属于在途或后续版本，不重复立项。QA-012只是连接证据不足，现有材料围栏/数据通道测试有效，未发现可据此认定的安全突破。

**归档结论：不能。** 27通过、50部分通过、5未验证、0不通过、0按决定不做。四个新问题、上述生产/异常/质量矩阵、阶段后续和三级体验未收口。SIGTERM后记录7次请求但进程未退出，随后仅对本次PID54010发SIGKILL；确认退出，核对临时目录非软链后删除Home及密文。未把这次QA启动器关闭延迟未经归因就记为产品回归。


## 5. 问题表

| 编号 | 线／严重程度／类型 | 验收与章节 | 发现 main SHA | 复现步骤（隔离 Home 起） | 预期／实际 | 证据 | 疑似位置（仅线索） | 建议归属 | 回归断言 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-001 | 交互；P2；产品缺陷 | 外围错误态（不据此判问卷 AC-21 失败）；PRODUCT 界面语言承诺、本次任务 §4；交互 §14.1／§18 A1 作相关依据 | ebad9a223b84d28937df03393231381587b3193a | 新建临时 Home，生产 Web 绑定随机回环端口；不配置模型；进入示例项目；外观设置切 English；助理开始新工作，输入 `Plan a review next week.` 并发送 | 预期失败原因/保稿提示/设置入口完整英文且保留原输入；实际原因仍是“还没有配置可用的模型，助理无法开始工作。”，两侧 `Something went wrong` / `Your text is kept` 已翻译；输入与设置链接正常 | 二级实走；`interaction-english-new-work-error.png`，[截图评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6264854212)；代码链与截图一致，renderer-gap-en 已有译文但链路没用 | `apps/local-host/src/assistant/assistant-error.ts:11`；`apps/workbench/src/scripts/client/assistant-send.ts:77`；`packages/ui-host/src/request-client.ts:194` | HANDOFF §3 交互⑨；与回执⑥协调 sender 文件 | 英文无模型 Home 真实发送失败后，原因与保稿提示全英文，草稿原文不变且模型设置链接有效 | 已派 |
| QA-002 | 交互；P2；产品缺陷 | AC-26／S1；交互 §1 完整失败恢复、§3 状态连续、§5 生命周期与恢复 | ebad9a223b84d28937df03393231381587b3193a | 新临时 Home 配 MiniMax-M3；Form 创建问卷并生成 4 题；输入“另做一份培训反馈问卷，请先问我面向哪种学员和题量。”；首次补问结构校验失败；原要求重试获得合法三题卡 | 预期新卡可答且聚焦时旧生成错误撤下；实际旧错误与合法卡同时显示；原提示和 4 道业务题保留。首次拒绝本身不是缺陷，也不能推断响应具体哪字段错 | 二级：[同一页面错误与新卡截图，1440/390 深色](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6264854212)；源码与实走一致。真实模型首轮结果有随机性，确定性复验需以受控供应商先无效后有效补问驱动同一生产页面 | `plugins/native/form/src/browser/draft.ts:37`、`:42`、`:45`；`browser/client.ts:77`；`browser/save.ts:24` | HANDOFF §3 ③ Form 文件 owner，⑨交互共同复验 | 第一次无效补问、重试有效补问后，新卡可见且首题获焦，旧生成错误隐藏；原提示保留，回答前业务题数不增 | 已派 |
| QA-003 | 交互；P3；文档不符（验收追溯） | AC-09、AC-11；specs/README 验收编号规则 | ebad9a223b84d28937df03393231381587b3193a | 干净检出并预备临时 Home，无需服务；按 README 的 tests 与非 fixture `*.test.*` 范围检索 AC-09/AC-11；对照状态表指向的真实测试 | 预期已有工程证据引用编号，人工部分另列；实际两编号均无引用，但存在真实行为测试。不是产品无实现或完全无测试 | 一级静态核对：`coding-changeset-http`、`coding-report-persistence`、`form-draft-questions` 证明专业链部分；`agent-question-types` 与 `assistant-typed-questions.e2e` 证明适配器部分；#785 仅文档回填 | `tests/form-draft-questions.test.ts:42`；`tests/agent-question-types.test.ts:25`；`specs/README.md:74` | HANDOFF §3 ⑨交互 | 按 AC-09/AC-11 可定位真实证明工程子条件的测试；人工复合条件明确列出，不用空测试凑引用 | 已派 |
| QA-004 | 采用；P2；轻做或证据不足 | PA-08；§5.3、P3 | f31801f5b53c9b520a6b86e12023e5dcdba7c1a9 | 新临时 Home；运行 `node scripts/run-tests.mjs tests/assistant-delegation-handback.test.ts`；对照测试释放顺序、人工继续时点和 spec:515；再读 delegation:521～550 的双方屏障反证 | 预期两子结果与人工继续交错且最多一个父 Run；实际第一个完成后等 400ms 才放第二个，人工继续在自动轮完成后；注释称同时不成立。另有单子结果＋人工的真实竞争，不能说完全无并发 | A2 6/6、A3 delegation 16/16 通过，但不证明缺失组合；不是产品重复执行的实证 | `tests/assistant-delegation-handback.test.ts:77`、`:82`、`:100` | HANDOFF §3 ④采用线；Host 文件 owner 协作 | 屏障制造两子结果与人工继续交错，父 Session 只新增一 Run、接续只消费一次，重开不再启动 | 新 |
| QA-005 | 采用；P2；轻做或证据不足 | PA-17；§5.3、P2 | f31801f5b53c9b520a6b86e12023e5dcdba7c1a9 | 新临时 Home；运行 `node scripts/run-tests.mjs tests/prologue-external-checks.test.ts --test-name-pattern=PA-17`；核对断言终点及 fixture usage；对照历史 live 文件的手动 `start` | 预期 pending 请求与实际用量增量均零、满足后同 Session 恰好一轮；实际仅到 eligible 和请求计数，未检查 usage 或一次启动。历史 live 手动下一轮/打印用量不能补齐 | A1、A3 background-wait 通过；live 历史记录确实存在，但没有完整组合断言 | `tests/prologue-external-checks.test.ts:36`、`:71`；`tests/fixtures/external-checks.ts:101`；`tests/coding-external-wait-live.test.ts:45` | HANDOFF §3 ④采用线 | 原 Run 结束后多次 pending 的真实请求与用量增量为零，满足及重复通知后只新增一轮且接续 consumed/started；计量接缝先有非零正例 | 新 |
| QA-006 | 手册；P2；轻做或证据不足 | ADH-16/18；§8、§9.5 D1② | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 新临时 Home；按 H1 模式跑 gateway 的 ending review 用例；读 :752 循环及 spec:837/840，全文检索 review 的故障注入 | 预期断言核对调用出错/超时仍放原结尾、无额外续做；实际只测正常空结果和无效 JSON，spec 却称错误/超时由确定性证明。未复现产品挂住 | H1 通过；ending-review:52 设30秒、:56归档、:59 catch放过是源码意图，非故障运行证明 | tests/assistant-business-gateway.test.ts:752；horizontal/agent-host/src/adapters/ending-review.ts:41；specs/ai-development-handbook/spec.md:837 | HANDOFF §3 ⑦手册与④采用/agent-host | 核对实际抛错及超时后原结尾通过、无自动续做/新业务写，临时核对会话收回 | 新 |
| QA-007 | 手册；P3；文档不符 | ADH-07；手册 §14 基础实现索引 | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 干净检出并预备临时 Home，无需服务；读手册:515/524/540、同表真实模型行与 assistant-directory；核 #560/#561 合入记录 | 预期索引准确区分当前、历史和未实现；实际总句“无真实模型证据”与表内真实评测冲突，能力目录说只列可用但代码也列不可用原因，已合入#560/#561仍称在途 | 文审与源码；GitHub 两 PR 均 merged，且变更已在本 SHA；不同于已知control版本#793 | docs/platform/PROLOGUE-AI.md:515；:524；:540；apps/local-host/src/assistant/assistant-directory.ts:29 | HANDOFF §3 ⑦手册（相关能力 owner 复核） | 当前索引的能力范围、证据类型和PR状态逐项与本SHA源码及记录一致，历史基线明确标为历史 | 新 |
| QA-008 | Computer Use；P3；文档不符 | CU-G14；runbook§6、open-decisions状态、spec D16/§6 | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 干净检出并预备临时Home，无需真实桌面操作；对照runbook§6与open-decisions§1已选A、spec状态已合#721/§9新裁剪OCR | 预期操作单遵守已定A并准确标历史；实际runbook仍写面板“待定、先问绕开”，open-decisions称#721 draft，旧“不向模型送图/无OCR”未标已替代 | 文审，当前实现与§9一致；没有因此放宽不同PID拒绝或改代码；已核PG§7与在途未找到本项 | specs/computer-use/acceptance-runbook.md:77；specs/computer-use/open-decisions.md:3；specs/computer-use/spec.md:28 | HANDOFF §3 ⑦手册/Computer Use | 四份文档对已定A、#721状态、自动裁剪/OCR现状一致；历史限制明确注明已替代，真机缺口仍保留 | 新 |
| QA-009 | 回执；P2；轻做或证据不足 | RC-02/11；§11阶段1c/1d | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 新临时Home；运行R1 agent-input-delivery与R4 coding-input-receipts.e2e对应编号；读同键重发和网络故障夹具 | 预期真实Coding已收下后丢回包、同键重发仍只一笔；实际去重Map在替身内，浏览器在原fetch之前抛错，仅比对重试键。助理RC-16另有真实覆盖，不扩大结论 | R1/R4均通过；历史SDK去重记录不等于当前Coding全链 | tests/agent-input-delivery.test.ts:55；tests/coding-input-receipts.e2e.test.ts:106；:122 | HANDOFF §3 ⑥回执，④采用协作 | 真实Host接受固定键后切断响应，重发返回原input_id/replayed，账里仅一条且provider只含一次、界面不重复 | 新 |
| QA-010 | 回执；P2；轻做或证据不足 | RCPT-102；§20.3/20.5 | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 新临时Home；跑coding-history-requirements的RCPT-102；读coding-history-summary-http故障注入与host-inference-completion截止测试，检查下一轮请求 | 预期实际摘要超时后六条要求仍进入下一轮且不重复摘要；实际测试立即Error或空值，含“两分钟”的错误字样不构成超时。其他inference deadline测试不是此路径 | R1/R2通过；未复现产品挂住或丢要求 | tests/coding-history-requirements.test.ts:19；:91；tests/coding-history-summary-http.test.ts:43；tests/host-inference-completion.test.ts:120 | HANDOFF §3 ⑥回执与④agent-host | 真实摘要截止超时走回退，下一provider请求保六条要求，迟到摘要不替换且无额外摘要调用 | 新 |
| QA-011 | 回执；P3；文档不符、测试夹具失真 | RCPT-341；§11阶段3d-1 | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 新临时Home；跑coding-report-persistence对应编号和prologue-input-receipts；对照spec五态及真实SDK结算投影 | 预期报告标准与真实终态一致；实际spec写五状态，夹具五输入仅四态、含终态applied且无received；生产结算会把received/applied归未读。不能靠再造一个received夹具补绿 | R2/R5通过；生产导出只取终态，静态链与真实投影一致 | specs/ai-input-receipts/spec.md:837；tests/coding-report-persistence.test.ts:123；plugins/native/coding/src/routes-changesets.ts:32 | HANDOFF §3 ⑥回执 | 用真实结算账生成固定报告，逐条状态与SDK一致；spec分别写清全生命周期五态与终态可出现集合 | 新 |
| QA-012 | 回执；P2；轻做或证据不足 | RCPT-343；§11阶段3d-1 | 8eedf222268eabb69a191ee726b11b62fa2d5ecb | 新临时Home；跑coding-report-persistence的RCPT-343与prologue-materials；追踪存报告到下一provider请求 | 预期已存固定报告作为材料进入下一轮仍是数据；实际前者到格式器即止，后者用手写普通材料，未串起同一固定报告。并未观察到注入或安全突破 | R2/R3通过，围栏与泛材料真实provider测试均有效，缺连接组合 | tests/coding-report-persistence.test.ts:202；tests/prologue-materials.test.ts:34 | HANDOFF §3 ⑥回执与④采用 | 公开保存带恶意围栏的报告后交固定版本给下一Run，在真实provider请求中核正文和来源版本仅在数据通道、任务/系统不被替换 | 新 |

QA-001 已核 BACKLOG、§10.27～10.29、PG 与 19 个在途 PR；BL-118/125/141、PG-071 属邻近问题但不是该路径，#631/#778 也没有修复该原因翻译。已知 P1 #709 继续沿用原编号，未新立项；尚待按原步骤复验。QA-002 与 BL-094（Feed 错误串页）不同；#776/#785 不修改该状态清理。统筹已在[分诊评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6265235773)确认 QA-001～003 并派交互线；#785 没有补测试编号，QA-003 保留。QA-009～012已核BACKLOG、防腐§10.27～29、PG及#631/#778/#789/#793/#795，未找到同一缺口的登记；候选只有独立核实并去重后才编号。

## 6. 跨线场景

已实走一条跨线子链（RU）：助理提问→补充/撤回→真实模型→Pages固定文档→文件预览，见§4.5；不含Coding与情境落点。

尚待实走：助理提问 → Coding 执行 → 固定结果进入成果库 → 情境浮条放进 Pages；核对同一事实的主人、输入回执、取消/撤权后的业务写入及恢复。须先确认当前各线承诺，缺失的链路只按其已有决定判定。

## 7. 没验的范围和原因

除 §4.1～4.5 明列范围外，其余动态路径均未验证。密钥现已可安全使用。真实 Home、发布/安装和迁移不在本次范围；第三方账号和真实资料不作为夹具。助理 Agent 目录模型配置与 Form 开发环境入口不能相互替代；正式助理配置已按用户批准以临时密文完成；其他未覆盖模型链路仍保留未验证。

## 8. 待用户验收

中文 IME 候选过程、主观手感与视觉质感、VoiceOver 连续听感及各线明确要求的真人判断：UNVERIFIED，后续按编号细化。自动化工程结果与 QA 实走均不能代替用户认可。

## 9. 决定与疑问

- 2026-10-19：用户确认当前机器不是禁止使用的开发 Mac，可做 QA；仍只用临时 Home。
- 保留 detached 被测基线；文档 PR 使用独立 `codex/` 报告分支，不往别人的分支推。被测代码不随报告更新改变。
- 回执库存补入 RC-01～19、G13；子需求书 T/Q 编号保持原样；AC-27/28 汇总与子项统计明确重叠。后续计划中的“以后做”不是永久决定不做。
- coverage 工具只识别部分标准写法，本次 JSON 报告对交互只列 16 条、回执只列 7 条，Computer Use/情境未枚举；必须人工补全，不据 0 退出码称全覆盖。重定向为普通文件得到完整 JSON；管道截断不是产品验收失败。
- 初始读到最近夜间全量 run `39157724720` 成功，覆盖 `739e6cb29b92a89dcc035b7db49c3afeec5a5ac3`；不是初始 QA SHA，不能证明之后的提交通过全量。后续核查 jobs、flaky 和取消情况。

- 已读[统筹接续评论](https://github.com/molis-ai/molis-work/pull/784#issuecomment-6264083782)：#709 的修复在途 #759，生成插件补问已有 BL-245，网关插件 caller 缺口已登记 PG-110；只作已知问题线索，仍按被测 SHA 和需求自行核对。

- 2026-10-19：正常助理/Coding 配置需要凭据密文，自动审批先按“密钥不进文件”拒绝启动；没有请求发出。用户随后明确允许本次例外：仅一次性 Home 保存 AES-GCM 密文，独立加密主钥匙只在内存，停服务后删除 Home；明文继续只从专属钥匙串内联读入 MINIMAX_API_KEY，不进文件/日志/参数/截图。不伪造 connection 或跳过正式配置检查。

- 采用线真实服务请求总数最终为 18，已停止自建 PID，核对临时目录名且非软链后删除整个 Home；未操作真实 Home/4207。PA-23 按现行 P3a 已定接法判断，不能把旧 A0 的禁 yield 文字用于否定正式 SDK 接续。

- 手册线 7/12 次请求完成；按 PID 49492 停服务，确认进程退出后核对临时目录并删除，密文随 Home 清除。

- Computer Use 的0/30请求仅权限先决检查；已按自建 PID 50894 停服务并核对删除本线临时 Home。没有修改系统权限；后续真机需权限由用户自行配置后再复验。
