# 生成插件：AI 经 Prologue

本章供创作台的设计和代码 Agent 直接挂载，是 molis-prologue-ai 在生成插件沙箱中的适用规则。完整 Native/Host 开发规则见相邻 Skill `molis-prologue-ai/SKILL.md`，生成插件不自行构造 Runtime。

## 设计时

- 讲清模型读哪些材料、产出什么、结果在哪里展示或保存、用户何时确认。AI 调用放在明确的 command 按钮里，不放在自动刷新的 query。
- 在操作合同 `effects.capabilities` 声明 `model.generate`。发现与调用以当前 `developer/capabilities.json` 为准；不写新的模型供应商 HTTP、密钥设置或硬编码模型名。
- 没有模型、超时、空回答、无效结构、用户取消时保留输入和已有结果，提供明确状态与重试入口。不要拿占位内容冒充成功。
- 需要带工具的多轮 Agent、流式对话或图片时先核对目录是否有对应能力；`model.generate` 只承诺一次文字生成，不能用提示词假装提供缺少的平台功能。

## 实现时

```ts
const { text } = await sdk.capability.call('model.generate', {
  instructions: '提炼为三条中文要点，每条不超过 40 字，只输出要点。',
  input: originalText,
}) as { text: string };
const summary = text.trim();
if (!summary) throw Object.assign(new Error('没有生成正文，请重试'), { code: '合同中声明的错误码' });
```

`originalText` 来自当前操作已校验的输入；示例错误码必须换成冻结合同中实际声明的值。先获得有效结果，再按本插件约定保存并返回严格合同结果。结构化输出要验证字段和含义，解析失败保留原文供恢复，不写伪造的默认成功数据。

调用链是 `sdk.capability.call` → 沙箱 Broker 的授权能力 → Local Host → 同一 Home 的 Prologue Runtime → 模型。身份、授权、凭据、取消、调用预算由宿主负责；沙箱没有 `caller.beforeEffect()`，不要编造该 SDK 方法。Native 动作的并发和版本提交规则由平台实现，不能在生成代码中绕过 Broker 直连网络。

一次请求要重试时复用保存的请求身份；每次用时间或随机数生成新幂等键会造成重复副作用。若平台能力没有声明幂等支持，不声称重试不会重复收费。

## 验证时

安装前模型能力由替身代答，只能证明接线、结构、保存和错误分支；不能据此宣称真实模型质量已验收。沿用 `developer/` 提供的测试接口，覆盖合同错误及输入/已有结果保留。安装后再用已配置模型体验主路径和失败恢复。
