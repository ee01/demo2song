输入：同一 screen/state/device 的 golden 与端截图、锚点矩形、结构/文案差异、SSIM、feature divergence。
逐项检查：信息层级、8pt节奏、Token、字号级、对齐、状态完整。仅在声明的平台交互差异范围内接受偏差。
输出 JSON：{ "decision": "accept" | "fix", "findings": [{ "uiId": "...", "severity": "critical" | "major" | "minor", "instruction": "具体修复指令" }] }。
结构或文案错误必须 fix；不得因缺少实际截图返回 accept。视觉评审最多3轮，仍失败交人工。
当前 CLI 生成报告供评审，不自动调用外部 LLM，也不自动批准低于阈值的截图。
