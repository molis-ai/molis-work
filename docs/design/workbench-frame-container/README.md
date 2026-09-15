# 工作台 Frame 容器 · 高保真切片

等级 2：可交互原型。工作台主区是 Container（钉住的 Goal 画布 Tab + 各 Goal 的 Frame Tab）。Goal 画布就是现生产的目标关系图，不另做一套卡片。刷新即重置。

切片只演示空间与质感。产品所有权见 `specs/workbench-frame-container/spec.md`：容器是壳，Frame 是按 Goal 的工作面，目录里的东西是可拖资产。视觉沿用 Calm Desktop。

## 这版改了什么

- **保留：** 点阵依赖图、258×190 纸面节点、状态/标题/caption、「属于…」、右上角 `.goal-canvas-open`（maximize）。点它、或双击节点，仍打开原来的 Goal 工作框（终端 + 信息/时间线）。
- **改成：** 只在卡片右上角、原展开按钮左侧，加一个 Frame 按钮。点它才打开该 Goal 的 Frame Tab。
- **忽略：** 卡片内对话、用 Frame 替换原工作框、去掉依赖箭头和「目标关系」。

## 启动

```sh
python3 -m http.server 64521 --bind 127.0.0.1 --directory docs/design/workbench-frame-container
```

打开 [http://127.0.0.1:64521/](http://127.0.0.1:64521/)。

可选：`?tab=frame`、`?workspace=1`、`?project=spark`、`?dark=1`、`?en=1`。

## 建议怎么看

1. 默认停在 **Goal 画布**。三张现生产形态的 Goal 卡，有依赖箭头。右上角两个 28px 图标：左边新加的 Frame，右边仍是原来的展开。
2. 点原来的展开（或双击卡片）→ 打开现有 Goal 工作框，不是 Frame。
3. 点新的 Frame 按钮 → 顶栏多一个该 Goal 的 Frame Tab。
4. 切到 Frame Tab 后，把左侧 Session / Feed / 交付物拖进画布。拖到 Goal 画布会被拒绝。
5. 点目录里的 Goal 只选中主画布上的卡片，不新开 Frame，也不打开工作框。
6. 切到「灵感收集」看空 Frame；关 Frame Tab 后构图还在，卡片还在。
