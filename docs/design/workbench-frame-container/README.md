# 工作台 Frame 容器 · 高保真切片

等级 2：可交互原型。Goal 画布是主画布；每个 Goal 有自己的 Frame。不接真实数据。刷新即重置。

切片只演示空间与质感，不演示独立 Frame 插件包。产品所有权见 spec：容器是壳，Frame 是按 Goal 的工作面，目录里的东西是可拖资产。视觉沿用 Calm Desktop：点阵画布、纸面 Goal 节点、Tab 用字重和下划线定位。

## 启动

```sh
python3 -m http.server 64521 --bind 127.0.0.1 --directory docs/design/workbench-frame-container
```

打开 [http://127.0.0.1:64521/](http://127.0.0.1:64521/)。

## 建议怎么看

1. 默认停在 **Goal 画布**。卡片右上角：对话推进 / 展开 Frame。
2. 「写周报」已是对话模式。点另一张卡的展开，会在顶栏多一个该 Goal 的 Frame Tab。
3. 切到 Frame Tab 后，把左侧 Session / Feed / 交付物拖进画布。拖到 Goal 画布会被拒绝。
4. 点目录里的 Goal 只选中主画布上的卡片，不新开 Frame。
