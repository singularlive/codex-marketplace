# Sound widget (widgetId 3585)

For paired creation and layout, see [Sound authoring](../widgets/sound.md). Inspect the loaded version and live schema before scripting; the companion source model exposes `file` as an audio field with a string URL value, `playbackStyle` as a selection, and `volume` as a number.

| Payload field | Type | Meaning |
| --- | --- | --- |
| `file` | string | Approved Player-reachable audio URL; empty means no playable source. |
| `playbackStyle` | string | `in`, `out`, `inout`, or `loop`. |
| `volume` | number | Percentage from `0` to `100`; the renderer normalizes it to media volume `0` to `1`. |

Within the existing composition script's `init(comp, context)`:

```javascript
var sound = comp.findWidget('Sting')[0];
if (sound) {
  sound.setPayload({
    file: approvedAudioUrl,
    playbackStyle: 'in',
    volume: 80
  });
}
```

Resolve the widget name from inspected structure and the URL from the user's request or public input. `setPayload` changes the widget values; there is no composition-script method for direct access to its internal `HTMLAudioElement`, timers, fade interval, or external overlay handler.

The renderer reloads when `file` changes, applies volume immediately, and toggles media looping only for `playbackStyle: "loop"`. Non-loop styles restart or pause at transition start: `in` plays on In, `out` plays on either Out, and `inout` plays on every transition. Loop style starts and fades in on In, fades out during Out, and pauses at the end of Out. Every play first seeks to zero. When a parent runtime exposes `SingularOverlayControlAudioHandler`, the widget sends `load`, `volume`, `loop`, `seek`, `play`, and `pause` commands to it instead of controlling its local audio element.

Use the Singular Player or the target external audio handler to verify command order, file load, normalized volume, loop state, transition behavior, replacement, and failures. Screenshots and Composer model readback cannot prove audio. Browser autoplay policy, codec support, CORS/network access, device muting, and handler availability remain runtime dependencies.
