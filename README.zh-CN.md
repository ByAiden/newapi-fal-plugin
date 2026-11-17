---
locale: zh-CN
---
# fal.ai

[English](README.md) | **简体中文**

通过 fal 的[队列接口](https://fal.ai/docs/documentation/model-apis/inference/queue)调用 [fal.ai](https://fal.ai/) 模型端点。一组精选的当前图片和视频模型可通过 OpenAI Images 与 Videos 接口调用。其他 fal 端点走插件自带的 fal 路由：插件提供十个占位模型，由渠道映射到你选定的端点。

## 渠道设置

- 安装插件后，新建「任务插件」类型的渠道并绑定 `byaiden_fal`。
- 密钥填写 [fal 控制台](https://fal.ai/dashboard/keys)中的 fal API Key。插件以 `Authorization: Key YOUR_FAL_KEY` 发送。
- API 地址留空即使用 `https://queue.fal.run`。也可填写备用地址 `https://queue.falrun.com` 或队列前面的代理；不要填写同步接口地址 `https://fal.run`。
- 在渠道中添加要提供的模型。模型名就是 fal 端点 ID，例如 `fal-ai/flux/dev`，完整列表见下文。
- 要提供其他任意 fal 端点，请添加占位模型 `fal-endpoint-1` 至 `fal-endpoint-10` 中的一个，并在渠道的模型映射中把它映射到端点 ID，例如 `{"fal-endpoint-1": "fal-ai/recraft/v3/text-to-image"}`，客户端随后以 `fal-endpoint-1` 调用。网关只服务插件声明的模型：既非精选、也不在占位模型之后的端点 ID 会被拒绝；占位模型的渠道别名也没有可定价的用量字段。

## 模型与接口

| 接口 | 用途 | 模型 |
| --- | --- | --- |
| `POST /fal/requests` | fal 队列：`{"model", "input", "priority"?, "start_timeout"?}`，`input` 为该 fal 端点自身的输入 | 所有声明的模型 |
| `GET /fal/requests/{request_id}` | 以 fal 的格式返回状态和结果 | 所有声明的模型 |
| `POST /v1/images/generations` | OpenAI Images 接口：`prompt`、`n`、`size`、`output_format`，以及 fal 自身字段如 `image_size`、`aspect_ratio`、`resolution`、`seed` | 精选图片模型 |
| `POST /v1/images/edits` | OpenAI 图片编辑；所有 `image` 传入 `image_urls` | 精选的 `.../edit` 图片模型 |
| `POST /v1/videos` | OpenAI 视频接口：`prompt`、`seconds`、`size`、`input_reference`，以及 fal 自身字段如 `resolution`、`aspect_ratio`、`generate_audio` | 精选视频模型 |

精选图片模型：`fal-ai/flux/dev`、`fal-ai/flux/schnell`、`fal-ai/flux-2-pro`、`fal-ai/flux-2-pro/edit`、`fal-ai/nano-banana-pro`、`fal-ai/nano-banana-pro/edit`、`fal-ai/bytedance/seedream/v4.5/text-to-image`、`fal-ai/bytedance/seedream/v4.5/edit`、`bytedance/seedream/v5/pro/text-to-image`、`bytedance/seedream/v5/pro/edit`。

精选视频模型，均含文生视频和图生视频：`fal-ai/kling-video/v3/pro/...`、`kling/v4/...`、`alibaba/wan-3.0/...`、`minimax/h3/...`、`google/gemini-omni-flash/v1.2/...`、`xai/grok-imagine-video/v1.5/...`（`text-to-video` 与 `image-to-video`），以及 `fal-ai/veo3.1` 和 `fal-ai/veo3.1/image-to-video`。

fal 路由也可在插件前缀下访问，如 `/byaiden_fal/fal/requests`。客户端轮询 `GET /fal/requests/{request_id}`：`status` 为 `IN_QUEUE`、`IN_PROGRESS` 或 `COMPLETED`；完成的请求在 `response` 中带回模型输出，其中所有 fal 媒体地址都换成网关下载地址；失败的请求带 `error`。通过 `POST /v1/videos` 提交的任务，客户端轮询 `GET /v1/videos/{task_id}`，并从 `GET /v1/videos/{task_id}/content` 下载文件。OpenAI Images 接口会等待图片生成，返回图片 URL；请求设置 `response_format: "b64_json"` 时返回 base64 数据。

对精选模型，插件按该模型文档列出的字段校验输入，并显式发送决定价格的字段（`num_images`、`image_size` 或 `resolution`、`duration`、音频开关），使预扣费用与 fal 实际生成一致。占位端点的 `input` 原样转交 fal。

## 计费

每个模型有各自的用量字段，请为每个模型分别保存任务表达式。价格单位为美元，网关按 美元 x 500000 扣减额度（未计分组倍率）。

- 图片模型报告 `images`（输出图片数）、`megapixels`（每张图片按 1024 x 1024 像素为一百万像素向上取整后求和）、`input_images`、`large_output`（Nano Banana Pro 的 `4K`，Seedream 5.0 Pro 超过 1536 x 1536）、`web_search` 和 `units`。
- 视频模型报告 `seconds`、`resolution`（`360p`、`480p`、`720p`、`768p`、`1080p`、`2k`、`4k`）、`audio` 和 `units`。
- 占位模型只报告 `units`。
- `units` 是 fal 自己的计费单位数。fal 在结果的 `X-Fal-Billable-Units` 响应头中返回它，且已按该端点的计价单位计数，因此费用为 `units` 乘以该端点的单价（见 [fal 定价接口](https://fal.ai/docs/documentation/model-apis/pricing)或模型页面）。结果返回前，插件按估算预扣：精选模型按请求的图片数、百万像素或秒数；占位模型按请求的 `num_images`、请求的 `duration` 秒数，否则按一个单位。
- 任务完成时，图片按 fal 实际交付的张数和真实尺寸结算，`units` 有响应头时按其结算。失败的请求全额退款，fal 对失败请求也不收费。

按撰写当日 fal 公布价格给出的推荐表达式（使用前请核对各模型页面，并加上你的利润）：

| 模型 | 表达式 |
| --- | --- |
| `fal-ai/flux/dev` | `tier("base", u("megapixels") * 0.025)` |
| `fal-ai/flux/schnell` | `tier("base", u("megapixels") * 0.003)` |
| `fal-ai/flux-2-pro` | `tier("base", (u("images") + u("megapixels")) * 0.015)` |
| `fal-ai/flux-2-pro/edit` | `tier("base", (u("images") + u("megapixels") + u("input_images")) * 0.015)` |
| `fal-ai/nano-banana-pro`、`.../edit` | `u("large_output") == true && u("web_search") == true ? tier("4k search", u("images") * 0.3 + 0.015) : u("large_output") == true ? tier("4k", u("images") * 0.3) : u("web_search") == true ? tier("search", u("images") * 0.15 + 0.015) : tier("standard", u("images") * 0.15)` |
| `fal-ai/bytedance/seedream/v4.5/...`（两者） | `tier("base", u("images") * 0.04)` |
| `bytedance/seedream/v5/pro/text-to-image` | `u("large_output") == true ? tier("2k", u("images") * 0.135) : tier("1.5k", u("images") * 0.0675)` |
| `bytedance/seedream/v5/pro/edit` | `u("large_output") == true ? tier("2k", u("images") * (0.135 + 0.0045 * (u("input_images") - 1))) : tier("1.5k", u("images") * (0.0675 + 0.0045 * (u("input_images") - 1)))` |
| `fal-ai/kling-video/v3/pro/...`（两者） | `u("audio") == true ? tier("audio", u("seconds") * 0.168) : tier("muted", u("seconds") * 0.112)` |
| `kling/v4/...`（两者） | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.235) : tier("720p", u("seconds") * 0.157)` |
| `alibaba/wan-3.0/...`（两者） | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.2) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.1) : tier("480p", u("seconds") * 0.05)` |
| `minimax/h3/...`（两者） | `u("resolution") == "4k" ? tier("4k", u("seconds") * 0.16) : u("resolution") == "2k" ? tier("2k", u("seconds") * 0.13) : u("resolution") == "768p" ? tier("768p", u("seconds") * 0.06) : tier("480p", u("seconds") * 0.05)` |
| `google/gemini-omni-flash/v1.2/...`（两者） | `u("resolution") == "4k" ? tier("4k", u("seconds") * 0.2457) : u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.1229) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.0819) : tier("360p", u("seconds") * 0.0273)` |
| `fal-ai/veo3.1`、`fal-ai/veo3.1/image-to-video` | `u("resolution") == "4k" && u("audio") == true ? tier("4k audio", u("seconds") * 0.6) : u("resolution") == "4k" ? tier("4k muted", u("seconds") * 0.4) : u("audio") == true ? tier("audio", u("seconds") * 0.4) : tier("muted", u("seconds") * 0.2)` |
| `xai/grok-imagine-video/v1.5/...`（两者） | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.25) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.14) : tier("480p", u("seconds") * 0.08)` |
| `fal-endpoint-1` 至 `fal-endpoint-10` | `tier("base", u("units") * P)`，`P` 为该占位模型所映射端点的单价 |

价格说明：FLUX.2 Pro 也对输入图片按百万像素收费，编辑表达式把每张输入图片按一百万像素计。Seedream 5.0 Pro 的价格被 fal 标为暂定。Gemini Omni Flash 还会收取输入 token 费用，表达式未计入。Kling v3 的语音控制比普通音频更贵，未包含在内。任何精选模型也可改为按 `units` 乘以其 fal 单价定价，与 fal 自己的计数完全一致。

## 示例

```bash
curl https://your-gateway.example.com/v1/images/generations \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"model": "fal-ai/flux/dev", "prompt": "A paper boat on a calm pond, watercolor", "size": "1024x1024", "n": 1}'
```

通过 fal 队列调用占位模型背后的任意 fal 端点：

```bash
curl https://your-gateway.example.com/fal/requests \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"model": "fal-endpoint-1", "input": {"prompt": "A lighthouse at dusk", "style": "digital_illustration"}}'
```

用返回的 `request_id` 轮询：

```bash
curl https://your-gateway.example.com/fal/requests/{request_id} \
  -H "Authorization: Bearer ***"
```

## 经由另一个 New API 网关

外层网关转发到持有 fal 渠道的中间网关时，两边都安装本插件：

- 中间网关：按「渠道设置」建任务插件渠道，设置自己的价格以及占位模型的模型映射。
- 外层网关：新建 **New API** 渠道（类型 60），Base URL 填中间网关地址，密钥填中间网关的令牌，在「上游任务插件」里选择本插件，并添加精选模型和要用的占位模型；占位模型在外层不要做映射（中间网关只接受声明过的模型名，由它自己映射）。

外层插件会把所有请求（包括 OpenAI 请求）以 `{model, input}`（设置了 `priority`、`start_timeout` 时一并带上）发到中间网关的 `POST /byaiden_fal/fal/requests`，并在 `GET /byaiden_fal/fal/requests/{id}` 查询，用 `Authorization: Bearer` 加令牌鉴权（不用 fal Key）。下载走中间网关签名的链接，中间网关的服务器地址（系统设置）必须能被外层网关访问。外层的原生路由和视频返回外层自己的下载地址；OpenAI 图片回复里是中间网关签名的链接，不需要密钥即可下载。

外层计费：`images`、`megapixels`、`input_images`、`large_output`、`web_search`、`seconds`、`resolution`、`audio` 都按请求和交付的文件以相同方式计算，上面按模型写的表达式可以直接使用。fal 的 `X-Fal-Billable-Units` 响应头不会经过中间网关，所以外层的 `units` 只是估算值（精选图片模型按交付的图片计算，其他保持预扣值）。外层请用按模型写的表达式定价，不要用 `units`；占位模型在外层的 `units` 按每次请求、每张请求的图片或每秒请求时长计。

## 限制

- 插件路由只接受携带网关令牌的 `Authorization: Bearer`；fal 官方 SDK 以 `Key` 认证访问 fal 自身地址，不能直接指向网关使用。
- `sync_mode: true` 会被拒绝，因为它以 data URI 返回输出，队列中无结果可取。不提供 webhook，由网关轮询。
- 输入为 URL 或 data URI。在 OpenAI 接口上传的文件会以 data URI 发给 fal。图片编辑不支持 `mask`。
- fal 只保留请求结果一小时，结果达到 10 KB 时只保留六分钟，因此网关在状态变为 `COMPLETED` 后立即读取结果。输出文件保存在 fal 的媒体主机上，直到 fal 账户的媒体过期设置将其删除；网关从那里提供下载。
- 只有位于 fal 媒体主机（`fal.media`、`*.fal.media`、`*.fal.ai`、`*.fal.run` 以及 `storage.googleapis.com/falserverless/`）上的输出文件会成为可下载产物。纯文本输出原样返回。
- OpenAI Images 接口最多等待网关的协议超时（`TASK_PLUGIN_PROTOCOL_TIMEOUT_SECONDS`，默认 600 秒）。客户端放弃后重试会发起一个新的、单独计费的请求。

经 New API 上游下载文件时，调用中间网关 `/v1/tasks/{id}/artifacts/{key}/content`，携带 Bearer 令牌；直接访问厂商 CDN 时仍不携带密钥。
