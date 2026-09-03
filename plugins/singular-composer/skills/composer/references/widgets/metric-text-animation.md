# Metric Text Animation authoring

Use `metric-text-animation` (widget `4706`) for single-line Font 2.0 text with native character or word animation. Static text uses [Metric Text](metric-text.md); multiline text uses [Metric Text ML](metric-text-ml.md).

Run `primitives --primitive metric-text-animation` for catalog fields and defaults. Preserve the complete inspected `font` object (`metricfont`); ordinary Text font commands do not apply. Base text, alignment, overflow, spacing, shadows and insets follow [Metric Text](metric-text.md). Use stable-keyed declarative graphics for base construction:

```json
{
  "key": "headline",
  "primitive": "metric-text-animation",
  "name": "Animated headline",
  "placement": { "unit": "percent", "left": 10, "top": 40, "width": 80, "height": 15 },
  "properties": { "text": "LIVE UPDATE", "alignment": "center", "overflow": "fitScale" }
}
```

This is one element in a version-2 graphics specification. Shared ownership, type/size checks, idempotence and rollback apply.

## Configure the live animation fields

Animation fields are published asynchronously on the native tile's custom model. They are not catalog fields: `primitives`, declarative properties/styles/templates and orchestration graphics accept only the catalog schema. Do not put `inEffect` or other custom fields into a declarative specification, guess missing fields, or write the custom model directly.

1. After creation, configure the native `widget` Timeline effect as shown below, then use `get --type tile --id <id>`. The widget waits for a Timeline event before publishing its animation fields; creation with the default `none` effect alone is insufficient. Allow a bounded retry after Timeline setup if `inEffect` has not appeared yet. `get` reports the live merged fields, selection choices, ranges, runtime values and `disableDataLink` flags.
2. Set a present field using `update --type tile --id <id> --namespace data --path <field> --value-file <json-file>`. For example, a file containing `"move"` selects `inEffect`.
3. Re-read the tile after changing the effect. Only then set its newly advertised parameters, such as `inMoveDistance`. Repeat discovery after conditional selections change. Hidden saved parameters may remain in `values`; their presence does not mean they are currently active.
4. Configure `animationTarget` (`characters` or `words`), `inEasing`, `inOrigin` and `inOverlap` from live selections/ranges. Whole-text effects hide unused stagger controls. `useUpdateAnimation` controls text-change animation; `updateOverlap` appears when enabled.
5. For an independent Out effect, enable the composition's second timeline with the existing composition workflow and re-read. `outEffect: "same"` reverses In. Selecting another Out effect exposes its own `out...` parameters. With one timeline, Out reverses In and the Out group is absent.

Generic updates preserve runtime types and the 32 KB serialized-value limit; they do not enforce every widget selection or numeric range. Use inspected choices and bounds. Animation fields marked `disableDataLink` are not public Control Node targets. Link a Text Control Node to the catalog `text` field for public input. The widget's Preview button is an editor action, not a payload value or agent button command.

## Enable playback and verify

Agent creation sets Timeline effects to `none`. Configure native `widget` effects with positive durations using `set-timeline-animations` for coordinated In/Out assignments (or the targeted `set-timeline-animation` for one edit). For example:

```json
{
  "timelineAnimations": [
    { "key": "headline-in", "id": "<tile-id>", "timeline": "In", "effect": "widget", "start": 0, "duration": 1 }
  ]
}
```

Pass this file to `set-timeline-animations --file <path>` and read back the effects and keyframes. Effect duration comes from the Composer Timeline, not a guessed widget duration property. The platform property-change Update animation is unavailable for this custom-animation widget; its own `useUpdateAnimation` handles qualifying text-only changes while In.

Verify start/intermediate/end frames, character/word splitting, Out, text replacement and clearing in the Player. Stored fields do not prove motion. See [Metric Text Animation scripting](../composition-scripting/widget-metrictextanim.md) for runtime payloads and lifecycle limits.
