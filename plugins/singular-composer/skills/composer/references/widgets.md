# Widget authoring references

Use this index to choose a reference for building or editing widgets in paired Composer. Widget-specific authoring guides live in `widgets/`; this index stays at `references/widgets.md`. Read only the document matching the task, alongside [graphics.md](graphics.md) for shared layout, color, and declarative-specification rules.

Selection follows the creation-default policy in the runtime skill: prefer fully inspectable native text and shape primitives. Do not introduce Bodymovin, Sound, Video, or Web Page content unless the request or supplied material identifies that external runtime dependency. Image, HTML, AISVG, tickers, clocks, timers, Table, and Grid are conditional on their actual semantic need rather than default decoration. Existing specialized widgets may still be inspected, preserved, or edited when the user targets them.

| Primitive | Authoring reference | Read it for |
| --- | --- | --- |
| `text` | [Text and fonts](widgets/text.md) | Font discovery, structured font values, formatting, and Text edits. |
| `metric-text` | [Metric Text](widgets/metric-text.md) | Single-line Font 2.0 text, character alignment, fitting, spacing, and insets. |
| `metric-text-ticker` | [Metric Text Ticker](widgets/metric-text-ticker.md) | Horizontal Font 2.0 message crawl with speed, direction and image separators. |
| `text-ticker` | [Text Ticker](widgets/text-ticker.md) | Legacy-font horizontal message crawl with speed, direction and image separators. |
| `metric-text-style` | [Metric Text Style](widgets/metric-text-style.md) | SVG text with gradient fill, outline, glow, shadow and native looping effects; staged dynamic field updates. |
| `metric-text-animation` | [Metric Text Animation](widgets/metric-text-animation.md) | Font 2.0 text with native character/word Timeline and text-change effects; inspect live fields after creation. |
| `metric-text-ml` | [Metric Text ML](widgets/metric-text-ml.md) | Multiline Font 2.0 text, wrapping, line limits, ellipsis, vertical alignment, and Textarea inputs. |
| `rectangle` | [Rectangle](widgets/rectangle.md) | Shape sizing, pivots, rounded and beveled corners, hollow frames, and strokes. |
| `circle` | [Circle](widgets/circle.md) | Disks, ellipses, rings, wedges, angular endpoints, and outlines. |
| `gradient` | [Gradient](widgets/gradient.md) | CSS linear/radial backgrounds, transparency, complete style replacement, and clearing. |
| `html` | [HTML](widgets/html.md) | Trusted HTML fragments, full content replacement, clearing, and unsanitized-markup precautions. |
| `image` | [Image](widgets/image.md) | Image slots, the default placeholder, fit, shift, mirroring, and load verification. |
| `aisvg` | [AISVG](widgets/aisvg.md) | Sanitized SVG/JSON, paths, masks, filters, dynamic bindings, and widget animation. |
| `bodymovin` | [Bodymovin](widgets/bodymovin.md) | Lottie JSON URL assets and Composer-driven widget Timeline animation. |
| `bodymovin-loop` | [Bodymovin Loop](widgets/bodymovin-loop.md) | Continuously looping Lottie assets, speed, direction, and timed capture. |
| `sound` | [Sound](widgets/sound.md) | Audio URL, volume, In/Out/loop playback policy, and Player-only verification. |
| `video-animation` | [Video Animation](widgets/video-animation.md) | Separate In, Out, and optional loop clips, fit, shift, and crossfade timing. |
| `video-background` | [Video Background](widgets/video-background.md) | Muted looping background video, fit, shift, and composition-state playback. |
| `video-clip` | [Video Clip](widgets/video-clip.md) | Muted controllable clip playback, looping, fit, opacity, and button actions. |
| `video-clip-with-audio` | [Video Clip with Audio](widgets/video-clip-with-audio.md) | Audible controllable clip playback with the Video Clip field and button contract. |
| `web-page` | [Web Page](widgets/web-page.md) | Embedded HTTP(S) page URL and optional periodic iframe reload. |
| `timer` | [Timer](widgets/timer.md) | Time Control input, count-up/count-down bounds, formatting, frequency, and Widget Node templates. |
| `date-time-countdown` | [Date / Time Countdown](widgets/date-time-countdown.md) | Absolute target dates, stop/continue behavior, padding, and widget-owned digit templates. |
| `current-date-time` | [Current Date and Time](widgets/current-date-time.md) | Formatted clocks, fixed UTC offsets, locale, update frequency, and Widget Node templates. |
| `table` | [Table](widgets/table.md) | Row templates, composition-valued fields, validated row data, and Table updates. |
| `grid` | [Grid](widgets/grid.md) | Two-dimensional cell templates, validated content, spacing, pagination, and transitions. |

The index routes to knowledge; it does not duplicate schemas. Run `primitives --primitive <name>` to discover the loaded field contract and `get` for an existing instance. The live schema determines accepted fields and value shapes; authoring references explain how to use them. For widget-owned templates, also read [widget-subcompositions.md](widget-subcompositions.md) and [Widget Nodes](widget-nodes.md) when the owner supplies template outputs.

## Scripting is a separate phase

For JavaScript payload changes or runtime behavior, follow [composition-scripts.md](composition-scripts.md), then use its handoff routes and [widget scripting reference index](composition-scripting/widget-references.md). The `composition-scripting/widget-*.md` documents own runtime payload contracts. They do not replace the authoring references above or authorize scripts through the paired editor relay.
