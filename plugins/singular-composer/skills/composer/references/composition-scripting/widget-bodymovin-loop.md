# Bodymovin Loop widget (widgetId 3783)

For paired creation and layout, see [Bodymovin Loop authoring](../widgets/bodymovin-loop.md). The approved primitive is `bodymovin-loop`; the Timeline-driven [Bodymovin widget](widget-bodymovin.md) (`3367`) has a different contract. Published version `3` was inspected during development; URL defaults to `""`, speed to `100` (catalog range `0`–`1000`, step `0.1`), and direction to `"forwards"`. Inspect the loaded version and live schema before scripting.

| Payload field | Type | Meaning |
| --- | --- | --- |
| `bodymovinJson` | string | Approved hosted Lottie JSON URL, not inline JSON. |
| `speed` | number | Percentage of the original animation speed; `100` is normal speed. |
| `animationDirection` | string | `forwards`, `backwards`, or `alternating`. |

Within the existing composition script's `init(comp, context)`:

```javascript
var animation = comp.findWidget('Ambient Animation')[0];
if (animation) {
  animation.setPayload({
    bodymovinJson: approvedAnimationUrl,
    speed: 100,
    animationDirection: 'forwards'
  });
}
```

Resolve the name from inspected structure and the URL from the requested asset or public input. `setPayload` is the public widget API; the internal Lottie object and SingularWidget callbacks are not composition-script methods. There are no payload fields for raw animation data, frame seeking, a loop toggle, or a play/pause button.

Source: companion `singularwidgets/Bodymovin Loop/source/output.html`. Lottie loads with SVG rendering, looping, and autoplay. Changed speed calls `setSpeed(speed / 100)`; changed direction adjusts Lottie direction and installs/removes a loop-complete listener. The state callback plays for `state.animation === 'In'` and pauses for other non-empty states. Composer Timeline seeks do not select Lottie frames.

A changed URL destroys the old instance and loads another asynchronously; an unchanged URL does not reload. Cached speed/direction and the alternating-direction counter are not reset on replacement, and autoplay is not reconciled with the existing composition state. Sending the same settings alongside a replacement URL therefore does not guarantee their reapplication. Do not invent a toggle workaround or promise state preservation; verify the requested transition in the Player and report any renderer discrepancy.

Use timed capture and multiple Player observations for looping motion, speed, all requested directions, In/Out pause/resume, and URL replacement. Model readback proves stored payload only. Follow [debugging-and-verification.md](debugging-and-verification.md); network/CORS failures and missing asset dependencies can leave a correctly configured widget blank.
