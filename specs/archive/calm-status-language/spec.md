# 平静语义色：枚举、目录与标签

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

## 背景目标

工作台中性锌已经够静，但枚举几乎只剩蓝/灰/绿/红四色，目录状态常常不出现，列表还把已有 Lucide 图标藏掉换成圆点。扫一眼分不清「待开始 / 进行中 / 等你 / 等待」。

目标：用**低饱和语义色 + 图标 + 短标签**让状态可扫，不把界面染成仪表盘。

## 当前行为与问题证据

- Goal 可见状态里，待开始、进行中、等你、大量 pending 都走 `--blue` / `--blue-dark`。
- 舞台列表、看板卡、画布节点 `svg { display: none }`，改用 6px 圆点。
- 目录 `meta` 行把 `status` 丢掉，只留 caption；Inbox「待处理」在目录里看不见。
- Feed/Inbox 详情 kicker 是 9px 全圆 pill，和 DESIGN「不要通用药丸」冲突。
- Frame 状态用 `○ ✓ ! ◐` 字符，不是图标系统。
- 当前 / 归档 / 回收站折叠只有灰字，没有归属图标。

## 范围与非目标

做：

- 增加平静语义色族 token（idle / progress / attention / hold / blocked / done / quiet）。
- Goal 状态按族上色；列表恢复 12px 图标+文字；画布/看板仍用圆点+文字，但圆点走同一色族。
- 共享 `mw-status` 标签：文档里 11% 薄洗、5px 圆角；目录/列表里纯色无底（`--plain`）。
- 目录 compact/meta 都展示 status 标签；Inbox / Sessions / Feed / Artifacts 接上对应色族和图标。
- 当前/归档/回收站折叠加图标；设置分类与插件目录图标用安静的归属色。
- Feed/Inbox kicker 改成同一套标签，不再用 999px 药丸。
- Frame / 工作区标题状态复制真实 status 标记，去掉 unicode。

不做：不换 Linear × Coss 世界；不改 Goal 语义、筛选、写入；不把大面积表面染色；不把颜色当唯一编码。

## 使用场景

1. Goals 列表：待开始是冷灰+播放，进行中靛蓝+播放，等你陶土+人，等待雾青+钟，受阻玫瑰+叉，完成鼠尾草+勾。
2. 打开 Inbox：目录第二行仍是原因，右侧能看到「待处理」陶土标签。
3. Feed 任务行：名称、拉取时间、健康标签（正常/需处理/同步中/暂停）可区分。
4. 详情 kicker 和列表标签是同一套，不是另一套药丸。

## 方案与关键决策

色温：冷锌底，语义色低彩、只上图标和标签。进度靛蓝保持稀有。等你用陶土，等待用雾青，避免再并进蓝。

对照：

| 族 | 含义 | 例 |
| --- | --- | --- |
| idle | 可开始、未动 | 待开始、Session 可查看 |
| progress | 正在发生 | 进行中、Inbox 处理中、Feed 同步 |
| attention | 轮到人 | 等你、Inbox 待处理、Feed 需处理 |
| hold | 在等系统/他人/子项 | 等待 |
| blocked | 故障、受阻、不可用 | 执行受阻、Artifact 不可用 |
| done | 完成、健康 | 已完成、来源运行正常、Artifact 可用 |
| quiet | 归档、忽略、已读 | 归档、回收站、已忽略 |

图标仍走 Lucide；回收站用 `trash`，归档用 `archive`。颜色不是唯一线索。

## 文件 / 模块边界

允许：`packages/design-system` token/primitives/目录行、`interaction-texture`、Goals 树/状态 CSS、Feed/Inbox/Sessions/Artifacts 目录与 kicker、Frame/工作区状态复制、`DESIGN.md`、对应测试。

禁止：MCP、领域写入、改用户 home、提交。

## 验收

1. 六个 Goal 可见状态分属不同色族；列表看得到对应图标，不再是统一蓝点。
2. Inbox/Sessions/Feed/Artifacts 目录看得到状态标签。
3. kicker 圆角 5px，不是胶囊。
4. Light/Dark 标签字色在纸面上可读；色盲仍能靠图标和文字区分。
5. 完成等级 3。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-work --filter @molis-ai/molis-work-plugin-artifacts typecheck
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/goals-status-ui.test.ts tests/goals-kanban-ui.test.ts tests/goals-tree-ui.test.ts tests/visual-foundation.test.ts tests/inbox-native-plugin.test.ts tests/feed-native-plugin.test.ts
```

浏览器：Goals 列表、看板、Inbox 目录、Feed 目录、设置分类。不打用户默认 home 以外的 4180（当前预览可核）。

## 假设

4180 已在跑用户预览；改 CSS 后重启才能看到。
