# Text Ticker authoring

Use `text-ticker` (widget `1216`) for a legacy-font horizontal news crawl. Newlines separate queued messages; empty lines are skipped. Prefer [Metric Text Ticker](metric-text-ticker.md) for new Font 2.0 work.

Run `primitives --primitive text-ticker`, then inspect created instances with `get`. Metadata loads on demand, including creation before discovery. Published version 7 exposes `textarea` text, legacy `font`, color, pixel letter/word spacing, percent height/padding/speed, direction, image separators, and shadows. The live schema remains authoritative; preserve the complete inspected font object when updating other properties.

```json
{
  "version": 2,
  "elements": [{
    "key": "legacy-crawl",
    "primitive": "text-ticker",
    "name": "Legacy news crawl",
    "placement": { "unit": "percent", "left": 5, "top": 85, "width": 90, "height": 8 },
    "properties": {
      "text": "First headline\nSecond headline",
      "speed": 20,
      "messagePadding": 10,
      "direction": "RightToLeft"
    },
    "control": { "name": "Headlines", "type": "textarea", "property": "text" }
  }]
}
```

Shared typed operations preserve unrelated values and reject invalid types or serialized values over 32 KB; catalog ranges and choices still come from live inspection. Published version 7 offers 0–500 for speed and message padding, 0–100 for text height, and `RightToLeft`/`LeftToRight` direction. Positive speed scrolls as a percentage of widget width per second. Separator images must use trusted absolute HTTP(S), protocol-relative, or `data:image/` URLs.

The renderer requires a valid legacy font before it starts. `In` resumes and other animation states pause the crawl; no Widget Timeline effect is required. Text replacement resets queue selection without immediately removing messages already in flight, and clearing is not an immediate visual blank. Verify motion, direction, queue draining, pause/resume, separators, and resize in the Player with timed capture. See [Text Ticker scripting](../composition-scripting/widget-text-ticker.md).
