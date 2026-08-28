# Design Specification: Thermal Printer Bridge Integration (Preview Aligned)

**Date**: 2026-08-28  
**Status**: Approved (Brainstorming Phase)  
**Target System**: LTO Cabuyao District Office Queuing System  

---

## 1. Overview

This specification details the end-to-end integration between the Window A registration & ticket preview system and the raw thermal printing bridge in `bit_array/printerbridge.py`. 

When an operator generates a queue ticket in Window A, the ticket preview card renders in the UI showing the ticket number (e.g. `P-001`), color label (`COLOR: PINK`), generated `Ticket ID: P001-xxxxxxxx`, disclaimer, and official office address details. Upon clicking **PRINT**, the system constructs raw binary ESC/POS commands matching the visible preview layout (excluding the graphic logo and hidden transaction metadata) and transmits them to the Windows RAW printer queue (`Xprinter XP-58`) via `printerbridge.py` on port 9100 with an Express server proxy fallback (`/api/print`).

---

## 2. ESC/POS Binary Command Sequence

The ESC/POS payload sent to the thermal printer bridge is structured to match the visible elements of `#ticket-paper`:

| Command / Text | Description | ESC/POS Hex / Byte Sequence |
|---|---|---|
| Initialize | Reset printer state | `0x1B 0x40` |
| Center Alignment | Center text alignment | `0x1B 0x61 0x01` |
| Quad Size Header | Double width & height | `0x1B 0x21 0x30` + `"LAND TRANSPORTATION OFFICE\n"` |
| Subtitle | Normal font size | `0x1B 0x21 0x00` + `"CABUYAO DISTRICT OFFICE\n"` |
| Divider Line | Horizontal line | `"--------------------------------\n"` |
| Section Title | Center align section header | `"TICKET NUMBER\n"` |
| Category Header | Bold text category | `0x1B 0x45 0x01` + `${boxHeader}\n` |
| Ticket Number | Quad size bold ticket number | `0x1B 0x21 0x30` + `${ticket.id}\n` |
| Reset & Color | Normal size color label | `0x1D 0x21 0x00 0x1B 0x45 0x00` + `COLOR: ${colorName}\n` |
| Divider Line | Horizontal line | `"--------------------------------\n"` |
| Ticket ID Line | Center align & Ticket ID label | `0x1B 0x61 0x01` + `Ticket ID: ${fileNo}\n\n` |
| Disclaimer Text | Notice to customer | `"Please take your seat and wait for your\nnumber to appear on the screen\n\n"` |
| Footer Address Line 1 | Address | `"154 Areza Town Center, Brgy. Canlalay, Biñan, Laguna.\n"` |
| Footer Contact Line 2 | Phone numbers | `"Contact Number: +63 222146466 | +63 953643536 | +63 474918939\n"` |
| Footer Email Line 3 | Office email | `"Office email address: 0420ltocabuyaodo@gmail.com.\n\n\n\n"` |
| Auto Paper Cut | ESC/POS Cut command | `0x1D 0x56 0x41 0x03` |

---

## 3. Front-End & Server Synchronization

1. **`sendEscPosPrint(ticketObj)`**:
   - Updated in both `public/js/windowA.js` and root `windowA.html`.
   - Uses exact ESC/POS byte array building matching the table above.
   - Posts binary buffer to `http://127.0.0.1:9100/print` with fallback to `/api/print`.
2. **State Updates & Reset**:
   - Counter increments in `localStorage` (`counter_X`).
   - Ticket added to `lto_ticket_queue` in `localStorage` & SQLite DB.
   - Form resets after 1.8 seconds.
