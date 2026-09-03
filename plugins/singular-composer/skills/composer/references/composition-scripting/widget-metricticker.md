# Metric Text Ticker (widgetId 4672)

Horizontal Font 2.0 message crawl. Use [Metric Text Ticker authoring](../widgets/metric-text-ticker.md) for paired construction and [the composition-script workflow](../composition-scripts.md) for runtime work. Inspect the actual widget/version before choosing payloads. The local renderer is `app/components/widgets/WidgetMetricTicker.js`; published catalog defaults and renderer fallbacks are distinct.

```javascript
const ticker = comp.findWidget("News crawl")[0];
ticker.setPayload({ text: "First headline\nSecond headline", speed: 20 });
```

The normal merged payload path preserves the existing font. Do not fabricate a font: retain complete inspected `font.fontData` and valid Font 2.0 metrics. The renderer needs resolved metrics to start scrolling.

| Payload | Type | Behavior |
| --- | --- | --- |
| `text` | string | Newline-separated messages. Blank lines are skipped; use `""` to empty the queue. Trusted `<html>...</html>` messages are unsanitized display markup. |
| `font` | object | Metric font object; see [Metric Text font object](widget-metrictext.md#font-object). |
| `color` | string/object | Solid text color using the native color formats. |
| `speed` | number | Percentage of widget width per second; positive values scroll. Renderer fallback 10, catalog v2 default 20. |
| `messagePadding` | number | Gap as percentage of widget width; initial fallback 10. |
| `direction` | string | `LeftToRight` reverses the initial `RightToLeft` direction. |
| `loopActive` | boolean | Initially true. False stops scheduling after the queue is exhausted. Runtime-only in catalog v2. |
| `letterSpacing`, `wordSpacing` | number | Percentage of widget height. |
| `transform` | string | `uppercase`, `lowercase`, `capitalize`, `small-caps`, or `none`; runtime-only in catalog v2. |
| `separatorActive` | boolean | Enable separators after the first message. |
| `separatorText` | string | Text separator takes precedence over an image. Runtime-only in catalog v2. |
| `separatorImage` | string | Image URL; local renderer accepts HTTP(S), protocol-relative and `data:image/` values. Use trusted assets. |
| `separatorHeight` | number | Image height as percentage of widget height. |
| `separatorVerticalOffset` | number | Image vertical offset in pixels in the local renderer, despite the catalog `%` label. |
| `shadowActive` | boolean | Enable inherited text shadow. |
| `shadowDirection` | number | Degrees. |
| `shadowDistance`, `shadowBlur` | number | Percentage of widget height. |
| `shadowColor` | string/object | Native solid color value. |
| `emitEvents` | boolean | Enable the custom messages below. |

## Queue and lifecycle behavior

Updates to nonempty text reset the next-message index while existing pool elements continue. Clearing empties the queue but does not immediately hide active messages; allow their remaining travel time. Speed, direction, padding, separator or spacing changes can restart the crawl. Font readiness and resize rebuild it. Avoid redundant payload delivery: any changed merged payload containing text can reset queue iteration even when its text is unchanged. Do not promise that changing `loopActive` alone restarts an already-exhausted queue.

`In` resumes active timelines; other animation states pause them. No Widget Timeline entrance setup is required. An image separator is omitted until loaded; successful loading can restart the ticker, and failed loading falls back to text without the image. The first message has no separator.

With `emitEvents: true`, custom messages are `tickerPause`, `tickerResume`, `tickerComplete`, and `messageStart`. The latter carries `messageIndex`, `messageTotal`, `width`, `text`, and `duration` (seconds). `tickerComplete` means the next-message scheduler exhausted a nonlooping queue; the final message can still be visible. Do not log message text in sanitized verification reports. There is no bounds-event contract or button command for restarting this widget.

Verify moving positions over time, both directions, queued text replacement, eventual clearing, pause/resume and separator loading in the Player. Use timed captures because a looping ticker does not become visually still. Stored Composer values alone do not prove motion or completion.
