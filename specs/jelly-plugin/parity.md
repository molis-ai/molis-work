# Jelly 原件功能与插件对照

本表依据 2026-09-22 对 `/Users/oreal/adeptify-home/repos/Jelly` 的源码审计。README 中“摘要尚未实现”已经落后于 AppEnvironment.live 的真实接线。原件“已有实现”不等于此刻重新完成产品实操；本文未读取或修改日用数据。插件状态随实际代码与验证更新，缺口不能通过删行消失。

源码引用以下均相对原件仓库。插件代码在当前 Molis Work 工作树 `plugins/native/jelly/`。截至此表初稿，日历纯领域回归通过；其他模块正在并行实现，不能提前写成完成。

| 原件功能 | 实际语义与源码依据 | 插件兑现与当前验证边界 |
| --- | --- | --- |
| 三模块工作区 | 日历、笔记、灵感正式启用；`Sources/CalendarApp/AppShell/WorkspaceRoute.swift`、`AppEnvironment.swift` | 三入口正在接 Molis Work Slot；产品实操待验 |
| 日历月视图 | 连续周流/月导航，跨周跨日排布、今天定位；`Sources/CalendarApp/Month/`、`Sources/CalendarDomain/WeekSegmentLayout.swift` | 月/周/列表 UI 并行实现；连续周流和手势须逐项实操 |
| 日历周视图/日抽屉 | 按小时的定时日程、全天事项与日详情；`Sources/CalendarApp/Week/`、`DayDrawer/` | 领域投影已实现，视觉/交互待验 |
| 事项增删改 | 所有新事项统一可完成 task；event 为兼容旧数据；`CalendarDomain/CalendarModels.swift`、`CalendarCommand.swift` | `calendar.ts` 实现；无效命令不部分写入，回归通过 |
| 日期与跨日 | civil 日期，首尾日均含；两时间同时有/无，同日结束晚于开始，跨日允许跨午夜；保留创建时区 | `calendar-validation.ts` + 日期/跨午夜测试通过 |
| 移动/多选移动/复制 | 整体移日期并保留天数和时刻；单项复制创建新身份；`CalendarDomain/CalendarItemCopy.swift`、`CalendarReducer.swift`、`DragDrop/` | 单项/多项移动已实现并验证；复制由 create 新 ID，UI 入口待验 |
| 优先级与置顶 | P0/P1/P2/无，置顶动作升 P0；统一排序置顶→优先级→跨日→无时间→时刻→手动rank→创建时间→ID | 投影/排序回归通过；`CalendarDomain/TimelineProjection.swift` |
| 无时间手工排序 | 仅同日一次性无时间项可 reorder，必须包含该日全部可排序 ID；重复与跨日项不参与 | 实现与集合完整性回归通过；`CalendarDomain/UntimedItemReorder.swift` |
| 每周重复 | 多星期、规则起日、可选止日、单次跨日时长；未实现通用 RRULE/月/年重复 | 实现与边界验证通过；`CalendarDomain/RecurrenceModels.swift`、`RecurrenceEngine.swift` |
| 重复实例身份/完成 | `(seriesID,originalDate)` 稳定；改显示日不改身份；完成独立存储，重打勾不重写原完成时间 | 实现与移动入查询窗/完成回归通过 |
| 只改/删这一次 | 独立 displayed schedule/title/category/priority/notes 例外；删除为 skip，不能单次改变规则 | 实现与无效规则回归通过；`CalendarDomain/SeriesMutationEngine.swift` |
| 这次及以后 | 新系列拆分；保留历史，移动 weekdays，迁例外、完成、主/参考笔记/实例覆盖 | 实现与拆分/迁移/首实例替换回归通过 |
| 分类 | 共用于日历/笔记/灵感；增改色名/排序/筛选；删除迁未分类；未分类不能删 | 跨域迁移回归通过；`WorkspaceDomain/WorkspaceReducer+Categories.swift` |
| 周/月回顾 | 自然周一/月初至今天；跨日只计一次，已完成/未完成/延期/分类分布/P0-P1未完成；本地事实统计，无假 AI | `jellyProgress` 实现并验证；`CalendarApp/Progress/ProgressSummaryEngine.swift` |
| 回顾搬迁未完成 | 选择一次性项统一搬下周周一/下月1日；重复项不改；可撤销 | 领域 move_many 已有，UI/撤销闭环待验；`ProgressSummaryView.swift` |
| 连续块笔记 | paragraph/H1/H2/H3/bullet/ordered/task/quote/code/divider/link；缩进、代码语言 | 合同含对应11种块；编辑器与 Markdown 并行实现；`WorkspaceDomain/BlockDocument.swift` |
| 行内格式 | bold/italic/code/link；连续选区、多块粘贴、格式工具条、slash、拖动、快捷键 | 合同保留 inline_spans；编辑体验不得以 textarea 等同原件；`CalendarApp/Notes/BlockEditor/` |
| 笔记管理 | 新建、标题/分类、置顶、归档/恢复、永久删除预览；自动保存、会话切换保护、草稿恢复 | store/content 并行实现；原生IME/保存与崩溃恢复待逐项验；`NotesSplitView.swift`、`NoteAutosaveCoordinator.swift`、`DraftRecoverySheet.swift` |
| Markdown/HTML 导入导出 | 解析成块；导入可追加或替换，显示损失诊断；导出活跃草稿；格式回读 | codec 并行实现；`WorkspaceDomain/BlockMarkdownCodec.swift`、`BlockHTMLCodec.swift`、`CalendarApp/Notes/NoteMarkdownCommands.swift` |
| 日历↔笔记 | 一主笔记+多参考；系列基线与单实例继承/替换/清空/参考增减；来回跳转 | 合同保留 relations/relation_overrides，拆分迁移已测；编辑/路由待验；`WorkspaceDomain/CalendarNoteRelations.swift` |
| 笔记/任务安排日历 | 整篇排期或单任务块排期；任务块与一次性项一对一，标题/完成双向一致；删除不丢原笔记正文 | 日历改题/完成同步及删链接已测，笔记方向并行实现；`TaskBlockCalendarLink.swift`、`WorkspaceReducer+Relations.swift` |
| 旧随记迁为笔记 | 日历旧 Markdown notes 有预览/诊断/合并与主笔记关系处理 | 导入保留 notes；专用旧随记合并 UI 尚待对照；`CalendarApp/Calendar/LegacyNotesMigrationSheet.swift` |
| 原始灵感捕获 | 文字、URL、本地文件，分类/元数据/来源类型；原文优先，捕获不自动调模型 | content/Host 并行实现；文件原件为 security scoped bookmark，插件改为用户上传副本 |
| 灵感管理与转笔记 | 搜索、分类、归档/恢复/永久删除；转笔记幂等并保留来源/链接；原件转后不可编辑原文 | content 并行实现；`WorkspaceDomain/WorkspaceReducer+Inspiration.swift`、`InspirationNoteLink.swift` |
| 素材手动提炼 | 用户启动→读来源→保存快照→生成中文派生摘要→审阅→写笔记；取消/重试/重读/原文变更失效 | Host AI/内容写回并行实现；全闭环待验；`CalendarApp/Inspiration/MaterialDigestCoordinator.swift` |
| TXT/Markdown/直接文字 | 原始文本与段落定位保存；`TextMaterialExtractor.swift` | Host UTF8上传链已实现并回归通过，直接文字由既有输入提供 |
| 公共 HTML | 正文提取，保留段落与覆盖信息；`HTMLMaterialExtractor.swift` | Host 上传HTML文字提取与脚本不执行回归通过；远程获取需现有 Host 的公开 URL 约束 |
| 图片 | Vision OCR，图像定位与置信度；`ImageMaterialExtractor.swift` | 独立 macOS helper 已编译；真实 PNG OCR / PDF文字页+扫描页OCR范围回归通过，最终界面路径待验 |
| PDF | PDFKit 原文本，缺文本页 Vision OCR；逐页定位；`PDFMaterialExtractor.swift` | 独立 macOS helper 已编译；真实 PNG OCR / PDF文字页+扫描页OCR范围回归通过，最终界面路径待验 |
| 音频与视频 | AVFoundation音轨、WhisperKit转写/模型下载、视频关键帧OCR、时间定位；`MediaMaterialExtractor.swift`、`WhisperKitMaterialTranscriber.swift` | 独立 WhisperKit 1.0.0 + AVFoundation + 五帧OCR移植进行中；模型下载需显式选择；构建/真实语音结果另记，不能用“选择文件成功”代替转写 |
| 专站源 | B站字幕/音轨、小宇宙公开音频、小红书公开正文/图集/视频；受限时粘贴/文件/重试 | 站点适配完整链未移植；原件真实成功页证据也不齐；`MaterialSourceProviders.swift`、`XiaohongshuMaterialAcquirer.swift` |
| 长材料与证据 | snapshot blocks、paragraph/page/image/timestamp locator、coverage；摘要thesis/takeaways/chapters/quotes/dropped绑定block ID | 当前简化digest合同无法表达完整块证据；必须保留为待兑现项；`WorkspaceDomain/MaterialSnapshot.swift`、`MaterialDigestEvidence.swift`、`HierarchicalMaterialSummarizer.swift` |
| 材料 AI 设置 | OpenAI-compatible endpoint/model、Keychain密钥、严格结构输出、格式失败/鉴权/配置状态 | 复用 Molis Work Host AI，属于后端迁移；不能继承原件模型质量验收；`OpenAICompatibleMaterialSummarizer.swift`、`DigestSettingsView.swift` |
| 拆开并安排入口 | 全篇或选区冻结 note/workspace revision、源block/范围与checksum；理解→拆分→安排 | AI计划合同/Host并行实现；选区快照和事实澄清完整交互待对照；`DecompositionSourceCapture.swift`、`DecompositionModels.swift` |
| 拆解候选编辑 | 标题、可观察完成说明、15/30/45/60/90分钟；选择创建/安排；锁字段刷新、局部重拆、排序/删除 | 当前 JellyPlanAction 不含所有原件字段；不能宣称全部复刻；`DecompositionActionEditor.swift`、`DecompositionPlanning.swift` |
| 自动时间建议 | 今天起7天、9–21点、15分钟网格；首天晚于当前；全部定时占用含重复/跨日，全天不占分钟 | overlap函数已验证；建议与手工时间保护由Host/内容模块完成并另测；`CalendarProposalEngine.swift` |
| 计划原子落地 | 任务块+日历项+links同一事务；源版本/晚到冲突校验；选区源块后/全篇尾；精确整次撤销 | store/content 并行实现；后续检查事务/幂等/撤销，不以仅AI返回成功作验收 |
| Apple 智能/手动回退 | 生产仅 macOS26+FoundationModels；系统/设备/语言/模型不可用则手动；MiniMax脚本仅评估 | 复用Host AI；原生helper可探测本机可用性，不冒充模型可用；`LiveDecompositionPlanner.swift` |
| 搜索/快捷键/主题 | 三对象统一检索，Cmd1/2/3、CmdN、CmdK、深浅主题与减少动态效果 | Molis Work设计系统适配中；IME、VoiceOver、主观手感留真人验 |
| 共享撤销重做 | 日历、笔记、灵感关系使用统一WorkspaceStore undo/redo；MCP同栈 | 私人库/store并行实现，跨页面精确撤销和重启待实操 |
| 全库备份/恢复 | JSON schema5含全部域；恢复先预览+确认，保留恢复前回滚副本，损坏源只读导出 | 插件自身备份+原件导入并行实现；严禁双写日用库；`CalendarPersistence/WorkspaceDocument.swift`、`JSONWorkspaceRepository.swift` |
| 草稿/提交异常恢复 | draft journal、revision、原子比较替换、外部写入冲突、异常提交对账、恢复manifest/snapshot | 插件SQLite事务不是原生全部恢复流程的等价证明；崩溃草稿恢复差异待完整对照 |
| MCP | 13工具：list_items/get_item/search/list_categories/create_item/update_item/move_items/set_task_completed/delete_item/reorder_untimed_items/create_series/modify_series/undo；笔记灵感只搜索 | Molis Work MCP装配并行实现；工具权限/真正读写同库待验；`Sources/JellyMCP/JellyMCPToolDefinitions.swift` |

## 当前真实未实现，不属于“复刻已有功能”的扩展

原件没有 iCloud/CloudKit、Watch/iOS、EventKit系统日历、系统提醒通知、团队负责人/指派、GoalBoard双向交付或独立wiki知识库。相关设计/历史讨论不等于已排期或已实现。`ProgressSummaryMockAI.swift` 已移除模拟AI，仅保留文件说明。

## 源端验收证据的正确边界

原件 `docs/qa/2026-08-22-plan-and-schedule-product-run.md` 记录手工拆解/安排/回写/撤销/重启主路径实操，但真实 Apple 模型与用户认可仍未完成。`docs/acceptance/2026-08-24-universal-material-digest-candidate.md` 记录文字、TXT、小红书受限恢复和写笔记；PDF、图片、音视频、小红书成功页等不能扩大成全格式产品实操通过。以上是历史证据，不能继承为本插件验收。

插件当前日历领域验证：`node --import tsx --test tests/jelly-calendar.test.ts`；仅支持领域结论，不代表 UI/Host/最终交付物或用户体验验收。
