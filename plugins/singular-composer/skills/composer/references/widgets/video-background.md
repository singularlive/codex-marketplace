# Video Background authoring

Use `video-background` for a continuously looping muted background video. It maps to widget `3936`.

Run `primitives --primitive video-background`. Published version 3 exposes `videoFile`, `objectFit` (`contain`, `cover`, or `fill`), and numeric-string `shift`. Preserve the live runtime types.

The renderer autoplays and loops while the composition is In, pauses while Out, and resumes on In. Use a Player-reachable video URL. Verify load, loop continuity, In/Out pause and resume, fit/shift, replacement, resize, and media failure in the Player with timed evidence.
