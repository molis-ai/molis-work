# Jelly 原生组件第三方声明

`jelly-whisper` 使用 argmax-oss-swift 的 WhisperKit / ArgmaxCore。直接依赖固定为 **1.0.0**（提交 `25c62997041c134b03ca82731ce2f6fd2cae1eb9`），采用 MIT License，版权为 `Copyright (c) 2024 argmax, inc.`。完整许可随本目录的 `licenses/argmax-oss-swift-LICENSE.txt` 分发。

SwiftPM 锁文件另包含 swift-argument-parser **1.8.2**（提交 `6a52f3251125d74daf04fcbd5e6f08a75d074382`），它是上游 CLI 的依赖；本 helper 只链接 WhisperKit 产品。其 Apache 2.0 + Runtime Library Exception 许可保留在 `licenses/swift-argument-parser-LICENSE.txt`。本项目没有修改这两个上游包的源码。

准确依赖身份见 `whisper/Package.resolved`。源码和二进制依赖许可不代表语音模型许可；模型由用户明确选择后单独下载，不包含在插件分发包中。

本次审计未在原 Jelly 仓库找到 LICENSE 文件或 Package.swift / README 的许可证声明，因此不将“原 Jelly 为 MIT”记为事实。本仓库新增 helper 是面向其公开行为和依赖 API 的独立适配实现。
