# 工作台导航控件修复验收记录

## Automated checks

- `pnpm typecheck`：通过。
- `node --import tsx --test tests/web.test.ts`：39/39 通过。
- `node --import tsx --test tests/desktop-tui.test.ts`：28/28 通过。
- `node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout src/web`：返回 `[]`，无布局告警。
- `git diff --check`：通过。

## Browser interaction

使用当前源码启动独立本地验收服务，并在真实 Goal 页面检查 Web 与 `?desktop=1` Desktop Shell。

### 宽屏 Web

- 目录栏初始宽度为 300px；收起后为 44px 窄轨。
- 收起前后 `data-desktop-directory` 保持 `root`，Goal Tree 折叠节点数量保持不变。
- 收起后刷新，`--tree-width` 仍保存为 `300px`；再次展开恢复为 300px。
- Goal Hero 的 Focus/Runtime 均可见，原 `.desktop-workbench-actions` 数量为 0。
- 切换 Runtime 后文档隐藏、TUI 可见且“返回聚焦”可见；返回后文档恢复、TUI 隐藏。

### 窄屏 Web

- 顶部显示当前项目“Molis Work 信息流工作台重设计”和项目设置入口。
- 项目菜单为 310px 宽白色浮层，10 个项目项均为 34px 可点击行；浮层命中层级正确、容器 `overflow: visible`，未被内容遮挡或裁切。
- 点击菜单外部会关闭菜单。
- 原“目录 / 目标 / 聚焦 / 运行”四段导航保持可见，Goal Hero 模式切换在窄屏隐藏。

### Native Desktop Shell

- 首轮复测发现 Native Desktop 仍通过单独的 `desktopShell` 分支渲染旧 `.desktop-workbench-actions`；已删除该分支及对应死样式，并补充 Desktop 专项断言，避免只测 Web 输出造成假通过。
- 宽屏 `?desktop=1` 中目录栏按钮和 Goal Hero 模式切换可见；目录栏实测由 284px 收起为 0px 内容面板并保留恢复窄轨；原工作台动作区数量为 0。
- Runtime 中“返回聚焦”可见，返回后 Goal Hero 的“聚焦 / Runtime”切换恢复可见。
- 窄屏 `?desktop=1` 不渲染 `.mobile-project-bar`，原四段导航保持可见。
- 未制作、安装或替换 macOS App 包。
