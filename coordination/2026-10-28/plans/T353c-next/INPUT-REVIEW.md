# T353C · Pages wholeEnds 新门禁输入短审

结论：**公开 SDK 没有 wholeEnds 的等价能力；当前不应把它硬迁成 cutHead/cutTail。最小合规方案是给 RAC-2728 登记一个受精确约束的既有特例，Pages 与 SDK 生产代码保持不变。** 这不是按目录排除或为变绿放宽“新增就地限长截法必须走 SDK”的规则。

绑定：M `be0c777002509b6eb4e2c2187eb3a5765a5440f6`；候选 B `45b3dbfffdece73d006800535142444ef25e8045`；C `07592e0fc36375b8d191d24ceafbd5e58d36d403`。M/B 的 `plugins/native/pages/src/whole-characters.ts` 均为 blob `728ecf5d317f02574b206542d773a49f7673c060`；C 尚无该文件。Git 来源为已采用 T204/#1563 的提交 `86570ac4499871f46c52762f73a1cd91f68ccc20`。这是合流后新增的扫描输入，旧 C 五行证据不能覆盖它。B 仍待实际采用，C 的原顺序不变。

## 为何不能直接迁 SDK

- M 的 `packages/plugin-sdk/src/whole-units.ts` 与公开 whole-units API 提供 cutHead、cutTail、cutCharacters、exceedsCharacters；未见两端修剪函数。cutHead/cutTail 的合同明确“限内原样返回”，只有超 N 时截对应一端。
- Pages 的 wholeEnds 不接受 N，清掉片段开头落单低代理、末尾落单高代理；不清理内部字符，也不做按字素计量。静态推导：若 s 由“落单低代理 + A + 落单高代理”组成，wholeEnds(s) 得到 `"A"`；`cutHead(s,s.length)` 与 `cutTail(s,s.length)` 都原样返回。不能用额外删字符/拼哨兵强迫 SDK 进入截断分支来伪装等价。
- 实际调用不只“长文本截头”：`focus.ts:159–160` 的 before/after 来自 ProseMirror 任意 UTF-16 位置；`landing-editor.ts:57–58` 对选区及前后文调用，其中 surroundings 没有再 slice；`link.ts:44,73` 在图片说明/书签名 slice 后始终清两端。浏览器 context、headingPath 也复用这一份。换为单端限长函数会漏掉另一端，限内短片段也可能保留原来会删除的边界半字。

Pages 已声明 SDK 依赖，且 landing-editor 已导入 SDK/browser，故特例理由应是**语义不同**，不能写成“浏览器不能依赖 SDK”或未经实测的资源增长。新增 SDK 两端修剪 API 会扩大原 C 批 5 的 API/消费者范围，当前无必要。

## 最小合规修订

只在原 `tests/whole-units-gate.test.ts` 内处理这项新输入，并由根在同一 T353C 合同记录分类：

1. 保 CUT_IDIOMS、`git grep -n -i -F`、非 tests 的原扫描范围、无匹配 assert.fail、旧 ALLOWED 的理由及 SDK 恰好两条命中全部不变。
2. 特例只认 `plugins/native/pages/src/whole-characters.ts` 的现有 **wholeEnds 单条声明**。理由写明：T204 已有的任意编辑器片段两端修剪，无 N、非 SDK 限长截法。不要泛加 `plugins/native/pages/`，也不要只把整个文件无约束地加入 ALLOWED。
3. 对该特例额外钉住“只有一个匹配行，且就是准确现有 wholeEnds 声明/匹配式及替换值”。可剥去 git 输出的路径/行号后比精确声明，不固定物理行号；同文件新增第二条截法、修改成另一个实现、其它文件复制这一条都仍拒绝。保持其余名单外拒绝，不改 regex 来让 Pages 不被看见。
4. 门禁注释、断言说明与原任务验收措辞区分“SDK 的限长截法”与“已登记的两端片段修剪特例”，不能继续把该合法输入称为新的 SDK 等价副本，或宣称仓库所有整字处理只剩 SDK。

以上可限于 C 原有 gate 路径及根串行的同单说明，不需要增加 Pages 第九源码路径、包依赖、API/动作快照或资源许可。不要改 wholeEnds 的大小写/转义以躲扫描，也不要改它的既有行为。

## 对原验收的影响

RAC-2726 的 SDK 算法与 RAC-2727 的 C 业务迁移不因此重开；既有证据继续按原头/来源沿用。RAC-2728 需要在最终合流输入上重跑完整 gate 文件，并证明这一个既有声明可过、同文件新增匹配或其它文件副本仍红；正常绿不能独自证明特例没有扩宽。原已要求的小写、无锚点 tail、无匹配拒绝的有效动态证据继续核抵，尚缺的独立证据仍保持缺口，不由本报告代签。

160/4000 上限、已接受代理边界行为、摘要参与 searchRevisionOf 等均不改；不新增 Pages 生产改动及其额外运行矩阵。原七份未跑浏览器、准确新头 CI/Full、旧失败归因等条件仍照 READINESS/任务书结算，full=true 不降级。

本审只读指定材料与准确 Git 对象/必要调用链；未运行 gate、测试、build 或变异，未改代码、refs、GH。唯一写入为本文件，不复审已定截法算法，不扩大其它事项。
