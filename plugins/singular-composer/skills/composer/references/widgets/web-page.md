# Web Page authoring

Use `web-page` to embed a trusted HTTP(S) page in an iframe. It maps to widget `822`.

Run `primitives --primitive web-page`. Published version 10 exposes `url`, `reloadFlag`, and numeric-string `reloadDuration` in seconds. Preserve the live runtime types. Keep geometry in Composer layout.

The widget assigns `url` to its nested iframe. When reload is enabled and the duration is nonzero, it reassigns the current iframe URL on that interval. Do not embed untrusted pages merely because they render, and expect CSP, X-Frame-Options, mixed-content, authentication, and network policy to remain authoritative.

Verify the nested page content, replacement, periodic reload when requested, resize, and blocked/load-failure behavior in the Player. Outer widget readback does not prove that the nested document loaded.
