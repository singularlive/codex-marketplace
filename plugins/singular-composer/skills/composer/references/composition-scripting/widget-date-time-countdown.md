# Date / Time Countdown widget (widgetId 3617)

For paired creation, datetime validation, template ownership, and rendering limits, see [Date / Time Countdown authoring](../widgets/date-time-countdown.md). The primitive is `date-time-countdown`. This contract comes from published version `5`, inspected through localhost's widget catalog and its published output; the older companion `countdownClock` implementation is a different contract.

| Payload field | Type | Meaning |
| --- | --- | --- |
| `anchorTime` | Integer Unix milliseconds | Absolute target instant. Resolve the requested time zone before conversion. |
| `stopAtZero` | boolean | Clamp elapsed output at zero when true; otherwise continue counting up. |
| `leadingZeros` | boolean | Pad component values below ten, not totals. |
| `composition` | string | Existing widget-owned template ID; normally preserve it. |

Within `init(comp, context)`, after resolving the inspected widget name and a validated target timestamp:

```javascript
var countdown = comp.findWidget('Event Countdown')[0];
if (countdown) {
  countdown.setPayload({
    anchorTime: targetTimestampMs,
    stopAtZero: true,
    leadingZeros: true
  });
}
```

Use public `widget.setPayload`; internal Moment objects, interval functions, `SingularWidget` callbacks, and template instances are not composition-script APIs. The script API does not inherit paired CLI validation: validate timestamps and booleans yourself. Preserve the template relationship instead of scripting an ephemeral edit-session ID.

The widget instantiates its template and supplies values with internal `setWidgetNode`, not `setControlNode`. Exposed components are `weeks`, `days`, `hours`, `minutes`, `seconds`, and `sign`; totals are `totalWeeks`, `totalDays`, `totalHours`, `totalMinutes`, and `totalSeconds`. Components are strings, totals are floored numbers. Moment's duration components are not interchangeable with totals. `months` and `totalMonths` are computed but absent from version 5's native template schema. Ordinary controls with matching names do not receive these values automatically. Author their native bindings during the paired phase using [Widget Nodes](../widget-nodes.md).

Each successful update emits a widget custom message with `type: "timeChanged"`, `payload` containing the component/total outputs, `time` containing duration seconds, and `limit` indicating that a past target was clamped. In the composition `message` listener, the Player envelope has `event: "custom"` and `params: { type: "widget", name, id, widgetId, compId, data }`; the countdown message is `params.data`. Filter the observed originating tile ID and widget ID before consuming it. Do not treat `limit` as a one-shot completion event: updates continue while clamped. Guard any requested state transition against repetition.

The time base is the browser clock plus the SDK-provided server offset. Future values count down with `-`, except the sign is empty below one second. Past values either clamp to zero with an empty sign or count up with `+` and the source's extra one-second adjustment. Neither ordinary Timeline pause/seek nor `stopAtZero` stops the interval. No timer-control payload exists.

An invalid anchor suppresses new output rather than clearing previous digits. Template replacement is asynchronous and may initially receive cached node values; it is not a guaranteed atomic visual reset. Verify multiple Player frames, anchor changes, padding, stop/continue behavior across expiry, and any message-driven script action. Use timed capture; see [debugging-and-verification.md](debugging-and-verification.md). Stored payload, a static template, and a single screenshot are insufficient evidence of a working countdown.
