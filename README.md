---
translations:
  zh-CN: README.zh-CN.md
---
# fal.ai

**English** | [简体中文](README.zh-CN.md)

Runs [fal.ai](https://fal.ai/) model endpoints through fal's [queue API](https://fal.ai/docs/documentation/model-apis/inference/queue). A curated set of current image and video models answers the OpenAI Images and Videos APIs. Other fal endpoints run through the plugin's own fal route, using ten placeholder models that the channel maps to the endpoints you choose.

## Channel setup

- Install the plugin, then add a channel of the Task Plugin type and bind it to `byaiden_fal`.
- The key is a fal API key from the [fal dashboard](https://fal.ai/dashboard/keys). The plugin sends it as `Authorization: Key YOUR_FAL_KEY`.
- Leave the API address empty to use `https://queue.fal.run`. Its backup host `https://queue.falrun.com`, or a proxy in front of the queue, also works; do not use the synchronous `https://fal.run` host.
- Add the models you offer to the channel. Model names are fal endpoint ids, such as `fal-ai/flux/dev`; the full list is below.
- To offer any other fal endpoint, add one of the placeholder models `fal-endpoint-1` to `fal-endpoint-10` and map it to the endpoint id in the channel's model mapping, for example `{"fal-endpoint-1": "fal-ai/recraft/v3/text-to-image"}`. Clients then call `fal-endpoint-1`. The gateway serves only the models the plugin declares, so an endpoint id that is neither curated nor behind a placeholder is refused, and channel aliases of a placeholder get no usage fields to price.

## Models and endpoints

| Endpoint | What it does | Models |
| --- | --- | --- |
| `POST /fal/requests` | fal's queue: `{"model", "input", "priority"?, "start_timeout"?}`; `input` is the fal endpoint's own input | every declared model |
| `GET /fal/requests/{request_id}` | Status and result in fal's shape | every declared model |
| `POST /v1/images/generations` | OpenAI Images API: `prompt`, `n`, `size`, `output_format`, plus fal's own fields such as `image_size`, `aspect_ratio`, `resolution`, `seed` | curated image models |
| `POST /v1/images/edits` | OpenAI image edits; every `image` goes to `image_urls` | the curated `.../edit` image models |
| `POST /v1/videos` | OpenAI video API: `prompt`, `seconds`, `size`, `input_reference`, plus fal's own fields such as `resolution`, `aspect_ratio`, `generate_audio` | curated video models |

Curated image models: `fal-ai/flux/dev`, `fal-ai/flux/schnell`, `fal-ai/flux-2-pro`, `fal-ai/flux-2-pro/edit`, `fal-ai/nano-banana-pro`, `fal-ai/nano-banana-pro/edit`, `fal-ai/bytedance/seedream/v4.5/text-to-image`, `fal-ai/bytedance/seedream/v4.5/edit`, `bytedance/seedream/v5/pro/text-to-image`, `bytedance/seedream/v5/pro/edit`.

Curated video models, each as text to video and image to video: `fal-ai/kling-video/v3/pro/...`, `kling/v4/...`, `alibaba/wan-3.0/...`, `minimax/h3/...`, `google/gemini-omni-flash/v1.2/...`, `xai/grok-imagine-video/v1.5/...` (`text-to-video` and `image-to-video`), and `fal-ai/veo3.1` with `fal-ai/veo3.1/image-to-video`.

The fal routes also work under the plugin's prefix, as `/byaiden_fal/fal/requests`. Clients poll `GET /fal/requests/{request_id}`: `status` is `IN_QUEUE`, `IN_PROGRESS` or `COMPLETED`; a finished request carries the model output in `response`, with every fal media URL replaced by the gateway's download address, and a failed one carries `error`. For a task from `POST /v1/videos`, clients poll `GET /v1/videos/{task_id}` and download the file from `GET /v1/videos/{task_id}/content`. The OpenAI Images endpoints wait for the images and answer with their URLs, or with base64 data when the request sets `response_format: "b64_json"`.

On curated models the plugin checks the input against the model's documented fields and sends the price-setting fields (`num_images`, `image_size` or `resolution`, `duration`, the audio switch) explicitly, so the reserved charge matches what fal renders. Placeholder endpoints pass `input` to fal as it is.

## Billing

Each model has its own usage fields; save a task expression per model. Prices are USD, and the gateway charges USD x 500000 quota before group ratios.

- Image models report `images` (output images), `megapixels` (each image rounded up to whole megapixels of 1024 x 1024 pixels, then summed), `input_images`, `large_output` (Nano Banana Pro at `4K`, Seedream 5.0 Pro above 1536 x 1536), `web_search` and `units`.
- Video models report `seconds`, `resolution` (`360p`, `480p`, `720p`, `768p`, `1080p`, `2k`, `4k`), `audio` and `units`.
- The placeholder models report `units` only.
- `units` is fal's own billing unit count. fal returns it in the `X-Fal-Billable-Units` header of the result, already counted in the unit the endpoint is priced in, so the cost is `units` times the endpoint's unit price from [fal's pricing API](https://fal.ai/docs/documentation/model-apis/pricing) or the model page. Until the result arrives, the plugin reserves an estimate: requested images, megapixels or seconds on curated models, and on placeholders the requested `num_images`, the requested `duration` in seconds, or one unit.
- When the task finishes, images settle on the images fal delivered and their real sizes, and `units` settles on fal's header when present. Failed requests are refunded in full; fal does not charge them either.

Recommended expressions at fal's list prices on the day of writing (check each model page before use, and add your margin):

| Model | Expression |
| --- | --- |
| `fal-ai/flux/dev` | `tier("base", u("megapixels") * 0.025)` |
| `fal-ai/flux/schnell` | `tier("base", u("megapixels") * 0.003)` |
| `fal-ai/flux-2-pro` | `tier("base", (u("images") + u("megapixels")) * 0.015)` |
| `fal-ai/flux-2-pro/edit` | `tier("base", (u("images") + u("megapixels") + u("input_images")) * 0.015)` |
| `fal-ai/nano-banana-pro`, `.../edit` | `u("large_output") == true && u("web_search") == true ? tier("4k search", u("images") * 0.3 + 0.015) : u("large_output") == true ? tier("4k", u("images") * 0.3) : u("web_search") == true ? tier("search", u("images") * 0.15 + 0.015) : tier("standard", u("images") * 0.15)` |
| `fal-ai/bytedance/seedream/v4.5/...` (both) | `tier("base", u("images") * 0.04)` |
| `bytedance/seedream/v5/pro/text-to-image` | `u("large_output") == true ? tier("2k", u("images") * 0.135) : tier("1.5k", u("images") * 0.0675)` |
| `bytedance/seedream/v5/pro/edit` | `u("large_output") == true ? tier("2k", u("images") * (0.135 + 0.0045 * (u("input_images") - 1))) : tier("1.5k", u("images") * (0.0675 + 0.0045 * (u("input_images") - 1)))` |
| `fal-ai/kling-video/v3/pro/...` (both) | `u("audio") == true ? tier("audio", u("seconds") * 0.168) : tier("muted", u("seconds") * 0.112)` |
| `kling/v4/...` (both) | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.235) : tier("720p", u("seconds") * 0.157)` |
| `alibaba/wan-3.0/...` (both) | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.2) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.1) : tier("480p", u("seconds") * 0.05)` |
| `minimax/h3/...` (both) | `u("resolution") == "4k" ? tier("4k", u("seconds") * 0.16) : u("resolution") == "2k" ? tier("2k", u("seconds") * 0.13) : u("resolution") == "768p" ? tier("768p", u("seconds") * 0.06) : tier("480p", u("seconds") * 0.05)` |
| `google/gemini-omni-flash/v1.2/...` (both) | `u("resolution") == "4k" ? tier("4k", u("seconds") * 0.2457) : u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.1229) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.0819) : tier("360p", u("seconds") * 0.0273)` |
| `fal-ai/veo3.1`, `fal-ai/veo3.1/image-to-video` | `u("resolution") == "4k" && u("audio") == true ? tier("4k audio", u("seconds") * 0.6) : u("resolution") == "4k" ? tier("4k muted", u("seconds") * 0.4) : u("audio") == true ? tier("audio", u("seconds") * 0.4) : tier("muted", u("seconds") * 0.2)` |
| `xai/grok-imagine-video/v1.5/...` (both) | `u("resolution") == "1080p" ? tier("1080p", u("seconds") * 0.25) : u("resolution") == "720p" ? tier("720p", u("seconds") * 0.14) : tier("480p", u("seconds") * 0.08)` |
| `fal-endpoint-1` to `fal-endpoint-10` | `tier("base", u("units") * P)`, where `P` is the unit price of the endpoint the slot maps to |

Notes on these prices: FLUX.2 Pro charges input megapixels too, and the edit expression counts each input image as one megapixel. Seedream 5.0 Pro prices are marked tentative by fal. Gemini Omni Flash also charges input tokens, which the expression leaves out. Kling v3 voice control costs more than plain audio and is not covered. Any curated model can instead be priced on `units` with its fal unit price, which follows fal's own count exactly.

## Example

```bash
curl https://your-gateway.example.com/v1/images/generations \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"model": "fal-ai/flux/dev", "prompt": "A paper boat on a calm pond, watercolor", "size": "1024x1024", "n": 1}'
```

Any fal endpoint behind a placeholder, through fal's queue:

```bash
curl https://your-gateway.example.com/fal/requests \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"model": "fal-endpoint-1", "input": {"prompt": "A lighthouse at dusk", "style": "digital_illustration"}}'
```

Poll the request with the `request_id` from the reply:

```bash
curl https://your-gateway.example.com/fal/requests/{request_id} \
  -H "Authorization: Bearer ***"
```

## Limits

- Native routes take only `Authorization: Bearer` with a gateway token; fal's own SDKs, which send `Key` auth to fal's URLs, cannot point at the gateway unchanged.
- `sync_mode: true` is rejected, because its data-URI output leaves nothing to fetch from the queue. Webhooks are not offered; the gateway polls.
- Inputs are URLs or data URIs. On the OpenAI endpoints, uploaded files are sent to fal as data URIs. `mask` is not supported on image edits.
- fal keeps a request's result for one hour, or six minutes when it is 10 KB or larger, so the gateway reads it as soon as the status turns `COMPLETED`. Output files stay on fal's media hosts until the fal account's media expiration removes them; the gateway serves the downloads from there.
- Only output files on fal's media hosts (`fal.media`, `*.fal.media`, `*.fal.ai`, `*.fal.run`, and `storage.googleapis.com/falserverless/`) become downloadable artifacts. Outputs that are text only are returned as they are.
- The OpenAI Images endpoints wait up to the gateway's protocol timeout (`TASK_PLUGIN_PROTOCOL_TIMEOUT_SECONDS`, 600 seconds by default). A client that gives up and retries starts a new, separately charged request.
