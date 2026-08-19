# Secondary Nav, Page Transitions & Skeleton Loading — Design Spec
**Date:** 2026-08-19 | **Status:** Approved

## Scope: Logged-In Pages Only
sub-nav + transitions: windowList, windowA-N (11 files), cashier.html
skeletons: all of the above + viewQueuing.html (queue data panels)

## 1. Secondary Breadcrumb Nav Bar
- Element: `<nav class="sub-nav">` after `</header>`, logged-in pages only
- Height: 40px, backdrop-filter: blur(20px), rgba white 6%, 1px bottom border rgba white 12%
- Breadcrumbs per page:
  - windowList: [WINDOWS (active)]
  - windowA-N: [WINDOWS (link to windowList.html)] > [WINDOW X (active)]
  - cashier: [WINDOWS (link to windowList.html)] > [CASHIER (active)]
- Active item: color #FFD700, border-bottom 2px solid #FFD700
- Hover: color white, background rgba(255,255,255,0.08)

## 2. Page-to-Page Transitions (Fade + Slide Up/Down)
- Enter: body animates from opacity:0 + translateY(10px) to visible on DOMContentLoaded
- Exit: clicking any <a href> (not #anchors, not target=_blank) triggers .page-exit class
  - .page-exit: opacity:0 + translateY(-8px) over 250ms, then navigate
- Duration: 250ms both directions
- Applied via inline script in <head> of each logged-in page

## 3. Skeleton Loading States
- Window buttons (windowList): show shimmer placeholders initially; swap after 300ms
- Purpose cards (windowA): shimmer placeholder tiles; swap after 300ms
- Queue data panels (cashier, viewQueuing): shimmer on data cells while localStorage reads
- Shimmer: linear-gradient sweep 90deg, 1.5s infinite, background-size 200%
- Reveal: opacity 0→1 + translateY(8px→0) over 300ms ease

## 4. Enhanced Hover Micro-interactions
- Window buttons: tighten transition to 0.15s, add color glow box-shadow matching btn gradient
- Purpose cards: .card-title gets letter-spacing 0→1px on hover (0.2s ease)
- Queue now-serving panel: border-color pulse animation when value updates

## Files Affected
style.css, windowList.html, windowA-N.html (11), cashier.html, viewQueuing.html
