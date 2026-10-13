# Host 原生素材组件

组件只读取公共 Host 提取器在独立临时目录写入的已授权字节。原始文件、引用与业务模型缓存目录由调用方管理；Jelly 继续使用 `jelly/imports/<sha256>.<扩展名>` 和 `jelly/models`，历史附件不迁移。输入默认限 25 MiB，Shelf 的文档/图片可由可信 Host 显式采用 32 MiB；上传端限额保持各自合同。文件名不能触发网络读取或模型下载。

## 文档与图片

从 Local Host 目录运行 `pnpm materials:build`。原生程序为 `native/materials/bin/jelly-material`，依赖 macOS 自带的 Vision、PDFKit、AppKit，最低目标 macOS 14。图片先检查像素上限，PDF 最多 100 页，正文最多 200 万字符。图片/扫描页使用 OCR；PDF 有文字的页面直接读文字。缺页、空页、截断或仅第一帧都返回覆盖信息。

- `jelly-material capabilities`：探测 PDF 和 OCR。
- `jelly-material extract <临时材料> [--languages zh-Hans,en-US]`：输出 JSON 的 text/pages/coverage；图片页面额外提供每行 text/confidence。未选语言保留原有中英文默认，显式语言不支持时说明失败，不能静默替换。低置信度的产品提示由消费者决定。


## 音视频

从 Local Host 目录运行 `pnpm materials:build:whisper`。独立 SwiftPM 工程 `whisper/Package.swift` 固定 `argmax-oss-swift` 1.0.0；生产程序为 `native/materials/bin/jelly-whisper`。使用 AVFoundation 提取音轨，WhisperKit 输出时间戳转写，视频额外采样最多 5 帧进行 Vision OCR。视频报告始终说明没有理解完整视觉内容。

模型 variant 沿用 Jelly 的 `large-v3-v20240930_626MB`。Jelly 使用的模型、tokenizer 仍在 `{home}/jelly/models`，不会借用原 Jelly 的模型库。`capabilities <模型目录>` 只探测；没有完整模型/tokenizer时默认返回 `model_required`，不会下载。仅调用方明确提供 `allowModelDownload: true`（Jelly 上传为 `allow_model_download: true`） 才启用约 626 MB 的模型及 tokenizer 下载。

Host 可传 AbortSignal 终止组件；等待子进程关闭后，在 finally 清除独立 `molis-material-*` 临时目录及音轨。已下载的模型保留供重试；上传的内容只在内存里，不落盘。转写回调进度只是阶段反馈，不能被当作准确剩余时间。

## 证据范围

`tests/jelly-native-material.test.ts` 使用临时生成的图片/PDF和隔离目录；不读取个人材料。文档提取通过不代表真实用户素材、OCR质量、音视频模型质量或产品体验已验收。未授权模型下载时，只验证无模型门禁、静音视频OCR和清理路径，语音模型质量仍需显式启用后用代表性材料验收。

摘要/生成通过 Agent Host/Prologue。已删除没有生产调用方的本机 summarize 分支，原生提取器不承担对话或内容生成。
