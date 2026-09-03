# Video Clip Widget (widgetId 812)

Payload reference for `widget.setPayload(...)` and `widget.click(...)` on Video Clip widgets. `onSingularButton(...)` is an internal renderer callback and is not exposed on the composition-script widget object.

For paired Composer work, use the dedicated [Video Clip authoring guide](../widgets/video-clip.md) and shared [Graphics guidance](../graphics.md). Widget `812` is available as the `video-clip` primitive. This document owns the scripting payload and button contract; the live instance and schema remain authoritative for its loaded version.

## Usage

```javascript
const video = comp.findWidget("Video")[0];
video.setPayload({ videoFile: "https://example.com/video.mp4", autoplay: true });
```

## Payload Properties

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `videoFile` | string | `""` | URL to a video file (`.mp4` or `.webm`). The widget auto-detects playable format. |
| `opacity` | number | — | Opacity (`0`–`100`). |
| `volume` | number | — | Volume (`0`–`100`). Note: the video element is rendered `muted` (browser autoplay restriction), so volume changes may not take effect in practice. |
| `autoplay` | boolean | — | If `true`, starts playing the video automatically. |
| `loop` | boolean | — | If `true`, loops the video. |
| `objectFit` | string | — | Fit mode: `"contain"` (fit entirely, letterbox) or `"cover"` (fill entirely, crop). |
| `shift` | number | — | Alignment shift as a percentage. Shifts the video position when it doesn't perfectly fit the layout. |

### Examples

```javascript
// set a new video and autoplay
video.setPayload({
  videoFile: "https://example.com/clip.mp4",
  autoplay: true,
  loop: true
});

// cover mode with opacity
video.setPayload({
  videoFile: "https://example.com/clip.webm",
  objectFit: "cover",
  opacity: 80
});
```

## Button Actions

The Video Clip widget supports button actions via button control nodes:

| Action ID | Description |
| :--- | :--- |
| `"start"` | Pause, reset to 0, then play from beginning |
| `"play"` | Play/resume |
| `"pause"` | Pause |
| `"seek0"` | Pause and seek to 0 |

Trigger from a composition script:

```javascript
video.click("start");
video.click("play");
video.click("pause");
video.click("seek0");
```

## Video Events (via sendCustomMessage)

The widget emits custom messages for video events:

| Event Name | Data |
| :--- | :--- |
| `loadedmetadata` | `{ videoWidth, videoHeight, duration }` |
| `error` | `{ code, message }` |
| `canplay` | `{}` |
| `playing` | `{ currentTime }` |
| `pause` | `{ currentTime }` |
| `ended` | `{ currentTime }` |

## Source reference

- Widget code: `app/components/widgets/WidgetVideoClip.js`
