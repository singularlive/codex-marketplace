# Composition authoring standard

Read this reference before every prompt-, screenshot-, or reference-driven graphic creation or refinement. It is the single source of truth for composition-authoring best practice and the completion gate before handing finished work back to the user.

The standard has two equally required parts:

1. **Effective Composer construction** — the internal structure must be understandable, editable, controllable, and safe to refine. Users may not see this structure, but it determines whether the graphic behaves correctly and remains useful after handoff.
2. **Final graphic quality** — the rendered result must communicate clearly and look deliberate, coherent, and finished. This is the part the user sees directly.

Task-specific references define commands, schemas, and implementation mechanics. When a specialized reference repeats or illustrates an authoring principle, this document owns the principle.

## User requirements and design judgment

The user's request owns explicit content, style, behavior, assets, and scope. Use supplied references and the inspected composition to resolve context, then apply your own design judgment to content, layout, controls, and motion where the request leaves room for interpretation. Keep safe assumptions proportionate to the request and preserve unrelated content.

Plan the required structure, public inputs, lifecycle, and acceptance checks in whatever concise form serves the task. No prescribed brief format is required. Ask only when a missing decision materially changes the requested output, controls, runtime behavior, or required branding.

Apply the construction rules, visual-quality requirements, and completion gate below to the user's requirements and the task-specific choices. They remain the standard for every graphic, including work created from a sparse prompt.

## Part 1: Effective Composer construction

### Scope and preservation

- Build only what the user requested. For overlay work, do not add a full-frame background unless the user asks for one.
- Preserve unrelated user-created elements, groups, compositions, controls, scripts, and states.
- Inspect the active composition and relevant targets before authoring. Treat Composer readback as authoritative for structure, values, links, and scope.
- Make the smallest coherent change that fulfills the request. Do not reorganize existing content merely to make it match the agent's preferred structure.

### Choose the right structural unit

- Use a **tile** for one independently editable visual or widget, such as a background shape, text value, image, divider, or table. Do not combine separately aligned or separately controlled values into one tile merely to reduce element count.
- Use a **group** when elements in the same composition need shared clipping, bounds, layer movement, or a genuinely shared animation lifecycle. Do not group persistent and transient elements under one hiding animation.
- Use a **sub-composition** for a complete module the user is likely to take in or out, animate, edit, reuse, or control independently. Examples include a score bug, lower third, story list, or ticker.
- Keep sibling modules in sibling sub-compositions even when they normally appear together. Nest only when a module contains another independently controlled module.
- Group by control and lifecycle intent, not by primitive type. A module's background, accents, images, primary text, and supporting text should remain operationally coherent.
- Remember that ordinary sub-compositions retain the full Composer canvas coordinate system; they are control boundaries, not cropped layout regions.

### Prefer editable native structure

- Prefer standard Text, Rectangle, Circle, Image, and supported widget primitives when they can express the design cleanly.
- Use Table for genuinely repeated tabular content rather than manually duplicating rows.
- Use AISVG only for the bounded vector, mask, filter, path, or motion portion that standard primitives cannot represent faithfully. Keep ordinary text and images as native elements when independent editing is valuable.
- Add composition scripts only when persisted runtime logic is required. Do not use a script to replace structure, links, timelines, or widget behavior that Composer already represents directly.

### Author for safe refinement

- Give modules, tiles, groups, controls, and script-addressed widgets clear semantic names based on their roles.
- Use one version-2 declarative graphics specification per authored composition and keep element keys stable across refinement passes.
- Prefer one atomic orchestration manifest for several related ordinary modules. Within one composition, batch related Timeline, Update, or Behavior assignments.
- Keep declaratively managed elements inside their managed ownership group. Reuse the same specification and keys when refining instead of rebuilding equivalent elements.
- Use top-left semantic placement, styles, regions, grids, templates, and repeats when they make layout intent clearer and eliminate duplicated coordinate math.
- Keep layer order deliberate: structural backgrounds first, then accents and images, with foreground text and status details above them unless the requested design requires another relationship.

### Design the public control contract

- Identify values the user or an external system is expected to change, and give those values stable widget or Control Node contracts.
- Keep a control in the same module as the element it drives unless inherited or cross-composition control is intentional.
- Use a direct link when one public input maps directly to one widget property. Use a script only when an input must be interpreted, combined, formatted, or routed.
- Do not expose Transform or Effect properties as Control Nodes merely because they are technically linkable. Expose them only when the user asks for those exact public controls.
- Once a script relies on a composition or widget name, treat that name as part of the runtime contract and change the structure and script together.

### Build for real content and lifecycle

- Size and arrange the graphic for plausible live values, not only the initial sample. Account for longer names, wider numbers, missing images, empty fields, and repeated rows where applicable.
- Give every intended logo, photo, headshot, sponsor mark, or other asset its own Image tile even when only the approved placeholder is available.
- Decide which elements are persistent and which are transient before assigning motion.
- Use one containing animation only when every child shares the same lifecycle. For mixed lifecycles, animate the appropriate children or separate them structurally.
- Ensure every requested module has a coherent settled In state and the intended settled Out state. Treat Update animation and continuous Behavior as distinct runtime contracts rather than extensions of the In/Out timeline.
- For scripts, initialize from the current payload, guard lookups and inputs, avoid redundant writes, and clean up owned timers, listeners, streams, and network activity in `close()`.

## Part 2: Final graphic quality

### Theme and visual language

- Establish one coherent visual language across the complete graphic: palette, typography, corner treatment, stroke weight, shadows, spacing rhythm, and motion character should feel related.
- Use variation to communicate hierarchy or state, not as accidental inconsistency. Repeated roles should use repeated visual treatment.
- Prefer a few purposeful shapes and accents over decorative clutter.
- Match the requested or reference theme at the level of major bounds, visual weight, color relationships, type hierarchy, and motion character before refining small details.

### Composition and information hierarchy

- Establish one clear reading order. Make the most important live values easiest to find and keep secondary labels visibly subordinate without sacrificing readability.
- Keep the requested foreground graphic balanced within broadcast-safe margins.
- Give related content clear proximity and separation. Modules should read as intentional units without colliding or appearing accidentally detached.
- Use whitespace deliberately. Similar gaps should feel consistent, while larger separations should communicate stronger grouping boundaries.

### Alignment by information role

- Align content according to its semantic role, not merely the position of its bounding box.
- Center isolated focal values such as scores, clocks, or metrics within their intended cells.
- Left-align the primary and secondary text of a left-side identity block. Right-align the corresponding text of a right-side identity block.
- Keep each primary label and its subtitle on the same alignment edge so mirrored layouts read as one balanced system.
- Make box geometry and internal Text alignment agree. A centered Text tile requires both the intended centered bounds and a stored Text alignment of `center`; moving the box alone does not change the widget's default alignment.
- Preserve shared baselines, centerlines, padding, and visual weight across mirrored or repeated structures.

### Typography and legibility

- Use a small, deliberate type hierarchy with consistent roles for primary values, names, subtitles, labels, and status text.
- Keep font family, weight, size, case, line height, and tracking consistent for repeated roles.
- Judge readability at the intended output resolution, not only while zoomed into the editor.
- Preserve strong foreground/background contrast. Do not rely on fine outlines or shadows to rescue weak contrast.
- Size text boxes for their intended content and overflow behavior. Confirm that realistic longer values do not collide, clip, wrap unexpectedly, or shrink disproportionately.

### Color, spacing, and assets

- Use consistent internal padding and repeat spacing across related cells, labels, and modules.
- Use color consistently to communicate hierarchy, category, or state. Avoid accents that compete with the primary information.
- Check contrast and legibility across every major background the graphic can appear over when transparency or partial coverage is part of the design.
- Preserve intended image aspect ratio, crop behavior, padding, and visual prominence. A placeholder must occupy the same designed slot as the eventual asset.
- Avoid effects that look accidental at output resolution, including clipped shadows, uneven corner radii, mismatched opacity, and inconsistent blur or stroke treatment.

### Motion and temporal quality

- Use motion to reinforce information hierarchy and spatial relationships. Tightly coupled content should move coherently.
- Keep direction, duration, easing, and stagger purposeful and reasonably consistent across related elements.
- Account for every visible background, accent, divider, image, label, subtitle, and decorative element during In and Out.
- Require a complete settled In state. For Out, remove every transient element cleanly while preserving anything the requested lifecycle says should remain.
- Verify meaningful intermediate states when timing, masking, clipping, occlusion, path drawing, or staged reveals affect the design. A settled frame alone cannot prove those effects.
- Treat composition state and timeline readback as implementation evidence, not visual proof. A reported `Out1` or `Out2` state does not prove that the frame looks correct.

## Completion gate before user handoff

Do not present composition work as finished until every applicable check below passes:

1. **Scope:** The requested graphic is complete, unrelated content is preserved, and the active composition stack is correct.
2. **Structure:** Tiles, groups, and sub-compositions follow control and lifecycle intent; names, stable keys, ownership, links, and public controls are understandable and verified through Composer readback.
3. **Editability:** Native primitives are used where practical; AISVG, Table, widget templates, and scripts are used only for the portions that require them.
4. **Rendered quality:** Inspect or capture the result at the intended resolution and check theme consistency, safe bounds, clipping, hierarchy, alignment, internal Text alignment, spacing, typography, contrast, effects, and asset placement.
5. **Dynamic content:** Exercise realistic long, short, wide, empty, and repeated values wherever those variations could affect the layout.
6. **Animation:** For graphics with In/Out behavior, verify the settled In and intended settled Out frames. Verify intermediate states when the visual contract depends on motion between them.
7. **Runtime behavior:** Verify composition scripts and other Player-owned behavior in Singular Player with deterministic inputs. A successful write, Composer readback, or single screenshot is not proof of runtime behavior.
8. **Final state:** Restore the composition, controls, timeline, viewport, and navigation stack to the state requested by the user, then inspect the relevant scope again.
9. **Handoff:** Keep the best final visual artifact when one was needed. Tell the user what was created or changed, which controls and behaviors matter to their use of the graphic, what was verified, and any remaining visible difference, unsupported behavior, placeholder asset, or other limitation. Do not burden the user with internal construction details unless they ask or those details affect editing, control, reuse, or a limitation.

If a check is not applicable, omit it rather than manufacturing evidence. If an applicable check cannot be completed, report the composition as pending verification rather than finished.
