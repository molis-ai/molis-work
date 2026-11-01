# T146 最终 M 增量与四对视觉二审

**结论：准确 H `c35ad3036b7ed2e296d5b1b6fce383546b1dafb9` 的最终同步及本次删除 CSS 的局部视觉证据可核收，无当前 Blocker/P1 或必须补跑项。V1/V2 iframe 证据足以判断原始设置文档受本次 CSS 删除影响的呈现；顶层 URL 导航首败不转为通过。** 准确头 Linux Full、原七完整浏览器文件、最终采用及用户验收仍待根结算，不能据本报告签整单已合入。

本线亲读作者最终 REPORT、视觉 REPORT/scenario/run、原始结果与首败日志，实际打开 V1/V2/V3/V8 四对图、H 的两张顶层首败图及旧折叠 V3 图；没有运行测试、build、浏览器或写 GH/源码。原 accepted 书、6543667203、原二审/VERIFY 的有效边界继续沿用，本轮只补最终 M 和四对视觉。

最终 M=`6729a2d4655caa603daa369f99884e09c4726bde`，H tree=`da3f567c3c350576972579cea05cf803269c14db`，双父为前候选 b2cb 与 M；作者树仍 HEAD=H、tracked clean。实际 M→H 六路径、66增5删，自有增删行与上一轮补丁相同；page-assets.ts、测试、README、slice 四个非资源文件保持前候选 blob，privileges 另继承 M 的 T382 顶部说明。生产仍仅删除 CODING_STYLES import 与设置表插值，未改 settings renderer、加载器、导航或插件代码。48 资源原件独立比较仅 settings.css **904914→827276 B（−77638）**，其余47项 bytes/hash全同；许可/门禁算法无本单增量。最终 health、边界、导入、资源/插件样式和secrets原件通过；diff-check仍报同一旧测试blob的EOF空行，保原非阻塞P2，不改成通过。[最终绑定](/private/tmp/t146-current-sync/final6729-binding.json)

iframe等价判断依据具体执行，而非截图相似本身：scenario只把测试外层 body 换成全视口、零边框 iframe，src仍是 `/settings/coding-settings?project=<fixture>`，没有改服务HTML/CSP、子文档DOM或CSS。`pluginFrameBrowser` 只选择真实子文档执行上下文；生产 `isTopLevelNavigation` 按 sec-fetch-dest=document 判定，iframe自然绕开顶层302分支。子文档仍由同一个未改的 settings renderer 输出自己的 html/body、设置布局、生产脚本与 stylesheet links，父工作台CSS不会跨iframe级联。raw确认V1子文档1360×900/light，V2为390×780/dark，实际settings.css及coding/git/files.css均200、text/css、sheetLoaded=true；浏览器CSS响应另有200/304记录。两状态实际方法发现/安装/展开及未提交MCP草稿操作成功。因此它证明生产设置文档在规定视口/主题下对**这次样式表删除**的呈现等价，不承担书签/地址栏到工作台的导航证明。[场景原件](/private/tmp/t146-visual/scenario.ts)、[M结果](/private/tmp/t146-visual/evidence/M/results.json)、[H结果](/private/tmp/t146-visual/evidence/H/results.json)

看图结论：V1的真实中文方法正文、pre-wrap换行、字体/灰底/间距和安装状态一致；V2的暗色MCP提示、表单、焦点环、窄屏换行及滚动可达一致。V3最终补图有展开正文，真实工作台目录加载、回切外观再返回后呈现一致；旧 H/V3 图确实折叠，不能算正文已验，最终配对使用 H-v3/V3.png 正确。V8真实项目工作区列表、路径换行、聚焦输入和按钮布局一致。随机Home/项目路径为实际动态差异。四状态28/12/24/11个采样元素的布局/计算样式比较无差异；这只是采样范围，不扩称全页所有状态已审。V3/V8实际使用workbench.css，是嵌入/旁路布局证据；V1/V2才直接覆盖被删内容所在的settings.css。[四对图](/private/tmp/t146-visual/evidence/pairs/V1.png)、[V2](/private/tmp/t146-visual/evidence/pairs/V2.png)、[V3](/private/tmp/t146-visual/evidence/pairs/V3.png)、[V8](/private/tmp/t146-visual/evidence/pairs/V8.png)

首败保留：H首次V1/V2到的是工作台，没有获得预期项目方法库绑定；实际图与未改的sendToWorkbench删除project分支相符。V3首次也缺已安装方法，V8通过。这里只定位了到达路径及前置条件，未把顶层路径判正常或归为环境。后续iframe是有界视觉取证方式改变，没有修好/覆盖原导航失败。M构建前三次依赖检查失败及统一store后的成功、H第二批旧V3折叠后单补展开均保原记录，不以最后绿倒写首次成功。[首批日志](/private/tmp/t146-visual/H-browser.log)、[最终V3](/private/tmp/t146-visual/evidence/H-v3/results.json)

视觉输入绑定可核：M必要独立build摘要 `ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872`；H复用作者matching dist，摘要 `534855835667132822612e600e3e7393ea5b15985e335531b79d351c4e86d853`，各自运行前后等manifest，测试临时脚本移除后clean。公共槽、专用Chrome153/独立profile及随机Host、file backend/ad-hoc有原件；Foundation原生TMP局限照留。清理记录显示本线fixture Home、所观察进程/profile与自有树已清，未清作者树。[绑定与清理](/private/tmp/t146-visual/final-binding.json)

本次四状态局部视觉缺口据此可关闭，无需为CSS删除再重跑整矩阵。旧Node14、作者67/三M及各次旧浏览器10/39、基线0/38、补丁组合47/48和picker19/21继续按原头/执行者留账；旧UNKNOWN/HOLD没有被四张图消除。准确H/实际CI checkout上的Linux Full及原七完整浏览器文件实际执行、失败/skip/quarantine、正式§8采用仍未在本轮签收。原顶层导航失败也保留为当前未通过路径，不能写成四条完整用户入口全部通过。
