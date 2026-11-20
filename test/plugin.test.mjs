// Runs the plugin's hooks the way the gateway calls them: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let fetchImpl = () => {
  throw new Error("utils.fetch is not available");
};
const fetched = [];
globalThis.utils = {
  fetch: (request) => {
    fetched.push(request);
    return fetchImpl(request);
  },
};

const plugin = await import("../plugin.js");
const { meta, native, protocols } = plugin;
const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");

const BASE = "https://queue.fal.run";
const KEY = "fal-test-key";
const IMAGE_FACTS = ["images", "megapixels", "input_images", "extra_input_images", "large_output", "web_search", "units"];
const VIDEO_FACTS = ["seconds", "resolution", "audio", "units"];

function decodeNative(body, extra) {
  return native.submitRequest(Object.assign({ method: "POST", path: "/fal/requests", params: {}, query: {}, requestHeaders: {}, body: { kind: "json", value: body } }, extra || {}));
}

function driver(intent, extra) {
  return Object.assign(
    { requestBody: intent.requestBody, requestHeaders: {}, action: intent.action, model: intent.model, upstreamModel: intent.model, baseUrl: BASE, apiKey: KEY, authHeader: "Bearer " + KEY, upstream: { kind: "vendor" }, config: {}, files: [], publicTaskId: "task_public" },
    extra || {},
  );
}

function queryCtx(model, state, extra) {
  return Object.assign({ taskId: "req-1", publicTaskId: "task_public", action: "generate", model: model, upstreamModel: model, baseUrl: BASE, apiKey: KEY, authHeader: "Bearer " + KEY, upstream: { kind: "vendor" }, config: {}, data: null, state: state }, extra || {});
}

function imageDecode(body, operation) {
  return protocols.openai_image.decodeRequest({ model: body.model, operation: operation || "generate", requestHeaders: {}, body: { kind: "json", value: body } });
}

function videoDecode(body) {
  return protocols.openai_video.decodeRequest({ model: body.model, requestHeaders: {}, body: { kind: "json", value: body } });
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

test("manifest follows the community rules", () => {
  assert.equal(meta.apiVersion, 1);
  assert.match(meta.key, /^[a-z0-9]+_fal$/);
  assert.ok(meta.key.length <= 30);
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
  for (const name of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const changelog = readFileSync(new URL("../" + name, import.meta.url), "utf8");
    assert.match(changelog, new RegExp("version: \"?" + meta.version.replace(/\./g, "\\.") + "\"?"));
    assert.ok(changelog.includes("## [" + meta.version + "]"));
  }
  assert.equal(meta.baseUrl, BASE);
  assert.equal(meta.channelTypes, undefined);
  assert.equal(meta.author.url, "https://github.com/" + meta.author.name);
  assert.equal(meta.key, meta.author.name.toLowerCase() + "_fal");
  assert.ok(!JSON.stringify(meta).includes("$"));
});

test("meta is a plain JSON literal", () => {
  const block = source.split("export const meta = ")[1].split("\n};\n")[0] + "\n}";
  assert.deepEqual(JSON.parse(block.replace(/^\s*\/\/[^\n]*\n/gm, "")), JSON.parse(JSON.stringify(meta)));
});

test("profiles cover every curated model and examples are complete vectors", () => {
  const profiled = [];
  for (const profile of meta.usageProfiles) {
    for (const model of profile.models) {
      assert.ok(meta.models.includes(model), model);
      profiled.push(model);
    }
    for (const example of profile.examples) assert.deepEqual(Object.keys(example.facts).sort(), Object.keys(profile.schema).sort());
  }
  assert.deepEqual(meta.models.filter((model) => !profiled.includes(model)), ["fal-endpoint-1", "fal-endpoint-2", "fal-endpoint-3", "fal-endpoint-4", "fal-endpoint-5", "fal-endpoint-6", "fal-endpoint-7", "fal-endpoint-8", "fal-endpoint-9", "fal-endpoint-10"]);
  for (const example of meta.usageExamples) assert.deepEqual(Object.keys(example.facts), Object.keys(meta.usageSchema));
  const image = meta.protocols.find((p) => p.name === "openai_image").models;
  const video = meta.protocols.find((p) => p.name === "openai_video").models;
  assert.deepEqual(image, meta.usageProfiles[0].models);
  assert.deepEqual(video, meta.usageProfiles[1].models);
});

test("native route submits any fal endpoint with Key auth", () => {
  const intent = decodeNative({ model: "fal-endpoint-3", input: { prompt: "a fox", num_images: 2, sync_mode: false }, priority: "low", start_timeout: 30 });
  assert.equal(intent.model, "fal-endpoint-3");
  assert.equal(intent.action, "generate");
  const mapped = { upstreamModel: "fal-ai/flux/krea" };
  const request = plugin.buildSubmitRequest(driver(intent, mapped));
  assert.equal(request.url, BASE + "/fal-ai/flux/krea");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.Authorization, "Key " + KEY);
  assert.equal(request.headers["X-Fal-Queue-Priority"], "low");
  assert.equal(request.headers["X-Fal-Request-Start-Timeout"], "30");
  assert.deepEqual(request.body, { prompt: "a fox", num_images: 2 });
  assert.deepEqual(plugin.extractUsage(driver(intent, mapped)), { units: 2 });
  assert.equal(plugin.extractUsage(driver(intent, { usagePurpose: "billing_ratios" })), null);
  const video = decodeNative({ model: "fal-endpoint-10", input: { prompt: "x", duration: "8" } });
  assert.deepEqual(plugin.extractUsage(driver(video, { upstreamModel: "fal-ai/some-video/v1" })), { units: 8 });
});

test("native route validation errors", () => {
  assert.throws(() => decodeNative({ model: "fal-ai/flux/dev" }), /input is required/);
  assert.throws(() => decodeNative({ input: {} }), /model is required/);
  assert.throws(() => decodeNative({ model: "fal-ai/x", input: [] }), /input must be an object/);
  assert.throws(() => decodeNative({ model: "fal-ai/../x", input: {} }), /fal endpoint id/);
  assert.throws(() => decodeNative({ model: "flux", input: {} }), /not a fal endpoint id/);
  assert.throws(() => decodeNative({ model: "fal-ai/x", input: {}, prompt: "x" }), /put model inputs in input/);
  assert.throws(() => decodeNative({ model: "fal-ai/x", input: { sync_mode: true } }), /sync_mode/);
  assert.throws(() => decodeNative({ model: "fal-ai/x", input: {}, priority: "high" }), /priority/);
  assert.throws(() => native.submitRequest({ body: { kind: "multipart", fields: {}, files: [] } }), /JSON body required/);
});

test("the placeholder model needs a channel mapping", () => {
  const intent = decodeNative({ model: "fal-endpoint-1", input: { prompt: "x" } });
  assert.equal(intent.model, "fal-endpoint-1");
  assert.throws(() => plugin.buildSubmitRequest(driver(intent)), /map it to one/);
  const mapped = plugin.buildSubmitRequest(driver(intent, { upstreamModel: "fal-ai/recraft/v3/text-to-image" }));
  assert.equal(mapped.url, BASE + "/fal-ai/recraft/v3/text-to-image");
  assert.deepEqual(plugin.extractUsage(driver(intent, { upstreamModel: "fal-ai/recraft/v3/text-to-image" })), { units: 1 });
  // A placeholder mapped to a curated endpoint reports that endpoint's profile.
  const curated = decodeNative({ model: "fal-endpoint-1", input: { prompt: "x" } });
  assert.deepEqual(Object.keys(plugin.extractUsage(driver(curated, { upstreamModel: "fal-ai/flux/dev" }))), IMAGE_FACTS);
});

test("curated image inputs are whitelisted and priced from the request", () => {
  const flux = decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x", image_size: "square_hd", num_images: 2 } });
  assert.equal(flux.action, "text_to_image");
  assert.deepEqual(plugin.buildSubmitRequest(driver(flux)).body, { prompt: "x", image_size: "square_hd", num_images: 2 });
  assert.deepEqual(plugin.extractUsage(driver(flux)), { images: 2, megapixels: 2, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 2 });
  // The default landscape_4_3 is sent explicitly.
  const plain = decodeNative({ model: "fal-ai/flux/schnell", input: { prompt: "x" } });
  assert.deepEqual(plain.requestBody.input, { prompt: "x", image_size: "landscape_4_3", num_images: 1 });
  const big = decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x", image_size: { width: 1920, height: 1080 } } });
  assert.equal(plugin.extractUsage(driver(big)).megapixels, 2);
  assert.throws(() => decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x", loras: [] } }), /loras is not a supported input/);
  assert.throws(() => decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x", num_images: 5 } }), /num_images must be an integer from 1 to 4/);
  assert.throws(() => decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x", image_size: "huge" } }), /image_size must be/);
  assert.throws(() => decodeNative({ model: "fal-ai/flux/dev", input: {} }), /prompt is required/);
});

test("nano banana pro reserves 4K and web search", () => {
  const intent = decodeNative({ model: "fal-ai/nano-banana-pro", input: { prompt: "x", num_images: 2, resolution: "4k", enable_web_search: true } });
  assert.equal(intent.requestBody.input.resolution, "4K");
  assert.deepEqual(plugin.extractUsage(driver(intent)), { images: 2, megapixels: 32, input_images: 0, extra_input_images: 0, large_output: true, web_search: true, units: 4 });
  const edit = decodeNative({ model: "fal-ai/nano-banana-pro/edit", input: { prompt: "x", image_urls: ["https://a/1.png", "data:image/png;base64,aGk="] } });
  assert.equal(edit.action, "image_edit");
  assert.deepEqual(plugin.extractUsage(driver(edit)), { images: 1, megapixels: 1, input_images: 2, extra_input_images: 1, large_output: false, web_search: false, units: 1 });
  assert.throws(() => decodeNative({ model: "fal-ai/nano-banana-pro/edit", input: { prompt: "x" } }), /image_urls is required/);
  assert.throws(() => decodeNative({ model: "fal-ai/nano-banana-pro/edit", input: { prompt: "x", image_urls: ["ftp://a"] } }), /http\(s\) URL or a data URI/);
});

test("seedream sizes and multi-image runs", () => {
  const v5 = decodeNative({ model: "bytedance/seedream/v5/pro/text-to-image", input: { prompt: "x" } });
  assert.equal(v5.requestBody.input.image_size, "auto_2K");
  assert.deepEqual(plugin.extractUsage(driver(v5)), { images: 1, megapixels: 4, input_images: 0, extra_input_images: 0, large_output: true, web_search: false, units: 2 });
  const small = decodeNative({ model: "bytedance/seedream/v5/pro/text-to-image", input: { prompt: "x", image_size: "auto_1.5K", num_images: 3 } });
  assert.deepEqual(plugin.extractUsage(driver(small)), { images: 3, megapixels: 9, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 3 });
  const v45 = decodeNative({ model: "fal-ai/bytedance/seedream/v4.5/text-to-image", input: { prompt: "x", num_images: 2, max_images: 3 } });
  assert.deepEqual(v45.requestBody.input.image_size, { width: 2048, height: 2048 });
  assert.equal(plugin.extractUsage(driver(v45)).images, 6);
  const flux2 = decodeNative({ model: "fal-ai/flux-2-pro/edit", input: { prompt: "x", image_urls: ["https://a/1.png"] } });
  assert.equal(flux2.requestBody.input.image_size, "auto");
  assert.deepEqual(plugin.extractUsage(driver(flux2)), { images: 1, megapixels: 2, input_images: 1, extra_input_images: 0, large_output: false, web_search: false, units: 4 });
});

test("seedream 5.0 pro edit counts the additional input images once per output image", () => {
  const edit = decodeNative({ model: "bytedance/seedream/v5/pro/edit", input: { prompt: "x", num_images: 2, image_urls: ["https://a/1.png", "https://a/2.png", "https://a/3.png"] } });
  const reserved = plugin.extractUsage(driver(edit));
  assert.equal(reserved.images, 2);
  assert.equal(reserved.input_images, 3);
  assert.equal(reserved.extra_input_images, 4);
  // fal: 0.135 + 0.0045 x (inputs - 1) per 2K output image; the README expression prices the facts linearly.
  const readme = (f) => (f.large_output ? f.images * 0.135 : f.images * 0.0675) + f.extra_input_images * 0.0045;
  const vendor = (f) => f.images * ((f.large_output ? 0.135 : 0.0675) + 0.0045 * Math.max(f.input_images - 1, 0));
  assert.ok(Math.abs(readme(reserved) - vendor(reserved)) < 1e-12);
  // Settles on the delivered images, also for tasks reserved before the fact existed.
  const old = Object.assign({}, reserved);
  delete old.extra_input_images;
  for (const facts of [reserved, old]) {
    const task = queryCtx("bytedance/seedream/v5/pro/edit", { facts: facts });
    const done = plugin.extractUsageOnComplete(task, { status: "SUCCESS" }, { images: [{ url: "https://v3b.fal.media/a.jpg", width: 2048, height: 2048 }] });
    assert.equal(done.images, 1);
    assert.equal(done.extra_input_images, 2);
    assert.ok(Math.abs(readme(done) - vendor(done)) < 1e-12);
  }
  // One input image is free.
  const single = decodeNative({ model: "bytedance/seedream/v5/pro/edit", input: { prompt: "x", image_urls: ["https://a/1.png"] } });
  assert.equal(plugin.extractUsage(driver(single)).extra_input_images, 0);
});

test("curated video inputs send duration and resolution", () => {
  const kling = decodeNative({ model: "fal-ai/kling-video/v3/pro/text-to-video", input: { prompt: "x", duration: 10, generate_audio: false } });
  assert.equal(kling.action, "text_to_video");
  assert.deepEqual(kling.requestBody.input, { prompt: "x", duration: "10", generate_audio: false });
  assert.deepEqual(plugin.extractUsage(driver(kling)), { seconds: 10, resolution: "1080p", audio: false, units: 10 });
  const veo = decodeNative({ model: "fal-ai/veo3.1", input: { prompt: "x" } });
  assert.deepEqual(veo.requestBody.input, { prompt: "x", duration: "8s", resolution: "720p", generate_audio: true });
  assert.deepEqual(plugin.extractUsage(driver(veo)), { seconds: 8, resolution: "720p", audio: true, units: 8 });
  const h3 = decodeNative({ model: "minimax/h3/image-to-video", input: { prompt: "x", image_url: "https://a/1.png", resolution: "768p" } });
  assert.equal(h3.action, "image_to_video");
  assert.equal(h3.requestBody.input.resolution, "768P");
  assert.deepEqual(plugin.extractUsage(driver(h3)), { seconds: 5, resolution: "768p", audio: false, units: 5 });
  const omni = decodeNative({ model: "google/gemini-omni-flash/v1.2/text-to-video", input: { prompt: "x", duration: 12, resolution: "4K" } });
  assert.deepEqual(plugin.extractUsage(driver(omni)), { seconds: 12, resolution: "4k", audio: true, units: 12 });
  assert.throws(() => decodeNative({ model: "fal-ai/veo3.1", input: { prompt: "x", duration: "5s" } }), /4, 6, 8/);
  assert.throws(() => decodeNative({ model: "kling/v4/text-to-video", input: { prompt: "x", duration: 31 } }), /3 to 30/);
  assert.throws(() => decodeNative({ model: "kling/v4/image-to-video", input: { prompt: "x" } }), /start_image_url is required/);
  assert.throws(() => decodeNative({ model: "alibaba/wan-3.0/text-to-video", input: { prompt: "x", resolution: "4k" } }), /resolution must be one of/);
  assert.throws(() => decodeNative({ model: "kling/v4/image-to-video", input: { prompt: "x", start_image_url: "https://a", aspect_ratio: "16:9" } }), /aspect_ratio is not a supported input/);
  assert.throws(() => decodeNative({ model: "fal-ai/veo3.1", input: {} }), /prompt is required/);
});

test("openai images map n, size and edits", () => {
  const intent = imageDecode({ model: "fal-ai/flux/dev", prompt: "x", n: 2, size: "1536x1024", response_format: "b64_json", quality: "hd" });
  assert.deepEqual(intent.requestBody.input, { prompt: "x", num_images: 2, image_size: { width: 1536, height: 1024 } });
  assert.equal(plugin.extractUsage(driver(intent)).megapixels, 4);
  const banana = imageDecode({ model: "fal-ai/nano-banana-pro", prompt: "x", size: "2048x1152" });
  assert.equal(banana.requestBody.input.resolution, "2K");
  assert.equal(banana.requestBody.input.aspect_ratio, "16:9");
  const edit = imageDecode({ model: "bytedance/seedream/v5/pro/edit", prompt: "x", image: ["https://a/1.png", { image_url: { url: "https://a/2.png" } }] }, "edit");
  assert.deepEqual(edit.requestBody.input.image_urls, ["https://a/1.png", "https://a/2.png"]);
  assert.throws(() => imageDecode({ model: "fal-ai/flux/dev", prompt: "x", image: "https://a/1.png" }), /only valid on \/v1\/images\/edits/);
  assert.throws(() => imageDecode({ model: "fal-ai/flux/dev", prompt: "x", image: "https://a/1.png" }, "edit"), /does not edit images/);
  assert.throws(() => imageDecode({ model: "fal-ai/flux-2-pro/edit", prompt: "x" }), /edits images/);
  assert.throws(() => imageDecode({ model: "fal-ai/flux-2-pro/edit", prompt: "x" }, "edit"), /image is required/);
  assert.throws(() => imageDecode({ model: "fal-ai/flux/dev", prompt: "x", mask: "https://a" }, "edit"), /mask/);
  assert.throws(() => imageDecode({ model: "fal-ai/flux/dev", prompt: "x", size: "big" }), /WIDTHxHEIGHT/);
  const upload = protocols.openai_image.decodeRequest({
    model: "fal-ai/nano-banana-pro/edit",
    operation: "edit",
    body: { kind: "multipart", fields: { prompt: ["x"] }, files: [{ ref: "request_file:image", field: "image", filename: "a.png", mimeType: "IMAGE/PNG", size: 3 }] },
  });
  assert.deepEqual(upload.requestBody.input.image_urls, [{ __fileRef: "request_file:image", encoding: "dataUrl", mimeType: "image/png" }]);
});

test("openai videos map seconds, size and input_reference", () => {
  const intent = videoDecode({ model: "kling/v4/text-to-video", prompt: "x", seconds: "10", size: "1280x720" });
  assert.deepEqual(intent.requestBody.input, { prompt: "x", duration: 10, aspect_ratio: "16:9", resolution: "720p" });
  const i2v = videoDecode({ model: "fal-ai/veo3.1/image-to-video", prompt: "x", seconds: 6, size: "1080x1920", input_reference: { image_url: "https://a/1.png" } });
  assert.deepEqual(i2v.requestBody.input, { prompt: "x", duration: "6s", aspect_ratio: "9:16", resolution: "1080p", image_url: "https://a/1.png", generate_audio: true });
  assert.throws(() => videoDecode({ model: "kling/v4/text-to-video", prompt: "x", input_reference: "https://a/1.png" }), /image-to-video endpoint/);
  assert.throws(() => videoDecode({ model: "xai/grok-imagine-video/v1.5/text-to-video", prompt: "x", generate_audio: true }), /not supported/);
  assert.throws(() => videoDecode({ model: "fal-ai/veo3.1", prompt: "x", seconds: 5 }), /4, 6, 8/);
  const upload = protocols.openai_video.decodeRequest({
    model: "minimax/h3/image-to-video",
    body: { kind: "multipart", fields: { prompt: ["x"], seconds: ["5"] }, files: [{ ref: "request_file:input_reference", field: "input_reference", filename: "a.jpg", mimeType: "image/jpeg", size: 3 }] },
  });
  assert.deepEqual(upload.requestBody.input.image_url, { __fileRef: "request_file:input_reference", encoding: "dataUrl", mimeType: "image/jpeg" });
});

test("submit parse keeps the queue app path and reserved facts", () => {
  const intent = decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "x" } });
  const parsed = plugin.parseSubmitResponse(driver(intent), {
    statusCode: 200,
    headers: {},
    body: { request_id: "req-1", status_url: "https://queue.fal.run/fal-ai/flux/requests/req-1/status", response_url: "https://queue.fal.run/fal-ai/flux/requests/req-1", queue_position: 3 },
  });
  assert.equal(parsed.taskId, "req-1");
  assert.deepEqual(parsed.taskData, { request_id: "req-1", status: "IN_QUEUE", queue_position: 3 });
  assert.equal(parsed.state.app, "/fal-ai/flux");
  assert.deepEqual(parsed.state.facts, { images: 1, megapixels: 1, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 1 });
  // Without usable URLs the app is the first two segments of the endpoint.
  const bare = plugin.parseSubmitResponse(driver(decodeNative({ model: "fal-ai/kling-video/v3/pro/text-to-video", input: { prompt: "x" } })), { statusCode: 200, headers: {}, body: { request_id: "r2", status_url: "https://evil.example/x" } });
  assert.equal(bare.state.app, "/fal-ai/kling-video");
  assert.throws(() => plugin.parseSubmitResponse(driver(intent), { statusCode: 200, headers: {}, body: {} }), /request_id/);
});

test("query reads the status, then the result once complete", () => {
  const state = { app: "/fal-ai/flux", facts: { units: 1 } };
  fetched.length = 0;
  fetchImpl = () => ({ status: 200, headers: {}, body: { status: "IN_PROGRESS", request_id: "req-1" } });
  let request = plugin.buildQueryRequest(queryCtx("fal-ai/flux/dev", state));
  assert.equal(request.url, BASE + "/fal-ai/flux/requests/req-1/status");
  assert.equal(request.headers.Authorization, "Key " + KEY);
  assert.equal(fetched[0].url, BASE + "/fal-ai/flux/requests/req-1/status");
  fetchImpl = () => ({ status: 200, headers: {}, body: { status: "COMPLETED", request_id: "req-1" } });
  request = plugin.buildQueryRequest(queryCtx("fal-ai/flux/dev", state));
  assert.equal(request.url, BASE + "/fal-ai/flux/requests/req-1");
  // A failed request is reported by its status.
  fetchImpl = () => ({ status: 200, headers: {}, body: { status: "COMPLETED", request_id: "req-1", error: "boom" } });
  assert.equal(plugin.buildQueryRequest(queryCtx("fal-ai/flux/dev", state)).url, BASE + "/fal-ai/flux/requests/req-1/status");
  fetchImpl = () => {
    throw new Error("network");
  };
  assert.equal(plugin.buildQueryRequest(queryCtx("fal-ai/flux/dev", null)).url, BASE + "/fal-ai/flux/requests/req-1/status");
});

test("task states map to gateway statuses", () => {
  const ctx = queryCtx("fal-ai/flux/dev", { app: "/fal-ai/flux", facts: {} });
  const ok = { status: 200, headers: {} };
  assert.deepEqual(plugin.parseTaskResult(ctx, { status: "IN_QUEUE", request_id: "req-1", queue_position: 2 }, ok), { status: "QUEUED" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { status: "IN_PROGRESS", request_id: "req-1" }, ok), { status: "IN_PROGRESS" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { status: "COMPLETED", request_id: "req-1" }, ok), { status: "IN_PROGRESS", progress: "99%" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { status: "COMPLETED", request_id: "req-1", error: "Internal error", error_type: "runner_disconnected" }, ok), { status: "FAILURE", reason: "Internal error (runner_disconnected)" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { detail: [{ msg: "prompt too long", loc: ["body", "prompt"] }] }, { status: 422, headers: {} }), { status: "FAILURE", reason: "prompt too long" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { detail: "Request is still in progress" }, { status: 400, headers: {} }), { status: "UNKNOWN", reason: "result not ready" });
  assert.deepEqual(plugin.parseTaskResult(ctx, { detail: "cancelled" }, { status: 499, headers: {} }), { status: "FAILURE", reason: "request was cancelled" });
  assert.equal(plugin.parseTaskResult(ctx, "oops", ok).status, "UNKNOWN");
  assert.deepEqual(plugin.parseTaskResult(ctx, { images: [] }, ok), { status: "FAILURE", reason: "fal returned no output file" });
  const done = plugin.parseTaskResult(ctx, { images: [{ url: "https://v3.fal.media/files/a.png", width: 1024, height: 1024 }] }, { status: 200, headers: { "X-Fal-Billable-Units": "1.5" } });
  assert.deepEqual(done, { status: "SUCCESS", progress: "100%", state: { app: "/fal-ai/flux", facts: {}, billable_units: 1.5 } });
  // Generic endpoints may answer with text only.
  assert.deepEqual(plugin.parseTaskResult(queryCtx("fal-ai/any-llm", null), { output: "hello" }, ok), { status: "SUCCESS", progress: "100%" });
});

test("settlement uses delivered images and fal's billable units", () => {
  const reserved = { images: 2, megapixels: 2, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 2 };
  const task = queryCtx("fal-ai/flux/dev", { app: "/fal-ai/flux", facts: reserved });
  const data = { images: [{ url: "https://v3.fal.media/files/a.png", width: 1920, height: 1080, content_type: "image/png" }] };
  assert.deepEqual(plugin.extractUsageOnComplete(task, { status: "SUCCESS" }, data), { images: 1, megapixels: 2, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 2 });
  assert.deepEqual(plugin.extractUsageOnComplete(task, { status: "SUCCESS", plugin_state: { billable_units: 3 } }, data).units, 3);
  // Seedream 5.0 settles its size tier on the delivered size.
  const seedream = queryCtx("bytedance/seedream/v5/pro/text-to-image", { facts: { images: 1, megapixels: 4, input_images: 0, extra_input_images: 0, large_output: true, web_search: false, units: 2 } });
  assert.deepEqual(plugin.extractUsageOnComplete(seedream, { status: "SUCCESS" }, { images: [{ url: "https://v3b.fal.media/a.jpg", width: 1536, height: 1536 }] }), { images: 1, megapixels: 3, input_images: 0, extra_input_images: 0, large_output: false, web_search: false, units: 1 });
  const video = queryCtx("fal-ai/veo3.1", { facts: { seconds: 8, resolution: "720p", audio: true, units: 8 } });
  assert.deepEqual(plugin.extractUsageOnComplete(video, { status: "SUCCESS", plugin_state: { billable_units: 16 } }, { video: { url: "https://v3.fal.media/v.mp4" } }), { seconds: 8, resolution: "720p", audio: true, units: 16 });
  const generic = queryCtx("fal-ai/any-llm", { facts: { units: 1 } });
  assert.deepEqual(plugin.extractUsageOnComplete(generic, { status: "SUCCESS", plugin_state: { billable_units: 0.25 } }, { output: "x" }), { units: 0.25 });
  assert.deepEqual(plugin.extractUsageOnComplete(generic, { status: "SUCCESS" }, { output: "x" }), { units: 1 });
  // A reported count in the stored state counts too.
  assert.deepEqual(plugin.extractUsageOnComplete(queryCtx("fal-ai/any-llm", { facts: { units: 1 }, billable_units: 7 }), { status: "SUCCESS" }, { output: "x" }), { units: 7 });
  // Other calls keep the reservation.
  assert.equal(plugin.extractUsageOnComplete(task, { status: "SUCCESS" }, undefined), null);
  assert.equal(plugin.extractUsageOnComplete(task, { status: "FAILURE" }, data), null);
  assert.equal(plugin.extractUsageOnComplete(task, { status: "SUCCESS" }, { status: "COMPLETED", request_id: "x" }), null);
  assert.equal(plugin.extractUsageOnComplete(queryCtx("fal-ai/flux/dev", null), { status: "SUCCESS" }, data), null);
});

test("artifacts list fal media files and download credentialless", () => {
  const data = {
    images: [
      { url: "https://v3.fal.media/files/a.png", content_type: "image/png", width: 1024, height: 1024 },
      { url: "https://v3b.fal.media/files/b.jpg" },
    ],
    video: { url: "https://v3.fal.media/files/v.mp4", content_type: "video/mp4" },
    audio: { url: "https://storage.googleapis.com/falserverless/out/a.mp3" },
    extra: { url: "https://evil.example/x.png" },
    seed: 1,
  };
  const artifacts = plugin.listArtifacts({ status: "SUCCESS", data: data });
  assert.deepEqual(artifacts, [
    { key: "audio-1", type: "audio", mimeType: "audio/mpeg" },
    { key: "image-1", type: "image", mimeType: "image/png" },
    { key: "image-2", type: "image", mimeType: "image/jpeg" },
    { key: "video", type: "video", mimeType: "video/mp4" },
  ]);
  assert.deepEqual(plugin.listArtifacts({ status: "IN_PROGRESS", data: data }), []);
  const content = plugin.buildContentRequest({ artifactKey: "video", data: data, clientRequest: { method: "HEAD", headers: {} }, baseUrl: BASE, apiKey: KEY });
  assert.deepEqual(content, { url: "https://v3.fal.media/files/v.mp4", method: "HEAD", credentialless: true });
  assert.throws(() => plugin.buildContentRequest({ artifactKey: "image-9", data: data, clientRequest: { method: "GET", headers: {} } }), /artifact_not_found/);
});

test("presenters hide fal URLs behind gateway addresses", () => {
  const data = { images: [{ url: "https://v3.fal.media/files/a.png", width: 1, height: 1 }], seed: 7 };
  const done = native.requestStatus({ artifacts: { "image-1": { key: "image-1", type: "image", url: "https://gw.example/assets/1" } } }, { task_id: "task_1", status: "SUCCESS", data: data });
  assert.deepEqual(done, { request_id: "task_1", status: "COMPLETED", response: { images: [{ url: "https://gw.example/assets/1", width: 1, height: 1 }], seed: 7 } });
  assert.equal(data.images[0].url, "https://v3.fal.media/files/a.png");
  assert.deepEqual(native.requestStatus({ artifacts: {} }, { task_id: "task_1", status: "QUEUED", data: { status: "IN_QUEUE", request_id: "r", queue_position: 4 } }), { request_id: "task_1", status: "IN_QUEUE", queue_position: 4 });
  assert.deepEqual(native.requestStatus({ artifacts: {} }, { task_id: "task_1", status: "IN_PROGRESS", data: { status: "IN_PROGRESS", request_id: "r" } }), { request_id: "task_1", status: "IN_PROGRESS" });
  assert.deepEqual(native.requestStatus({ artifacts: {} }, { task_id: "task_1", status: "FAILURE", fail_reason: "timeout", data: { status: "IN_PROGRESS", request_id: "r" } }), { request_id: "task_1", status: "COMPLETED", error: "timeout", error_type: "request_failed" });
  assert.deepEqual(native.requestSubmitted({}, { task_id: "task_1", data: {} }), { request_id: "task_1", status: "IN_QUEUE" });
  assert.deepEqual(native.error({}, { message: "bad", code: "invalid_request" }), { detail: "bad", error_type: "invalid_request" });
  assert.deepEqual(protocols.openai_image.render({}, { status: "SUCCESS", data: data }), { data: [{ url: "https://v3.fal.media/files/a.png" }] });
  assert.deepEqual(protocols.openai_video.render({}, { status: "FAILURE", fail_reason: "nsfw", data: {} }), { object: "video", error: { code: "video_generation_failed", message: "nsfw" } });
  assert.deepEqual(protocols.openai_video.render({}, { status: "SUCCESS", data: {} }), { object: "video" });
});

test("hooks do not mutate their arguments", () => {
  const body = deepFreeze({ model: "fal-ai/nano-banana-pro/edit", input: { prompt: "x", image_urls: ["https://a/1.png"], resolution: "2k" } });
  const intent = decodeNative(body);
  const ctx = deepFreeze(driver(intent));
  plugin.buildSubmitRequest(ctx);
  plugin.extractUsage(ctx);
  plugin.parseSubmitResponse(ctx, deepFreeze({ statusCode: 200, headers: {}, body: { request_id: "r" } }));
  const data = deepFreeze({ images: [{ url: "https://v3.fal.media/a.png", width: 2048, height: 2048 }] });
  const task = deepFreeze(queryCtx("fal-ai/nano-banana-pro/edit", { facts: plugin.extractUsage(ctx) }));
  plugin.parseTaskResult(task, data, deepFreeze({ status: 200, headers: { "X-Fal-Billable-Units": "1" } }));
  plugin.extractUsageOnComplete(task, deepFreeze({ status: "SUCCESS" }), data);
  native.requestStatus(deepFreeze({ artifacts: { "image-1": { url: "https://gw/1" } } }), deepFreeze({ task_id: "t", status: "SUCCESS", data: data }));
  imageDecode(deepFreeze({ model: "fal-ai/flux/dev", prompt: "x", size: "1024x1024" }));
});

test("code never references meta, so the gateway can read it statically", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const rest = src.slice(src.indexOf("\n};\n", src.indexOf("export const meta = {")));
  assert.doesNotMatch(rest, /(^|[^A-Za-z0-9_$.])meta([^A-Za-z0-9_$]|$)/m);
  assert.ok(rest.includes(JSON.stringify(meta.models)));
});

// --- through another New API gateway (type-60 channel) -----------------------

const GW = "http://middle.example:3000";
const GW_PREFIX = GW + "/" + meta.key;
const viaGW = { baseUrl: GW, apiKey: "sk-gateway", authHeader: "Bearer sk-gateway", upstream: { kind: "new_api" } };

test("meta declares the New API upstream", () => {
  assert.deepEqual(meta.upstreams, ["vendor", "new_api"]);
});

test("new_api: submit goes to the middle gateway's native /fal/requests with Bearer only", () => {
  const routes = new Set(meta.routes.map((r) => r.method + " " + r.path));
  const intent = decodeNative({ model: "fal-ai/flux/dev", input: { prompt: "a fox", num_images: 2 }, priority: "low", start_timeout: 30 });
  const request = plugin.buildSubmitRequest(driver(intent, viaGW));
  assert.equal(request.url, GW_PREFIX + "/fal/requests");
  assert.ok(routes.has("POST " + request.url.slice(GW_PREFIX.length)));
  assert.deepEqual(request.headers, { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer sk-gateway" });
  assert.deepEqual(request.body, { model: "fal-ai/flux/dev", input: plugin.buildSubmitRequest(driver(intent)).body, priority: "low", start_timeout: 30 });
  // The middle gateway decodes it on its native route and sends fal the same input.
  const middle = decodeNative(JSON.parse(JSON.stringify(request.body)));
  const vendor = plugin.buildSubmitRequest(driver(middle));
  assert.deepEqual(vendor.body, plugin.buildSubmitRequest(driver(intent)).body);
  assert.deepEqual(plugin.extractUsage(driver(middle)), plugin.extractUsage(driver(intent, viaGW)), "both layers reserve the same facts");
  // OpenAI requests on the outer gateway become native requests on the middle one.
  const video = plugin.buildSubmitRequest(driver(videoDecode({ model: "fal-ai/veo3.1", prompt: "a fox", seconds: "4", size: "1280x720" }), viaGW));
  assert.equal(video.body.model, "fal-ai/veo3.1");
  assert.deepEqual(decodeNative(video.body).requestBody, { input: video.body.input });
});

test("new_api: a placeholder model passes to the middle gateway, which maps it", () => {
  const intent = decodeNative({ model: "fal-endpoint-2", input: { prompt: "x" } });
  const request = plugin.buildSubmitRequest(driver(intent, viaGW));
  assert.equal(request.body.model, "fal-endpoint-2");
  assert.deepEqual(plugin.extractUsage(driver(intent, viaGW)), { units: 1 });
  const parsed = plugin.parseSubmitResponse(driver(intent, viaGW), { statusCode: 200, headers: {}, body: native.requestSubmitted({}, { task_id: "task_middle", data: {} }) });
  assert.deepEqual(parsed, { taskId: "task_middle", taskData: { request_id: "task_middle", status: "IN_QUEUE" }, state: { facts: { units: 1 } } });
  const q = queryCtx("fal-endpoint-2", parsed.state, Object.assign({ taskId: "task_middle" }, viaGW));
  assert.equal(plugin.parseTaskResult(q, native.requestStatus({ artifacts: {} }, { task_id: "task_middle", status: "SUCCESS", data: { output: "text" } }), { status: 200, headers: {} }).status, "SUCCESS");
});

test("new_api: poll, settle and download through the middle gateway's replies", () => {
  fetched.length = 0;
  fetchImpl = () => {
    throw new Error("no prefetch expected");
  };
  const intent = imageDecode({ model: "fal-ai/flux/dev", prompt: "a fox", n: 2, size: "1920x1080" });
  const ctx = driver(intent, viaGW);
  const reserved = plugin.extractUsage(ctx);
  const parsed = plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: native.requestSubmitted({}, { task_id: "task_middle", data: {} }) });
  assert.equal(parsed.taskId, "task_middle");
  const q = queryCtx("fal-ai/flux/dev", parsed.state, Object.assign({ taskId: "task_middle" }, viaGW));
  assert.deepEqual(plugin.buildQueryRequest(q), { url: GW_PREFIX + "/fal/requests/task_middle", method: "GET", headers: { Accept: "application/json", Authorization: "Bearer sk-gateway" } });
  assert.ok(meta.routes.some((r) => r.type === "query" && r.path === "/fal/requests/:request_id"));
  assert.equal(fetched.length, 0);

  const vendorResult = { images: [{ url: "https://v3.fal.media/files/a.png", width: 1920, height: 1080, content_type: "image/png" }, { url: "https://v3.fal.media/files/b.png", width: 1920, height: 1080, content_type: "image/png" }], seed: 7 };
  const signed = (k) => GW + "/v1/tasks/task_middle/artifacts/" + k + "?sig=1";
  const status = (s, data) => native.requestStatus({ artifacts: s === "SUCCESS" ? { "image-1": { key: "image-1", type: "image", url: signed("image-1") }, "image-2": { key: "image-2", type: "image", url: signed("image-2") } } : {} }, { task_id: "task_middle", status: s, data: data });
  assert.deepEqual(plugin.parseTaskResult(q, status("QUEUED", { status: "IN_QUEUE", request_id: "r" }), { status: 200, headers: {} }), { status: "QUEUED" });
  assert.deepEqual(plugin.parseTaskResult(q, status("IN_PROGRESS", { status: "IN_PROGRESS", request_id: "r" }), { status: 200, headers: {} }), { status: "IN_PROGRESS" });
  const failed = plugin.parseTaskResult(q, status("FAILURE", { status: "IN_PROGRESS", request_id: "r" }), { status: 200, headers: {} });
  assert.equal(failed.status, "FAILURE");
  const done = status("SUCCESS", vendorResult);
  const result = plugin.parseTaskResult(q, done, { status: 200, headers: {} });
  assert.deepEqual(result, { status: "SUCCESS", progress: "100%" });
  // The facts follow the delivered images exactly as on the middle gateway; fal's
  // billable-units header does not pass the middle gateway.
  const settled = plugin.extractUsageOnComplete(q, result, done);
  const vendorQ = queryCtx("fal-ai/flux/dev", { app: "/fal-ai/flux", facts: reserved });
  assert.deepEqual(settled, plugin.extractUsageOnComplete(vendorQ, { status: "SUCCESS" }, vendorResult));
  assert.equal(settled.images, 2);
  const task = { status: "SUCCESS", data: done };
  assert.deepEqual(plugin.listArtifacts(task), [{ key: "image-1", type: "image", mimeType: "image/png" }, { key: "image-2", type: "image", mimeType: "image/png" }]);
  assert.deepEqual(plugin.buildContentRequest(Object.assign({}, q, { artifactKey: "image-2", upstreamTaskId: "task_middle", data: done, clientRequest: { method: "GET", headers: {} } })), { url: GW + "/v1/tasks/task_middle/artifacts/image-2/content", method: "GET", headers: { Authorization: "Bearer sk-gateway" } });
  assert.deepEqual(protocols.openai_image.render({}, task), { data: [{ url: signed("image-1") }, { url: signed("image-2") }] });
  // The outer gateway's own presenter swaps in its own download addresses.
  const outerLinks = { "image-1": { key: "image-1", type: "image", url: "https://outer.example/a1" }, "image-2": { key: "image-2", type: "image", url: "https://outer.example/a2" } };
  const outerReply = native.requestStatus({ artifacts: outerLinks }, { task_id: "task_outer", status: "SUCCESS", data: done });
  assert.deepEqual(outerReply.response.images.map((i) => i.url), ["https://outer.example/a1", "https://outer.example/a2"]);
  assert.equal(outerReply.response.images[0].width, 1920);
  assert.ok(!JSON.stringify(outerReply).includes("middle.example"));
  const again = native.requestStatus({ artifacts: {} }, { task_id: "task_outer", status: "SUCCESS", data: done });
  assert.deepEqual(again.response, done.response);
});

test("new_api: a failed middle request fails the outer task", () => {
  const q = queryCtx("fal-ai/flux/dev", { facts: { units: 1 } }, Object.assign({ taskId: "task_middle" }, viaGW));
  const body = native.requestStatus({ artifacts: {} }, { task_id: "task_middle", status: "FAILURE", data: { status: "COMPLETED", request_id: "r", error: "nsfw", error_type: "content_policy" } });
  assert.deepEqual(plugin.parseTaskResult(q, body, { status: 200, headers: {} }).status, "FAILURE");
  assert.equal(plugin.extractUsageOnComplete(q, { status: "FAILURE" }, body), null);
});
