# Shelf 端到端对齐 DropAgent

状态：本轮实现与定向验收完成；目标仍为内部完整，最终宿主/原生手势验收尚有下列缺口，不宣称已可发布或已获用户验收。

## 目标与依据

用户要求打磨 Shelf 的交互、动效、功能和轮盘文字。以本机 `/Users/yijunwang/code/DropAgent/macos/App` 及其模块当前实现为参考，继承 `../shelf-plugin/spec.md` 的产品范围。保留 Molis 插件入口、舞台主从布局及项目成果衔接；替换移植中缺失或失真的行为，不改 DropAgent 仓库和其他插件。

已发现：轮盘将 NSTextAlignment(2) 错当居中（当前 macOS 实际是右对齐），标签另被额外缩窄并裁剪，连续 drag 更新会把渐入 alpha 直接置 1；轮盘图片只判类型、没有传递字节，file URL 直接去前缀导致空格/中文路径错误；复制文件实际下载，文本复制可能截断；多来源结果对照只用第一份；预览把 Markdown/JSON 都当普通行文本；终端投递未区分文字/链接/文件，已展开但退出的终端不能恢复。

## 行为与实现边界

- 原生轮盘保持六瓣顺序、64/128 半径、0.18s 定点、0.2/0.12s 显隐和 1.06 弹簧。文字使用参考的 72×28pt 换行布局、10.5pt medium 和中心锚点，不额外 clip。浅深色和禁用态保持参考配色。显隐不能被连续移动或过期回调截断。
- 拖入文件、目录、图片、文字、链接按真实内容收取副本，正确解码文件 URL；失败在 Shelf 可见，已收下的材料保留。Agent 能力获取不阻塞主线程、不并发堆积、不因短暂失败清空有效缓存。
- 复制文件通过 macOS 文件剪贴板，支持多选；浏览器明确提供下载回退。复制正文读取完整内容，编辑保存后再复制。失败不能显示成功。
- 结果可在所有仍存在的来源之间对照；Markdown、JSON、代码、网页/链接有对应阅读呈现，长正文读取实际副本。内容仅安全渲染，不执行 HTML/脚本。
- 终端发送保留文字/URL 语义，文件路径正确引用；终端退出后再次发送会重新连接/启动。折叠不关闭会话，失败保留可重试输入。
- 对齐本次审计确认的选择、菜单、拖入反馈和关键动效；尊重减少动态效果，窄工作面与浅深主题均可用。

允许修改：`plugins/native/shelf/**`、`modules/shelf/**`、Shelf contracts/HTTP、`apps/desktop/adapters/tauri/src/{drop_wheel*,shelf*,main.rs}`、对应权限/构建配置、桌面 shell 的 Shelf 主题语言同步、Shelf 测试及本 spec。保留已有修改，尤其 `plugins/native/shelf/src/styles.ts`。不改用户默认 home，不安装发布、不调用真实付费 Agent 做测试。

## 验收与证据

1. 对照原生绘制验证六瓣文字、颜色、布局及进入/悬停/离开；单元测试验证 drag 生命周期与能力缓存。
2. 隔离 home 下真实 HTTP/浏览器：导入 → 预览/编辑 → 动作确认 → 本机提取/受控 Agent 结果 → 多来源对照 → 完整复制/再作材料；测试失败恢复。
3. 原生文件/图片/目录进货和系统文件剪贴板通过实际 AppKit 路径验证；受控终端验证发送及退出后重启。合成事件证据与真人 Finder 手势区别记录。
4. Shelf 包类型检查、定向模块/HTTP/浏览器测试、`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop` 相关过滤项和原生构建通过。只运行适用检查，不为无关仓库改动扩大范围。

未验证项或本机环境限制必须在最终交付标明，不能以旧 spec 或工具成功代替体验证据。


## 本轮落地与验证（2026-09-26）

原生轮盘改用平台 `NSTextAlignment::Center`，保留参考的 72×28pt / 10.5pt medium 字号布局，移除额外裁剪；主题和中英文随宿主同步，淡出过期回调不能关闭新显示的轮盘。生产 NSView 在主线程的独立临时 harness 输出了 [浅色](evidence/wheel-light.png)、[深色](evidence/wheel-dark.png)、[禁用态](evidence/wheel-disabled.png)、[英文](evidence/wheel-english.png)，四图均已逐张检查文字与图标同轴。它们是静态绘制证据，不能代替真实拖动/背景模糊/动画实操。

已补齐现代多文件 pasteboard URL 解码、实际图片字节、RTF、目录递归和 64 MiB 限制；读取同一 pasteboard changeCount 时复用快照。关闭轮盘不再禁用工作面接收。拖入后的结果刷新、失败反馈和长任务等待保留副本。复制走系统文件剪贴板；真实临时桌面 App 中选中示例 PDF，⌘C 后在 Finder 粘贴成功，646 字节与 Shelf 副本完全一致。测试仅使用临时 home，App 与 4173 自有测试服务已停止，端口已交给 Onboarding owner。

客户端修正完整文件读取/编辑、读取失败禁止编辑、编辑后复制、多选复制、多来源对照、安全 Markdown / JSON / 代码呈现；补齐新建动作、整理重排与减少动态效果。设置局部更新不再重载整个终端。目录嵌套工作面导致的双 click / keydown 已消除，文件选择器在完成读取后才清空；混合目录与文件拖入不再遗漏文件，部分失败时已入库材料仍可见，失败显示原因。终端退出后可再次启动，启动/连接失败返还未发送内容并清队列；缺 bridge 保留输入；含单引号文件路径按 shell 规则转义。

已通过：

- `tsc -p plugins/native/shelf/tsconfig.json` 与最终 `tsc --noEmit -p plugins/native/shelf/tsconfig.json`；desktop 包类型检查、生成脚本语法及 scoped `git diff --check`。
- Shelf 模块/HTTP 的 plugin、recipes、settings、project-results 共 32 项；覆盖副本保护、失败/取消、目录、本机 OCR 和受控 Agent 结果。原有 `shelf-plugin.e2e.test.ts` 全流程通过。
- `shelf-dropagent-parity.e2e.test.ts` 首轮 7/7 通过，覆盖完整长文、安全预览、多来源、动作与复制/终端客户端契约；[浅色](evidence/browser-compare-light.png)、[深色](evidence/browser-compare-dark.png)、[窄布局](evidence/browser-compare-narrow.png) 已看图。
- 最终 `node scripts/run-tests.mjs tests/shelf-client-boundaries.e2e.test.ts tests/shelf-terminal-recovery.test.ts`：10/10 通过。使用当前生产源码、真实 Chrome FileList、HTTP handlers 和 Store；验证选择器单次触发、完整落盘和尾部预览、失败输入恢复/缺 bridge、单引号路径，以及混合拖入和部分失败。目录 entry 事件和终端 WebSocket/bridge 为明确的测试替身，不声称是真人手势或真实 Agent 进程。
- `desktop-shell-bootstrap.test.ts` 3/3；`cargo test ... --bin molis-work-desktop shelf -- --test-threads=1` 18/18、`drop_wheel` 19/19，包含真实命名 AppKit 剪贴板/多 URL/PNG/RTF、目录和几何生命周期；最终 `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop` 成功。命名剪贴板测试未碰 general 剪贴板。

未完成的整体验收：

- 最后增补后的全宿主复跑仍停在首次项目页面导航，未进入 Shelf 业务断言：统一构建后一次导航及 CDP 诊断均超时（`/tmp/shelf-final-host-verified.log`，总计约 100 秒）；最后一次导航等待 30 秒超时、诊断可返回正确项目路径且无页面 alert（`/tmp/shelf-final-host-after-trace.log`，总计约 52 秒）。同快照的一次独立 Network/Runtime/lifecycle 诊断约 14 秒成功（`/tmp/shelf-navigation-one-shot.log`）；Chrome init→DOMContentLoaded 的内部时间差约 366ms，Node 收到两事件相隔约 5.25 秒，存在宿主事件派发延迟，不能据此把卡顿归因浏览器脚本。诊断使用相同 fake Claude 环境及视口，但未执行主测试导航前的 Store/runtime 断言；它不能代替完整套件。没有继续扩大超时或将其记为业务通过。具体宿主延迟根因仍待确认。
- 先前全量 local-host 类型检查曾受连接器 `authExtras` / Gmail `action` 错误阻塞。构建 owner 随后完成统一增量，已包含最新 Shelf、desktop、local-host 与 PTY 产物；本任务检查了产物中的路径转义、混合拖入和终端恢复修复。共享 dist 仍由构建 owner 管理，本任务不重复写入。
- 原生 Finder 文件复制已实操；最终修复后的 WebKit 系统选择器重验先遇到临时 App 的 400ms 服务健康探测超时。随后在 Onboarding 交还 4173 后，已换入含 Center 修复的最新原生程序、准备 51,845 字节中文 Markdown 并启动隔离服务；但直接连接 Finder、重置 CUA 会话后重连均报原生操作服务退出（`-10005: codex app-server exited before returning a response`），未能操作 UI，已停止自有 PID 62896。真实 Finder 轮盘拖入/拖出、连续悬停动画、背景模糊与真人手感仍未完成最终手势验收。且当前工具只有完整 `drag(from,to)`，不支持按住后暂停再转向花瓣，不能以普通面板收取冒充轮盘花瓣命中。没有安装、发布或使用真实付费 Agent。

范围复核：store.ts 的 OCR、网页和执行器已在 ocr.ts / website.ts / job-runner.ts 分离；本轮根因位于客户端与原生桥接，因此没有为行数拆 store。其他任务在 main.rs / Cargo.toml 的 context-directory 模块和依赖修改均保留，未算作本轮成果。
