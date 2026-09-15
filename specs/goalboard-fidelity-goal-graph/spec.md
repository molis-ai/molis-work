# Molis Work 复杂关系 Graph 高保真实现

## 完成等级

本 Goal 达到 **内部可用的桌面 UI 切片（Level 4）**：真实 Molis Work Desktop 可在 List 与 Graph 间切换，Graph 从现有 Goal 与 Relation 事实生成，并与右侧 Goal Focus 联动。

## 背景与目标

现有 Graph 已经能读取真实关系，但完整网络中未关联 Goal、关系标签和当前焦点缺少清晰分层，复杂项目会重新变成一张难读的线团。目标是在不改变任何领域行为的前提下，还原已确认高保真稿的结构感：先看清关系方向和状态，再选择节点继续推进。

## 范围

- Desktop 中保留 List / Graph 切换，Web 与 Desktop 继续读取同一份 Goal 和 Relation。
- 按相对当前 Goal 的真实关系方向分成“流入当前焦点 / 当前焦点 / 当前指向 / 其他 Goal”四个视觉区域。
- 选中节点、状态、父子关系和依赖关系保持可辨；完整网络降低重复关系文字造成的噪声。
- 提供只影响当前视图的 Graph 缩放、关系类型筛选、搜索和直接相关 / 完整网络切换。
- 节点选择继续驱动右侧 Goal Focus，Light、Dark 与跟随系统均可读。

## 非目标

- 不新增、删除或修改 Goal、Relation、状态机、领取、完成、复核、权限或 Runtime 行为。
- 不把视觉分区保存为新的业务分组，也不推断项目阶段。
- 不制作静态假数据 Graph 替代真实产品页面。
- 本 Goal 不制作最终 README 推广截图。

## 关键决策

Graph 的分区只表达相对“当前选中 Goal”的拓扑事实：指向当前节点的关系在左，当前节点居中，从当前节点继续指向的关系在右，不属于当前连通网络的 Goal 单独放在“其他 Goal”。完整网络用线型和底部图例说明关系类型，隐藏每条边的重复文字；聚焦模式保留边标签。缩放、筛选和聚焦只保存在浏览器会话状态，不写回 Molis Work。

## 验收标准

1. 真实 `.app` 的 Graph 能清楚看到四个区域、当前焦点、状态、关系方向和右侧 Goal Focus。
2. 节点不重叠；完整网络的关系文字不形成明显遮挡，聚焦模式仍能解释关系类型。
3. List / Graph、直接相关 / 完整网络、父子 / 依赖筛选、搜索与缩放可操作，且不改变任何 Goal 状态或关系。
4. 选择 Graph 节点后，右侧 Goal Focus 切换到同一个 Goal。
5. Light、Dark、System 和桌面常用宽度下均保持可读。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/goal-graph.test.ts tests/visual-foundation.test.ts tests/web.test.ts tests/i18n.test.ts`
- `pnpm test`
- 构建并完整重启真实 `.app`，在直接相关与完整网络两种状态检查布局、缩放、节点选择和右侧联动。
