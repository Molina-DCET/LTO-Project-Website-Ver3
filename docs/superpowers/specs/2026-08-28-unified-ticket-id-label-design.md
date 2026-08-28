# Design Specification: Unified Ticket ID (8-Digit Hash Formula) & Label Standardization

**Date**: 2026-08-28  
**Topic**: Standardize Ticket ID across all views using the 8-digit hash formula & update label from "File No" to "Ticket ID"

---

## 1. Problem & User Requirements
- **Label Update**: User requested changing all instances of "File No", "File No.", "FILE NO:" to **"Ticket ID"** / **"Ticket ID:"**.
- **Value Standardization**: User requested using the **8-digit hash formula** (`M001-11152639`) consistently across all screens (Window A preview/print slip, Pending ticket modal, Transaction details panel, and Queue card list items) so that all views share the exact same 1 value.

---

## 2. Proposed Changes

### A. 8-Digit Hash Formula Standard
The 8-digit hash algorithm:
```javascript
function fileNo(idOrTicket) {
    if (!idOrTicket) return '—';
    const idStr = typeof idOrTicket === 'object' ? (idOrTicket.id || '') : String(idOrTicket);
    if (!idStr) return '—';
    if (typeof idOrTicket === 'object' && idOrTicket.fileNo) return idOrTicket.fileNo;
    
    var h = 0;
    for (var i = 0; i < idStr.length; i++) h += idStr.charCodeAt(i);
    return idStr.replace('-', '') + '-' + ((h * 4317) % 90000000 + 10000000);
}
```
For ticket `M-001`, this algorithm yields `M001-11152639`.

### B. Updating Ticket Creation in Window A
- In `public/js/windowA.js`, when creating ticket `M-001`, set `barcodeData = fileNo(ticketId)` (e.g. `M001-11152639`).
- Store `ticketObj.fileNo = barcodeData`.
- Preview box barcode element text: `Ticket ID: M001-11152639`.
- Thermal print bytes: `Ticket ID: M001-11152639`.

### C. Updating Windows B through N, Cashier, Control Panel
- Modal details row label: `<span class="wb-modal-dlbl">Ticket ID</span>` with value `M001-11152639`.
- Calling banner & transaction info labels: `Ticket ID: M001-11152639`.
- Queue list card item subtext: `M001-11152639`.
- Search placeholders: `Search Ticket or Ticket ID...`.

---

## 3. Verification Plan
1. Generate `M-001` in Window A -> Preview slip displays `Ticket ID: M001-11152639`.
2. Open Pending Ticket modal for `M-001` in Window D -> Label displays `Ticket ID` and value displays `M001-11152639`.
3. Check Transaction Info panel -> Displays `Ticket ID: M001-11152639`.
4. Check Queue Card list item -> Subtext displays `M001-11152639`.
