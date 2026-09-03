# Video Animation Widget (widgetId 3934)

Payload reference for `widget.setPayload(...)` on Video Animation. For paired construction, use [Video Animation authoring](../widgets/video-animation.md). Live inspection is authoritative for the loaded version.

Payload keys are `videoIn`, `videoOut`, and `videoLoop` URL strings; `objectFit` (`contain`, `cover`, or `fill`); numeric `shift`; boolean `loopActive`; and numeric `fadeDuration` seconds. The widget reacts to Composer Timeline animation rather than button clicks.

```javascript
const video = comp.findWidget("Video Animation")[0];
video.setPayload({
  videoIn: "https://example.com/in.webm",
  videoLoop: "https://example.com/loop.webm",
  videoOut: "https://example.com/out.webm",
  loopActive: true,
  fadeDuration: 0.5,
  objectFit: "cover",
  shift: 0
});
```

The renderer emits custom `loadedmetadata`, `error`, `canplay`, `playing`, `pause`, and `ended` events. Events include `type` (`in`, `out`, or `loop`); metadata includes dimensions and duration, while playback events include current time where applicable.
