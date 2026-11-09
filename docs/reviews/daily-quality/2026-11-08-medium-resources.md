# A 类修复的页面资源实测

状态：用户已明确批准这组最终体积变化与一次性放行记录（2026-11-09），记录在 `tooling/gates/page-asset-allowances/daily-quality-medium-20261108.json`。

主门禁已通过（最终整体构建 build37 后，build39 最终头再次实测一致，真实隔离基准，51 个资源）：对固定 merge-base `1b8712618152ff4563e0678fa7167fe6063f8999` 在临时检出构建并测量真实 Host 资源；无新增资源。

| 资源 | 原字节数 | 当前字节数 | 增量 |
| --- | ---: | ---: | ---: |
| `/assets/molis-work-arrival.css` | 633049 | 633425 | +376 |
| `/assets/molis-work-plugin-frame.js` | 229144 | 229848 | +704 |
| `/assets/molis-work-settings.css` | 786021 | 786397 | +376 |
| `/assets/molis-work-workbench.css` | 1139081 | 1139457 | +376 |
| `/assets/molis-work-workbench.js` | 1027199 | 1028474 | +1275 |
| `/assets/molis-work-plugins/shelf.js` | 65319 | 67551 | +2232 |
| `/assets/molis-work-plugins/coding.js` | 300534 | 302760 | +2226 |
| `/assets/molis-work-plugins/files.js` | 11688 | 13835 | +2147 |
| `/assets/molis-work-plugins/git.js` | 31055 | 33205 | +2150 |
| `/assets/molis-work-plugins/pages.css` | 43362 | 43485 | +123 |
| `/assets/molis-work-plugins/coding.css` | 69743 | 69841 | +98 |

最终复验：11 个现有资源合计增加 12,083 字节，单项最多 2,232 字节，比用户批准的总增量再少 64 字节；原批准额度保留不扩大。四个插件脚本主要增加 SDK 共用 HTML 清理边界，frame 增加可见性、参数和刷新限频，工作台脚本增加已批准的取消状态和临时草稿等修复。CSS 为焦点、触屏和取消状态。

IM 路由不在主资源门禁覆盖面，另行逐字节核对生成产物：JS 从 81,881 降到 59,807 字节（减少 22,074）；CSS 从 20,786 增到 29,322 字节（增加 8,536）。CSS 复用共享按钮与 toast，避免两套交互样式；JS 的原始翻译增长已通过构建期压缩消化，不新增运行时依赖。合计 IM 两资源仍减少 13,538 字节。

仓库 AGENTS.md 要求必要增长经评审，单项超过 10 KB 或新资源先询问。本批没有超过 10 KB 的单项，也没有新资源；此前自动审批因增长尚未获批而拒绝写入；用户随后审阅本表并明确批准，现已按精确增量写入一次性放行记录。
