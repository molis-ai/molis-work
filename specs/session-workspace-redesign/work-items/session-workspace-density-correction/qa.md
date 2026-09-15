# Session 详情密度纠偏与原型清理 QA

日期：2026-08-31

完成等级：3 · 功能可用

## 结论

Session 详情继续使用紧凑 Hero + 执行主列 + Goal 历史侧栏，不需要在互斥 Tab 间切换内容。生产 renderer 已删除整套静态 Session/工作目录样例、模拟 transcript/event、假归档监听和 `liveData` 双分支；无记录时只显示真实空态，有记录时只消费 Registry / Catalog / Runtime capability 生成的数据。

## 代码边界检查

- `src/web/server.ts` 只向视图传递实际消费的 `session_id`、Runtime、内容模式、当前 Goal、Goal 历史、workspace、更新时间和摘要。
- 已删除没有视图消费者的 `nativeRuntimeSessionId`、`goalHistoryIds`、`createdAt`、`provenance` 与 Session capability 副本；Runtime capability 仍只在创建/Handoff 选项上使用。
- 内容加载不再依赖仅为原型区分而存在的 `data-live-session`；只要详情具有真实 `session_id`，便调用项目隔离的内容 API。
- 原生内容、Molis Work TUI/状态事件、unsupported 与 failed 仍由内容服务返回的真实 `content_mode` 决定；renderer 不生成示例正文。
- 归档只保留 `data-session-archive` 的真实 API 动作；页面内假成功监听已删除。

## 自动验证

- `pnpm typecheck`：通过。
- Session/目录/内容/Handoff/工作目录最终定向套件：14/14 通过；其中 `tests/session-web.test.ts` 2/2 通过。
- `pnpm build`：通过。
- `tests/web.test.ts`：50/51 通过；唯一失败仍是既存 Feed 窄屏 CSS 字符串断言 `tests/web.test.ts:1884`，与本 Work Item 的 Session renderer、API 和布局无关。
- `git diff --check`：通过。

## 真实浏览器检查

地址：`http://127.0.0.1:4187/projects/project-aeb51deb-e335-403b-80cc-387e20e0e000#sessions`

### 桌面

- 有效 viewport：1152×720。
- Session Hero 高 96px；执行主列宽 581px，Goal 历史/关系侧栏宽 218px，主列与侧栏宽度比 2.67:1。
- “执行内容”和“关联历史”同时可见；页面横向 overflow 为 0。
- Hero 中没有旧原型标记；DOM 中没有 `data-live-session` 或 `data-operation-archive`。

### 窄屏

- 有效 viewport：312×675。
- Hero 高 246px，占 viewport 36%；两个 44px 主动作保持同一行，执行内容从 y=358 开始。
- 阅读顺序为 Hero → 执行内容 → Goal 历史 → 身份边界；页面横向 overflow 为 0。
- 移除 `data-live-session` 后，真实原生内容仍自动加载并显示来源标签，说明调用链没有被旧原型门禁截断。

## 验收映射

| 标准 | 结果 | 证据 |
| --- | --- | --- |
| Hero 紧凑，执行内容与 Goal 历史为主体 | 通过 | 桌面 2.67:1；窄屏 Hero 36% 与顺序量测 |
| 代表数据和模拟动作不冒充生产事实 | 通过（以删除旧原型分支收口） | renderer 清理测试 + 真实浏览器 DOM 检查 |
| 真实内容加载、空态、归档和 Handoff 不回退 | 通过 | 最终定向 14/14、`session-web` 2/2 |

## 已知非阻塞项

共享 Web 套件的 Feed CSS 文本断言仍需由 Feed 视觉任务处理；本次不为制造全绿而修改无关 Feed 样式或测试。
