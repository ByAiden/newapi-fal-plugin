// fal.ai Model APIs through fal's queue (queue.fal.run). Any fal endpoint id
// (fal-ai/flux/dev, fal-ai/kling-video/..., your own apps) runs through the
// native /fal/requests routes with fal's own input; a curated set of current
// image and video endpoints also answers the OpenAI Images and Videos APIs.
// A request is POST {base}/{endpoint_id}; its status and result live at
// {base}/{owner}/{app}/requests/{request_id}[/status].

// Pixels in one billing megapixel, as fal's FLUX pages define it.
const MEGAPIXEL = 1024 * 1024;
const MAX_IMAGES = 128;
const MAX_UNITS = 1000000;
const MAX_ARTIFACTS = 64;
const MAX_WALK_DEPTH = 8;
const QUEUE_STATES = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
const PRIORITIES = ["normal", "low"];

// fal's named image sizes.
const IMAGE_PRESETS = {
  square_hd: [1024, 1024],
  square: [512, 512],
  portrait_4_3: [768, 1024],
  portrait_16_9: [576, 1024],
  landscape_4_3: [1024, 768],
  landscape_16_9: [1024, 576],
};
const PRESET_NAMES = Object.keys(IMAGE_PRESETS);
const BANANA_RATIOS = ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8"];
const BANANA_SIDES = { "1K": 1024, "2K": 2048, "4K": 4096 };

// Curated image endpoints. family picks the request mapping and the billing
// unit; sizes lists the extra named sizes beyond fal's presets, with the side
// length a square of that size has.
const IMAGE_ENDPOINTS = {
  "fal-ai/flux/dev": { family: "flux", edit: false, maxImages: 4, keys: ["prompt", "image_size", "num_inference_steps", "seed", "guidance_scale", "num_images", "enable_safety_checker", "output_format", "acceleration"] },
  "fal-ai/flux/schnell": { family: "flux", edit: false, maxImages: 4, keys: ["prompt", "image_size", "num_inference_steps", "seed", "guidance_scale", "num_images", "enable_safety_checker", "output_format", "acceleration"] },
  "fal-ai/flux-2-pro": { family: "flux2", edit: false, maxImages: 1, keys: ["prompt", "image_size", "seed", "safety_tolerance", "enable_safety_checker", "output_format"] },
  "fal-ai/flux-2-pro/edit": { family: "flux2", edit: true, maxImages: 1, maxInputs: 10, auto: true, keys: ["prompt", "image_urls", "image_size", "seed", "safety_tolerance", "enable_safety_checker", "output_format"] },
  "fal-ai/nano-banana-pro": { family: "banana", edit: false, maxImages: 4, keys: ["prompt", "num_images", "seed", "aspect_ratio", "resolution", "output_format", "enable_web_search", "safety_tolerance", "system_prompt", "limit_generations", "thinking_level", "temperature", "top_p"] },
  "fal-ai/nano-banana-pro/edit": { family: "banana", edit: true, maxImages: 4, maxInputs: 14, keys: ["prompt", "image_urls", "num_images", "seed", "aspect_ratio", "resolution", "output_format", "enable_web_search", "safety_tolerance", "system_prompt", "limit_generations", "thinking_level", "temperature", "top_p"] },
  "fal-ai/bytedance/seedream/v4.5/text-to-image": { family: "seedream45", edit: false, maxImages: 6, sizes: { auto_2K: 2048, auto_4K: 4096 }, defaultSize: { width: 2048, height: 2048 }, keys: ["prompt", "image_size", "num_images", "max_images", "seed", "enable_safety_checker"] },
  "fal-ai/bytedance/seedream/v4.5/edit": { family: "seedream45", edit: true, maxImages: 6, maxInputs: 10, sizes: { auto_2K: 2048, auto_4K: 4096 }, defaultSize: { width: 2048, height: 2048 }, keys: ["prompt", "image_urls", "image_size", "num_images", "max_images", "seed", "enable_safety_checker"] },
  "bytedance/seedream/v5/pro/text-to-image": { family: "seedream5", edit: false, maxImages: 6, sizes: { auto_1K: 1024, "auto_1.5K": 1536, auto_2K: 2048 }, defaultSize: "auto_2K", keys: ["prompt", "image_size", "num_images", "output_format", "watermark", "enhance_prompt_mode", "enable_safety_checker"] },
  "bytedance/seedream/v5/pro/edit": { family: "seedream5", edit: true, maxImages: 6, maxInputs: 10, sizes: { auto_1K: 1024, "auto_1.5K": 1536, auto_2K: 2048 }, defaultSize: "auto_2K", keys: ["prompt", "image_urls", "image_size", "num_images", "output_format", "watermark", "enhance_prompt_mode", "enable_safety_checker", "background"] },
};

// Curated video endpoints. duration is {format, min, max, values, default}:
// "string" sends "5", "int" sends 5, "suffix" sends "8s". resolution lists
// the vendor values (null when the endpoint renders one size, fixed);
// audio names the boolean that switches sound on, or true when sound is
// always generated. image names the first-frame field of image to video.
const VIDEO_ENDPOINTS = {
  "fal-ai/kling-video/v3/pro/text-to-video": { duration: { format: "string", min: 3, max: 15, default: 5 }, resolution: null, fixed: "1080p", aspects: ["16:9", "9:16", "1:1"], audio: "generate_audio", keys: ["prompt", "negative_prompt", "aspect_ratio", "duration", "generate_audio", "cfg_scale", "shot_type", "multi_prompt", "enable_safety_checker"] },
  "fal-ai/kling-video/v3/pro/image-to-video": { duration: { format: "string", min: 3, max: 15, default: 5 }, resolution: null, fixed: "1080p", image: "start_image_url", audio: "generate_audio", keys: ["prompt", "negative_prompt", "start_image_url", "end_image_url", "duration", "generate_audio", "cfg_scale", "shot_type", "multi_prompt", "elements", "enable_safety_checker"] },
  "kling/v4/text-to-video": { duration: { format: "int", min: 3, max: 30, default: 5 }, resolution: ["720p", "1080p"], defaultResolution: "1080p", aspects: ["16:9", "9:16", "1:1", "21:9"], keys: ["prompt", "resolution", "duration", "multi_prompt", "aspect_ratio"] },
  "kling/v4/image-to-video": { duration: { format: "int", min: 3, max: 30, default: 5 }, resolution: ["720p", "1080p"], defaultResolution: "1080p", image: "start_image_url", keys: ["prompt", "start_image_url", "middle_image_urls", "end_image_url", "resolution", "duration", "multi_prompt"] },
  "alibaba/wan-3.0/text-to-video": { duration: { format: "int", min: 2, max: 30, default: 5 }, resolution: ["480p", "720p", "1080p"], defaultResolution: "1080p", aspects: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], audio: "audio", keys: ["prompt", "resolution", "aspect_ratio", "duration", "audio", "seed", "enable_prompt_expansion", "enable_thinking", "enable_safety_checker"] },
  "alibaba/wan-3.0/image-to-video": { duration: { format: "int", min: 2, max: 30, default: 5 }, resolution: ["480p", "720p", "1080p"], defaultResolution: "1080p", aspects: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], image: "start_image_url", audio: "audio", keys: ["prompt", "start_image_url", "end_image_url", "resolution", "aspect_ratio", "duration", "audio", "seed", "enable_prompt_expansion", "enable_thinking", "enable_safety_checker"] },
  "minimax/h3/text-to-video": { duration: { format: "int", min: 5, max: 15, default: 5 }, resolution: ["480P", "768P", "2K", "4K"], defaultResolution: "2K", aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], keys: ["prompt", "resolution", "aspect_ratio", "duration", "seed", "prompt_expansion_mode", "target_audio_url", "enable_safety_checker"] },
  "minimax/h3/image-to-video": { duration: { format: "int", min: 5, max: 15, default: 5 }, resolution: ["480P", "768P", "2K", "4K"], defaultResolution: "2K", image: "image_url", keys: ["prompt", "image_url", "end_image_url", "resolution", "duration", "seed", "prompt_expansion_mode", "target_audio_url", "enable_safety_checker"] },
  "google/gemini-omni-flash/v1.2/text-to-video": { duration: { format: "int", min: 3, max: 15, default: 8 }, resolution: ["360p", "720p", "1080p", "4k"], defaultResolution: "720p", aspects: ["16:9", "9:16"], audio: true, keys: ["prompt", "resolution", "aspect_ratio", "duration"] },
  "google/gemini-omni-flash/v1.2/image-to-video": { duration: { format: "int", min: 3, max: 15, default: 8 }, resolution: ["360p", "720p", "1080p", "4k"], defaultResolution: "720p", aspects: ["16:9", "9:16"], image: "image_url", audio: true, keys: ["prompt", "image_url", "end_image_url", "resolution", "aspect_ratio", "duration"] },
  "fal-ai/veo3.1": { duration: { format: "suffix", values: [4, 6, 8], default: 8 }, resolution: ["720p", "1080p", "4k"], defaultResolution: "720p", aspects: ["16:9", "9:16"], audio: "generate_audio", keys: ["prompt", "duration", "aspect_ratio", "resolution", "generate_audio", "negative_prompt", "seed", "auto_fix", "safety_tolerance"] },
  "fal-ai/veo3.1/image-to-video": { duration: { format: "suffix", values: [4, 6, 8], default: 8 }, resolution: ["720p", "1080p", "4k"], defaultResolution: "720p", aspects: ["auto", "16:9", "9:16"], image: "image_url", audio: "generate_audio", keys: ["prompt", "image_url", "duration", "aspect_ratio", "resolution", "generate_audio", "negative_prompt", "seed", "auto_fix", "safety_tolerance"] },
  "xai/grok-imagine-video/v1.5/text-to-video": { duration: { format: "int", min: 1, max: 15, default: 6 }, resolution: ["480p", "720p", "1080p"], defaultResolution: "720p", aspects: ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"], keys: ["prompt", "resolution", "aspect_ratio", "duration", "enable_safety_checker"] },
  "xai/grok-imagine-video/v1.5/image-to-video": { duration: { format: "int", min: 1, max: 15, default: 6 }, resolution: ["480p", "720p", "1080p"], defaultResolution: "720p", image: "image_url", keys: ["prompt", "image_url", "resolution", "duration", "enable_safety_checker"] },
};
const IMAGE_MODELS = Object.keys(IMAGE_ENDPOINTS);
const VIDEO_MODELS = Object.keys(VIDEO_ENDPOINTS);
const VIDEO_RESOLUTIONS = ["360p", "480p", "720p", "768p", "1080p", "2k", "4k"];

export const meta = {
  "apiVersion": 1,
  "key": "byaiden_fal",
  "name": "fal.ai",
  "icon": "Fal.Color",
  "description": {
    "en": "Run fal.ai model endpoints through fal's queue API, with OpenAI-compatible image and video entry points for popular image and video models",
    "zh": "通过 fal 队列接口调用 fal.ai 模型端点，并为常用图片和视频模型提供 OpenAI 兼容的图片与视频入口"
  },
  "version": "1.1.0",
  "author": {
    "name": "ByAiden",
    "url": "https://github.com/ByAiden"
  },
  "website": "https://fal.ai/docs/documentation/model-apis/inference/queue",
  "baseUrl": "https://queue.fal.run",
  "models": [
    "fal-ai/flux/dev",
    "fal-ai/flux/schnell",
    "fal-ai/flux-2-pro",
    "fal-ai/flux-2-pro/edit",
    "fal-ai/nano-banana-pro",
    "fal-ai/nano-banana-pro/edit",
    "fal-ai/bytedance/seedream/v4.5/text-to-image",
    "fal-ai/bytedance/seedream/v4.5/edit",
    "bytedance/seedream/v5/pro/text-to-image",
    "bytedance/seedream/v5/pro/edit",
    "fal-ai/kling-video/v3/pro/text-to-video",
    "fal-ai/kling-video/v3/pro/image-to-video",
    "kling/v4/text-to-video",
    "kling/v4/image-to-video",
    "alibaba/wan-3.0/text-to-video",
    "alibaba/wan-3.0/image-to-video",
    "minimax/h3/text-to-video",
    "minimax/h3/image-to-video",
    "google/gemini-omni-flash/v1.2/text-to-video",
    "google/gemini-omni-flash/v1.2/image-to-video",
    "fal-ai/veo3.1",
    "fal-ai/veo3.1/image-to-video",
    "xai/grok-imagine-video/v1.5/text-to-video",
    "xai/grok-imagine-video/v1.5/image-to-video",
    "fal-endpoint-1",
    "fal-endpoint-2",
    "fal-endpoint-3",
    "fal-endpoint-4",
    "fal-endpoint-5",
    "fal-endpoint-6",
    "fal-endpoint-7",
    "fal-endpoint-8",
    "fal-endpoint-9",
    "fal-endpoint-10"
  ],
  "upstreams": [
    "vendor",
    "new_api"
  ],
  "fetchMode": "per_task",
  "usageSchema": {
    "units": {
      "type": "number",
      "unit": "credit",
      "description": {
        "en": "fal billing unit price",
        "zh": "fal 计费单位单价"
      }
    }
  },
  "usageExamples": [
    {
      "label": "1 unit",
      "facts": {
        "units": 1
      }
    },
    {
      "label": "4 units",
      "facts": {
        "units": 4
      }
    }
  ],
  "usageProfiles": [
    {
      "models": [
        "fal-ai/flux/dev",
        "fal-ai/flux/schnell",
        "fal-ai/flux-2-pro",
        "fal-ai/flux-2-pro/edit",
        "fal-ai/nano-banana-pro",
        "fal-ai/nano-banana-pro/edit",
        "fal-ai/bytedance/seedream/v4.5/text-to-image",
        "fal-ai/bytedance/seedream/v4.5/edit",
        "bytedance/seedream/v5/pro/text-to-image",
        "bytedance/seedream/v5/pro/edit"
      ],
      "schema": {
        "images": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "image",
            "zh": "张"
          },
          "description": {
            "en": "Output image unit price",
            "zh": "输出图片单价"
          }
        },
        "megapixels": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "megapixel",
            "zh": "百万像素"
          },
          "description": {
            "en": "Output megapixel unit price",
            "zh": "输出百万像素单价"
          }
        },
        "input_images": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "image",
            "zh": "张"
          },
          "description": {
            "en": "Input image unit price",
            "zh": "输入图片单价"
          }
        },
        "large_output": {
          "type": "boolean",
          "description": {
            "en": "Whether high-resolution output is requested",
            "zh": "是否请求高分辨率输出"
          }
        },
        "web_search": {
          "type": "boolean",
          "description": {
            "en": "Whether web search is enabled",
            "zh": "是否启用联网搜索"
          }
        },
        "units": {
          "type": "number",
          "unit": "credit",
          "description": {
            "en": "fal billing unit price",
            "zh": "fal 计费单位单价"
          }
        }
      },
      "examples": [
        {
          "label": "FLUX.1 dev 1024x768",
          "facts": {
            "images": 1,
            "megapixels": 1,
            "input_images": 0,
            "large_output": false,
            "web_search": false,
            "units": 1
          }
        },
        {
          "label": "Nano Banana Pro 4K x2",
          "facts": {
            "images": 2,
            "megapixels": 32,
            "input_images": 0,
            "large_output": true,
            "web_search": false,
            "units": 4
          }
        },
        {
          "label": "Seedream 5.0 Pro edit 2K, 3 inputs",
          "facts": {
            "images": 1,
            "megapixels": 4,
            "input_images": 3,
            "large_output": true,
            "web_search": false,
            "units": 2
          }
        }
      ]
    },
    {
      "models": [
        "fal-ai/kling-video/v3/pro/text-to-video",
        "fal-ai/kling-video/v3/pro/image-to-video",
        "kling/v4/text-to-video",
        "kling/v4/image-to-video",
        "alibaba/wan-3.0/text-to-video",
        "alibaba/wan-3.0/image-to-video",
        "minimax/h3/text-to-video",
        "minimax/h3/image-to-video",
        "google/gemini-omni-flash/v1.2/text-to-video",
        "google/gemini-omni-flash/v1.2/image-to-video",
        "fal-ai/veo3.1",
        "fal-ai/veo3.1/image-to-video",
        "xai/grok-imagine-video/v1.5/text-to-video",
        "xai/grok-imagine-video/v1.5/image-to-video"
      ],
      "schema": {
        "seconds": {
          "type": "number",
          "unit": "second",
          "description": {
            "en": "Video generation unit price",
            "zh": "视频生成单价"
          }
        },
        "resolution": {
          "enum": [
            "360p",
            "480p",
            "720p",
            "768p",
            "1080p",
            "2k",
            "4k"
          ],
          "description": {
            "en": "Output video resolution",
            "zh": "输出视频分辨率"
          }
        },
        "audio": {
          "type": "boolean",
          "description": {
            "en": "Whether audio is generated",
            "zh": "是否生成音频"
          }
        },
        "units": {
          "type": "number",
          "unit": "credit",
          "description": {
            "en": "fal billing unit price",
            "zh": "fal 计费单位单价"
          }
        }
      },
      "examples": [
        {
          "label": "Kling v3 Pro 5s with audio",
          "facts": {
            "seconds": 5,
            "resolution": "1080p",
            "audio": true,
            "units": 5
          }
        },
        {
          "label": "Veo 3.1 8s 1080p",
          "facts": {
            "seconds": 8,
            "resolution": "1080p",
            "audio": true,
            "units": 8
          }
        },
        {
          "label": "Wan 3.0 5s 720p",
          "facts": {
            "seconds": 5,
            "resolution": "720p",
            "audio": true,
            "units": 5
          }
        }
      ]
    }
  ],
  "routes": [
    {
      "method": "POST",
      "path": "/fal/requests",
      "type": "submit",
      "decode": "submitRequest",
      "render": "requestSubmitted"
    },
    {
      "method": "GET",
      "path": "/fal/requests/:request_id",
      "type": "query",
      "taskIdParam": "request_id",
      "render": "requestStatus"
    }
  ],
  "protocols": [
    {
      "name": "openai_image",
      "models": [
        "fal-ai/flux/dev",
        "fal-ai/flux/schnell",
        "fal-ai/flux-2-pro",
        "fal-ai/flux-2-pro/edit",
        "fal-ai/nano-banana-pro",
        "fal-ai/nano-banana-pro/edit",
        "fal-ai/bytedance/seedream/v4.5/text-to-image",
        "fal-ai/bytedance/seedream/v4.5/edit",
        "bytedance/seedream/v5/pro/text-to-image",
        "bytedance/seedream/v5/pro/edit"
      ]
    },
    {
      "name": "openai_video",
      "models": [
        "fal-ai/kling-video/v3/pro/text-to-video",
        "fal-ai/kling-video/v3/pro/image-to-video",
        "kling/v4/text-to-video",
        "kling/v4/image-to-video",
        "alibaba/wan-3.0/text-to-video",
        "alibaba/wan-3.0/image-to-video",
        "minimax/h3/text-to-video",
        "minimax/h3/image-to-video",
        "google/gemini-omni-flash/v1.2/text-to-video",
        "google/gemini-omni-flash/v1.2/image-to-video",
        "fal-ai/veo3.1",
        "fal-ai/veo3.1/image-to-video",
        "xai/grok-imagine-video/v1.5/text-to-video",
        "xai/grok-imagine-video/v1.5/image-to-video"
      ]
    }
  ]
};

// The gateway reads the manifest statically, so the code below uses these copies of its values.
const PLUGIN_KEY = "byaiden_fal";
const MODEL_IDS = ["fal-ai/flux/dev","fal-ai/flux/schnell","fal-ai/flux-2-pro","fal-ai/flux-2-pro/edit","fal-ai/nano-banana-pro","fal-ai/nano-banana-pro/edit","fal-ai/bytedance/seedream/v4.5/text-to-image","fal-ai/bytedance/seedream/v4.5/edit","bytedance/seedream/v5/pro/text-to-image","bytedance/seedream/v5/pro/edit","fal-ai/kling-video/v3/pro/text-to-video","fal-ai/kling-video/v3/pro/image-to-video","kling/v4/text-to-video","kling/v4/image-to-video","alibaba/wan-3.0/text-to-video","alibaba/wan-3.0/image-to-video","minimax/h3/text-to-video","minimax/h3/image-to-video","google/gemini-omni-flash/v1.2/text-to-video","google/gemini-omni-flash/v1.2/image-to-video","fal-ai/veo3.1","fal-ai/veo3.1/image-to-video","xai/grok-imagine-video/v1.5/text-to-video","xai/grok-imagine-video/v1.5/image-to-video","fal-endpoint-1","fal-endpoint-2","fal-endpoint-3","fal-endpoint-4","fal-endpoint-5","fal-endpoint-6","fal-endpoint-7","fal-endpoint-8","fal-endpoint-9","fal-endpoint-10"];

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function present(value) {
  return value !== undefined && value !== null;
}

function given(value) {
  return present(value) && value !== "";
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// A fal endpoint id: owner/app with optional sub-paths, such as
// fal-ai/flux/dev or fal-ai/kling-video/v3/pro/text-to-video.
function endpointId(value) {
  const id = trimmed(value).replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/.test(id) || /(^|\/)\.\.?(\/|$)/.test(id))
    throw new Error("model must be a fal endpoint id such as fal-ai/flux/dev");
  return id;
}

// The fal endpoint the channel sends upstream: the mapped name first, then
// the client's. The placeholder models fal-endpoint-1 to fal-endpoint-10
// work only when the channel maps them to a real endpoint id.
function upstreamEndpoint(identity) {
  const names = [identity.upstreamModel, identity.model].map(trimmed).filter(Boolean);
  for (const name of names) {
    if (name.indexOf("/") > 0) return endpointId(name);
  }
  throw new Error((names[0] || "model") + " is not a fal endpoint id; map it to one such as fal-ai/flux/dev in the channel's model mapping");
}

// A type-60 New API channel: the same plugin answers on another gateway,
// whose native /fal/requests routes take {model, input} under the plugin's
// key with the gateway token as Authorization: Bearer. Hosts that never set
// ctx.upstream mean fal.
function viaGateway(ctx) {
  return !!(ctx && ctx.upstream && ctx.upstream.kind === "new_api");
}

// The model a request names upstream. fal gets an endpoint id; another
// gateway also takes a declared placeholder (fal-endpoint-1 to 10), which
// that gateway's channel maps to an endpoint id.
function endpointOf(ctx) {
  if (viaGateway(ctx)) {
    for (const name of [ctx.upstreamModel, ctx.model].map(trimmed).filter(Boolean)) {
      if (name.indexOf("/") > 0) return endpointId(name);
      if (MODEL_IDS.includes(name)) return name;
    }
  }
  return upstreamEndpoint(ctx);
}

// The usage profile the gateway checks facts against: the profile of the
// upstream endpoint when the plugin declares it, else that of the client's
// model, else the plugin default.
function profileKind(identity) {
  for (const name of [identity.upstreamModel, identity.model].map(trimmed)) {
    if (IMAGE_ENDPOINTS[name]) return "image";
    if (VIDEO_ENDPOINTS[name]) return "video";
    if (name && MODEL_IDS.includes(name)) return "units";
  }
  return "units";
}

function integerValue(value, name, min, max) {
  const number = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max)
    throw new Error(name + " must be an integer from " + min + " to " + max);
  return number;
}

function booleanValue(value, name) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "false") return value === "true";
  throw new Error(name + " must be true or false");
}

function enumValue(value, name, allowed) {
  const text = trimmed(value);
  for (const option of allowed) {
    if (option.toLowerCase() === text.toLowerCase()) return option;
  }
  throw new Error(name + " must be one of " + allowed.join(", "));
}

function mediaURL(value, name) {
  if (typeof value !== "string" && !(plainObject(value) && value.__fileRef)) throw new Error(name + " must be a URL or a data URI");
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^(https?:\/\/|data:)/i.test(text)) throw new Error(name + " must be an http(s) URL or a data URI");
    return text;
  }
  return value;
}

// Settings fal ignores or that would leave the gateway without a result to
// fetch: sync_mode answers with data URIs outside the request history.
function rejectQueueOverrides(input) {
  if (present(input.sync_mode) && input.sync_mode !== false) throw new Error("sync_mode is not supported; results are fetched from the queue");
}

// Size of a fal image_size value: a named preset, a model's own named size
// or {width, height}.
function imageSizeValue(value, spec) {
  if (typeof value === "string") {
    const name = value.trim();
    if (IMAGE_PRESETS[name]) return { value: name, width: IMAGE_PRESETS[name][0], height: IMAGE_PRESETS[name][1] };
    if (spec.sizes && spec.sizes[name]) return { value: name, width: spec.sizes[name], height: spec.sizes[name] };
    if (spec.auto && name === "auto") return { value: name, width: 0, height: 0 };
    const names = PRESET_NAMES.concat(Object.keys(spec.sizes || {})).concat(spec.auto ? ["auto"] : []);
    throw new Error("image_size must be {width, height} or one of " + names.join(", "));
  }
  const object = plainObject(value);
  if (!object) throw new Error("image_size must be a named size or {width, height}");
  for (const key of Object.keys(object)) {
    if (key !== "width" && key !== "height") throw new Error("image_size takes only width and height");
  }
  const width = integerValue(object.width, "image_size.width", 64, 16384);
  const height = integerValue(object.height, "image_size.height", 64, 16384);
  return { value: { width: width, height: height }, width: width, height: height };
}

function megapixelsOf(width, height) {
  return Math.ceil((width * height) / MEGAPIXEL);
}

// Validates a curated image endpoint's input, keeps its documented fields,
// and sends the size and image count explicitly so the reserved charge
// matches what fal renders. Returns the input and its usage facts.
function imageRequest(model, source) {
  const spec = IMAGE_ENDPOINTS[model];
  rejectQueueOverrides(source);
  const input = {};
  for (const key of Object.keys(source)) {
    if (key === "sync_mode") continue;
    if (!spec.keys.includes(key)) throw new Error(key + " is not a supported input of " + model);
    input[key] = copy(source[key]);
  }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("prompt is required");
  let inputs = 0;
  if (spec.edit) {
    if (!Array.isArray(input.image_urls) || !input.image_urls.length) throw new Error("image_urls is required on " + model);
    if (input.image_urls.length > spec.maxInputs) throw new Error("image_urls takes at most " + spec.maxInputs + " images on " + model);
    input.image_urls = input.image_urls.map(function (url, index) {
      return mediaURL(url, "image_urls[" + index + "]");
    });
    inputs = input.image_urls.length;
  }
  const count = present(input.num_images) ? integerValue(input.num_images, "num_images", 1, spec.maxImages) : 1;
  if (spec.maxImages > 1 || present(input.num_images)) input.num_images = count;
  let perRun = 1;
  if (present(input.max_images)) {
    perRun = integerValue(input.max_images, "max_images", 1, 6);
    input.max_images = perRun;
  }
  let side = 0;
  let width = 0;
  let height = 0;
  let large = false;
  let webSearch = false;
  if (spec.family === "banana") {
    input.resolution = present(input.resolution) ? enumValue(input.resolution, "resolution", Object.keys(BANANA_SIDES)) : "1K";
    if (present(input.aspect_ratio)) input.aspect_ratio = enumValue(input.aspect_ratio, "aspect_ratio", BANANA_RATIOS);
    if (present(input.enable_web_search)) input.enable_web_search = booleanValue(input.enable_web_search, "enable_web_search");
    side = BANANA_SIDES[input.resolution];
    width = side;
    height = side;
    large = input.resolution === "4K";
    webSearch = input.enable_web_search === true;
  } else {
    let size;
    if (present(input.image_size)) size = imageSizeValue(input.image_size, spec);
    else if (spec.defaultSize) size = imageSizeValue(spec.defaultSize, spec);
    else if (spec.auto) size = imageSizeValue("auto", spec);
    else size = imageSizeValue("landscape_4_3", spec);
    input.image_size = size.value;
    width = size.width;
    height = size.height;
    // An automatic size follows the input image; reserve two megapixels.
    if (!width) {
      width = 2048;
      height = 1024;
    }
    if (spec.family === "seedream5") large = width * height > 1536 * 1536;
  }
  const images = Math.min(count * perRun, MAX_IMAGES);
  const facts = {
    images: images,
    megapixels: Math.min(images * megapixelsOf(width, height), MAX_IMAGES),
    input_images: inputs,
    large_output: large,
    web_search: webSearch,
    units: 0,
  };
  facts.units = imageUnits(model, facts);
  return { input: input, facts: facts };
}

// fal's billing units for a curated image endpoint, estimated from the
// published pricing: megapixels on FLUX.1, a first-megapixel surcharge on
// FLUX.2 Pro (charged in its extra-megapixel unit, inputs included), images
// on Seedream 4.5, and images with high-resolution output counted twice on
// Nano Banana Pro and Seedream 5.0 Pro. fal's own count replaces it when the
// result reports one.
function imageUnits(model, facts) {
  const family = IMAGE_ENDPOINTS[model].family;
  let units;
  if (family === "flux") units = facts.megapixels;
  else if (family === "flux2") units = facts.megapixels + facts.images + facts.input_images;
  else if (family === "seedream45") units = facts.images;
  else units = facts.images * (facts.large_output ? 2 : 1);
  return Math.min(units, MAX_UNITS);
}

function durationSeconds(value, spec) {
  const text = typeof value === "number" ? String(value) : trimmed(value).toLowerCase().replace(/s$/, "");
  if (!/^\d+$/.test(text)) throw new Error("duration must be a whole number of seconds");
  const seconds = Number(text);
  if (spec.values) {
    if (!spec.values.includes(seconds)) throw new Error("duration must be one of " + spec.values.join(", ") + " seconds");
  } else if (seconds < spec.min || seconds > spec.max) {
    throw new Error("duration must be from " + spec.min + " to " + spec.max + " seconds");
  }
  return seconds;
}

function durationField(seconds, spec) {
  if (spec.format === "string") return String(seconds);
  if (spec.format === "suffix") return seconds + "s";
  return seconds;
}

// Validates a curated video endpoint's input, keeps its documented fields,
// and sends duration and resolution explicitly.
function videoRequest(model, source) {
  const spec = VIDEO_ENDPOINTS[model];
  rejectQueueOverrides(source);
  const input = {};
  for (const key of Object.keys(source)) {
    if (key === "sync_mode") continue;
    if (!spec.keys.includes(key)) throw new Error(key + " is not a supported input of " + model);
    input[key] = copy(source[key]);
  }
  const hasPrompt = typeof input.prompt === "string" && input.prompt.trim() !== "";
  if (present(input.prompt) && typeof input.prompt !== "string") throw new Error("prompt must be a string");
  if (!hasPrompt && !(Array.isArray(input.multi_prompt) && input.multi_prompt.length) && !spec.image) throw new Error("prompt is required");
  if (spec.image) {
    if (!present(input[spec.image])) throw new Error(spec.image + " is required on " + model);
    input[spec.image] = mediaURL(input[spec.image], spec.image);
  }
  for (const key of ["end_image_url", "target_audio_url"]) {
    if (present(input[key])) input[key] = mediaURL(input[key], key);
  }
  if (present(input.middle_image_urls)) {
    if (!Array.isArray(input.middle_image_urls)) throw new Error("middle_image_urls must be an array");
    input.middle_image_urls = input.middle_image_urls.map(function (url, index) {
      return mediaURL(url, "middle_image_urls[" + index + "]");
    });
  }
  const seconds = present(input.duration) ? durationSeconds(input.duration, spec.duration) : spec.duration.default;
  input.duration = durationField(seconds, spec.duration);
  let resolution = spec.fixed;
  if (spec.resolution) {
    input.resolution = present(input.resolution) ? enumValue(input.resolution, "resolution", spec.resolution) : spec.defaultResolution;
    resolution = input.resolution.toLowerCase();
  }
  if (present(input.aspect_ratio)) {
    if (!spec.aspects) throw new Error("aspect_ratio is not supported on " + model);
    input.aspect_ratio = enumValue(input.aspect_ratio, "aspect_ratio", spec.aspects);
  }
  let audio = spec.audio === true;
  if (typeof spec.audio === "string") {
    input[spec.audio] = present(input[spec.audio]) ? booleanValue(input[spec.audio], spec.audio) : true;
    audio = input[spec.audio];
  }
  const facts = { seconds: seconds, resolution: resolution, audio: audio, units: seconds };
  return { input: input, facts: facts };
}

// Any other fal endpoint: fal validates the input itself. The reservation
// counts one unit per requested image, the requested seconds, or one unit;
// the task settles on fal's own unit count.
function genericRequest(source) {
  rejectQueueOverrides(source);
  const input = copy(source);
  delete input.sync_mode;
  let units = 1;
  const images = Number(input.num_images);
  if (Number.isInteger(images) && images > 1) units = images;
  const seconds = parseInt(trimmed(input.duration), 10);
  if (seconds > 0) units = Math.max(units, seconds);
  return { input: input, facts: { units: Math.min(units, MAX_UNITS) } };
}

function falRequest(model, source) {
  const input = plainObject(source);
  if (!input) throw new Error("input must be an object");
  if (IMAGE_ENDPOINTS[model]) return imageRequest(model, input);
  if (VIDEO_ENDPOINTS[model]) return videoRequest(model, input);
  return genericRequest(input);
}

// Facts in the shape of the profile the gateway checks.
function profileFacts(kind, facts) {
  if (kind === "image") {
    if (present(facts.images)) return facts;
    return { images: 1, megapixels: 1, input_images: 0, large_output: false, web_search: false, units: facts.units };
  }
  if (kind === "video") {
    if (present(facts.seconds)) return facts;
    return { seconds: Math.min(facts.units, 3600), resolution: "720p", audio: false, units: facts.units };
  }
  return { units: facts.units };
}

function actionOf(model, input) {
  if (IMAGE_ENDPOINTS[model]) return IMAGE_ENDPOINTS[model].edit ? "image_edit" : "text_to_image";
  if (VIDEO_ENDPOINTS[model]) return VIDEO_ENDPOINTS[model].image ? "image_to_video" : "text_to_video";
  return "generate";
}

// The normalized request body the driver hooks receive.
function submitIntent(clientModel, upstream, input, options) {
  const request = falRequest(upstream, input);
  const body = { input: request.input };
  if (options.priority) body.priority = options.priority;
  if (options.start_timeout) body.start_timeout = options.start_timeout;
  return { kind: "submit", model: clientModel, action: actionOf(upstream, request.input), requestBody: body };
}

function queueOptions(source) {
  const options = {};
  if (present(source.priority)) options.priority = enumValue(source.priority, "priority", PRIORITIES);
  if (present(source.start_timeout)) options.start_timeout = integerValue(source.start_timeout, "start_timeout", 1, 86400);
  return options;
}

function authHeaders(ctx) {
  return { Accept: "application/json", Authorization: "Key " + ctx.apiKey };
}

function baseOf(ctx) {
  return trimmed(ctx.baseUrl).replace(/\/+$/, "");
}

// The queue path of a request's app, /{owner}/{app}: from the URL fal
// returned when it has the expected shape, else from the endpoint id.
function appPath(url, requestId, model) {
  const match = /^https?:\/\/[^/?#]+(\/[^?#]*)$/i.exec(trimmed(url));
  if (match) {
    const path = match[1].replace(/\/status$/, "");
    const suffix = "/requests/" + requestId;
    if (path.slice(-suffix.length) === suffix) {
      const app = path.slice(0, -suffix.length);
      if (/^(\/[A-Za-z0-9][A-Za-z0-9._-]*){2}$/.test(app)) return app;
    }
  }
  const parts = endpointId(model).split("/");
  return "/" + parts[0] + "/" + parts[1];
}

function gatewayRequests(ctx) {
  return baseOf(ctx) + "/" + PLUGIN_KEY + "/fal/requests";
}

function queueURLs(ctx) {
  const state = plainObject(ctx.state) || {};
  const app = trimmed(state.app) || appPath("", ctx.taskId, upstreamEndpoint(ctx));
  const request = baseOf(ctx) + app + "/requests/" + encodeURIComponent(ctx.taskId);
  return { status: request + "/status", response: request };
}

function isQueueStatus(body) {
  const object = plainObject(body);
  return !!object && QUEUE_STATES.includes(object.status) && (present(object.request_id) || present(object.response_url) || present(object.queue_position));
}

// The fal result inside another gateway's /fal/requests/{id} reply
// ({request_id, status: "COMPLETED", response}); fal's own status replies
// never carry response.
function gatewayResult(body) {
  const object = plainObject(body);
  return object && isQueueStatus(object) && object.status === "COMPLETED" && !present(object.error) ? plainObject(object.response) : null;
}

function errorText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(errorText).filter(Boolean).join("; ");
  const object = plainObject(value);
  if (!object) return "";
  return errorText(object.msg) || errorText(object.message) || errorText(object.detail) || errorText(object.error);
}

function failureReason(body) {
  const object = plainObject(body) || {};
  const reason = errorText(object.error) || errorText(object.detail) || "request failed";
  const type = trimmed(object.error_type);
  return type ? reason + " (" + type + ")" : reason;
}

// Output files are served from fal's media hosts.
function mediaHost(url) {
  const match = /^https:\/\/([^/?#:@]+)(\/[^?#]*)?/i.exec(url);
  if (!match) return false;
  const host = match[1].toLowerCase();
  if (host === "fal.media" || /\.fal\.media$/.test(host) || /\.fal\.ai$/.test(host) || /\.fal\.run$/.test(host)) return true;
  return host === "storage.googleapis.com" && /^\/falserverless\//.test(match[2] || "");
}

function mediaType(item, hint) {
  const contentType = trimmed(item.content_type).toLowerCase();
  for (const type of ["image", "video", "audio"]) {
    if (contentType.indexOf(type + "/") === 0) return type;
  }
  if (hint) return hint;
  const path = trimmed(item.url).split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(path)) return "image";
  if (/\.(mp4|mov|webm)$/.test(path)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(path)) return "audio";
  return "file";
}

function mimeOf(item, type) {
  const contentType = trimmed(item.content_type).toLowerCase();
  if (/^[a-z]+\/[a-z0-9.+-]+$/.test(contentType)) return contentType;
  const path = trimmed(item.url).split("?")[0].toLowerCase();
  if (/\.png$/.test(path)) return "image/png";
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  if (/\.webp$/.test(path)) return "image/webp";
  if (/\.mp4$/.test(path)) return "video/mp4";
  if (/\.mp3$/.test(path)) return "audio/mpeg";
  if (/\.wav$/.test(path)) return "audio/wav";
  return type === "video" ? "video/mp4" : "";
}

const HINTS = { images: "image", image: "image", video: "video", videos: "video", audio: "audio", audio_file: "audio" };

// Every output file of a fal result, in a stable order (members by name,
// arrays by index): objects with a fal media URL anywhere in the output.
// The first video is "video"; the others are numbered per type ("image-1",
// "video-2", "audio-1", "file-1").
function artifactEntries(data) {
  // Another gateway's reply carries the result with that gateway's own
  // download addresses in place of fal's media URLs.
  const wrapped = gatewayResult(data);
  if (wrapped) data = wrapped;
  const accepts = wrapped ? function (url) { return /^https?:\/\/[^/?#\s]+/i.test(url); } : mediaHost;
  const entries = [];
  const counts = {};
  let firstVideo = false;
  const visit = function (value, path, hint, depth) {
    if (entries.length >= MAX_ARTIFACTS || depth > MAX_WALK_DEPTH) return;
    if (Array.isArray(value)) {
      value.forEach(function (item, index) {
        visit(item, path.concat([index]), hint, depth + 1);
      });
      return;
    }
    const object = plainObject(value);
    if (!object) return;
    if (typeof object.url === "string" && accepts(object.url.trim())) {
      const type = mediaType(object, hint);
      let key;
      if (type === "video" && !firstVideo) {
        firstVideo = true;
        key = "video";
        counts.video = 1;
      } else {
        counts[type] = (counts[type] || 0) + 1;
        key = type + "-" + counts[type];
      }
      const entry = { key: key, type: type, url: object.url.trim(), path: path };
      const mime = mimeOf(object, type);
      if (mime) entry.mimeType = mime;
      if (Number(object.width) > 0 && Number(object.height) > 0) {
        entry.width = Number(object.width);
        entry.height = Number(object.height);
      }
      entries.push(entry);
      return;
    }
    for (const key of Object.keys(object).sort()) {
      visit(object[key], path.concat([key]), HINTS[key] || hint, depth + 1);
    }
  };
  if (plainObject(data) && !isQueueStatus(data)) visit(data, [], "", 0);
  return entries;
}

// The result with each output URL swapped for the gateway's download
// address.
function withGatewayURLs(data, artifacts) {
  const out = copy(gatewayResult(data) || data);
  if (!artifacts) return out;
  for (const entry of artifactEntries(data)) {
    const artifact = artifacts[entry.key];
    if (!artifact || !trimmed(artifact.url)) continue;
    let target = out;
    for (const step of entry.path) target = target[step];
    target.url = trimmed(artifact.url);
  }
  return out;
}

export const native = {
  // fal's queue, one route for every endpoint: {model, input, priority?,
  // start_timeout?}. model is the fal endpoint id (or a channel alias).
  submitRequest: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const body = plainObject(ctx.body.value);
    if (!body) throw new Error("request body must be an object");
    for (const key of Object.keys(body)) {
      if (!["model", "input", "priority", "start_timeout"].includes(key)) throw new Error(key + " is not supported; put model inputs in input");
    }
    const model = trimmed(body.model);
    if (!model) throw new Error("model is required");
    if (!present(body.input)) throw new Error("input is required");
    const upstream = protocolEndpoint({ model: model, upstreamModel: ctx.upstreamModel });
    return submitIntent(model, upstream, body.input, queueOptions(body));
  },
  requestSubmitted: function (ctx, task) {
    return { request_id: task.task_id, status: "IN_QUEUE" };
  },
  requestStatus: function (ctx, task) {
    const raw = plainObject(task.data) || {};
    const data = gatewayResult(raw) || raw;
    const out = { request_id: task.task_id };
    if (task.status === "SUCCESS") {
      out.status = "COMPLETED";
      out.response = withGatewayURLs(raw, ctx.artifacts);
      return out;
    }
    if (task.status === "FAILURE") {
      out.status = "COMPLETED";
      out.error = task.fail_reason || failureReason(data);
      out.error_type = isQueueStatus(data) && trimmed(data.error_type) ? trimmed(data.error_type) : "request_failed";
      return out;
    }
    out.status = data.status === "IN_PROGRESS" ? "IN_PROGRESS" : "IN_QUEUE";
    if (out.status === "IN_QUEUE" && typeof data.queue_position === "number") out.queue_position = data.queue_position;
    return out;
  },
  error: function (ctx, error) {
    return { detail: error.message, error_type: error.code || "request_error" };
  },
};

// Decoders run before channel selection, without a mapping; a declared
// placeholder model then passes on the client's name.
function protocolEndpoint(identity) {
  try {
    return upstreamEndpoint(identity);
  } catch (error) {
    if (!trimmed(identity.upstreamModel) && MODEL_IDS.includes(trimmed(identity.model))) return trimmed(identity.model);
    throw error;
  }
}

// The fal input of a stored request, checked again against the endpoint the
// channel sends it to.
function driverRequest(ctx) {
  const body = plainObject(ctx.requestBody) || {};
  const model = endpointOf(ctx);
  return { model: model, request: falRequest(model, body.input), options: queueOptions(body) };
}

export function buildSubmitRequest(ctx) {
  const built = driverRequest(ctx);
  if (viaGateway(ctx)) {
    const body = { model: built.model, input: built.request.input };
    if (built.options.priority) body.priority = built.options.priority;
    if (built.options.start_timeout) body.start_timeout = built.options.start_timeout;
    return {
      url: gatewayRequests(ctx),
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
      body: body,
      action: actionOf(built.model, built.request.input),
    };
  }
  const headers = Object.assign({ "Content-Type": "application/json" }, authHeaders(ctx));
  if (built.options.priority) headers["X-Fal-Queue-Priority"] = built.options.priority;
  if (built.options.start_timeout) headers["X-Fal-Request-Start-Timeout"] = String(built.options.start_timeout);
  return {
    url: baseOf(ctx) + "/" + built.model,
    method: "POST",
    headers: headers,
    body: built.request.input,
    action: actionOf(built.model, built.request.input),
  };
}

export function parseSubmitResponse(ctx, resp) {
  const body = plainObject(resp.body);
  const id = body ? trimmed(body.request_id) : "";
  if (!id) throw new Error("fal did not return a request_id");
  const built = driverRequest(ctx);
  const data = { request_id: id, status: "IN_QUEUE" };
  if (typeof body.queue_position === "number") data.queue_position = body.queue_position;
  const state = { facts: built.request.facts };
  if (!viaGateway(ctx)) state.app = appPath(body.status_url || body.response_url, id, built.model);
  return { taskId: id, taskData: data, state: state };
}

export function extractUsage(ctx) {
  // Legacy per-call prices have no ratio to scale.
  if (ctx.usagePurpose === "billing_ratios") return null;
  return profileFacts(profileKind(ctx), driverRequest(ctx).request.facts);
}

// Polls the status; once fal reports the request complete without an error,
// the query reads the result instead, which becomes the task's data.
export function buildQueryRequest(ctx) {
  if (viaGateway(ctx)) {
    return { url: gatewayRequests(ctx) + "/" + encodeURIComponent(ctx.taskId), method: "GET", headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey } };
  }
  const urls = queueURLs(ctx);
  let url = urls.status;
  try {
    const response = utils.fetch({ url: urls.status, headers: authHeaders(ctx) });
    const body = plainObject(response.body);
    if (response.status === 200 && body && body.status === "COMPLETED" && !present(body.error)) url = urls.response;
  } catch (_error) {
    url = urls.status;
  }
  return { url: url, method: "GET", headers: authHeaders(ctx) };
}

function billableUnits(headers) {
  const object = plainObject(headers) || {};
  for (const name of Object.keys(object)) {
    if (name.toLowerCase() !== "x-fal-billable-units") continue;
    const units = Number(trimmed(object[name]));
    if (Number.isFinite(units) && units > 0) return Math.min(units, MAX_UNITS);
  }
  return 0;
}

export function parseTaskResult(ctx, body, response) {
  const status = response && response.status ? response.status : 200;
  if (status >= 400) {
    // 400 is fal's answer for a result read before the request is done.
    if (status === 400) return { status: "UNKNOWN", reason: "result not ready" };
    if (status === 499) return { status: "FAILURE", reason: "request was cancelled" };
    return { status: "FAILURE", reason: failureReason(body) };
  }
  if (isQueueStatus(body) && !gatewayResult(body)) {
    if (body.status === "IN_QUEUE") return { status: "QUEUED" };
    if (body.status === "IN_PROGRESS") return { status: "IN_PROGRESS" };
    if (present(body.error)) return { status: "FAILURE", reason: failureReason(body) };
    // Complete; the next poll reads the result.
    return { status: "IN_PROGRESS", progress: "99%" };
  }
  const data = gatewayResult(body) || plainObject(body);
  if (!data) return { status: "UNKNOWN", reason: "unrecognized result" };
  const model = endpointOf(ctx);
  if ((IMAGE_ENDPOINTS[model] || VIDEO_ENDPOINTS[model]) && !artifactEntries(body).length) return { status: "FAILURE", reason: "fal returned no output file" };
  const result = { status: "SUCCESS", progress: "100%" };
  const units = billableUnits(response && response.headers);
  if (units) result.state = Object.assign({}, plainObject(ctx.state) || {}, { billable_units: units });
  return result;
}

// Settles on what was delivered: the images fal returned and their sizes,
// and fal's billable units when the result reported them. The gateway calls
// this with the result it just parsed (its plugin_state holds the units)
// and the result body.
export function extractUsageOnComplete(task, result, data) {
  const output = gatewayResult(data) || plainObject(data);
  if (!output || isQueueStatus(output)) return null;
  const parsed = plainObject(result) || {};
  if (parsed.status && parsed.status !== "SUCCESS") return null;
  const state = plainObject(task.state) || {};
  const reported = plainObject(parsed.plugin_state) || plainObject(parsed.state) || {};
  const reserved = plainObject(state.facts);
  if (!reserved) return null;
  const units = Number(reported.billable_units) > 0 ? Number(reported.billable_units) : Number(state.billable_units) > 0 ? Number(state.billable_units) : 0;
  const kind = profileKind(task);
  const model = trimmed(task.upstreamModel) || trimmed(task.model);
  const facts = Object.assign({}, profileFacts(kind, reserved));
  if (kind === "image" && IMAGE_ENDPOINTS[model]) {
    const images = artifactEntries(data).filter(function (entry) {
      return entry.type === "image";
    });
    if (images.length) {
      facts.images = Math.min(images.length, MAX_IMAGES);
      if (
        images.every(function (entry) {
          return entry.width > 0;
        })
      ) {
        let megapixels = 0;
        for (const entry of images) megapixels += megapixelsOf(entry.width, entry.height);
        facts.megapixels = Math.min(megapixels, MAX_IMAGES);
        if (IMAGE_ENDPOINTS[model].family === "seedream5")
          facts.large_output = images.some(function (entry) {
            return entry.width * entry.height > 1536 * 1536;
          });
      }
      facts.units = imageUnits(model, facts);
    }
  }
  if (units) facts.units = Math.min(units, MAX_UNITS);
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  return artifactEntries(task.data).map(function (entry) {
    const artifact = { key: entry.key, type: entry.type };
    if (entry.mimeType) artifact.mimeType = entry.mimeType;
    return artifact;
  });
}

// fal's media URLs are public; they stay until the account's media
// expiration setting removes them. Through another gateway they are that
// gateway's signed download addresses.
export function buildContentRequest(ctx) {
  if (viaGateway(ctx)) {
    if (!ctx.upstreamTaskId) throw new Error("artifact_not_found");
    return {
      url: String(ctx.baseUrl || "").replace(/\/+$/, "") + "/v1/tasks/" + encodeURIComponent(ctx.upstreamTaskId) + "/artifacts/" + encodeURIComponent(ctx.artifactKey) + "/content",
      method: (ctx.clientRequest && ctx.clientRequest.method) || "GET",
      headers: { Authorization: "Bearer " + ctx.apiKey },
    };
  }
  for (const entry of artifactEntries(ctx.data)) {
    if (entry.key === ctx.artifactKey) return { url: entry.url, method: ctx.clientRequest.method, credentialless: true };
  }
  throw new Error("artifact_not_found");
}

function sizeParts(size) {
  const parts = trimmed(size).toLowerCase().replace("*", "x").split("x");
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (parts.length !== 2 || !(width > 0) || !(height > 0) || !Number.isInteger(width) || !Number.isInteger(height)) throw new Error("size must be WIDTHxHEIGHT");
  return { width: width, height: height };
}

function nearestRatio(width, height, ratios) {
  let best = "";
  let nearest = Infinity;
  for (const ratio of ratios) {
    const sides = ratio.split(":").map(Number);
    if (sides.length !== 2 || !(sides[0] > 0)) continue;
    const distance = Math.abs(Math.log(width / height) - Math.log(sides[0] / sides[1]));
    if (distance < nearest) {
      nearest = distance;
      best = ratio;
    }
  }
  return best;
}

// Multipart text fields, each given once.
function formFields(body) {
  const req = {};
  const fields = body.fields || {};
  for (const name of Object.keys(fields)) {
    if (fields[name].length > 1) throw new Error(name + " must be provided once");
    req[name] = fields[name][0];
  }
  return req;
}

function uploadedImage(file, name) {
  const mime = trimmed(file.mimeType).toLowerCase();
  if (!/^image\//.test(mime)) throw new Error(name + " must be an image");
  return { __fileRef: file.ref, encoding: "dataUrl", mimeType: mime };
}

// An OpenAI image given as a URL string, {image_url} or {url}.
function openAIImage(value) {
  const object = plainObject(value);
  if (object && present(object.image_url)) return typeof object.image_url === "string" ? object.image_url : plainObject(object.image_url) ? object.image_url.url : object.image_url;
  if (object && present(object.url)) return object.url;
  return value;
}

// fal fields an OpenAI request may also carry, passed on as they are.
const IMAGE_PASSTHROUGH = ["seed", "aspect_ratio", "resolution", "image_size", "output_format", "enable_web_search", "safety_tolerance", "negative_prompt", "guidance_scale", "num_inference_steps", "enable_safety_checker", "max_images", "num_images", "enhance_prompt_mode", "watermark", "thinking_level", "system_prompt", "acceleration"];
const VIDEO_PASSTHROUGH = ["duration", "resolution", "aspect_ratio", "generate_audio", "audio", "negative_prompt", "seed", "end_image_url", "image_url", "start_image_url", "cfg_scale", "shot_type", "enable_safety_checker", "enable_prompt_expansion", "auto_fix", "prompt_expansion_mode"];

// The OpenAI Images API on a curated endpoint: prompt, n, size and
// output_format, plus fal's own fields. size picks fal's image_size, or on
// Nano Banana Pro the nearest aspect ratio and the resolution of the longer
// side. The host owns response_format.
function openAIImageInput(req, operation, images, model) {
  const spec = IMAGE_ENDPOINTS[model];
  if (given(req.mask)) throw new Error("mask is not supported; describe the edit in the prompt");
  if (operation === "edit" && !spec.edit) throw new Error(model + " does not edit images; use its edit endpoint on /v1/images/edits");
  if (operation === "generate" && spec.edit) throw new Error(model + " edits images; call /v1/images/edits");
  const input = { prompt: req.prompt };
  for (const key of IMAGE_PASSTHROUGH) {
    if (present(req[key]) && spec.keys.includes(key)) input[key] = req[key];
  }
  if (given(req.n)) input.num_images = integerValue(req.n, "n", 1, spec.maxImages);
  if (given(req.output_format) && spec.keys.includes("output_format")) input.output_format = trimmed(req.output_format).toLowerCase() === "jpg" ? "jpeg" : req.output_format;
  if (given(req.size) && trimmed(req.size).toLowerCase() !== "auto" && !present(req.image_size)) {
    const sides = sizeParts(req.size);
    if (spec.family === "banana") {
      const longer = Math.max(sides.width, sides.height);
      if (!present(req.resolution)) input.resolution = longer > 2048 ? "4K" : longer > 1024 ? "2K" : "1K";
      if (!present(req.aspect_ratio)) input.aspect_ratio = nearestRatio(sides.width, sides.height, BANANA_RATIOS);
    } else {
      input.image_size = { width: sides.width, height: sides.height };
    }
  }
  if (spec.edit) {
    if (!images.length) throw new Error("image is required");
    input.image_urls = images;
  }
  return input;
}

function resolutionHeight(option) {
  return { "2k": 1440, "4k": 2160 }[option.toLowerCase()] || parseInt(option, 10);
}

// The OpenAI video API on a curated endpoint: prompt, seconds, size and
// input_reference (the first frame), plus fal's own fields.
function openAIVideoInput(req, model) {
  const spec = VIDEO_ENDPOINTS[model];
  const input = {};
  if (present(req.prompt)) input.prompt = req.prompt;
  for (const key of VIDEO_PASSTHROUGH) {
    if (present(req[key])) {
      if (!spec.keys.includes(key)) throw new Error(key + " is not supported on " + model);
      input[key] = req[key];
    }
  }
  if (given(req.seconds)) input.duration = durationField(durationSeconds(req.seconds, spec.duration), spec.duration);
  if (given(req.size)) {
    const sides = sizeParts(req.size);
    if (spec.aspects && !present(req.aspect_ratio)) input.aspect_ratio = nearestRatio(sides.width, sides.height, spec.aspects);
    // The largest resolution whose height fits the shorter side.
    if (spec.resolution && !present(req.resolution)) {
      const shorter = Math.min(sides.width, sides.height);
      let pick = spec.resolution[0];
      for (const option of spec.resolution) {
        if (resolutionHeight(option) <= shorter && resolutionHeight(option) > resolutionHeight(pick)) pick = option;
      }
      input.resolution = pick;
    }
  }
  if (present(req.input_reference)) {
    if (!spec.image) throw new Error(model + " is text to video; send input_reference to its image-to-video endpoint");
    if (present(input[spec.image])) throw new Error("send either input_reference or " + spec.image);
    input[spec.image] = req.input_reference;
  }
  return input;
}

function curatedModel(ctx, table) {
  for (const name of [ctx.upstreamModel, ctx.model].map(trimmed)) {
    if (table[name]) return name;
  }
  throw new Error(trimmed(ctx.model) + " is not available on this endpoint");
}

export const protocols = {
  openai_image: {
    decodeRequest: function (ctx) {
      if (!ctx.body || (ctx.body.kind !== "json" && ctx.body.kind !== "multipart")) throw new Error("JSON or multipart body required");
      const operation = ctx.operation === "edit" ? "edit" : "generate";
      let req;
      let images = [];
      if (ctx.body.kind === "json") {
        req = plainObject(ctx.body.value);
        if (!req) throw new Error("JSON object required");
        const listed = present(req.images) ? (Array.isArray(req.images) ? req.images : null) : [];
        if (!listed) throw new Error("images must be an array");
        images = (present(req.image) ? (Array.isArray(req.image) ? req.image : [req.image]) : []).concat(listed).map(openAIImage);
      } else {
        req = formFields(ctx.body);
        for (const file of ctx.body.files || []) {
          if (file.field !== "image" && file.field !== "image[]") throw new Error("unexpected file field: " + file.field);
          images.push(uploadedImage(file, "image"));
        }
        if (given(req.image)) images.unshift(req.image);
      }
      if (operation === "generate" && images.length) throw new Error("image is only valid on /v1/images/edits");
      const model = curatedModel(ctx, IMAGE_ENDPOINTS);
      return submitIntent(ctx.model, model, openAIImageInput(req, operation, images, model), {});
    },
    render: function (ctx, task) {
      return {
        data: artifactEntries(task.data)
          .filter(function (entry) {
            return entry.type === "image";
          })
          .map(function (entry) {
            return { url: entry.url };
          }),
      };
    },
  },
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || (ctx.body.kind !== "json" && ctx.body.kind !== "multipart")) throw new Error("JSON or multipart body required");
      let req;
      if (ctx.body.kind === "json") {
        req = plainObject(ctx.body.value);
        if (!req) throw new Error("JSON object required");
        if (present(req.input_reference)) req = Object.assign({}, req, { input_reference: openAIImage(req.input_reference) });
      } else {
        req = formFields(ctx.body);
        const files = ctx.body.files || [];
        for (const file of files) {
          if (file.field !== "input_reference") throw new Error("unexpected file field: " + file.field);
        }
        if (files.length > 1) throw new Error("input_reference must be provided once");
        if (files.length) req.input_reference = uploadedImage(files[0], "input_reference");
      }
      const model = curatedModel(ctx, VIDEO_ENDPOINTS);
      return submitIntent(ctx.model, model, openAIVideoInput(req, model), {});
    },
    // The host owns id, status, progress and timestamps.
    render: function (ctx, task) {
      const output = { object: "video" };
      if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: task.fail_reason || failureReason(task.data) };
      return output;
    },
  },
};
