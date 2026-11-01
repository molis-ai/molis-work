# T379 独立验证计划

负责人：Codex 验证线3。状态：只读准备完成，**尚未启动独立测试、Host 或浏览器**；本书交统筹核收后才排执行。唯一需求书 `/Users/yijunwang/code/mw-coord/coordination/2026-10-28/tasks/T-379.md`，沿用 RAC-2800～2803，不新造验收矩阵。

固定 B=`b6f92222fce89dfba756a580768889292cfe9967`，H=`ea67075d13fde5353651645a4599bdf0ee5c4e1e`，tree=`24bf45d51a00cd215321e966946fae3c5965d3c7`。作者树 `/private/tmp/t379-dev` 保持冻结。本次不跟随 main、不引入 T377 或其他候选；未来资源/共享文档采用后按实际差分结算。

## 已核事实与可以沿用的原件

已从不可变 Git 对象独立复核：H 唯一 parent=B、仅两生产两测试文件、当前干净；四文件工作内容 blob 与 binding.json 一致，Git 完整 B→H patch 与作者 candidate.patch 逐字节相同。用独立空 HOME/CFFIXED/XDG/file-backend 环境，只调用公开 computeBuildSourceDigest 做只读计算，当前结果与 build manifest、作者最终 binding 均为 `a2941a4c5fe77dfc5bfdc50232e92a25daca9269a30df733f4905e108b9a4b59`，manifest 时间 `2026-11-01T00:45:23.708Z`。原件 `preflight.json`。

已回读 red/green/required 完整日志、result、run-stage 与两测试完整新增差异。原红为4例中3通过1失败，可信 K 在 Todo notes 的桥前与桥后均未消费、非 composing/repeat/terminal，独立 dialog/focus oracle 失败；作者最终两完整文件7/7，README 28文件188/188，fail/skip/cancel/todo均0。它们仍署作者执行，本线不再重演红，也不重跑188。

**绑定原件存在一个具体限制**：作者 green/required 的 result.head/tree 为提交前 B，dirty列出四文件；其中 result.files 两生产 blob 也列 B 旧值，不能把这两个字段作为实际工作内容的 H 绑定。相同日志的 matching_source_digest 已是最终 a294，当前干净 H、准确 patch 与公开 digest 已另核。保留这个原貌，不改作者 result，不把提交前运行说成 H checkout 实跑。本次两个完整文件的新执行将直接绑定干净 H，补这一层独立证据。

作者来源拒绝覆盖真实 shell listener；DOM terminal fixture 仅支持 selector 识别。组合输入/repeat及来源 MessageEvent 为局部合成探针，均不冒称原生输入。资源实测 +179/+360、资源门禁仍失败、文档仅候选 patch；本次不放行或改账本。

## 最小执行：一批完整文件＋一次独立最终产物实操

1. **两个原完整文件，7例，jobs1/retries0**：`tests/global-ui-interaction.e2e.test.ts`、`tests/issue-global-navigation.e2e.test.ts`。保持原文件、无name筛选、无fixture/断言修改。覆盖原全局UI案例、RAC-2800主区原生K/F、桥前已消费/终端DOM/局部repeat-composing、RAC-2801嵌套Issue、RAC-2802实际shell来源拒绝与RAC-2803原ISSUE-35全部路径。目的为新独立执行者在干净H上核核心修复和来源边界；不扩大成README188或另套SI回归。
2. **同一隔离真实Host的一次产品实操**：沿公共 openTestHome/ChromeHarness/pluginFrameBrowser，completeText=null、正常catalog policy；公开管理入口建一个合成项目，真实Todo UI创建一条待办、写合成notes。直接点notes，**不点回shell、不直接打开搜索、不派合成keydown**，CDP原生Meta+K后记录两阶段只读keydown回执（trusted、key/code/modifiers、defaultPrevented、repeat/composing、目标/焦点）及外壳dialog.open/inputFocused。K再次按下关闭，原生Escape、重新点notes后F打开同一dialog，F已开重聚焦；保留待办id/说明/URL。用原生Ctrl+K/F各一组检查共用Mod分支，不枚举系统/尺寸/语言矩阵。
3. **同一Host嵌套Issue实操**：真实Issue入口→现有嵌套composer→输入未发送合成草稿，原生K/F到顶层同一dialog，观察一次按键只产生一次有效转发/打开，outer event.source是当前仍连接可见side frame，关闭搜索后可继续编辑、草稿和frame身份保持。与两完整文件中的hidden/inert/CSS-hidden/non-current/closed/detached/wrong-origin/unrelated-source/illegal-chord拒绝原件共同结算主区、嵌套及来源边界；不再在一次性driver里重复整套来源矩阵。
4. **现有终端路径、无命令/无模型的原生负例**：使用本次合成项目中真实Goals页面的现有终端面板，走“添加终端”→“自定义命令”，仅聚焦生产 `[data-tui-pane]` 下的 `input[name=command]`，保持空值，原生K/F，记录可信按键、实际焦点/祖先、搜索保持关闭；取消菜单。**不按提交/Runtime启动按钮，不发送命令、不创建PTY/外部Agent、不用模型**。核Network无终端创建/启动写入。此项是真实既有终端面板输入路径，不是Todo里造一个DOM容器；它仍不是运行中xterm/PTY输入证据。源码显示现有xterm要经panel启动/attach才挂载，不能在“无命令”约束下把它伪称已验。若统筹要求运行中xterm，则该部分保持未验证并另定安全输入范围，不能偷偷启进程或用假panel替代。

实际执行前以当前真实可见入口定位Goals与Issue，不靠猜selector反复点。若生产Goal路由或面板状态阻挡第4步，保存响应/截图并交根，先完成其余不依赖步骤；不预采用T116/T377，不造终端DOM来填“真实路径”。本链不重跑原场景7移动/权限/落盘。

## 产物复用与隔离

执行时优先建本线自有 detached H 树 `/private/tmp/t379-independent/wt`；从作者树**只读复制**对应 ignored node_modules 与各级dist（可用本机APFS clone）到自己的树，保持相对workspace链接，不改作者树或源码。复制后独立核干净HEAD/tree、四文件blob、lock、Node/ABI、当前source digest与manifest；所有build产物均须解析在H同输入的保留产物内。这样测试生成的ignored截图也在本线树，不写作者树。复用缺文件/绑定不符先报根定位，不擅自重建或从别头补dist。本轮无新安装/build计划。

完整文件和真实UI分两个串行stage，各只用一个公共browser槽：外层在系统共享TMPDIR调用 `node scripts/machine-slot.mjs run browser --label ... -- /usr/bin/python3 <本线包装>`，取得公共槽后子进程才换隔离HOME/TMPDIR；不在私TMPDIR造锁。两文件stage的实际命令为 `node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/global-ui-interaction.e2e.test.ts tests/issue-global-navigation.e2e.test.ts`。只有这批正常结束才进入产品实操；没有失败自动重试。

完整空环境allowlist沿本线已验证的T122/scene7包装：独立 HOME、CFFIXED_USER_HOME、XDG、TMPDIR、Swift/Clang缓存与MOLIS_WORK_HOME；file backend、adhoc identity `-`，npm/git个人配置禁用，不继承账号/token/模型/代理环境。浏览器必须是有效专用 `/Users/yijunwang/.local/bin/molis-test-browser`，自有profile，basic password-store/mock-keychain；不启动日常Chrome。公共test-kit与fixture不改；本线临时driver在仓库外。无真实Home4207/Keychain/个人配置读取，无localFull、GH/coord写入或CI控制。

## 证据与停止条件

输出准确输入及driver、原始完整stdout/stderr、逐例计数、原生回执、来源观察、少量关键截图、页面异常/拒绝原响应、build/source绑定、清理结果。每个失败保留首个现场，先判断输入是否送达/焦点是否正确/来源是否有效，再报告产品或driver；不随机重跑、不绕行搜索补绿、不修改断言。作者红与旧scene7首败保持原来源；作者188不改署。

结束关闭本次Host/Chrome，核本次pid与profile/Home清除，释放公共槽；保留本线树/报告供根核收，作者树与产物保持冻结。新独立结果只能签H覆盖路径，资源窗口、共享文档采用、后继F差分、独立二审、CI Full及W6最终核收仍归统筹。当前只完成本计划与只读preflight，未签独立7例或最终UI通过。
