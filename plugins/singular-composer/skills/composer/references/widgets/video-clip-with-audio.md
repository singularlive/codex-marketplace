# Video Clip with Audio authoring

Use `video-clip-with-audio` when a controllable video must retain its audio track. It maps to widget `4307`.

Run `primitives --primitive video-clip-with-audio`. Published version 1 exposes the same authoring contract as Video Clip: `videoFile`; numeric-string `volume`, `shift`, and `opacity`; `autoplay`; `loop`; `objectFit`; and `start`, `play`, `pause`, and `seek0` buttons. Unlike widget `812`, its video element is not forced muted.

Browser autoplay policy may reject audible autoplay. Verify load, normalized volume, audible playback, autoplay handling, loop, button order, seek, composition-state pause/resume, opacity, fit/shift, replacement, resize, codec/network failures, and cleanup in the Player. Screenshots cannot prove audio.
