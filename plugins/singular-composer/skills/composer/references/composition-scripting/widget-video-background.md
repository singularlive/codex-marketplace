# Video Background Widget (widgetId 3936)

Payload reference for `widget.setPayload(...)` on Video Background. For paired construction, use [Video Background authoring](../widgets/video-background.md). Live inspection is authoritative for the loaded version.

Payload keys are `videoFile` (URL), `objectFit` (`contain`, `cover`, or `fill`), and numeric `shift`.

```javascript
const background = comp.findWidget("Video Background")[0];
background.setPayload({
  videoFile: "https://example.com/background.mp4",
  objectFit: "cover",
  shift: 0
});
```

The renderer loops muted video, plays while the composition is In, and pauses while Out. It does not expose widget button actions.
