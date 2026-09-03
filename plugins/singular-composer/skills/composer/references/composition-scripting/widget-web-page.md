# Web Page Widget (widgetId 822)

Payload reference for `widget.setPayload(...)` on Web Page. For paired construction, use [Web Page authoring](../widgets/web-page.md). Live inspection is authoritative for the loaded version.

Payload keys are `url` (HTTP(S) iframe URL), `reloadFlag` (boolean), and numeric `reloadDuration` seconds.

```javascript
const page = comp.findWidget("Web Page")[0];
page.setPayload({
  url: "https://example.com/status",
  reloadFlag: true,
  reloadDuration: 30
});
```

Changing `url` replaces the nested document. When reload is enabled with a nonzero duration, the widget periodically reassigns the iframe URL. Page CSP, frame policy, mixed-content, authentication, and network behavior remain authoritative.
