# T389 阶段2：Linux 原失败后的有限现场取证建议

状态：仅方案，未更新accepted WO、未写源码/coord/refs/GH、未build/test。阶段1已结束；H44efe/M6729在Mac各一完整文件2/2，不新增Mac运行，旧Linux失败原因仍UNKNOWN。

## 建议与授权边界

推荐根在同一T389工单另列“证据改进阶段”，允许测试文件原60的失败分支采集一次终态；不复用阶段1安装observer的实现。当前accepted WO的RAC-2832明确要求关键步骤前安装记录器，且总量H/M各一次，因此不能默认为已授权第二阶段：根须明确替换本阶段观测合同、输入与执行预算，保留阶段1原件和结论。RAC-2831～2833已登记，不擅自新增编号或把它们改签成修复验收。

证据改进不是修复。协调README§9要求两次同文件红后不第三次盲重跑，承载推送前旧失败先修好跑过；阶段1绿色与诊断catch均不满足“已修好”。不因提交取证代码再打Full标签、dispatch Full、推integration触发Full、重跑旧job，亦不把一个诊断提交称作修复轮。根只有在某次Linux完整文件执行本身已被独立授权且符合§9时，才将取证随同带入；没有这样的执行，就先解决Linux环境/静态归因这一缺口。

## 最小测试侧实现建议（尚未实施）

只在 `tests/project-user-journey.e2e.test.ts` 把原60包为try/catch；try仍只有原 `await click('[data-feed-choose-kind=custom_rss]')`。原59的plugin(feed)与rail-add两次await逐字保持；成功时直接原61，不做新增CDP、listener/observer安装、初始采样、等待、落盘或截图。原helper、生产、超时、全部断言及原点击不改。不改CI规则、runner、清单，不建测试框架或常驻诊断系统。

catch收到原异常后、fixture teardown之前：

1. 立即用一次只读evaluate作有界快照：顶层及可访问同源iframe中Feed root/dialog/choices/custom_rss/rail-add的匹配数；每个候选的文档索引、快照内引用编号、connected/hidden/disabled；有界祖先链的tag/允许的data角色、hidden/inert、computed display/visibility、rect；feedView/selectedSource/mobileView、aria-busy，选中pane/tab和允许的panePlugin/workbenchPane元数据。只读白名单，不用outerHTML/textContent/输入值/整段class或dataset/完整URL；不可访问frame记unknown，不绕隔离。仅失败后读取style/rect，不追溯性宣称这些是helper超时前每一刻的状态。
2. 原fixture的Page.captureScreenshot能力捕获当前viewport，保留宽度与attempt可区分的文件名；仅隔离fixture，无真实Home/凭据页面。截图与DOM快照顺序标明，二者不称同一瞬间。辅助采集用既有CDP命令的有界超时、有限命令数、不重试；异常/页面已关则记录capture-unavailable，继续保留原异常。不能把90秒测试上限调大来保证取证完成。
3. 浏览器错误：保留原helper异常的脱敏selector/type/line，不打印其不受控cause、正文或对象全量。当前browser CDP只有实时on接口，未见可读的历史JS exception缓冲；因此**失败后不能恢复之前的Runtime.exceptionThrown**。本阶段不为此在成功路径加listener。可以在catch内短暂监听后续异常至采集结束（只保类型/行号及去URL元数据），finally移除；没有事件只写“此前错误unknown”，不能写“无浏览器错误”。不以新增Log.enable或console重放机制补齐历史。
4. 将脱敏快照/采集可用性输出为有界、带唯一开始/结束标记的测试日志；采集任何失败不得覆盖原错误，最后throw原异常，原测试仍失败。截图本地写入已忽略QA目录，失败再失败也走原fixture清理。编号仅代表本快照引用，不声称恢复旧初始节点身份/点击事件/调用者时序。

快照仅能回答“失败后匹配/隐藏/所在文档怎样”；不能单独证明哪次事件丢失、哪个setter关闭面板、storage因果或Linux专属根因。截图采集本身也在原失败之后，延迟与页面继续变化是明确局限。

## 已核CI入口及证据带出限制

只读核的是冻结H44efe与M6729的配置（两者下列配置无diff），本地主检出08c9933d、origin/main本地引用6729；没有fetch/GH，不宣称远端当前head。根选下一实际承载头时须重核这些入口。

- `.github/workflows/full-suite.yml:17–26,45–60,138–155`：PR full-suite标签、integration push、无inputs的workflow_dispatch及nightly；16片，无单文件或单shard dispatch参数。现有Full确实包括完整旅程文件，但自动retries1；普通分支bail/fail-fast，integration不bail。此方案不改这些规则，若随已获准Full运行，明确这是工作流原有重试，不冒称jobs1/retries0诊断；每个实际失败attempt分别输出现场，不主动加运行。
- `.github/workflows/ci.yml:630–655,828–904` 与 `scripts/ci-test-selection.mjs:80–112`：PR selection只与本job既有清单求交，manual CI跑既有清单；`tests/ci-product-subset.txt`不含project-user-journey。修改此测试即使被affected选中也不能使它自动进product-subset。不能假设普通Verify或手动CI能单跑它；不为诊断扩大5个browser-smoke清单。
- Full没有upload-artifact步骤，只有runner日志/summary；在QA目录写PNG不会自动带出runner。product-subset现有上传仅 `$RUNNER_TEMP/product-subset` 且本文件不执行，不能借它接收Full截图。`scripts/run-tests/pool.mjs:130–158`会输出失败文件原件，bail下首败后retry成功也保留首败输出；因此脱敏JSON可经现有失败日志带出。

若未来**已获准的Full**是唯一执行环境且要求不改CI，截图可在失败分支同时输出有限PNG base64日志块（固定标记/分块序号/总块数，纯测试侧、可离线还原，不添加通用解析框架）；事先在书面合同限制viewport、图片/日志字节数与快照条目数。超过限额标记screenshot-unavailable，不截断图片再冒充完整。根按实际raw job log核全部块再还原；Actions日志截断/作业被取消时只能记缺证，不据此补跑。不要在本方案中承诺日志PNG一定可取回。若不接受二进制入日志，就选择有可回收文件系统的授权Linux环境；现有Full无法保证导出PNG。

## 当前可行的两条路径与取舍

1. **授权独立Linux环境的一次完整文件**（优先）：根确认可用Linux VM/远程设备/受控容器及执行授权，在准确诊断输入隔离Home/profile、专用Chrome运行原完整文件一次、jobs1/retries0。沿用现有test-kit；对齐记录旧CI的Node24.14、Chrome实际版本/启动flags、字体与构建解析，容器差异照实保留。匹配构建须为Linux且输入/解析有效，不能复用Mac native产物。结果及PNG直接回收；无Full开销，但仍不等于CI同环境，未复现不追加轮次。这需要真实Linux访问能力，目前未验证其可用，不假设Docker/远端已存在。
2. **静态继续收敛，待符合§9的自然Linux运行**：不启动任何运行；根指定有限静态问题（例如原add点击到dialog可见的具体覆盖/状态关闭路径），形成可证伪根因或最小修复后，再按§9推进已必要的验证，失败取证随同带入。节省环境准备，但无失败现场时可能仍UNKNOWN；不能以“等下一Full”规避本轮阻塞或制造已修假象。

不推荐第三条“仅为取证再跑一次Full”。若没有独立Linux环境、没有符合§9且自然包含此文件的运行、静态证据也不足，正确交付是具体缺口与根的环境/阶段授权决定，旧失败保持未修；不是让诊断工单通过来放行T385。

## 后续阶段完成边界

根更新同一WO后，唯一writer先提交可审阅的测试侧最小diff与脱敏/失败不掩盖原错误的静态证明；review核成功分支无新观测、原helper/生产/CI/超时不变。不在Mac再跑来凑绿色。根明确下一次合法Linux执行输入、环境、总量和证据接收方式后才执行；成功仅证明该次旅程通过，失败保留现场，未执行/未取到历史错误均写unknown。本方案完成即停，不启动上述任一路径。
