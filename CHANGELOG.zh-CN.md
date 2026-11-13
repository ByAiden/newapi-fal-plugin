---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.0.0"
locale: "zh-CN"
---
# Changelog

## [1.0.0]

### Added

- 在任务插件渠道上以 `Key` 认证通过 fal 队列接口调用 fal.ai 模型端点，轮询每个请求的状态，并在完成后立即读取结果。
- 为所有声明的模型提供原生 `POST /fal/requests` 与 `GET /fal/requests/{request_id}` 路由，按 fal 的格式返回状态和结果，输出文件经网关提供下载。
- 为精选的 FLUX.1、FLUX.2 Pro、Nano Banana Pro、Seedream 4.5、Seedream 5.0 Pro、Kling v3 Pro、Kling 4.0、Wan 3.0、MiniMax H3、Gemini Omni Flash 1.2、Veo 3.1 和 Grok Imagine Video 1.5 端点提供 OpenAI Images（生成与编辑）和 Videos 入口，校验输入并显式发送决定价格的字段。
- 占位模型 `fal-endpoint-1` 至 `fal-endpoint-10`，可由渠道映射到任意其他 fal 端点 ID。
- 按模型报告用量（图片数、百万像素、输入图片数、高分辨率输出、联网搜索、秒数、分辨率、音频），并通过 `X-Fal-Billable-Units` 响应头报告 fal 自身的计费单位数；README 给出推荐价格表达式。
