# Video Clip with Audio Widget (widgetId 4307)

Video Clip with Audio uses the same payload keys, button actions, and custom media-event shapes as [Video Clip](widget-videoclip.md). For paired construction, use [Video Clip with Audio authoring](../widgets/video-clip-with-audio.md). Live inspection is authoritative for the loaded version.

Unlike widget `812`, this renderer does not force the video element muted. `volume` therefore controls audible output, subject to browser autoplay policy. Use `setPayload(...)` for `videoFile`, `volume`, `autoplay`, `loop`, `objectFit`, `shift`, and `opacity`; use `click("start"|"play"|"pause"|"seek0")` for transport controls.
