# Video Clip authoring

Use `video-clip` for a muted controllable clip. It maps to widget `812`.

Run `primitives --primitive video-clip`. Published version 16 exposes `videoFile`; numeric-string `volume`, `shift`, and `opacity`; `autoplay`; `loop`; `objectFit`; and the `start`, `play`, `pause`, and `seek0` buttons. The built-in renderer keeps the video element muted, so do not promise audible volume behavior; choose `video-clip-with-audio` when sound is required.

The widget pauses while the composition is Out and resumes on In only when its internal play state is active. Use a Player-reachable MP4 or WebM URL. Verify load, autoplay, loop, button order, seek, composition-state pause/resume, opacity, fit/shift, replacement, resize, and failures in the Player.
