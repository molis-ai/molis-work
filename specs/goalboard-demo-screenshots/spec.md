# Molis Work README 产品演示截图集

## 完成等级

本 Goal 达到 **可直接用于 README 的真实演示素材（Level 4）**：截图来自当前 Web 页面、实际 Molis Work `.app` 与真实 Codex Desktop Mock Session，不用静态高保真稿冒充产品。

## 背景与目标

README 需要用少量截图证明 Molis Work 的完整使用方式，而不是重复解释功能。截图应分别回答：独立工作站如何工作、复杂关系如何理解、窄窗如何伴随 Harness、Web 与 Desktop 如何选择。

## 范围

- 桌面宽屏三栏：Goal Navigator、Goal Focus、Goal-bound Runtime 同屏，保留 TitleBar 与窗口边界。
- 复杂 Goal Graph：列表/Graph 入口、关系方向、分组、状态、当前焦点与 Goal Focus 同屏。
- 桌面窄屏三状态：Goals、Focus、Runtime；三张图使用相同宽度与主题。
- Harness 同屏：真实 Codex Mock Session 与 Molis Work Desktop 并排，展示同一 Goal 事实。
- Web：使用浏览器语境展示 Goal Tree、Goal Detail 与 Runtime，不伪装成桌面端。
- 最终素材进入 `docs/screenshots/`；内部原始截图与检查证据保留在 `.impeccable/qa/`。

## 内容与隐私

- 主演示优先使用可重建的 `Molis Work 示例项目`；复杂 Graph 使用已经验收的 Mock Goal 网络。
- 不修改真实业务项目，不伪造 Claim、Run、Evidence、关系或完成状态。
- Codex 侧栏的无关任务、用户身份和桌面文件名必须打码；当前 Mock Session 与 Molis Work 内容保持可读。
- 不在同一张图重复表达同一价值；每张图只承担一个传播任务。

## 非目标

- 不修改数据模型、状态机、权限、Goal 生命周期、Runtime/TUI 契约或其他后台功能。
- 不在本 Goal 中重写 README 文案。
- 不把已确认的参考图直接当成最终截图。

## 验收标准

1. 最终截图覆盖桌面三栏、列表与 Graph、三个窄屏状态、Harness 同屏和 Web。
2. 桌面截图能明确看见原生窗口/TitleBar；Web 截图能明确看见浏览器语境。
3. 所有关键文字在 README 常见显示宽度下仍可读，无横向溢出、遮挡或错误状态。
4. Harness 同屏图来自真实 Codex Mock Session，隐私区域已处理。
5. 文件名稳定、尺寸合理，可直接由 README 引用。

## 验证

- 逐张视觉检查窗口属性、主题、裁切、信息密度和文字可读性。
- 通过真实 `.app` 检查 Goals / Focus / Runtime 与宽屏三栏。
- 通过浏览器检查 Web 宽屏和复杂 Graph，无横向溢出。
- `sips -g pixelWidth -g pixelHeight docs/screenshots/<file>` 检查最终尺寸。
- `pnpm test` 证明截图准备没有引入功能回归。
