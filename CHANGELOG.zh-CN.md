---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.1.1"
locale: "zh-CN"
---

# Changelog

## [1.1.1]

### Added

- 新增用量字段 `extra_input_images`：第一张之后的输入图片数，按每张输出图各计一次。fal 对 Seedream 5.0 Pro 编辑的每张输出图按每张额外输入图收 0.0045，因此 `u("images") * 单价 + u("extra_input_images") * 0.0045` 与 fal 的价格完全一致，并能在模型广场显示为价格表。所有精选图片模型都在提交时上报该字段，并按实际交付的图片结算，外层网关上也一样。

### Fixed

- README 中 FLUX.2 Pro、FLUX.2 Pro 编辑和 Seedream 5.0 Pro 编辑的表达式现在能在模型广场显示为价格表（每个用量字段一个数字，不再使用括号求和或两个字段相乘）；收费不变。
