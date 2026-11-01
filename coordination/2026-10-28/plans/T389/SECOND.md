# T389 有限诊断独立终审

**结论：本阶段诊断合同成立，RAC-2831～2833按“未复现、保留UNKNOWN并停止”核收；无当前必须改产品或补跑项。旧T385 Full首败未关闭，没有可签的修复候选。** 本线只读accepted WO、实际诊断diff/observer、H/M完整日志、原始四份trace、绑定和清理；未运行测试/build/浏览器、第三次H/M或写refs/GH。验证线1的独立输入核收另计，不冒署其工作。

输入是准确H `44efe84d925b7f01e6f8f837c0bf284471ae7659`、tree `908622b69189edcfed007efb26290d57a1c148c7`，M `6729a2d4655caa603daa369f99884e09c4726bde`、tree `5df7692e7cf4affb0ca1942e8c1cf9ee29497066`。H产物取自准确T385；M产物来源45abd242仅有无关stop-feedback测试增量，Git对象核差属实，不称来源整树等于M。prepare/test metadata的生产digest、manifest、六个入口的本树dist解析一致。两份original-test与各Git头原文件逐字节相同，诊断SHA对应保存副本，两个树已恢复原测试、clean且HEAD准确。[绑定](/private/tmp/t389-evidence/input-binding.json)

本轮H/M各一次原完整journey文件，jobs1/retries0：两边均1440、390各通过，2/2、exit0、fail/skip/cancel/todo=0；这不是独立重复轮，也不等于旧CI被重放。实际诊断delta仅在原59前安装记录器、原60成功/失败后导出；`plugin('feed') → click(add-toggle) → click(custom_rss)`的三个原await连续，helper、断言、时限不变。原60返回后finally先移除Node异常listener，再以新增CDP往返执行stop/终态快照/断开observer，随后落盘、再继续原61。失败路径另有截图捕获；本轮无失败，不能要求生成不存在的失败现场图。[差异](/private/tmp/t389-evidence/H-diagnostic.diff)、[H日志](/private/tmp/t389-evidence/test-H.log)、[M日志](/private/tmp/t389-evidence/test-M.log)

记录器使用WeakMap身份与页面内有界数组，没有给节点加属性、替换生产函数、插主动点击/等待；mutation回调不取geometry。四份原始trace各有500条，可信plugin/add/custom点击均保留，custom在第312/313/312/313条。1440的实际点击target为按钮内子节点215，其祖先链含初始custom按钮20；390直接命中20，不能把两种target写成逐一相同节点。add均命中初始21。点击时祖先链无hidden/inert，初始与终态都有唯一顶层Feed匹配；这支持本轮路径身份，不排除旧CI的错文档/隐藏副本假设。同源帧不可访问记录仍为unknown，不能推成所有帧无副本。

**截断不算完整时序证据。** 缓冲分别丢5/6/5/6次record调用，丢弃分支只计数，无法确定其kind、对象、时间或值，也不能称只是无关mutation。末条保留记录都已在custom可信点击之后；终态快照独立于500条上限，因此点击target/祖先链和终态身份/geometry仍可核。本轮没有足够证据恢复尾部各中间状态、setter调用者或完整开关顺序。MutationObserver时间是回调时刻，可能合并同步更新，不能等同showFeedSetup/setFeedTask执行时刻。[原始H390](/private/tmp/t389-evidence/H-390.json)、[截断审计](/private/tmp/t389-evidence/truncation-audit.json)

被动观测仍有CPU/分配开销，初始计算样式/rect可能提前刷新布局；没有无观测对照，不能排除它掩盖调度差异。Mac本地单文件和Linux Full并发环境也不同。本轮成功仅说明四条受观测路径走通，不能由H/M均绿排除storage间接影响、判定CI环境问题、选等待/路由/CSS修法或销旧失败。尾部丢失已如实列明，合同本就允许观测不足停止，不应为补齐它追加本轮运行。

公共槽holder前后同一pid/since，实际命令及隔离环境有原件；专用safe-browser转发molis-test-browser并固定mock-keychain/basic参数。fixture正常teardown、九个runtime目录删除及两树原测试恢复可回读，当前目录确已不存在。Foundation临时路径未另测，保留其限制，不扩成系统所有路径隔离。

唯一后续建议：根若仍需关闭该UNKNOWN，在**下一次原本计划的Linux同文件运行**前，于同WO裁定有界现场观测，先减少无关mutation挤占，保留原点击/时限并确保关键状态及截断元数据可解释；本单不启动该运行或第三次Full。没有复现前不授权产品/helper修复。原Full失败、取消/未跑文件与旧归因UNKNOWN保持；T389仅本次有限诊断阶段完成。
