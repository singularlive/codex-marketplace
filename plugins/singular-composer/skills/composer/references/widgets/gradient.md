# Gradient authoring

Use `gradient` (widget `12`) for a rectangular CSS gradient surface. It loads on demand from the widget catalog. Run `primitives --primitive gradient` before creation and `get` before editing. Published version `8` was inspected during development; the loaded schema and instance remain authoritative.

The rendering field is `css_string`, a textarea string containing CSS **declarations**, such as `background: linear-gradient(...);`. Do not supply a selector, stylesheet, HTML, bare gradient function, RGBA object, or Rectangle-style structured gradient object. The default is a blue multi-stop linear gradient with legacy browser fallbacks. The catalog's `ColorZilla`, `CSSmatic`, and `Angrytools` buttons open external authoring helpers in Composer; they are not gradient payload fields or agent commands.

Example element in a version-2 graphics specification:

```json
{
  "key": "background-gradient",
  "primitive": "gradient",
  "placement": { "unit": "percent", "left": 0, "top": 0, "width": 100, "height": 100 },
  "properties": {
    "css_string": "background: linear-gradient(90deg, #142038 0%, #3069a0 55%, rgba(48, 105, 160, 0) 100%);"
  }
}
```

Use `background: radial-gradient(ellipse at center, #ffffff 0%, transparent 100%);` for a radial fade, or `background: #123456;` for a solid surface. An empty string clears the paint. Every CSS update replaces the complete inline style; retain all declarations still needed. The renderer reapplies width and height to fill the widget, so use Composer placement/layout for geometry instead of CSS width, height, or positioning.

Keep generated declarations limited to the requested paint. This is an existing inline-CSS renderer, not a CSS sanitizer: paired validation enforces string type and the 32 KB value limit, but does not validate gradient syntax or prevent URL-based CSS resource loads. Do not pass untrusted CSS through a public control or introduce external resources for an ordinary gradient. Invalid CSS may be ignored by the browser even when Composer stores it successfully.

Prefer Rectangle or Circle's own gradient field when the gradient belongs to that shape, its outline, or its rounded corners. Those fields accept structured gradient objects; `css_string` does not. Native Gradient Control Nodes remain unsupported. If a script must derive CSS from public inputs, expose simple Color/Number controls and construct bounded declarations internally.

Gradient has no widget-owned template or custom widget Timeline effect. Use ordinary Composer layout/motion for the surface. Verify direction, stops, alpha, replacement/clear behavior, and sizing in a rendered capture; stored CSS alone does not establish the result. See [Gradient scripting](../composition-scripting/widget-gradient.md) for runtime payload changes.
