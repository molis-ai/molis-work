# 从已有工作开始

2026-09-25：imagegen 图稿、高保真交互、生产接线和真实 Gmail 整理闭环已完成。

- [imagegen 原型图](checklist.png)（图中账号及连接状态是设计示例；精确提示词在同目录 `checklist.prompt.txt`，也已嵌入 PNG）。
- [最终实装截图](review/checklist-comp-size.png)、[窄屏](review/checklist-mobile.png)、[深色窄屏](review/checklist-mobile-dark.png)、[总结页](review/review-desktop.png)。
- [可交互设计原型](http://127.0.0.1:4336/)：完整产品动线演示，文件、账号、模型和项目均为模拟。重启命令见 [原型 README](../prototype/README.md)。
- [生产入口预览](http://127.0.0.1:4337/onboarding?mode=new-project)：真实实现，使用隔离测试 Home。文件和粘贴内容真实保存到本机；该 Home 未配置 Google 或文字模型。
- [需求与实施范围](../../../../specs/molis-work-context-onboarding/spec.md)、[验证记录](verification.md)、[本切片设计规范](DESIGN.md)。

## 首批已经接通

来源勾选/全选 → 选择范围或连接 Gmail → 读取内容 → 模型整理并显示来源 → 编辑/确认 → 项目中的 Pages 摘要与原文快照。首次使用和新项目共用入口，空白创建只需名称，不再强制 Goal 或 Runtime。

账号连接复用全局 Connector；Gmail 从清单打开 Google 官方 OAuth，state/PKCE 绑定本次整理，返回后继续。普通用户不需要填写 Client ID、Secret 或 Token。产品端仍须配置正式 OAuth 客户端并完成适用的提供商审核。

内容归 Cognia，文字总结通过现有 Prologue 模型端口，采用后的工作文档归 Pages，项目生命周期归 Projects。首批无需用户先安装这些内置插件。

## 当前边界

浏览器通过粘贴正文带入，聊天通过导出的文本文件带入；尚未开发自动读取浏览器标签页和 IM 实时连接。首批一轮形成一个可编辑项目建议，多项目自动归类保留在演示原型。只做本次整理，不持续同步。

用户亲自完成 Google 授权后，已按确认范围读取最近 7 天最多 20 封正文，经 Cognia → Prologue + MiniMax-M3 分批整理，编辑采用后保存 1 份摘要和 20 份来源文档。[打开实际项目](http://127.0.0.1:4339/projects/project-onboarding-803a77fa-a21a-481d-a22d-565ff8331293/)。原生系统浏览器打开及拒绝返回已实测。

最终摘要经过人工精炼；正式 OAuth 客户端和发布安装包尚未验收。无模型时仍可先带入资料创建项目。完整证据与自动化限制见验证记录。
