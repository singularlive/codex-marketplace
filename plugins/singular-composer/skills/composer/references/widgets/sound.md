# Sound authoring

Use `sound` (widget `3585`) for audio whose playback follows Composer animation-state transitions. Run `primitives --primitive sound` before creation and `get` before editing an existing tile. The loaded schema, version, runtime types, selections, and current values are authoritative.

The established widget model has three fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `file` | audio (string value) | Player-reachable audio URL. An empty string supplies no playable audio. |
| `playbackStyle` | selection | `in`, `out`, `inout`, or `loop`. |
| `volume` | number | Percentage from `0` to `100`. |

Use a user-provided or approved HTTP(S) asset URL. Do not invent a production URL, upload a file implicitly, use a local filesystem path, or put binary/audio data in the declarative specification. The paired adapter validates the catalog field types and the shared 32 KB serialized-value limit; inspect the live field range before relying on a numeric boundary.

Example element inside a version-2 graphics specification:

```json
{
  "key": "sting",
  "primitive": "sound",
  "placement": { "unit": "percent", "left": 0, "top": 0, "width": 1, "height": 1 },
  "properties": {
    "file": "https://example.com/approved-sting.mp3",
    "playbackStyle": "in",
    "volume": 80
  }
}
```

Playback is state-driven by the widget renderer:

- `in` restarts audio when an `In` transition starts and pauses it when an Out transition starts.
- `out` restarts audio when either Out transition starts and pauses it when `In` starts.
- `inout` restarts audio at the start of every In or Out transition.
- `loop` enables media looping, starts on `In`, fades toward the configured volume over the In duration, fades to silence during Out, and pauses when the Out transition stops.

These policies respond to widget animation callbacks; they do not add a new Composer-agent playback command. The renderer seeks to time zero before each play. Changing `file` loads the new asset, changing `volume` applies `volume / 100`, and changing away from `loop` disables media looping.

Audio has no useful visual screenshot proof. Verify the requested file load, normalized volume, loop flag, seek/play/pause sequence, In/Out policy, replacement, and load/play failures in the Singular Player or the external overlay audio handler used by the target runtime. Browser autoplay policy, network/CORS errors, unsupported codecs, muted output devices, and unavailable external handlers can prevent audible output even when Composer readback is correct. Do not claim audible playback from stored values or a successful capture.

For script-driven payload changes, use [composition-scripts.md](../composition-scripts.md) and [Sound scripting](../composition-scripting/widget-sound.md). Never send script text through the paired relay.
