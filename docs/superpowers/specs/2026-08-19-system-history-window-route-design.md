# System-Wide Action History & Window/Route Tracking Design

**Date:** August 19, 2026  
**Status:** Proposed / Draft  

---

## 1. Overview
This feature introduces comprehensive system-wide action tracking for all queue tickets across the entire LTO queuing system. Every ticket lifecycle event—including creation, calling, re-calling, cancelling calls, placing on hold, restoring from hold, queue prioritization, section transfers, and completion—will be recorded in a structured timestamped history log. Additionally, every ticket will maintain explicit metadata regarding its current window location, section queue, and full multi-stage processing route flow.

---

## 2. Ticket Data Model Extensions

The `ticket` object stored in `localStorage` (`lto_ticket_queue`, `lto_onhold_queue`, `lto_accomplished_queue`) will be expanded with the following fields:

```javascript
{
  id: "P-001",
  name: "Juan Dela Cruz",
  date: "2026-08-19",
  time: "09:30:00",
  type: "Priority",
  purpose: "LETAS",
  comment: "",
  status: "pending", // "pending" | "calling" | "onhold" | "completed"
  
  // New & Extended Tracking Metadata:
  currentSection: "C_B",               // Active queue section key ("C_B", "D_E", "E_J", "Cashier", "M_N", "Complete")
  currentWindow: "Window B",          // Specific window label where ticket is currently serving or waiting
  currentRoute: "A → B/C → Cashier",  // Human-readable processing route flow
  heldByWindow: "Window C",           // Window that put ticket on hold (if status === 'onhold')
  
  history: [
    {
      time: "09:30:15",
      action: "CREATED",
      window: "Window A (Registration)",
      desc: "Created at Window A (Registration). Initial Route: Section B/C (LETAS)"
    },
    {
      time: "09:35:10",
      action: "CALLED",
      window: "Window B",
      desc: "Called at Window B"
    },
    {
      time: "09:40:00",
      action: "ON_HOLD",
      window: "Window B",
      desc: "Put on hold at Window B"
    },
    {
      time: "09:45:22",
      action: "RESTORED",
      window: "Window B",
      desc: "Restored from hold at Window B to pending queue"
    },
    {
      time: "09:50:00",
      action: "ADVANCED",
      window: "Window B",
      desc: "Advanced from Window B to Cashier"
    },
    {
      time: "09:55:12",
      action: "COMPLETED",
      window: "Cashier",
      desc: "Completed transaction at Cashier"
    }
  ]
}
```

---

## 3. History Action Types & Triggers

| Event Action | Trigger Location | Recorded Description Pattern |
| :--- | :--- | :--- |
| **`CREATED`** | `windowA.html` (Registration) | `Created at Window A (Registration). Route: [Route]` |
| **`CALLED`** | `windowB.html` ... `windowN.html`, `cashier.html` (Call Next / Direct Call) | `Called at [Window]` |
| **`RECALLED`** | Window dashboards (Re-call button) | `Re-called at [Window]` |
| **`CANCEL_CALL`** | Window dashboards (Cancel Call) | `Call cancelled at [Window], returned to queue` |
| **`ON_HOLD`** | Window dashboards (Put on Hold / Modal To Hold) | `Put on hold at [Window]` |
| **`RESTORED`** | Window dashboards (Modal Restore to Waiting) | `Restored from hold at [Window] to pending queue` |
| **`PRIORITIZED`** | Window dashboards (Make First / Call Next) | `Moved to top of queue at [Window]` / `Designated to be called next at [Window]` |
| **`ADVANCED`** | Window dashboards (Proceed / Complete) | `Advanced from [Window] to [NextSection]` |
| **`COMPLETED`** | Cashier / Final window / Control Panel | `Completed transaction at [Window]` / `Bypassed & Marked Completed via Control Panel` |
| **`TRANSFERRED`** | Control Panel (Transfer Action) | `Transferred to [Section] via Control Panel` |
| **`DELETED`** | Control Panel (Delete Action) | `Deleted from system via Control Panel` |

---

## 4. Window & Route Resolution Logic

A centralized helper routine will determine the exact processing route for any ticket based on its transaction `purpose`:

- **LETAS**: `Window A (Registration) → Section B/C (Window B / Window C) → Cashier → Completed`
- **Miscellaneous**: `Window A (Registration) → Section D/E (Window D / Window E) → Cashier → Section M/N (Window M / Window N) → Completed`
- **Renewal**: `Window A (Registration) → Section E-J (Window E - J) → Cashier → Completed`
- **Other**: `Window A (Registration) → Section E-J (Window E - J) → Completed`

---

## 5. UI Enhancements

### 5.1 Control Panel (`controlPanel.html`)
- **Ticket Details Panel**:
  - Add explicit **Current Location & Route** info box displaying:
    - Current Window Badge (e.g. `Window B`, `Cashier`, `On Hold at Window C`)
    - Current Route Flow Badge (e.g. `Route: A → B/C → Cashier`)
  - **Action History List**: Render chronological timeline with color-coded action tags (Calling = Pink/Red, Hold = Yellow/Amber, Completed = Green, Created/Advanced = Blue).

### 5.2 Window Dashboards (`windowB.html` ... `windowN.html`, `cashier.html`)
- Ticket Detail Modal: Display current window location, route flow, and full history list.
- Record history for modal actions (`mToHold()`, `mToWait()`, `mMakeFirst()`, `mMakeNextToBeCalled()`).

### 5.3 Window List (`windowList.html`) & View Queuing (`viewQueuing.html`)
- Display Current Window location and Target Route for active, queued, and hold tickets.

---

## 6. Verification & Compatibility Plan
- Existing tickets without `history` or `currentWindow` attributes will default gracefully (`history = []`, `currentWindow` computed on the fly).
- All `localStorage` updates preserve existing keys (`lto_ticket_queue`, `lto_onhold_queue`, `lto_accomplished_queue`).
