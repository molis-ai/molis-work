# BL-due-delivery-after-listener

分组：7. 平台与架构

#2348 起，无监听的交付已失败并保留登记。其后独立复核复现了监听异步写入失败时的丢失。本轮的 [B2R-03](../b108-review-remediation/spec.md) 让宿主等待写入回执，Images 按登记重投中断结果。验证见 [助理提醒回归](../../tests/assistant-reminders.test.ts)。
