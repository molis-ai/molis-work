# Issue 自主录入的命名评测

保留 10 月 19 日的原状态、判定规则、改前和改后样本、失败及留出题。该功能后来由 #819 合入。

[返回需求书](spec.md)

状态：已实现，改后评测满足事先写好的两条判定（结果见「先量」后面的「改后」），等评审（分支 `claude/bl149-issue-naming`），实现记录见本节末尾。方向由方法与迁移线 ③ 对过（统筹 10-19 指定）；代码主人 @yijunw0212 经 CODEOWNERS 评审。由 AI 手册线写 spec 并改；下面列出的文件 ③ 那边不碰。先按「先量」量现状，再动手。

**先量（改之前）。**
- 材料：「日常模型的产品内评测」那 10 条输入。
- 现状：在隔离 Home 里用 MiniMax-M3 走现行页面录入（prepare → assistant/send → watch），每条跑 3 次。记一次调用就存好的比例、模型调用次数、时延，以及标题和类型是否合规则。
- 改后：同一组材料再跑。存好的比例不低于改前、标题和类型合规则的比例不低于改前，才合入；差的那几次逐条分类。
- 密钥只在那一条命令上从钥匙串读，不写进任何文件。

**要改的文件。**
- 插件：`plugins/native/issues/src/manifest.ts`（权限、新动作）、`actions.ts`（新动作，`capture` 去掉 `agent`）、`capture.ts`（命名并写入，写入人从调用上下文取）、`plugin.ts`（接 `services.model`、新路由）、`methods.ts`（v11）、新文件 `prompts.ts`（那一份规则与指令）、`capture-client.ts` 与 `review-client.ts`（去掉助理工作的读写、卡片和提问的分支）、`README.md`。
- 目录条目：`apps/workbench/src/builtin-plugins.ts` 的 Issue 条目声明指令（枢纽文件，动之前先查在途 PR）。
- 测试：`tests/issue-assistant.test.ts`、`tests/fixtures/issue-model.ts`、`tests/issue-capture.test.ts`、`tests/issue-capture-page.e2e.test.ts`、`tests/issue-reorganize.e2e.test.ts`、`tests/issue-clarification-page.e2e.test.ts` 按新路径改（`issue-assistant-repair-page.e2e` 删掉，见实现记录），新测试带 ISSUE-50～53。浏览器用例等机器恢复后再跑（用户 10-19 暂停）。
- 快照：`tooling/gates/actions/`（`pnpm actions:update`）；`tooling/gates/page-assets.json`（Issue 脚本应变小，变小就降）。


**实现记录（2026-10-19）。** 两个新动作都只给 `user` 调，`scheduling: "concurrent"`，权限加 `model:invoke`，`execution.cost: "metered"`：
- `issues.name_draft@1`（写）：读草稿，调一次模型，存成新记录或返回一句追问。`issues.suggest_name@1`（读）：给编辑中的原文和截图建议标题和类型，什么都不写。
- 模型调用：上限 90 秒、4000 个输出 token。传给模型的数据里写截图有几张、这次附上没有，模型不会以为自己看过截图。
- 截图只在所选模型声明能看图时附上。为此 `PluginModelAvailability` 多一个可选的 `vision`，宿主按模型目录里那个模型的 `vision` 填（`apps/local-host/src/plugin-model-service.ts`、`packages/contracts/src/platform/plugin-model.ts`）。模型要带 `vision: true`，截图才会到起标题这一步。2026-10-20 评审补修 BL-391，验收 `ISSUE-54`：人在「设置 → 模型 → 供应商 → 模型列表」逐个选择「读图能力：未声明／能看图／不能看图」，再保存。未声明的值不因保存其他设置变成 `false`；人明确选择能或不能，才写对应布尔值，也可恢复未声明。不改模型默认值、模板或真实 Home。只有截图且未声明或不能看图时，不调用模型、不写 Issue，固定提示说明原因及这条设置路径；明确能看图才附原图。浏览器回归经真实设置页保存并重载核对三态，再录入截图验证调用和持久化；既有 ISSUE-50 继续覆盖有文字时仅传文字。补中英文，复用同一个 Host 设置和模型服务；页面资源先在本文件减少重复选择器，仍有增长则按预算规则报实测，不借用其他 PR 的放行。验证已过：整体构建，模型设置与 Issue 服务端，10 份浏览器文件（其中 `tests/model-vision.e2e.test.ts` 真实保存、重载与中英文 480 px 截图），翻译、资源、边界与健康门禁。对直接前序 #840 的实测：`workbench.js` 1,129,640 → 1,129,470（减少 170 字节），设置 CSS 988,933 → 988,929、工作台 CSS 1,603,154 → 1,603,150（各减少 4 字节）；480 px 下模型标识可正常编辑，读图选项可见，控制项按可用宽度换行，未增加预算。两份旧浏览器用例先等截图缓存恢复、发送按钮启用，再输入快捷键；产物断言不变。评测两臂都按有 `vision` 跑（`MODEL_VISION=1`）；本次不改起名提示词或模型判断规则。
- 模型回答只认两种形状：`named`（一行标题，1～200 字；类型在枚举里）和 `needs_input`（一行追问，1～200 字）。其他回答报 `issues.model_reply_invalid`（类别 upstream），提示「模型没有给出可用的标题和类型，点开补全后保存」，不修补成记录。`result.validateResult()` 在写入事务里、提交前再查一次。
- 写入人取调用上下文的 actor。起标题存下的记录 `entered_via` 仍记 `assistant`：标题和类型是模型给的，人只写了原文。
- `issues.capture` 只剩 `user`（页面的手动保存）。助理在对话里记问题用 `issues.create`，测试 `tests/issue-assistant.test.ts` 的 ISSUE-25 那条覆盖。

页面上的处理：
- 两分钟兜底：服务端模型上限 90 秒，页面在两分钟后仍没等到就自己收尾。录入先撤掉草稿（`cancel_capture`）再提示超时，迟到的回答找不到草稿，不会在人手动存的那条旁边再存一条。重新整理直接丢掉迟到的回答，编辑器原样还给人（ISSUE-49 不变）。
- 出错提示：没有模型（`actions.connection_required`）和上游失败（`plugin.model_failed`，比如 503）都显示「模型暂时不可用，点开手动保存，或检查模型设置」。超时（`actions.timeout`）显示「整理超时，点开补全标题和类型」。带我们自己错误码的拒绝（截图超限、没存的录入太多、`issues.model_reply_invalid` 等）显示它自己的话。没有错误码的、内部失败（`actions.execution_failed`）和 `plugin.model_output_invalid`（回答不是 JSON）显示「没能自动整理，点开补全标题和类型」，这几种的原话不是给人看的。编辑器里重新整理遇到没有模型或上游失败，显示「模型暂时不可用，可以直接保存，或检查模型设置」（人已经在编辑器里，不再说「点开」）；需要补充的追问，两处都经翻译显示，固定的那一句也有英文。
- 回答在路上丢了（没有 HTTP 状态）时，先按草稿 ID 读一次，记录已经在就当存好。

规则文本在 `plugins/native/issues/src/prompts.ts`：`issues.name`（v1，owner `io.molis.work.issues`）登记在目录条目上，方法 `issues-capture` v11 用同一份文本拼。已知的限制：人在「Prompt 与 Character」里改了 `issues.name`，只影响页面起标题，不影响方法；方法里的规则仍是代码里那一份。

删掉的用例：`tests/issue-assistant-repair-page.e2e.test.ts` 通过 Issue 页面钉住的是助理运行时的行为，页面录入不再经助理，那些行为改在下面这些地方测：
- 合同拒绝写出完整 input 合同：`tests/assistant-business-gateway.test.ts`，和 `tests/issue-assistant.test.ts` 新的 ISSUE-25 那条（`issues.create` 带错输入被拒、改对后存好、撤销取回）。
- 重复调用保护：`tests/prologue-recovery.test.ts`、`tests/prologue-stream.test.ts`。
- 选项要有 label：`tests/interaction-sdk-mapping.test.ts`；被拒两次停下：`tests/interaction-repair-limit.test.ts`；被拒一次说明原因、改对后等人回答：同一个文件新加的 ISSUE-34 那条。
- 「每次确认」下页面录入落成卡片的那条不再适用，删掉；其中「放弃没写完的录入什么都不留」单独成了 `issue-capture-page.e2e` 里的一条。

改到的文件比上面的清单多这几个：`apps/workbench/src/i18n/renderer-gap-en.ts`（删掉不再出现的四句，加新提示的英文）、`apps/local-host/src/plugin-model-service.ts` 与 `packages/contracts/src/platform/plugin-model.ts`（`vision`）、`tests/fixtures/issue-browser.ts`、`tests/interaction-repair-limit.test.ts`、`tests/plugin-model-selection.test.ts`、`tests/security-invariants-plugin-model-metadata.test.ts`、`horizontal/agent-host/README.md`（回归用例改指 `tests/issue-assistant.test.ts`）。

先量（改前，2026-10-19，MiniMax-M3，隔离 Home，10 条 × 3 次，30 次全部有效）：
- 该存的 27 次里一次调用就存好 23 次（85%）；「111」3 次都只追问、没存。
- 没存的 4 次：3 次助理结束了工作却没存（05、07、09 各一次），1 次（09）不该问却问了。
- 30 次里每条规则都过的 20 次（67%）：标题超长（05、09 各一次）、英文输入起了中文标题（08 一次）、标题带项目名（02 一次）、07 存下的两次标题都抄了截图里旧标题的字句「看不到后半句」（人只写了「列表里长标题被截断」）。
- 时延中位 10.6 秒、最长 23.1 秒；每次平均 2.0 次模型调用。

改后（同一套题、同一个模型和隔离 Home，10 条 × 3 次；判定规则开跑前写好：一次存好和「111」问对的跑数都不少于改前，存好的记录全部规则通过的比例不低于改前）。改了四轮（前三轮改提示词，第四轮是评审 #819 之后把标题语言交给代码），照实并列：

| | 一次存好（27 次里） | 存好的记录全部规则通过 | 「111」只追问 | 每次模型调用 | 时延中位 | 输入 token 中位 |
| --- | --- | --- | --- | --- | --- | --- |
| 改前 | 23 | 17/23（73.9%） | 3/3 | 2.0 | 10.6 秒 | 19788 |
| 改后第一轮 | 20 | 16/20（80.0%） | 3/3 | 1.0 | 4.0 秒 | 735 |
| 改后第二轮 | 26 | 19/26（73.1%） | 3/3 | 1.0 | 4.7 秒 | 832 |
| 改后第三轮 | 23 | 20/23（87.0%） | 3/3 | 1.0 | 4.1 秒 | 915 |
| 改后第四轮（本分支，标题语言由代码定） | 24 | 23/24（95.8%） | 3/3 | 1.0 | 5.3 秒 | 957 |

改前一臂的「一次存好」23/27 没有扣找能力的调用（预登记的口径是「没有找能力」）；按那个口径是 21/27，改后更好。这里仍用 23 比，是从严；别人复算时会看到 21。

- 第一轮少存，是规则给了追问的出口：只有截图、没写页面都去追问了。第二轮去掉这些出口后存得多，但英文输入起中文标题（3 次）、照抄报错原文超长、标题留「希望修好」、短描述不到 8 字的多了。第三轮按事先定的归类改了标题规则（英文描述写英文标题并给例子；Bug 只陈述现象；截图里的报错写成人看到的现象；只有描述用「这里」或不到 8 字时才点页面名），两条判定都满足。
- 第三轮没存好的 4 次：05、09、10 各追问 1 次，10 有 1 次连不上 MiniMax（按规则算没存好、不重跑）。每次只调一次模型，没有调 `issues.capture` 或找能力。
- 第四轮（评审后，提交 `8b7734e3a`，30 跑全部有效，没有出错）：改了两处，都不是调词。标题语言由代码定（`title_language`），08 三次都起了英文标题（改前 2/3 英文、第二轮 0/3、第三轮 1/3 英文），不用再加“英文输入出现中日韩标题就拒绝”的兜底；提示词里照 03 原话写的例子换成与十题无关的一句。没存好的 3 次是 01、02、09 各追问 1 次（“你在哪个页面做了什么…”）：这三条描述里都有一句能看懂的话，是模型仍然会走追问的出口；规则没有再改。存好的 24 条里不过规则的 1 条：09 第 2 跑的标题抄了日志里的“feed:rss”和“pending”，超过 30 字。每次只调一次模型。
- 留出题（11～15，开跑前写下，提示词和规则从没对着它们改过；`cases/`）：英文功能需求、不到 8 字的中文、有文字加截图、中文夹英文单词、较长的英文 bug，各 3 跑，15 跑全部存好，14 跑全部规则通过（93.3%），比同一轮原十题的 95.8% 低不到 15 个百分点，没有贴着原十题改过的迹象。不过规则的 1 条是 12 的第 2 跑：标题“搜索没结果”只有 5 字，没按规则补页面名。留出题不据此改提示词，没有改前一臂，不拿它们判合不合。
- 第三轮时还剩的：08（英文输入）3 次里有 2 次起了中文标题，比改前（1 次）多；07 有 1 次补了截图里才有的「看不到后半句」。第四轮 08 三次都是英文标题，07 三次都没补截图里的字。四轮之间一次存好差到 6 次（20～26），样本小，结论只在这 10 道题、MiniMax-M3 上成立；前三轮改了提示词，也有贴着这套题改的风险，第四轮的留出题是为这个加的。
- 逐跑记录与判定规则在统筹共享笔记 `handbook-eval-issues/`（`issue-before.jsonl`、`issue-after{,2,3,4}.jsonl`、留出题 `issue-holdout4.jsonl`、`bl149-rule.md`）。
