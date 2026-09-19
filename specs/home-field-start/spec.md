# 项目首页：Onboarding 房间的一屏落地

状态：高保真切片迭代中。完成等级 **2**。不改生产首页布局。名人名言已从切片和生产一并去掉，见 `specs/home-remove-quotes/spec.md`。

## 背景目标

进项目后仍在 Onboarding 的房间里：冷灰留白、一次只点亮下一步、轻松开始工作。不是仪表盘，也不是暖纸窗光。

## 当前行为与问题

上一版切片用晨/午/夜暖纸和窗光呼吸，和 Linear × coss / Onboarding 冷灰蓝冲突。

## 范围与非目标

- 改 `.impeccable/review/home-field/index.html` 切片。
- 动效以及 Onboarding 房间动线保留；场色跟工作台主题 `--page`，不是独立冷灰蓝 canvas。
- 一屏、无点阵、无窗光、无晨午夜。
- 不改生产首页布局与动线。Agent 输入仍禁用。引语能力由 `home-remove-quotes` 删除。

## 方案

- 舞台场色跟工作台主题：`--page` `#f3f4f5` / `#0f1011`。动线：月历（今天点亮）→ 主继续 → Inbox/Session 降权行 → 下划线「我想」。没有名人名言。右侧是时间流：Inbox 一条注意力卡片，其余沿细轴回声，不是卡片墙。
- 动线：月历（今天点亮）→ 主继续 → Inbox/Session 降权行 → 下划线「我想」。没有名人名言。右侧是时间流：Inbox 一条注意力卡片，其余沿细轴回声，不是卡片墙。
- 动效：进房 `session-ready`；主继续 `control-ready` 扫光；足迹 `receipt-lock`；有工作/空项目用步骤 `clip-path` + `translateX` 进出。
- `prefers-reduced-motion` 去掉位移，保留状态。

## 验收

1. 一屏看见月历、主继续、侧门、足迹、下划线 composer；无点阵、无窗光、无第二屏。
2. 场色是工作台主题 `--page`，不是独立冷灰蓝 canvas，也不是暖纸。
3. 主继续明显亮于侧门；右侧只有 Inbox 是注意力卡片，其余足迹不是卡片。
4. 切换有工作/空项目走步骤进出。浅/深、桌面/390 可切换。
5. 点击只演示去向。work 步没有名言；空态 intro 仍是产品说明。
