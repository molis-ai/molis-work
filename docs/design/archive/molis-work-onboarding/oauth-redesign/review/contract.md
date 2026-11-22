# 本轮设计与实现约定

用户请求：用 imgen 设计原型图，再做高保真，然后开始开发。此前确认：面向广泛的个人工作用户；来源采用清单，勾选/全选；在此连接账号，用服务商 OAuth；整理已有工作后进入项目，不强迫先创建 Goal 或配置 Runtime。

这是已确定方向的 Molis Work 界面扩展，不是新视觉世界。沿用根 DESIGN.md 的 Coss、中性色、Inter / Noto Sans SC、Lucide。此前已完成的隔离高保真在 ../prototype/；本轮使用 imagegen 生成 checklist.png 并据此落实组件。用户的直接开发授权继续有效，没有再做方向抽签或额外人工批准图稿。comp 是实现参考，不声称用户已逐像素验收。

THESIS：从正在做的工作带入上下文，得到一个有资料可继续工作的项目。
OWN-WORLD：安静的中性色工作台，深浅主题一致；避免营销装饰。
STORY：带入内容 → 整理脉络 → 开始工作；一轮先形成一个项目建议。
FIRST VIEWPORT：左侧两行大标题、三步说明；右侧一个连续来源清单，页脚汇总与开始按钮。
FORM：延续已确认的双栏清单方向，无新世界 concept-roll。来源行对齐到选择、图标、名称/范围、状态与动作。窄屏按阅读顺序叠放。

能力边界：正式 UI 显示实际状态，不能把 comp 示例账号/目录写死。隔离验收 home 没有官方 Google 客户端，因此默认截图无可执行的连接按钮；配置好后清单直接出现“连接 Google”，未就绪状态和原因直接显示在来源行。聊天当前导入导出文本，浏览器当前粘贴正文，不声称已实现即时会话或浏览器自动抓取。

真实工程路径：资料写入 Cognia，整理调用 Host 的 Prologue 文字模型端口，摘要需有效 S 引用；Pages 保存项目摘要与原文快照；稳定创建请求防止重复项目。未配置模型可先带入资料创建项目。OAuth state 绑定原批次，原生桌面打开系统浏览器并轮询恢复。真实账号与真实模型调用未验收。

review-* 截图使用隔离的固定模型响应，并在正文明确标注。这仅验证排版、编辑、引用和落盘，不证明模型质量。

指定证据：review/checklist-comp-size.png（1505×1045，对照 comp 的 hero reproduction）、review/checklist-mobile.png（390 CSS px 全页）、review/checklist-mobile-dark.png（390 CSS px 全页）、review/review-desktop.png（1505 CSS px，全页）、review/review-mobile.png（390 CSS px，全页；sticky 采用按钮停在首屏底部）。其他 production-* 为工程验收补充，不作为视觉必选项。

检测器已经运行一次：两项 Inter 提示是沿用全产品字体的有意选择；progress width transition 已改为 transform。review/detector.json 为原始结果。无需再次运行 detector。
