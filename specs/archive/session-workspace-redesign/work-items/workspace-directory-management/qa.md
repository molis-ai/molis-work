# 项目内工作目录关联管理 QA

## 完成等级

- 目标：Level 3「功能可用」
- 结果：项目内 Sessions 与工作目录已接入真实 Catalog / Session Registry / API；工作目录读取、添加、修复、解除关系和启动 Session 均为真实行为，所有写入逐次确认，不操作真实文件，不创建默认关系。
- 范围边界：没有实现全局工作目录管理页；Handoff 仍属于独立 Goal。

## 自动验证

### 受影响主链路

```bash
node --import tsx --test --test-concurrency=1 \
  tests/workspace-project-actions.test.ts \
  tests/workspace-directory.test.ts \
  tests/session-project-binding-router.test.ts \
  tests/session-project-actions.test.ts \
  tests/session-directory.test.ts \
  tests/session-web.test.ts
```

结果：10/10 通过。覆盖路径 canonical identity、软链接、monorepo、缺失目录、Catalog / 历史 Session identity 冲突、项目隔离的 Session 路径修复、确认门禁、添加、解除、启动、无默认关系、跨事实源失败补偿，以及 Session / 路径列表状态只有一层视觉标签。

补充回归：

- `tests/project-catalog.test.ts` 与上述套件合跑 27/27 通过；旧目录默认写入被拒绝，工作目录只返回项目候选。
- `tests/mcp.test.ts` 32/32 通过；MCP 不再暴露 `workspace_default` 作为可选 scope，新 Session 仍需明确选择候选 Project。
- `tests/web.test.ts` 的 settings 定向用例 1/1 通过；旧默认 API 返回 410，不再写入。
- 在 Handoff 收口后的最新代码上，将工作目录、Session 关系、Project Catalog 与 MCP 边界合并复跑，结果 59/59 通过。

### 静态检查与构建

```bash
pnpm typecheck
pnpm build
git diff --check
```

结果：全部通过。

### 共享 Web / Desktop 壳层回归

```bash
node --import tsx --test --test-concurrency=1 tests/web.test.ts tests/desktop-tui.test.ts
```

结果：81/82 通过。唯一失败是既存的 Feed CSS 字符串快照，期望旧的 `.feed-detail` 移动端声明顺序；失败位置 `tests/web.test.ts:1884`，不经过本工作项的工作目录模块、API 或数据链路。Desktop 相关用例全部通过。

### Impeccable 检测

```bash
node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json \
  src/web/project-session-workspaces.ts src/web/server.ts
```

结果：0 个阻塞问题；检测器仅报告现有高密度界面使用的字号和圆角未全部进入 `DESIGN.md` token 表，均为 advisory。

## 浏览器 QA

真实地址：`http://127.0.0.1:4187/projects/project-aeb51deb-e335-403b-80cc-387e20e0e000#workspaces`

- Dark 桌面有效宽度 768px：Session 与工作目录的 selected row 都是整行唯一的 `BUTTON`，约 67px 高、row border 为 0、使用 paper 与轻微阴影；状态是单一元素且 `children.length === 0`。两类目录均保持 Goal / Feed 的高密度列表节奏。
- 移动 392px：Session 与工作目录 row 都是约 66px 高的整行按钮，页面横向 overflow 为 0，仍保持高密度而非卡片堆叠。
- 窄屏 312px：工作目录详情两个 Hero 动作纵向排列、各 44px，页面横向 overflow 为 0。
- 移动列表包含独立的添加入口，筛选与添加各自保持 44px 触控区域。
- Session 与工作目录列表 Item 统一为 Goal / Feed directory ledger：整行是唯一按钮，静止态透明，hover / selected / focus 沿用同一反馈；row 不是独立描边卡片，状态由单一元素绘制单框，不再出现双层状态框。
- 添加工作目录、启动 Session 对话框打开后提交按钮默认禁用；存在明确确认复选框。
- 工作目录详情展示真实 canonical path、Catalog 项目关系和 Session Registry 使用数量；没有 demo 标记、全局管理页或默认目录开关。
- Session 详情只保留已接通的“加载原 Session”；独立 Handoff Goal 完成前不显示占位按钮或假对话框。
- 直接访问全局 `/workspaces` 返回项目选择；项目 `#workspaces` 读取到当前项目 1 条真实目录记录，不存在 `Project / 工作目录` switch，页面横向溢出为 0。
- “路径正常”由单一无子元素的状态标签绘制，父级是唯一目录 row；没有外层状态容器，因此不存在双层框。

截图：

- `.impeccable/review/workspace-directory-desktop.png`
- `.impeccable/review/session-directory-desktop.png`
- `.impeccable/review/workspace-directory-mobile.png`
- `.impeccable/review/session-directory-mobile.png`
- `.impeccable/review/workspace-directory-narrow.png`

以上截图均来自当前源码。第二轮 reviewer 唯一剩余条件是原有工作目录三张截图过期；`.impeccable/review/workspace-directory-desktop.png`、`.impeccable/review/workspace-directory-mobile.png` 和 `.impeccable/review/workspace-directory-narrow.png` 已重新生成，并完成 312px Hero 纵排与触控高度指标验证，因此该条件已满足；两张 Session 截图是本轮列表一致性的额外证据。Impeccable 两轮 review 上限已用完，不再发起第三轮。

## 验收对照

1. 添加、修复、解除和启动均要求确认；不删除文件、不创建默认；旧默认写入入口退役：通过。
2. Catalog 与项目视角共享 canonical workspace identity；软链接、monorepo、缺失、重复和 Catalog / Session identity 冲突有确定结果：通过。
3. workspace 只提供 Project 候选，不静默绑定外部 Session：通过。
4. API 失败会保留对话框与输入并展示错误；第二事实源失败会自动恢复 Catalog；成功后刷新读取事实源：通过。
5. Goals、Sessions、工作目录维持项目内平级，无全局页、switch、新容器体系或链接下划线；Session / 工作目录列表复用 Goal / Feed directory ledger，不使用独立描边卡片或双层状态框：通过。
6. 768px Dark 桌面、392px 移动列表和 312px 窄详情无横向溢出，行密度、整行按钮与 Hero 触控高度符合要求，确认门禁可用：通过。

## Molis Work Contract 差异

当前 Goal 的旧 Contract 仍要求“全局 + 项目内”两套目录。最新用户决定是“Sessions 与工作目录都只在选定 Project 内，与 Goals 平级”。实现与本需求书按最新决定交付，但纠偏 Candidate 仍待用户确认；旧 Goal 不能在条款被正式替换前伪报完成。
