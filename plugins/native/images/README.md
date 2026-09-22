# 图片生成

Status: `partial`
Migration Goal: `goal-reorg-f2`
Contract: `@molis-ai/molis-work-contracts/platform/plugin`，记录结构见 `@molis-ai/molis-work-contracts/modules/images`。

在 Molis Work 项目中打开「图片」，添加生图连接，填写提示词并点击生成。历史记录与图片保存在本机，可刷新后找回、预览和下载。主工作台的模型设置仍是文字模型，生图配置在本插件管理。

支持 OpenAI Images、Gemini generateContent 和兼容 OpenAI Images 的同步接口。可编辑 API 基址和模型名；基址应为 `/images/generations` 或 `/models/{model}:generateContent` 之前的部分。兼容接口的尺寸按该厂商文档填写，留空采用默认值；不承诺任意厂商协议兼容。API Key 由宿主 SecretStore 加密保存，列表、任务与图片下载不会返回 Key。

每次生成由人明确点击，费用由所连接的厂商收取。失败、超时或重启不会自动再次调用；「停止等待」仅停止本机请求，不保证厂商不继续生成或计费。重新使用提示词不立即生图。

数据：`{home}/images/images.db` 与 `{home}/images/assets/`。任务按宿主项目隔离，配置属于本机。此版不包含图生图、蒙版、多图批处理、异步厂商私有协议、远程 MCP 工具或 Artifact 发布。

官方协议依据：[OpenAI](https://developers.openai.com/api/reference/resources/images/methods/generate)、[Gemini](https://ai.google.dev/api/generate-content)、[阿里兼容 API](https://www.alibabacloud.com/help/zh/model-studio/qwen-image-generation-and-editing-api-reference)。模型示例可编辑，账号可用性以实际厂商响应为准。

验证记录见 `specs/images-plugin/verification.md`。工程和受控链路验证不等于真实厂商生图或用户验收。
