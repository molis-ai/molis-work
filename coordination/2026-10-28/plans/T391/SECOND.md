# T391 独立最终二审（一审线2）

状态：**最终二审通过，无Blocker/P1或当前必修项；RAC-2837～2839的实际文档产物与独立验证结论一致，支持full=false。** 两处历史限定已落实。仅签本片文档范围，不签CI、推送、main采用或产品验收。本线没有build、新测试、重复书审或重跑作者/验证线有效检查。

## 最终输入与实际范围

- accepted WO：协调 `coordination/2026-10-28/tasks/T-391.md`，RAC-2837～2839；作者开发线4、独立验证线5、本线最终二审。
- M=`15ad4f397018241c8b31625aff8014b89259f239`；H=`8c1970313438137b19f114fe9b7ae4f3392f6687`；tree=`8762ccd9b471c21cd0c34fde3e02616620003f5f`；H唯一parent=M，本线从Git对象直接核实。
- 唯一diff是 `docs/system/EXTENSION-POINTS.md`，+10/−10，行号与行数未移；实际改行恰为37、61、77、240、244、252、253、277、279、282。15个旧“外加2/外加的2”文本项全部处理，没有只替换10次而漏格子。
- 根通知的当前main已用本地origin/main读到完整 `db29f18d4f602fa8d9efb689a6a766aa9b07625f`：相对M只改 `tests/mcp-connection-change-refusal.test.ts`，目标文档blob与M相同。本线未fetch或同步候选，不因无关测试前进要求作者额外merge/重跑。
- 作者REPORT与FINAL-STATE已齐，writer交回；本线只读观察作者树HEAD仍H、工作树clean。报告及原件位于 `/private/tmp/t391-evidence/`，未修改该目录或源码。

## 实际内容裁决

- **RAC-2837：文档差异通过。** 10行15项改成只另需SSOT文档一行；61/77/252明确assembly名单从生成登记读取、不手改。与先前已核当前实现及页首口径一致，没有将不手改门禁误写成无需运行检查。
- **RAC-2838：文档差异通过。** 77为“历史目标推演”、253为“再推演（按当时模型）”，根接受的两处P2限定已落实；原workspace/X1模型被保留为历史推演，不被宣称为新的现行手工操作。逐改行核历史成本数字不变，唯一移除的是外加项数量2及61句重复“不计入11”的解释，不是删除11处成本。五项推演、原X1括号及未逐项重测限制保持；没有成本归零或整表实测声明。
- **RAC-2839：实际范围/结构审阅与独立验证原件均通过。** 实际diff唯一该文档，逐行比较确认其它全部行不变；20/71/87/251已准确段、§3.12整个T148终端段188–198、T067/068服务集成及F3/其余owner段均未覆盖。受影响表行pipe列数不变，没有新增链接或路径token。

## 作者有效原件及不重复执行边界

已读作者最终REPORT、FINAL-STATE、scope-check、checks.json、doc-links.raw、inline-code-check.raw及CONTROL-NOTE。报告的验证文档blob `20fb4c927add35f683a11c3b8eae6824cf40797d` 对应H的目标文档。作者使用仓库既有brokenLinks检查tracked live Markdown，返回0问题；readMarkdown记录729处行内代码文本及行号相同；final diff-check无输出，affected为tests=[]、full=[]。本线只核原件与实际diff，没有重新执行上述命令，也不把不适用的skills/AGENTS/CALL-CHAINS行内引用规则说成扫描了本文件所有历史代码名。

作者保留了首次不识别fenced block的辅助正则误报，改用既有Markdown reader后核对相同；未为此改文档或放宽规则。本线不把该辅助误报当作产品失败，也不把它藏掉。作者未创建浏览器/profile、测试Home或常驻进程，无这类资源清理要求；干净候选与原件保留。

本片full=false判断与实际纯文档diff相符；没有新增build/browser/product/Full证据要求。CI、推送及main实际采用仍归根，不在本报告签认范围。

## 独立最终验证补核与结论

现已读取验证线5最终 [REPORT](/private/tmp/t391-verify/REPORT.md)、`verification.raw`及`diff-check.raw`：准确M/H/tree、文档blob、322行、10行实际差异与15项替换均与本线实际对象核对一致；RAC-2837～2839均通过。其独立提交级diff-check退出0/无输出，四个唯一Markdown相对目标和8个相关路径在H存在，全部链接/行内代码token未新增或变更；没有把729个历史代码词项都有效当作结论。该证据边界充分，不需要再跑同一检查。

本片文档验收无剩余项，书审P2已在77/253实际落实；没有新增后续修复或整表计量任务。当前main只前进无关测试且本文件未漂移，不据此制造文案rebase/重复验证要求。根仍负责准确H的发布、CI及最终main采用。报告与干净候选保留，本线停止工作，无持续轮询。
