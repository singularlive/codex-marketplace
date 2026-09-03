# Video Animation authoring

Use `video-animation` for a muted three-phase video transition: an In clip, optional looping middle clip, and Out clip. It maps to widget `3934`.

Run `primitives --primitive video-animation` before authoring. Published version 4 exposes `videoIn`, `videoOut`, and `videoLoop` URL strings; `objectFit` (`contain`, `cover`, or `fill`); numeric-string `shift`; `loopActive`; and numeric-string `fadeDuration`. Preserve the runtime types returned by the live schema.

Assign the widget Timeline effect with a positive duration. In starts `videoIn`; its completion enters `videoLoop` when enabled. Out plays `videoOut`; `fadeDuration` crossfades between the loop and Out when both looping and a positive fade are enabled. All three video elements are muted.

Use Player-reachable MP4 or WebM URLs. Verify loaded metadata, start/middle/end frames, loop entry, Out playback, crossfade, fit/shift, URL replacement, resize, and media failures in the Player with timed evidence. Stored values and one screenshot do not prove playback.
