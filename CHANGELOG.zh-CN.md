---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.1.0"
locale: "zh-CN"
---

# Changelog

## [1.1.0]

### Added

- 支持经由另一个 New API 网关：外层网关的 New API（类型 60）渠道可以绑定本插件，插件用网关令牌代替 fal 的 `Key` 鉴权，以 `{model, input}` 发到中间网关的 `/byaiden_fal/fal/requests`，在 `/byaiden_fal/fal/requests/{id}` 查询，通过中间网关签名的链接下载，并计算相同的图片和视频用量，外层可以直接用同样的按模型表达式。
