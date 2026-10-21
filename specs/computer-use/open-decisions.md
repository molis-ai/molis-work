# Computer Use 待决事项（2026-10-18）

状态：第 1 节已定（用户 2026-10-18 选 A：先拿真机事实，独立进程的面板继续拒绝）；第 2 节等真机数据（BL-326）。这不是任务书；两项能力在 [#721](https://github.com/molis-ai/molis-work/pull/721)（2026-10-18 合入 main，`7509b10ad`）里明确标为部分，真机验收按 [acceptance-runbook.md](acceptance-runbook.md) 晚点做（BL-325）；现状与交接见 [spec.md](spec.md)「交接（2026-10-20）」。

## 1. 打开/保存面板（CU-G09）

**现状**

- driver 观察目标应用前台窗口的辅助功能树；sheet、对话框、浮层已经有可读的角色名。
- 落点校验要求该点最上层的窗口与辅助功能元素都属于目标应用（同一个 pid）。
- macOS 可能把打开/保存面板放在 `com.apple.appkit.xpc.openAndSavePanelService`，那是另一个进程；也可能只是目标窗口的 sheet。还没有真机记录证明这台机器上是哪一种。

**先做的验证**（真机，runbook 的扩展）

1. 在 TextEdit 用「文件 › 保存」或「导出」，记录 `app.state.windows`、`probe.point` 在面板上的返回、AX 树里有没有 `AXSheet` 子节点、面板的 owner pid。
2. 如果面板是目标窗口的 `AXSheet` 且 pid 相同：现有实现应已可用，补一条真机场景即可。
3. 如果是另一个 pid：现有策略会按 `outside-target` 拒绝。

**选项**

- **A（推荐先做；用户 2026-10-18 选定）**：只把 sheet 路径补成真机用例；独立进程的面板继续拒绝，请用户自己完成面板。代码不动，先拿到事实。
- **B**：为“目标应用打开的保存/打开面板”加策略例外，只允许该面板的窗口/角色、只允许文件名输入与确认/取消，不接受任意别的进程。要改落点校验、S-25 测试与 `SECURITY-INVARIANTS.md`；风险高，需用户确认后才动。
- **C**：用菜单/键盘走不弹面板的路径（默认文件名、另存到已知位置），避开面板；覆盖不了需要选目录或改文件名的任务。

## 2. 模型主动请求的 zoom（CU-G08）

**现状**

- 树被截断或没有可点节点时，driver 自动给动作落点周围 400×300 点的 2 倍裁剪；模型不能主动要求看某个区域。
- Prologue 的 `UiAction` 与观察种类是固定闭集；加 zoom 需要 Prologue 合同加一条观察/回执能力，再换 vendor 包。

**提议（等真机数据）**

- 如果自动裁剪 + OCR 在密集 UI 上仍不够，向 Prologue 提一个 typed observation（例如 `screenshot-region`：`rect` + `scale ≤ 2`），仍走同一条截图脱敏与密码框拒绝；Molis 的 adapter/driver/helper 加实现和测试。
- 影响：Prologue PR、vendor 包替换、公开 API/动作合同快照（若新增动作）、桌面页面的说明；消费者是 `horizontal/agent-host` 与 `apps/local-host`。
- 现在不做：没有真机证据说明自动裁剪不够。

## 3. 验证矩阵（真机时逐项记录，未验证不写成已通过；没有机器的几项是 BL-327）

| 项 | 要记录 |
| --- | --- |
| 多显示器 / Retina 缩放 | 窗口在副屏、缩放 1x/2x 时的截图与落点 |
| Intel Mac / macOS 14 / 15 | 助手编译与三项权限、基本观察/点击 |
| 签名 / 公证（BL-021） | 稳定身份、更新后权限是否保留 |
| 系统打开/保存面板 | 见第 1 节 |
| Shelf 带截图 | runbook 的 CU-G03 |
