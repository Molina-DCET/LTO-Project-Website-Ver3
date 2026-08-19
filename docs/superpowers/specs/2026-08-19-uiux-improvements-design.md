# LTO Queuing System — UI/UX Improvements Design Spec

**Date:** 2026-08-19
**Status:** Approved
**Scope:** Public-facing pages + admin pages

## Background

The LTO Cabuyao District Office Queuing System is a multi-page HTML/CSS/JS application with no framework dependencies. It uses a single `style.css` shared across all pages and `localStorage` for ticket queue state. Five high-impact UI/UX improvements were audited and approved.

---

## Improvement 1: ARIA Labeling, :focus-visible Focus Rings, Skip-Nav

**Goal:** Bring the site to WCAG 2.1 AA baseline.

### Requirements
- Add a `.skip-nav` anchor as the first child of `<body>` on all pages, linking to `#main-content`. Visible only on `:focus`.
- Add `id="main-content"` to every `<main>` element.
- Add a global `:focus-visible` rule in `style.css`.
- All img acting as buttons must be replaced by `<button type="button">` wrapping `<img aria-hidden="true">`, with `aria-label` and `aria-pressed`.
- All `.window-badge` spans must add `role="status"` and `aria-live="polite"`.
- Scope: all `.html` files and `style.css`.

## Improvement 2: Mobile Header Collapse & iOS Performance Fix

### Requirements
- At max-width: 480px, hide `.header-title` and `.header-subtitle`; keep logo and button in single compact row (height: 56px).
- Remove `background-attachment: fixed` from `.hero`.
- All interactive elements must meet min-height: 48px and min-width: 48px.
- Hide `.time-container` at 480px breakpoint.

## Improvement 3: Live Queue Stats Bar on Landing Page

### Requirements
- Add `.hero-stats-bar` in `index.html` between title and CTA.
- Three stat cards: NOW SERVING, IN QUEUE, AVG. WAIT.
- Read from localStorage `lto_ticket_queue`. Poll every 2s.
- Glassmorphism card style.

## Improvement 4: Replace Bookman Old Style to Inter Font

### Requirements
- Add Google Fonts Inter (weights 400,600,700,900) to all HTML files.
- Update `--font-family` in `:root`.

## Improvement 5: Login Inline Validation + Loading State

### Requirements
- Loading state on LOGIN button while submitting.
- Inline error message with role="alert" on failure.
- Toast progress bar animation.

## Files Affected

| File | Improvements |
|------|------|
| style.css | 1, 2, 3, 4, 5 |
| index.html | 1, 2, 3, 4 |
| login.html | 1, 2, 4, 5 |
| windowList.html | 1, 2, 4 |
| viewQueuing.html | 1, 2, 4 |
| windowA.html | 1, 2, 4 |
| windowB-N.html (10 files) | 1, 2, 4 |
| cashier.html | 1, 2, 4 |
