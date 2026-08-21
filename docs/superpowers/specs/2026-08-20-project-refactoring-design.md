# Design Specification: Project Refactoring & Code Separation

**Date:** 2026-08-20  
**Status:** Pending Review  
**Scope:** Reorganize Vanilla HTML/CSS/JS project into a structured `public/` web root, extract inline CSS and JS into standalone files, and update asset paths.

---

## 1. Overview & Objectives

The goal of this refactoring is to clean up the codebase by separating all inline CSS and JavaScript code into standalone files while preserving 100% of the existing functionality, DOM element IDs, global variables, event listeners, and `localStorage` keys.

---

## 2. Directory Structure

All web-servable assets will be placed inside a `public/` directory:

```
public/
├── index.html
├── login.html
├── cashier.html
├── controlPanel.html
├── viewQueuing.html
├── windowA.html
├── windowB.html
├── windowC.html
├── windowD.html
├── windowE.html
├── windowF.html
├── windowG.html
├── windowH.html
├── windowI.html
├── windowJ.html
├── windowList.html
├── windowM.html
├── windowN.html
├── css/
│   └── style.css
├── js/
│   ├── index.js
│   ├── login.js
│   ├── cashier.js
│   ├── controlPanel.js
│   ├── viewQueuing.js
│   ├── windowA.js
│   ├── windowB.js
│   ├── windowC.js
│   ├── windowD.js
│   ├── windowE.js
│   ├── windowF.js
│   ├── windowG.js
│   ├── windowH.js
│   ├── windowI.js
│   ├── windowJ.js
│   ├── windowList.js
│   ├── windowM.js
│   └── windowN.js
└── assets/
    └── img/
        ├── Settings.png
        ├── alert-circle.png
        ├── background.png
        ├── car-sport.png
        ├── eye-off-sharp.png
        ├── eye.png
        ├── logo.png
        ├── people logo.png
        ├── refresh-circle.png
        └── reset.png
```

---

## 3. Detailed Extraction & Migration Rules

### 3.1 HTML Files Location & Head Updates
- All `.html` files (`index.html`, `login.html`, `cashier.html`, `controlPanel.html`, `viewQueuing.html`, `windowA.html` through `windowN.html`, `windowList.html`) will be moved into `public/`.
- Existing `<link rel="stylesheet" href="style.css">` tags in `<head>` will be updated to:
  ```html
  <link rel="stylesheet" href="css/style.css">
  ```

### 3.2 Inline CSS Extraction
- For every `.html` file containing `<style>` tags:
  1. The content inside the `<style>...</style>` block will be extracted.
  2. The extracted CSS will be appended to `public/css/style.css` under a clear header comment (e.g. `/* Extracted inline styles from cashier.html */`).
  3. The `<style>` tags will be deleted from the `.html` file.
- Existing root `style.css` will be copied to `public/css/style.css`.
- Image background references inside CSS (e.g., `background.png`) will be updated to `../assets/img/...` relative to `public/css/style.css`.

### 3.3 Inline JavaScript Extraction
- For every `.html` file:
  1. All inline code within `<script>` tags will be extracted into a dedicated JavaScript file inside `public/js/` matching the HTML filename (e.g. `cashier.html` -> `public/js/cashier.js`). If a page has multiple inline `<script>` blocks, their contents will be concatenated sequentially into the corresponding `.js` file.
  2. The inline `<script>` blocks will be removed from the HTML file.
  3. A single `<script src="js/<filename>.js" defer></script>` tag will be inserted right before the closing `</body>` tag (or at the bottom of the HTML body).

### 3.4 Image Asset Migration & Link Updates
- The root `img/` directory will be moved into `public/assets/img/`.
- All `src="img/filename"` references in HTML files will be updated to `src="assets/img/filename"`.

---

## 4. Integrity & Functionality Constraints

- **No Logic Alteration:** Variable names, function declarations, event handler signatures, DOM query selectors, and calculations will remain completely untouched.
- **LocalStorage Consistency:** All `localStorage.getItem` and `localStorage.setItem` keys (e.g. queue state, active window tokens) will remain unchanged to preserve cross-window communication and state persistence.
- **DOM Element ID Consistency:** All `id` attributes on HTML elements will be preserved so that DOM selection in externalized `.js` files continues to work flawlessly.

---

## 5. Self-Review Checklist

1. **Placeholder Scan:** No TBD or TODO items. All 18 HTML files and corresponding JS files are explicitly mapped.
2. **Consistency:** All paths (`css/style.css`, `js/<filename>.js`, `assets/img/<filename>`) match the public web root directory layout.
3. **Scope:** Pure refactoring and code separation without feature changes.

---

## 6. Verification Plan

1. **Directory Structure Verification:** Confirm `public/`, `public/css/`, `public/js/`, and `public/assets/img/` exist with all expected files.
2. **HTML Cleanliness Verification:** Ensure no inline `<style>` or inline `<script>` tags remain in any HTML file in `public/`.
3. **Script and Link Tag Audit:** Verify every HTML file correctly includes `<link rel="stylesheet" href="css/style.css">` and `<script src="js/<filename>.js" defer></script>`.
4. **Syntax & Logic Verification:** Check extracted JS files for syntax errors or scope issues.
