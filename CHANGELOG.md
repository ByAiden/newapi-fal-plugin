---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.0.0"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [1.0.0]

### Added

- Runs fal.ai model endpoints through fal's queue API on a Task Plugin channel with `Key` authentication, polling each request's status and reading its result as soon as it completes.
- Native `POST /fal/requests` and `GET /fal/requests/{request_id}` routes for every declared model, returning fal's status and result with output files served through the gateway.
- OpenAI Images (generations and edits) and Videos entry points for curated FLUX.1, FLUX.2 Pro, Nano Banana Pro, Seedream 4.5, Seedream 5.0 Pro, Kling v3 Pro, Kling 4.0, Wan 3.0, MiniMax H3, Gemini Omni Flash 1.2, Veo 3.1 and Grok Imagine Video 1.5 endpoints, with input validation and explicit price-setting fields.
- Placeholder models `fal-endpoint-1` to `fal-endpoint-10` that a channel maps to any other fal endpoint id.
- Usage facts per model (images, megapixels, input images, output resolution tier, web search, seconds, resolution, audio) plus fal's own billing units from the `X-Fal-Billable-Units` header, with recommended price expressions in the README.
