# BL-b91-0b-acceptance

| 编号 | 待办 | 来源 | 类型 | 现状 | 前置 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b91-0b-acceptance | 试用第 91 批前置段（91-0a / 91-0b）四套皮肤、F1 字体、共享交互底座、组件板与 P5 设置页实物 | [第 91 批](../post-anticorruption-roadmap/reference/batches/91.md#batch-91) | 待你验收 | 91-0a（PR #2221）与 91-0b（PR #2222）及补清小修已通过工程门禁、Visual audit 4/4、CI full-suite 24/24 与多轮只读评审；四套皮肤明暗手感、F1 中文三字重混排、无刷新动效、组件板 93 节与 30 页 P5 设置页待本人实物验收 | 91-0a / 91-0b 合入 main 后 | 中 | 一骏 |

在隔离构建或本机真实界面里按以下五处逐一试用：① 「设置 › 外观与语言」切换四套内置皮肤（Soft Workbench 净透云光默认 / Pure Studio / Warm Atelier / Folio）与明暗主题，核对 Light 底净透度、暗色对比度、纸面输入/次按钮/6px 状态芯片与 F1 `Inter Variable + Noto Sans SC 400/500/600` 中文标题与正文质感；② 在设置页使用左侧 228px 轨道的「全部设置 / 当前项目」作用域切换与搜索过滤（`Escape` 清空），浏览核心设置页并确认对齐六律与切页过渡柔和无刷新感；③ 打开组件板 `/__ui/catalog` 核对按章节筛选芯片、全部 `91-0b` 新增交互标本（`molisBusy`、统一宿主 Toast 悬停暂停与撤销、五态自动保存、日期/时间增强、流式 `molisStreamText` v2、状态环、`molisFollow`、`.mw-section-well`/`.mw-inset-group`/`.mw-inset-row`/`.mw-tabs__list--underline`）与中英文/明暗切换；④ 在工作台打开二分屏（约 600px 宽窗格）与任意插件 iframe（含创作台生成插件），核对 `@container plugin-stage` 窄窗格响应、分段滑块/`⌘+Enter` 弹窗提交与 `host.confirm` 危险红确认；⑤ 如桌面壳可用，顺带核对启动/升级页及账号入口的红绿灯安全区留白。
