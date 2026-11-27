# Host 原生素材组件

组件只读取公共 Host 提取器在独立临时目录写入的已授权字节。原始文件与引用由调用方管理。输入默认限 25 MiB，Shelf 的文档/图片可由可信 Host 显式采用 32 MiB；上传端限额保持各自合同。文件名不能触发网络读取。

## 文档与图片

从 Local Host 目录运行 `pnpm materials:build`。原生程序为 `native/materials/bin/molis-material`（源码 `MolisMaterial.swift`），依赖 macOS 自带的 Vision、PDFKit、AppKit，最低目标 macOS 14。图片先检查像素上限，PDF 最多 100 页，正文最多 200 万字符。图片/扫描页使用 OCR；PDF 有文字的页面直接读文字。缺页、空页、截断或仅第一帧都返回覆盖信息。

- `molis-material capabilities`：探测 PDF 和 OCR。
- `molis-material extract <临时材料> [--languages zh-Hans,en-US,ja-JP]`：输出 JSON 的 text/pages/coverage；图片页面额外提供每行 text/confidence。识别语言可选 `zh-Hans`、`zh-Hant`、`en-US`、`ja-JP`（最多 4 个，Host 的 `material-extraction.ts` 与插件沙箱守同一份名单）；成果库与未指定语言的调用共用本机默认顺序 `ja-JP,zh-Hans,zh-Hant,en-US`，按支持情况自动识别，保留日英混排里的假名，显式语言不支持时说明失败，不能静默替换。低置信度的产品提示由消费者决定。

Host 可传 AbortSignal 终止组件；等待子进程关闭后，在 finally 清除独立 `molis-material-*` 临时目录。上传的内容只在内存里，不落盘。

## 音视频

本机不转写音视频（第 112 批，用户 2026-11-25 定：删除原 `jelly-whisper` 与约 626 MB 的语音模型下载链）。音视频文件导入成果库时只保存原件并说明「不转写正文」；公开来源只读平台公开的字幕（如 B 站字幕），不读音轨。

## 证据范围

`tests/jelly-native-material.test.ts` 使用临时生成的图片/PDF和隔离目录；不读取个人材料。文档提取通过不代表真实用户素材、OCR质量或产品体验已验收。

摘要/生成通过 Agent Host/Prologue。原生提取器不承担对话或内容生成。
