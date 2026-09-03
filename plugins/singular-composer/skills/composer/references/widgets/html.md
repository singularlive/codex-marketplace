# HTML authoring

Use `html` (widget `1212`) for a custom HTML fragment inside a widget. It loads on demand from the catalog. Run `primitives --primitive html` before creation and `get` before editing. Published version `6` exposes one `source` textarea, initially empty; live schema and instance inspection remain authoritative.

Supply a string containing an HTML fragment, not a URL, object, or complete page. Example element in a version-2 graphics specification:

```json
{
  "key": "html-panel",
  "primitive": "html",
  "placement": { "unit": "percent", "left": 10, "top": 10, "width": 80, "height": 20 },
  "properties": {
    "source": "<div style=\"width:100%;height:100%;box-sizing:border-box;padding:16px;background:#123456;color:white;font:32px sans-serif\">Live <strong>update</strong><br>Second line</div>"
  }
}
```

The renderer replaces the entire fragment when `source` changes. Include every child and style still needed in each replacement; `source: ""` clears the content. Composer placement owns the widget bounds. Size the fragment within those bounds and verify wrapping, clipping, fonts, and resizing in the Player. Prefer ordinary Text and shape primitives when their independent editing and native controls serve the requested design.

This is an **unsanitized HTML renderer**. The paired adapter enforces the existing string type and serialized-value 32 KB limit; it does not sanitize HTML, validate CSS, or prevent resource loading. Use trusted, task-authored display markup. Escape externally supplied text before interpolation. Do not pass untrusted HTML through a public Textarea control, add event-handler attributes, script tags, executable URLs, or external resources as a workaround for composition scripting. HTML widget support does not add a script-execution command to the paired relay. Persist behavior through the separate [composition-script workflow](../composition-scripts.md).

There is no widget-owned template or custom widget Timeline animation in the inspected catalog. Use ordinary Composer layout and motion. The catalog's interactivity flag does not establish a custom event API. Readback proves stored markup only; verify the visible fragment, replacement, and clear behavior in the Player. See [HTML scripting](../composition-scripting/widget-html.md) for payload changes.
