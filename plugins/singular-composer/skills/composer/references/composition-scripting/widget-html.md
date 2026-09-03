# HTML widget (widgetId 1212)

For paired creation and layout, see [HTML authoring](../widgets/html.md). The primitive is `html`. Published version `6` exposes the `source` textarea, defaulting to an empty string. Live inspection remains authoritative for the loaded version.

```javascript
var panel = comp.findWidget('HTML Panel')[0];
if (panel) {
  panel.setPayload({ source: '<div style="color:white;background:#123456">Updated <strong>panel</strong></div>' });
}
```

`source` contains the complete HTML fragment. The companion `singularwidgets/HTML/source/output.html` caches the previous source and assigns changed source to its container's `innerHTML`. Replacement discards previous child DOM and child state; repeated identical strings do not rebuild it. Sending an empty string clears it. Do not assume arbitrary direct calls to the companion callback support partial payloads; use the normal widget `setPayload` path.

The companion container fills its iframe, whose body has no margin and hides overflow. Use Composer geometry for the outer bounds and responsive fragment styling for inner layout. Source inspection alone does not prove the published renderer or runtime outcome.

HTML is unsanitized. Escape untrusted text before inserting it, keep generated markup limited to the requested display, and do not treat script-tag insertion or event handlers as a scripting API. Use the [composition-script workflow](../composition-scripts.md) to implement behavior, validate public inputs there, and derive bounded markup internally. The widget has no documented custom playback, Widget Node output, or template API.

Verify markup appearance, payload replacement, clearing, and resize in the actual Player. Stored source and a successful payload call are insufficient runtime evidence.
