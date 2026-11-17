---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.1.0"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---

# Changelog

## [1.1.0]

### Added

- Works through another New API gateway: a New API (type 60) channel on an outer gateway can bind the plugin. It then sends requests as `{model, input}` to the middle gateway's `/byaiden_fal/fal/requests` with the gateway token instead of fal's `Key` auth, polls `/byaiden_fal/fal/requests/{id}`, downloads through the middle gateway's signed links, and computes the same image and video usage facts, so the outer gateway prices with the same per-model expressions.
