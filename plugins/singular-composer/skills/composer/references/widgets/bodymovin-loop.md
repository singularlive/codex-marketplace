# Bodymovin Loop authoring

Use `bodymovin-loop` (widget `3783`) for a continuously looping Bodymovin/Lottie asset. Use [Bodymovin](bodymovin.md) (`3367`) instead when asset frames must follow Composer's widget Timeline effect. These widgets have separate playback contracts.

Run `primitives --primitive bodymovin-loop` before creation and `get` before editing an existing tile. The loaded schema, runtime types, selections, and current values are authoritative. Published version `3` was inspected during development: URL defaults to `""`, speed to `100` (catalog range `0`–`1000`, step `0.1`), and direction to `"forwards"`.

`bodymovinJson` is a hosted JSON **URL string**, not inline JSON, an object, or a local file path. Use a user-provided or approved asset reachable by the Player, including any referenced images and fonts. Do not invent a production URL or upload files implicitly. Empty input supplies no usable animation; stored values do not prove loading or rendering.

The widget uses Lottie's SVG renderer with looping and autoplay enabled. Size and position its container with Composer layout. `speed` is a percentage of the asset's original speed (`100` means normal speed); preserve its live numeric type. `animationDirection` uses the exact selections `forwards`, `backwards`, and `alternating`. Alternating changes direction on loop completion.

Example element inside a version-2 graphics specification, after replacing the placeholder with the approved asset URL:

```json
{
  "key": "ambient-animation",
  "primitive": "bodymovin-loop",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 25, "height": 25 },
  "properties": {
    "bodymovinJson": "https://example.com/approved-animation.json",
    "speed": 100,
    "animationDirection": "forwards"
  }
}
```

Agent-created tiles still start with both Composer Timeline effects set to `none`. The Lottie loop does not require the `widget` effect, and Composer Timeline duration/seek does not control its frames. Use ordinary catalog effects for container entrances/exits when requested. The widget's state callback plays when `state.animation` is `In` and pauses for other non-empty states; this is separate from scrubbing or pausing the Composer Timeline.

Use `capture --wait-mode timed --settle <seconds>` for this continuous output. A stable or paused Composer Timeline cannot make the Lottie loop deterministic. Verify several frames and requested speed/direction/state transitions in the Player; one screenshot or successful model readback proves neither motion nor successful asset loading.

URL replacement destroys and asynchronously recreates the Lottie instance. The source caches speed and direction across replacement, so unchanged settings may not be reapplied to the new instance, and replacement starts with autoplay without restoring the current composition state. Its alternating-direction counter also survives changes. Do not promise replacement-state preservation or exact alternating restart behavior without verification of the loaded version. These are widget-source limitations, not agent controls.

For script-driven payload changes, use [composition-scripts.md](../composition-scripts.md) and [Bodymovin Loop scripting](../composition-scripting/widget-bodymovin-loop.md). Never send script text through the paired relay.
