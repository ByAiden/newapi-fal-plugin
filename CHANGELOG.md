---
changelogVersion: 1
plugin: "byaiden_fal"
version: "1.1.1"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---

# Changelog

## [1.1.1]

### Added

- Usage fact `extra_input_images`: the input images after the first, counted once per output image. fal charges every output image of a Seedream 5.0 Pro edit 0.0045 per additional input image, so `u("images") * price + u("extra_input_images") * 0.0045` matches fal's price exactly and shows as a price table on the gateway's model page. Every curated image model reports it at submission and settles it on the delivered images, on an outer gateway too.

### Fixed

- The README expressions for FLUX.2 Pro, FLUX.2 Pro edit and Seedream 5.0 Pro edit now display as a price table on the gateway's model page (one number per usage field instead of a parenthesized sum or a product of two fields); the charges are unchanged.
