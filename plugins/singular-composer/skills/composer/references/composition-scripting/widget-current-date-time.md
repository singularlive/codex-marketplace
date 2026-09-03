# Current Date and Time widget (widgetId 3616)

For paired creation, field defaults, fixed-offset time zones, and Widget Node templates, see [Current Date and Time authoring](../widgets/current-date-time.md). The primitive is `current-date-time`. This contract comes from published version `3`, whose output matches `singularwidgets/CurrentDateAndTime/source/output.html` after newline normalization. Live inspection remains authoritative for the loaded version.

Use public `widget.setPayload` after resolving the inspected instance inside `init(comp, context)`:

```javascript
var clock = comp.findWidget('Current Clock')[0];
if (clock) {
  clock.setPayload({
    offset: 0,
    format: 'YYYY-MM-DD HH:mm:ss',
    frequency: '1000',
    timezone: '0',
    leadingZeros: true,
    language: 'en'
  });
}
```

`offset` is seconds, `frequency` is milliseconds, and numeric time-zone values represent UTC-offset minutes. Use catalog selections: frequency `"100"`, `"1000"`, or `"60000"`; timezone `"local"` or an inspected fixed offset; language an inspected locale ID or `"device"`. No IANA zone/DST rules are loaded. Preserve `composition` unless intentionally replacing the inspected widget-owned template. Internal Moment objects, timers, SDK callbacks, and template instances are not composition-script APIs. Script calls do not inherit paired validation.

The source converts the extra offset to milliseconds in its value callback. Include `offset` explicitly in repeated scripted settings updates: an omitted offset is multiplied again if a partial payload reaches that callback. Locale changes set Moment's global locale after constructing the current Moment instance, so allow a following tick before assessing a language change. These are existing implementation caveats, not guarantees supplied by agent support.

The widget supplies its 19 native outputs through internal `setWidgetNode`, not ordinary Control Nodes. Bind them during the paired phase; see the authoring guide for IDs, units, mixed string/number values, and angle limits. Formatted output and `monthName` use Moment formatting; `leadingZeros` applies separately to component outputs.

Each update emits `{ type: "timeChanged", payload: <Widget Node outputs>, time: <Unix milliseconds> }`. The Player's composition `message` listener receives the widget message at `params.data` in the `event: "custom"` envelope. Filter the observed originating tile ID and widget ID before consuming it. `time` includes the extra time shift; it is not countdown seconds or an expiry signal. Updates continue independently of ordinary Timeline seek/pause; there is no widget timer-control payload.

Use multiple Player observations to verify scripted changes, ticking, locale changes, fixed-offset rollover, template replacement, and any message consumer. An editor sample or a successful payload write is not runtime proof. Follow [debugging and verification](debugging-and-verification.md).
