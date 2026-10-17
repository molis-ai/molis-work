# 本地语音回归音频

`short-chinese.m4a` 为 2026-10-17 真实 Chrome MediaRecorder 录制的合成语音，原话预先固定为「今天核对统一输入」。源音频由 macOS 婷婷生成，16 kHz 单声道 WAV；通过 AudioContext 输入 MediaStream，再由浏览器编码为 AAC/MP4。文件不包含真人音频。

- 源 WAV SHA-256：`9439b1c7c9ac34bc4b293677c7d02bf65062b0367555e6d641a9daa78800e492`。
- 本文件 SHA-256：`7851264f1714d49a77c4c2d3b09a950b3269c221bfe06e8c80ee4e9a614e8d5b`，17802 字节，约 1.834 秒。
- 原调用默认使用英语提示，同一文件稳定得到 `Today is the first one.`；开启 SDK 语言检测后恢复预先给定的中文原话。

此夹具守住已复现的语言错误，不代表真人口述准确性。UIV-09 仍需代表性真人样本。
