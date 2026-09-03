# Gradient widget (widgetId 12)

For paired creation and layout, see [Gradient authoring](../widgets/gradient.md). The primitive is `gradient`. Published version `8` exposes the `css_string` textarea. Live inspection remains authoritative for the loaded version.

```javascript
var gradient = comp.findWidget('Background Gradient')[0];
if (gradient) {
  gradient.setPayload({
    css_string: 'background: linear-gradient(90deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%);'
  });
}
```

`css_string` is an inline CSS declaration string, not a structured gradient or RGBA object. Supply the property name and semicolon. Radial gradients and solid backgrounds use the same field. Sending `css_string: ''` clears the paint; omitting it leaves the current style unchanged.

The local Player's `WidgetGradient.onSingularValue` replaces the drawing surface's entire inline style, then reapplies `width: 100%` and `height: 100%`. Consequently each update must include all paint declarations that should remain. Composer layout owns tile geometry. The companion `singularwidgets/GradientRenderer/source/output.html` follows the same replacement contract and sizes its canvas to its iframe viewport on initialization and resize. Do not infer a published remote implementation from that companion file alone.

The renderer offers no custom playback, gradient interpolation, Widget Node outputs, or template API. The three editor helper buttons are not runtime gradient controls. Use the standard `setPayload` path; do not invent start/stop methods. For script-driven changes, validate simple public inputs and derive CSS internally rather than exposing arbitrary CSS or a native Gradient Control Node. CSS is applied directly, and browser acceptance is separate from paired string/size validation.

Use the [composition-script workflow](../composition-scripts.md) for persisted behavior, and verify the actual Player after updates, clears, and resize. A successful payload call or editor readback is not rendering evidence.
