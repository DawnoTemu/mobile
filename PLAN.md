# Task & Context
Polish the synthesis progress modal so it matches the proposed modern layout, tighter spacing, clearer hierarchy, and refreshed microcopy.

## Current State (codebase scan)
- `components/Modals/ProgressModal.js` renders the synthesis modal with icon, title, copy, spinner, tip box, and cancel button.
- `styles/colors.js` exposes shared color tokens (`COLORS.peach`, `COLORS.text.*`, `COLORS.lavender`) but lacks the darker gray and lilac tints recommended in the proposal.
- Modal strings live in `STATUS_TITLES`, `STATUS_DESCRIPTIONS`, and `TIP_LIBRARY` inside `ProgressModal.js`, still using older “TIP:” prefixed copy.
- Layout uses wide padding, rounded corners (16px), and a lavender block tip (`backgroundColor: ${COLORS.lavender}20`) that currently pulls visual focus.

## Proposed Changes (files & functions)
- Update `ProgressModal.js` layout (container width/maxWidth, padding, spacing) and typography (font weights/sizes/colors) to align with the new hierarchy.
- Refresh `STATUS_DESCRIPTIONS` (especially `processing`) and `TIP_LIBRARY` copy to remove hard-coded “TIP:” prefixes and incorporate the optional magical microcopy.
- Restyle spinner and cancel button: center alignment, brand-accent color, outlined button look with hover/press feedback.
- Extend `styles/colors.js` with reusable tokens for the darker text (`#333333`), medium gray (`#555555`/`#666666`), and soft lilac background (`#F8F4FF`) + accent border (`#C29BFF`).
- Ensure accessibility labels remain accurate and the modal remains responsive (80% width with max 360px).

## Step-by-Step Plan
1. Introduce additional neutral and lilac tokens in `styles/colors.js`, keeping naming consistent (`text.deep`, `text.muted`, `lavenderSoft`, etc.).
2. Refactor `ProgressModal` structure: adjust container styles (width, maxWidth, borderRadius 20, shadow), reorganize header to stack the icon and title with improved spacing, and ensure body text centers cleanly.
3. Update copy constants: tweak `STATUS_DESCRIPTIONS.processing`, optionally consolidate the “TIP” messaging into the main body copy when applicable, and strip “TIP:” from `TIP_LIBRARY` entries or replace with intentionally crafted strings.
4. Redesign tip section component: use new colors, add the `💡` prefix in the UI (not in copy), tighten padding, and ensure the spinner sits between body text and tip with balanced spacing.
5. Move the cancel button styling to an outlined pattern (border, color, press state) and confirm focus/press accessibility while keeping it optional when synthesis is complete.
6. Manually verify layout via Expo (or at least snapshot logic) and run `npm run lint` to catch style regressions.

## Risks & Assumptions
- Modal fonts (Quicksand variants) may not include a 600 weight; might need to map to existing `Bold/SemiBold` without breaking design intent.
- Adding new color tokens could ripple into other components if naming clashes; ensure new keys are additive.
- Without running the app, exact spacing/line height might need tweaking after visual QA.
- Spinner customization is limited to color without extra animation unless we introduce new assets.

## Validation & Done Criteria
- Modal renders with centered icon/title, balanced spacing, and max width ≈360px on devices.
- Body copy and optional microcopy read clearly (no “TIP:” duplication) with improved contrast.
- Tip block uses soft lilac background with left accent bar and `💡` prefix, drawing less attention than the title.
- Spinner/cancel button align centered, feel cohesive with the rest of the modal.
- `npm run lint` passes without new warnings; any manual UI check confirms visual polish.

## Open Questions
- Should we switch entirely to the combined magical microcopy (removing the tip library) or keep both body text + rotating tips?
keep both body text + rotating tip