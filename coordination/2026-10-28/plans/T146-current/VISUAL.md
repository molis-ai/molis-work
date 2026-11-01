# T146 四组设置页面与视觉核收

结论：在下述准确 M/H 和运行方式下，V1/V2/V3/V8 的最终设置文档实操、CSS加载、布局及成对看图通过，未发现移除设置样式表中 `CODING_STYLES` 引起的视觉退化。**V1/V2 是独立 iframe 中加载的原始生产设置文档，不是顶层 URL 导航成功证明**；顶层导航的最初失败保留。准确头 Linux Full、七完整浏览器文件、旧 UNKNOWN/HOLD、EOF P2、整体二审和采用仍由根结算。

## 输入与构建

| | 准确输入 | 源码/构建匹配 |
|---|---|---|
| M | `6729a2d4655caa603daa369f99884e09c4726bde`，tree `5df7692e7cf4affb0ca1942e8c1cf9ee29497066` | 本线必要整体 build，digest `ed2596f14b20160c8be9477f4172e7269cf2752399a30f2f0713eaaeb1d0a872` |
| H | `c35ad3036b7ed2e296d5b1b6fce383546b1dafb9`，tree `da3f567c3c350576972579cea05cf803269c14db` | 复制开发线3既有 matching dist，独立重算 digest `534855835667132822612e600e3e7393ea5b15985e335531b79d351c4e86d853`；没有重建 H |

两边运行前后指纹等于各自 manifest；临时测试脚本移除后 Git 均 clean。绑定见 [final-binding.json](/private/tmp/t146-visual/final-binding.json)。未重跑旧 Node14/67文件/变异/48资源矩阵，未运行七完整浏览器文件、Full 或 GitHub 操作。

## 实际页面与看图

同一 Chrome 153.0.8010.12、中文、DPR1和确定方法正文，采用公共 test-kit、真实 Host/页面与脚本。方法通过临时工作区正常发现、安装、展开；没有注入方法 DOM 或伪造 bound。MCP只输入未提交的本地名称草稿，不连接模型/外部MCP。所有最终场景 jobs1/retries0，无跳过或取消。

| 状态 | 最终实操、视觉结论 | 成对截图（左M、右H） |
|---|---|---|
| V1，1360×900 light，独立设置文档方法区 | 方法库绑定、正常发现/安装/展开，中文正文与换行可见；标题、正文背景、字体、边框和间距一致 | [V1](/private/tmp/t146-visual/evidence/pairs/V1.png) |
| V2，390×780 dark，独立设置文档MCP区 | 未配置提示、表单、名称草稿及焦点可见，页面可滚动且不横溢；暗色层次、换行和控件一致 | [V2](/private/tmp/t146-visual/evidence/pairs/V2.png) |
| V3，1360×900 dark，工作台目录→Coding设置 | 真实目录加载，方法库 bound；切至外观再返回，方法正文展开可见；正文、表单和背景层次一致 | [V3](/private/tmp/t146-visual/evidence/pairs/V3.png) |
| V8，390×780 dark，非Coding项目工作区设置 | 真实关联工作区列表与目录路径、输入框焦点和操作可达；窄屏换行、选中态和按钮布局一致 | [V8](/private/tmp/t146-visual/evidence/pairs/V8.png) |

本线已实际打开以上四张成对图及 H 原图检查，没有用 link 结构或像素相等代替看图。随机 fixture Home 路径、项目ID、端口是已知动态差异。采集的可见关键元素 font/color/background/border/padding/bbox/scroll尺寸等 M/H 无差异，原始值及比较见 [layout-comparison.json](/private/tmp/t146-visual/layout-comparison.json)。该比较仅覆盖采集元素，不是全页视觉质量的自动证明。

V1/V2 实际文档 links 为 settings.css + coding.css/git.css/files.css；V3为 workbench.css + 三插件CSS；V8在已加载插件样式的工作台中检查共用设置布局，不把三个插件link解释成它自身必需。每条相关link均实际获取200、`text/css; charset=utf-8`、stylesheet已加载；另记录浏览器实际CSS响应（含缓存304）。最终运行无捕获的 Runtime异常。证据在 [M结果](/private/tmp/t146-visual/evidence/M/results.json)、[H四状态结果](/private/tmp/t146-visual/evidence/H/results.json)、[H最终V3](/private/tmp/t146-visual/evidence/H-v3/results.json)。没有跳转到未受影响的 Coding/Git/Files 主舞台。

## 最初失败与针对性修正

1. M 首次构建在 pnpm 依赖检查退出，冻结离线安装成功后又两次在同一编译前检查退出。实际根因是隔离环境的默认 store 与安装的 store 不同，pnpm11读取 `pnpm_config_store_dir`；统一正确配置并以CI非交互环境运行后，第一次实际源码构建成功（[M-build4.log](/private/tmp/t146-visual/M-build4.log)）。前三次日志保留 `M-build.log`、`M-build2.log`、`M-build3.log`，不写成首次全绿，也没有改依赖、锁或项目门禁来通过。
2. H 首批四状态 **V1/V2/V3失败、V8通过**：[完整首批日志](/private/tmp/t146-visual/H-browser.log)、[结果和截图](/private/tmp/t146-visual/evidence/H-first/results.json)。直接浏览器导航 `/settings/coding-settings?project=...` 被当前 `web-settings-arrival.ts` 的正常顶层导航分支送回工作台，`sendToWorkbench` 删除project参数；V1/V2未到方法库绑定。V3随后因本轮尚未安装方法，未达到预期正文状态。这里不签顶层导航正常，不把它归因为旧浏览器环境，也没有修生产代码。
3. 为核独立文档的设置样式，V1/V2改为fixture的全视口 iframe，直接加载**同一URL原始生产响应和生产脚本**；iframe请求不走顶层导航重定向，项目上下文正常。只替换fixture外层承载页，不改服务响应、CSP、设置文档DOM或CSS。V3/V8仍走真实工作台目录入口。修订后 H 四状态结构通过：[H-browser2.log](/private/tmp/t146-visual/H-browser2.log)。这是独立设置文档呈现证据，不能替代顶层导航路径。
4. 实际看 H 的首张 V3图发现回切保留了 details 展开状态，脚本再次点击将它折叠：虽然节点存在检查通过，该图未覆盖正文。只修本线脚本为“关闭时才点击”，并检查正文实际bbox高度；单独补 H V3，安装方法为必要准备，未再运行V2/V8：[H-browser3.log](/private/tmp/t146-visual/H-browser3.log)。旧V3图保留，最终配对使用 `H-v3/V3.png`。M用修正后的相同场景一次完成四状态：[M-browser.log](/private/tmp/t146-visual/M-browser.log)。

独立场景原件 [scenario.ts](/private/tmp/t146-visual/scenario.ts)，执行包装 [run.py](/private/tmp/t146-visual/run.py)。命令为公共browser槽内 `node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/t146-visual.e2e.test.ts`，属于本线四状态脚本，不冒署原七文件或其它正式完整用例通过。

## 隔离与清理

实际使用 `~/.local/bin/molis-test-browser`→独立 chrome-headless-shell，真实进程 argv/profile 与版本保留在各 `runtime.json`，没有使用个人 Chrome profile。系统HOME/Library、Node临时目录、XDG、file secret backend、ad-hoc签名均指向本线隔离环境；Foundation的 `NSTemporaryDirectory()`仍指系统用户临时区，见 [isolation-probe.log](/private/tmp/t146-visual/isolation-probe.log)，这一限制不写成已隔离。服务为随机loopback端口，无真实Home/4207操作。

fixture及测试runner临时Home、全部观察到的本线浏览器进程/profile已结束并移除，最终绑定记录逐项检查；只清理本线验证树与临时脚本，开发线3原树及 T384/T385均未修改。工作树清理结果另见 `cleanup.json`。
