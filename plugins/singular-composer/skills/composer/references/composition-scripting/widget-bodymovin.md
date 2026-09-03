# Bodymovin widget (widgetId 3367)

For paired creation, asset selection, layout, and Timeline setup, use [Bodymovin authoring](../widgets/bodymovin.md). `bodymovin` is an approved primitive; [Bodymovin Loop](widget-bodymovin-loop.md) (`3783`) has a separate continuous-playback contract.

The published schema inspected during development was version `17`. Always preserve live `get` and schema readback as authority for the loaded version reported by `widgetReferences`.

| Payload key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `bodymovinJson` | string | `""` | Hosted Bodymovin/Lottie JSON URL. This is not inline JSON. |

After following the handoff-driven composition-script workflow:

```javascript
const animation = comp.findWidget("Brand animation")[0];
if (animation) {
  animation.setPayload({ bodymovinJson: approvedAnimationUrl });
}
```

`approvedAnimationUrl` must come from the requested asset or inspected public input. A changed URL destroys the current Lottie instance and loads another asynchronously. An unchanged URL does not reload it. The widget has no public play/pause button contract or payload fields for speed, loop, direction, frame, or raw `animationData`. Its internal `onSingularAnimation` callback and Lottie instance are not composition-script widget methods.

Playback is driven by the Composer `widget` Timeline effect; agent creation leaves that effect disabled until explicitly assigned. The source scales asset frame time to effect duration, supports In/Out direction mapping, and handles initialization, jump, and seek. It does not explicitly handle `stop`, and its initialization guard is not reset on URL replacement. Verify runtime asset replacement and motion in the Player rather than promising preserved playback state from payload readback alone.

Source: the companion `singularwidgets` repository, `bodymovin/source/output.html`. Keep widget source changes in that repository's workflow; this reference does not authorize arbitrary scripts through the paired relay.
