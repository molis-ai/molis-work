# Session 详情密度纠偏与原型分支清理

日期：2026-08-31

完成等级：3 · 功能可用

## 背景与目标

用户已确认 Session 详情应把身份与动作压缩到顶部 Hero，把执行内容和 Goal 历史作为无需切换的主体。该布局已经进入真实项目页；原先为高保真切片准备的静态 Session / 工作目录样例和 `liveData` 双分支仍留在生产 renderer 中，但真实 Web 服务始终传入 Registry / Catalog 数据。

本次在保持当前已验收布局的前提下，删除不再进入生产调用链的静态原型数据、假归档行为和无消费字段，使 renderer 只表达真实数据、真实空态和真实 API 动作。

## 保留、替换、忽略

- 保留：紧凑 Hero、执行内容主区、Goal 历史侧栏、桌面并列与窄屏顺序、按需读取和 Handoff 真动作。
- 替换：`liveData` 分支改为单一真实渲染路径；无数据时统一显示空态，不再按项目名称注入代表数据。
- 删除：静态 Session / workspace fixtures、模拟 transcript / event、页面内假归档监听，以及只随旧 fixture 传递且没有消费者的字段。
- 忽略：不调整 Session Registry、Runtime Adapter、工作目录 Catalog 或 Handoff 业务规则；不增加新的状态或兼容层。

## 调用链与边界

1. `src/web/server.ts` 从 Session Registry、Project Catalog 和 Runtime capability 构造最小 `ProjectOperationsData`。
2. `src/web/render.ts` 把这份数据交给 `renderProjectOperations`。
3. `src/web/project-session-workspaces.ts` 只渲染真实 records；缺少数据时只渲染真实空态。
4. 原生/Molis Work 内容均通过现有内容 API 按需加载；unsupported 只显示能力缺失，不生成示例正文。

## 验收标准

1. Session Hero 仍集中展示状态、Runtime、Molis Work Session ID、更新时间与主动作；执行内容与 Goal 历史无需互斥切换。
2. 桌面执行内容占主列，Goal 历史位于侧栏；窄屏按 Hero、执行内容、Goal 历史顺序阅读，页面无横向溢出。
3. 生产 renderer 不再包含静态 Session/workspace IDs、`liveData`、模拟 transcript、模拟归档监听或未消费的原生 ID/历史 ID/创建时间/provenance/capability 视图字段。
4. 真实 Session/工作目录、空态、内容加载、归档、Handoff 和项目隔离回归通过。

## 验证

```bash
pnpm typecheck
node --import tsx --test --test-concurrency=1 tests/session-web.test.ts tests/session-directory.test.ts tests/session-content.test.ts tests/session-handoff.test.ts tests/workspace-directory.test.ts tests/web.test.ts
pnpm build
git diff --check
```

真实浏览器复核项目 `#sessions` 的桌面与窄屏详情，记录 Hero、主列/侧栏、顺序、真实数据和 overflow。
