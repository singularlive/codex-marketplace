# Metric Text Ticker authoring

Use `metric-text-ticker` (widget `4672`) for a horizontal Font 2.0 news crawl. Newlines separate messages; empty or whitespace-only lines are skipped. Use [Metric Text ML](metric-text-ml.md) for simultaneous multiline text instead.

Run `primitives --primitive metric-text-ticker`, then inspect created instances with `get`. Metadata loads on demand, including creation before discovery. The live schema is authoritative: version 2 exposes a `textarea` text field, `metricfont`, color, spacing, speed, direction, image separators, shadows and hidden `emitEvents`.

```json
{
  "version": 2,
  "elements": [{
    "key": "news-crawl",
    "primitive": "metric-text-ticker",
    "name": "News crawl",
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

Preserve the complete inspected `font.fontData`, including resolved metrics when present. Ordinary Text font commands do not support `metricfont`. The shared typed operations preserve unrelated values and reject invalid types or values exceeding the serialized 32 KB limit; they do not enforce all catalog ranges or selection choices.

- `speed` is advance as a percentage of widget width per second; use a positive value for motion. `messagePadding` is a percentage of widget width. Catalog version 2 offers 0–500 for both.
- `direction` is exactly `RightToLeft` or `LeftToRight`. Letter/word spacing and shadow distance/blur are percentages of widget height.
- `separatorActive`, `separatorImage`, and `separatorHeight` configure an image between messages, omitted before the first message. Use a trusted image URL. Height is a percentage of widget height. The local renderer interprets `separatorVerticalOffset` as pixels even though catalog version 2 labels it `%`.
- `loopActive`, `separatorText`, and `transform` are renderer payload fields absent from this published schema. Do not put them in declarative properties or guess a generic-update path. Use the separate scripting phase when needed.

Native scrolling does not require a Widget Timeline effect. In resumes scrolling; other animation states pause it. Text replacement changes the queue; already-active messages can finish scrolling, and clearing is not an immediate visual blank. Do not repeatedly resend unchanged text. Verify motion, queue replacement/clearing, direction and separator loading in the Player, using timed capture for continuous scrolling. See [Metric Text Ticker scripting](../composition-scripting/widget-metricticker.md).
