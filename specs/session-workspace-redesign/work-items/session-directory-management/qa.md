# Sessions 管理目录 QA

日期：2026-08-31

预览：`http://127.0.0.1:4187/projects/project-aeb51deb-e335-403b-80cc-387e20e0e000/goals/session-content-runtime-load#sessions`

## 结果

本 Work Item 达到完成等级 3（功能可用）的项目内范围：真实 Session Registry 已接入项目 Sessions 目录；加入已有、创建、关系维护、转移/移出 Project、Goal 切换、工作目录更新、归档和恢复均通过确认后的真实 API 写入。原 Runtime 加载沿用已完成能力，Handoff 继续诚实指向独立后续 Goal。

早期 Goal Contract 的“全局 Sessions 管理页”与用户后续确认的“只在 Project 内与 Goals 平级”冲突。本实现遵循最新产品决定：全局 `/sessions` 仍返回 Project 选择，不建立第二套管理页面。该旧条款不能标记为通过。

## 自动验证

### Session 定向套件

命令：

```bash
node --import tsx --test \
  tests/session-project-actions.test.ts \
  tests/session-directory.test.ts \
  tests/session-web.test.ts \
  tests/session-registry.test.ts \
  tests/session-adapters.test.ts \
  tests/session-content.test.ts \
  tests/session-resume.test.ts \
  tests/session-tui-capture.test.ts \
  tests/session-content-privacy.test.ts \
  tests/session-migration.test.ts
```

结果：22/22 通过（在 Handoff 收口后的最新代码上复跑）。

覆盖：

- Session 关联写入需要确认，且只改变目标 Session。
- Project 转移、移出、Goal 切换/清空和工作目录更新为同一 Registry 事务。
- Goal 切换保留历史；同工作目录的其他 Session 不变。
- 归档/恢复只改变 Molis Work 状态，不删除 Runtime 内容。
- Codex discover 只调用 `thread/list`，不调用 `thread/read`，不自动写 Project/Goal/workspace 关系。
- 未知 Runtime 的 discover 返回 unsupported；创建只建立 Molis Work 可证明的 fallback 记录。
- Web discover、加入、原生创建、归档、恢复与 Project 转移通过真实 loopback API；跨项目查询保持隔离。
- Registry 重开后 Session 与关系一致。

### 静态与构建

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。

### Web / Desktop 回归

命令：

```bash
node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts
```

结果：81/82 通过。唯一失败仍是任务开始前已存在的 Feed 窄屏 CSS 字符串断言：`tests/web.test.ts:1884` 期待旧的 `.feed-detail { padding: 22px 16px 28px; }` 文本；本 Work Item 未修改 Feed 样式或该断言。Sessions、Desktop、PTY、项目切换与本地控制门禁相关回归均通过。

## 浏览器检查

使用真实本地项目和真实 Session 数据完成两轮有界检查。

### Desktop / Dark

- Sessions 与 Goals、工作目录保持同一个项目根目录层级；没有 switch、第二侧栏或独立 Hero。
- 左侧为连续 Session ledger；右侧执行内容为最大区域，当前关系和 Goal 历史保持在同一详情工作面。
- 添加按钮、筛选面板、管理关系和归档确认均可见；提交按钮在勾选确认前禁用。
- 筛选弹层边界完全位于目录内：`x=68..286`，目录 `x=8..292`。
- 页面 `scrollWidth - clientWidth = 0`。
- 浏览器 console error：0。

### Narrow / Dark

- 实际 CSS viewport `312px`（请求 390px，浏览器缩放后报告值），目录和详情继续使用现有“目录 / Sessions / 详情 / 运行”导航。
- 列表搜索、筛选和添加按钮在同一紧凑工具区；没有标题下划线或错误方向箭头。
- 详情主操作均为 44px 高。
- 修正前发现 Transcript 内部 `scrollWidth > clientWidth`；增加 `min-width: 0`、`max-width: 100%` 与长文本换行后复核：选中详情 `296/296px`，页面横向溢出为 0。
- 添加 Session dialog 宽度 `312/312px`，页面横向溢出为 0；确认与取消操作保持可见。

### Desktop / Light

- 使用浏览器 `prefers-color-scheme: light` 临时模拟，页面计算 `color-scheme: light`、背景 `rgb(246, 246, 247)`。
- Session ledger、选中态、执行内容、关系 rail、筛选和归档动作保持可读；页面横向溢出为 0。
- 模拟结束后已清除媒体覆盖并恢复浏览器默认 viewport。

### 项目边界复核

- 直接访问全局 `/sessions` 会返回项目选择页；页面只解释“每个项目管理自己的 Goals、Sessions 和工作目录”，不会渲染第二套 Sessions 管理目录。
- 从项目入口回到 `#sessions` 后读取到当前项目 6 条真实 Session；页面中不存在 `Project / Sessions` switch，横向溢出为 0。

## 验收映射

| 标准 | 状态 | 证据 |
| --- | --- | --- |
| 单 Session 原子关系维护与 Goal 历史 | 通过 | `tests/session-project-actions.test.ts` |
| Runtime 元数据发现、fallback 边界与重启一致 | 通过 | `tests/session-directory.test.ts` |
| 项目目录搜索、筛选、排序、加载、归档恢复 | 通过 | 真实浏览器检查 + Session 定向套件 |
| 所有管理动作确认、失败反馈和服务端边界校验 | 通过 | Web API 测试 + dialog 浏览器检查 |
| 复用 Goal 目录/详情层级，桌面与窄屏无溢出 | 通过 | Desktop/Narrow 浏览器检查 |
| 新增全局 Sessions 管理页 | 不适用（旧 Contract 偏差） | 最新用户决定、`PRODUCT.md`、本 Work Item spec；`/sessions` 302 返回 Project 选择 |

## Remaining / Later

- Handoff 的真实生成和目标 Runtime 新 Session 创建仍由 `session-goal-handoff` Goal 负责。
- 工作目录自身的关联、路径修复和启动管理仍由 `workspace-directory-management` Goal 负责。
- 内部完整等级仍需最终 QA Goal 覆盖真实多 Runtime、异常恢复和发布级集成。
