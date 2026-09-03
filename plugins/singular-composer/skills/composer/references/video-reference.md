# Reference-video motion analysis

Use this workflow when the user supplies a clip whose motion, reveal order, timing, masking, or lifecycle persistence must be recreated. Skip dense analysis when only a static frame matters or motion does not affect the implementation.

## Coarse-to-fine workflow

1. Establish the source resolution, duration, and broad visual phases.
2. Sample the whole clip coarsely to locate transitions and persistent content. A typical rate is 8–16 fps, but choose it from the clip length and motion speed rather than treating it as a requirement.
3. Mark only the intervals where direction, topology, overlap, or timing would change the implementation choice.
4. Resample those ambiguous intervals more densely. A typical rate is 20–30 fps; use the lowest density that resolves the decision.
5. Record an event map with approximate time, visible elements, geometry change, overlap or occlusion, and whether each item is persistent or transient.
6. Map each part to the simplest faithful mechanism: standard primitives, groups and clipping, native Timeline effects, AISVG, or script-driven logic.
7. When AISVG geometry is easiest to transcribe in source pixels, use the source frame's coordinate system as the SVG `viewBox`.
8. Verify meaningful intermediate states as well as the settled In and Out states. Treat final-state geometry, intermediate-state geometry, and lifecycle persistence as separate acceptance questions.

Infer motion from adjacent frames rather than the first and last frames alone. Distinguish one continuous path from coordinated segments, and distinguish a path being drawn from a rectangle being scaled or revealed. Track backgrounds, frames, and accents that remain visible during Out instead of grouping them with transient foreground content.

## Media tools and artifacts

Prefer a decoder already available in the environment. Do not download or install media dependencies silently; if decoding support is missing, request approval before adding a workspace-local dependency. Keep generated contact sheets and focused interval samples in the task's artifact directory.
