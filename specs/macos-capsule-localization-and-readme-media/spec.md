# macOS 工作胶囊本地化与 README 深色媒体统一

## 完成等级

内部完整（等级 4）：`main` 的源码、桌面 App 和 README 描述同一套真实能力；macOS 状态栏工作胶囊可用、跟随 Molis Work 的界面语言，文档使用对应语言的真实深色截图。

## 背景与证据

- 真实 macOS App 已有状态栏图标与工作胶囊：点击后显示项目、待处理 Goal、状态和下一步。
- 当前 `main` 的桌面源码不含这套胶囊实现，而本机 debug App 二进制包含 `capsule_*` 命令和 tray 代码；完整实现位于未合入的提交 `58205e2`。这会导致后续从 `main` 构建的安装包丢失已经存在的产品能力。
- 当前 README 将该能力写入产品说明，但其图片混用浅/深色、英文/中文；英文 README 还引用中文桌面截图，中文 README 又引用英文 Codex 侧栏截图。
- 工作胶囊里的一部分 UI 字符串会在用户切换 Molis Work 界面语言后继续保留旧语言，缺少“页面语言变化 → 原生/胶囊重新渲染”的同步边界。

## 目标

1. 将已存在的 macOS 状态栏工作胶囊及其测试、路由和桌面壳恢复到 `main`，不把它误写成 Dock 或普通应用菜单。
2. 让状态栏胶囊使用当前 Molis Work 语言：英文界面显示英文标签与按钮，中文界面显示中文标签与按钮；切换语言后重新打开胶囊即可看到一致语言。
3. 用同一套演示场景重新整理 README 图片：全部深色；英文 README 只引用 `-en` 图片，中文 README 只引用 `-zh` 图片；加入状态栏胶囊截图。
4. 维护功能说明与实际代码一致，不新增未实现的状态栏能力，也不改变 Goal、Runtime、决策或终端行为。

## 范围

### 包含

- 将 `58205e2` 中工作胶囊所需的最小完整生产代码、权限、路由、测试和运行配置迁入当前 `main`，以当前 `main` 的 README 和其他后续改动为基线解决冲突。
- 在胶囊渲染路由和客户端刷新边界中，读取并使用当前请求语言；当用户从主窗口切换语言后，下一次打开/刷新胶囊不沿用旧页面语言。
- 更新 README.md、README.zh.md 和 README 相关测试，修正 desktop / Harness / Web / menu-bar 图片引用与说明。
- 产出并人工检查：英文与中文各一组深色截图，场景一致，并包含状态栏胶囊。

### 不包含

- 新增另一套系统托盘、Dock 行为或新的后台服务。
- 修改 Goal 生命周期、调度、Runtime 启动语义或胶囊的任务控制范围。
- 重做状态栏胶囊的信息架构；本次只修复语言同步、源码缺口和文档媒体一致性。

## 方案与边界

- `desktop/src-tauri/src/main.rs` 保持状态栏图标、胶囊窗口定位、显示/隐藏和主窗口深链接；桌面壳只承载原生窗口与状态栏生命周期。
- `src/web/capsule.ts` 只负责胶囊页面的展示和当前项目数据刷新；它通过请求语言生成 UI 文案，不自行持久化另一套语言状态。
- `src/web/server.ts` 仍以 Web locale cookie 为普通页面的回退来源；状态栏胶囊及其数据 API 接收主窗口同步过来的显式 `locale` 参数，优先使用它。这样胶囊的首屏和后续数据刷新都不会因旧 cookie 混入另一种语言。
- README 媒体文件按照 `*-en-dark.*` / `*-zh-dark.*` 命名；同一位置的两张图来自相同功能场景。README 不再跨语言引用图片。

## 验收标准

1. 从当前 `main` 构建/启动的 macOS App 会创建 Molis Work 状态栏图标，左键可打开工作胶囊，且不替换为 Dock 说明。
2. 英文 UI 下打开胶囊，顶部状态、分类标签、下一步、底部按钮均为英文；中文 UI 下对应文案为中文。切换语言后关闭再打开胶囊，语言同步。
3. 胶囊仍保留项目切换、状态刷新、打开主窗口和 ESC/失焦关闭等既有行为。
4. README.md 只引用英文深色媒体，README.zh.md 只引用中文深色媒体；两者都展示状态栏工作胶囊。
5. 任何 README 引用的产品截图均为深色主题；不再引用 `web-workspace-light.jpg` 或跨语言素材。
6. TypeScript 类型检查、相关 Web/胶囊测试、Rust 测试/检查和 macOS 桌面启动验证通过。

## 验证

- `pnpm typecheck`
- `pnpm build`
- `node --import tsx --test tests/capsule.test.ts tests/i18n.test.ts tests/web.test.ts tests/e2e.test.ts`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`
- 在实际 macOS App 中切换 `中文 → EN → 中文`，每次打开状态栏胶囊，核对可见标签和按钮。
- 人工检查 README 两个语言版本的图片路径、主题和语言配对。
