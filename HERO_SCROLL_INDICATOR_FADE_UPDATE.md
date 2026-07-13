# Hero Scroll Indicator Fade Update

## Update summary

The homepage scroll indicator now automatically fades out after the visitor begins scrolling and reappears near the top of the page.

## Behavior

- The indicator remains visible within the first 75 pixels of the page.
- Scrolling beyond 75 pixels adds the `is-hidden` state.
- The hidden state fades the indicator to transparent and disables pointer interaction.
- `visibility: hidden` prevents the invisible anchor from receiving keyboard focus.
- Returning to 75 pixels or less removes the hidden state and restores the indicator.

## CSS changes

File: `css/vca_style.css`

- Added `visibility` to the existing indicator transition.
- Added `.hero-scroll-indicator.is-hidden` with zero opacity, hidden visibility, disabled pointer events, and delayed visibility so the fade completes first.

## JavaScript changes

File: `js/vca_js.js`

- Selects `.hero-scroll-indicator` only when it exists.
- Toggles the hidden state based on whether `window.scrollY` exceeds 75 pixels.
- Updates the class only when the visibility state changes.
- Uses a passive scroll listener.
- Checks the initial scroll position when the script loads.

## Validation

- `git diff --check` completed successfully.
- Node.js is not installed in the current environment, so `node --check` was unavailable.

## Git status

- Date: July 13, 2026
- Target branch: `main`
- Target remote: `origin`
