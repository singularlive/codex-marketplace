# Text Ticker (widgetId 1216)

Legacy-font horizontal message crawl. Use [Text Ticker authoring](../widgets/text-ticker.md) for paired construction and [the composition-script workflow](../composition-scripts.md) for runtime work. Inspect the loaded widget version and payload before updates. The local renderer is `app/components/widgets/WidgetSimpleTicker.js`.

```javascript
const ticker = comp.findWidget("Legacy news crawl")[0];
ticker.setPayload({ text: "First headline\nSecond headline", speed: 20 });
```

Preserve the complete inspected `font` object. The renderer consumes `text`, `font`, `height`, `color`, `speed`, `messagePadding`, `direction`, `letterSpacing`, `wordSpacing`, image-separator fields, and shadow fields. Newlines form a queue and empty lines are skipped. Trusted message content is inserted as unsanitized HTML; never interpolate untrusted content.

`In` resumes active timelines and other animation states pause them. Text changes reset the next-message index while active messages finish. Speed, direction, padding, separator, spacing, font, and resize changes can rebuild or restart the crawl. Custom messages include `tickerPause`, `tickerResume`, and `messageStart`; the latter contains the message text, so sanitized reports must omit it. This legacy renderer loops continuously and does not emit `tickerComplete`.

Verify movement over time, both directions, replacement and eventual clearing, pause/resume, image loading, font readiness, and resize in the Player. Use timed captures because the crawl may never become visually still.
