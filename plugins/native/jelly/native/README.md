# Jelly 原生素材组件

组件只读取 Molis Work Host 保存的上传副本，不连接原 Jelly 数据目录。上传限 25 MB；文件保存到 Molis Work home 的 `jelly/imports/<sha256>.<扩展名>`。读取 URL、选择本机任意路径和模型下载均不会由文件名触发。

## 文档与图片

从插件目录运行 `pnpm native:build`。原生程序为 `native/bin/jelly-material`，依赖 macOS 自带的 Vision、PDFKit、AppKit，最低目标 macOS 14。图片先检查像素上限，PDF 最多 100 页，正文最多 200 万字符。图片/扫描页使用 OCR；PDF 有文字的页面直接读文字。缺页、空页、截断或仅第一帧都返回覆盖信息。

- `jelly-material capabilities`：探测 PDF、OCR、Apple Foundation Models。
- `jelly-material extract <上传副本>`：输出 JSON 的 text/pages/coverage。
- `jelly-material summarize <UTF-8文字副本>`：显式调用本机 Apple 模型；最多 12000 字符，不可用就报 `model_unavailable`，不切换其他模型。

本机 2026-09-22 编译与真实 PNG、文字/扫描混合 PDF 提取回归通过。Apple 模型探测结果为 `deviceNotEligible`；模型生成没有验收。

## 音视频

从插件目录运行 `pnpm native:build:whisper`。独立 SwiftPM 工程 `whisper/Package.swift` 固定 `argmax-oss-swift` 1.0.0；生产程序为 `native/bin/jelly-whisper`。使用 AVFoundation 提取音轨，WhisperKit 输出时间戳转写，视频额外采样最多 5 帧进行 Vision OCR。视频报告始终说明没有理解完整视觉内容。

模型 variant 沿用 Jelly 的 `large-v3-v20240930_626MB`。模型、tokenizer 只在 `{home}/jelly/models`，不会借用原 Jelly 的模型库。`capabilities <模型目录>` 只探测；没有完整模型/tokenizer时默认返回 `model_required`，不会下载。仅上传请求显式带 `allow_model_download: true` 才启用约 626 MB 的模型及 tokenizer 下载。

Host 可传 AbortSignal 终止组件，并在 finally 清除独立 `material-run-*` 音轨目录。上传副本、已下载模型仍保留供重试。转写回调进度只是阶段反馈，不能被当作准确剩余时间。

## 证据范围

`tests/jelly-native-material.test.ts` 使用临时生成的图片/PDF和隔离目录；不读取个人材料。文档提取通过不代表真实用户素材、OCR质量、音视频模型质量或产品体验已验收。未授权模型下载时，只验证无模型门禁、静音视频OCR和清理路径，语音模型质量仍需显式启用后用代表性材料验收。
