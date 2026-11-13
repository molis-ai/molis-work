# BL-assistant-card-press-scrolls

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-assistant-card-press-scrolls | 在页面里选了一段文字，助理给出操作卡；之后再选另一段，然后按卡上的「拆成目标步骤」，这一下按不出去。按下之后约 20～50 毫秒，助理对话区自己往下滚了 112px（`[data-assistant-thread]` 的 scrollTop 从 834 到 946，scrollHeight 没变），按钮跟着上移。松手时指针已经在对话区上，没有形成 click，卡一直停在 `ready`。人按下到松手大约要 100 毫秒，所以每次都按不出去；只有测试驱动在同一瞬间松手才赶在滚动之前。**复现**：在 `tests/interaction-no-crosstalk.e2e.test.ts` 的 AC-05「an action card keeps the selection…」第 1 步，把 `click` 换成按下、等 120 毫秒、再松手，不降速，本机 2 次红 2 次；`MOLIS_WORK_TEST_CPU_THROTTLE=3` 时原用例本身也约一半红（b819373250 上同样，不是新回归），CI 上两次都红。按下时 pointerdown 的目标是按钮里的文字；同一帧里卡只有一次属性变动、没有换节点 | #2046 的全量（run 43389084767，`interaction-no-crosstalk.e2e` AC-05 重跑也红） | 未实现 | 要查按下时是什么让对话区滚动：焦点离开页面框、选择条收起，或者「贴底」逻辑；然后让按下到松手之间不动布局。不改测试的点击方式去绕开它 | 无 | 高 | 助理面板 |
