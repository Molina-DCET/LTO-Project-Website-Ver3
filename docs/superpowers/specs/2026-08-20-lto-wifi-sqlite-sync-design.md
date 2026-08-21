# Technical Design: LTO Multi-Device Wi-Fi Queuing System (Express + SQLite + Short Polling)

## 1. Overview & Goals
The goal is to upgrade the vanilla HTML/CSS/JS LTO Queuing System from single-device `localStorage` into a resilient, multi-device local Wi-Fi application.
Any device (mobile, tablet, PC) connected to the local Wi-Fi can open `http://<HOST_IP>:3000` to interact with the system (Window A registration, Window B–N processing, Cashier, Control Panel, View Queuing Display).

### Core Principles
1. **Zero UI Breakage**: All 18+ existing frontend page JavaScript files (`windowA.js`, `cashier.js`, `controlPanel.js`, `viewQueuing.js`, etc.) remain 100% untouched. Their existing DOM lookups, event handlers, and 3-second render loops work out of the box.
2. **Zero Complex Setup (SQLite Database)**: Uses local SQLite (`data/lto.sqlite`) running on the Host PC. Single-file, persistent, zero external server installation required.
3. **Transparent Sync Layer (`public/js/api.js`)**:
   - Intercepts local storage writes and replicates changes to the Express REST API.
   - Runs a 1.5s–2.0s "barely-live" short polling sync loop that pulls the global state from SQLite and writes it to `localStorage` safely using write-guards (`_isSyncing`) to eliminate race conditions and infinite loops.
4. **Local Network Access**: Server listens on `0.0.0.0:3000`, serving static files and API endpoints across the Wi-Fi.

---

## 2. Architecture & Data Flow

```
+-------------------------------------------------------------------------+
|                              Host PC (Node.js)                          |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                 Express Server (server.js on 0.0.0.0:3000)        |  |
|  |                                                                   |  |
|  |   - Serves static assets (/public)                                |  |
|  |   - REST API: /api/state, /api/tickets, /api/calling, /api/stats  |  |
|  +---------------------------------+---------------------------------+  |
|                                    |                                    |
|                                    v                                    |
|                      +---------------------------+                      |
|                      |  SQLite Database          |                      |
|                      |  (data/lto.sqlite)        |                      |
|                      +---------------------------+                      |
+------------------------------------+------------------------------------+
                                     |
               Local Wi-Fi Network   |  (HTTP Requests & Static Assets)
                                     |
    +--------------------------------+--------------------------------+
    |                                |                                |
    v                                v                                v
+----------------------+  +----------------------+  +----------------------+
| Device 1 (Host PC)   |  | Device 2 (Mobile A)  |  | Device 3 (TV / Cash) |
| Browser (Window A)   |  | Browser (Window B)   |  | Browser (Display)    |
|                      |  |                      |  |                      |
| [api.js Bridge]      |  | [api.js Bridge]      |  | [api.js Bridge]      |
|    |      ^          |  |    |      ^          |  |    |      ^          |
|    v      |          |  |    v      |          |  |    v      |          |
| [localStorage]       |  | [localStorage]       |  | [localStorage]       |
|    |      ^          |  |    |      ^          |  |    |      ^          |
|    v      |          |  |    v      |          |  |    v      |          |
| [windowA.js (Orig)]  |  | [windowB.js (Orig)]  |  | [cashier.js (Orig)]  |
+----------------------+  +----------------------+  +----------------------+
```

---

## 3. Database Schema (SQLite)

The SQLite database file will be stored in `data/lto.sqlite` with WAL mode enabled:

### 3.1 `tickets` Table
Stores all tickets in the system across all queues (QUEUED, HOLD, ACCOMPLISHED):
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `ticket_number` TEXT NOT NULL
- `transaction_type` TEXT
- `priority_status` TEXT DEFAULT 'Normal'
- `status` TEXT NOT NULL DEFAULT 'QUEUED'  -- 'QUEUED', 'HOLD', 'ACCOMPLISHED'
- `window_id` TEXT
- `metadata` TEXT -- JSON serialized full ticket object (retaining original schema: history, currentSection, etc.)
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.2 `active_calling` Table
Stores the currently called ticket per window:
- `window_id` TEXT PRIMARY KEY
- `ticket_number` TEXT
- `ticket_data` TEXT -- JSON serialized active ticket payload
- `called_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.3 `window_stats` Table
Stores window statistics and hourly distributions:
- `window_id` TEXT PRIMARY KEY
- `entries_count` INTEGER DEFAULT 0
- `accomplished_count` INTEGER DEFAULT 0
- `hourly_data` TEXT DEFAULT '[]' -- JSON array of 24 hourly buckets
- `acc_hourly_data` TEXT DEFAULT '[]' -- JSON array of 24 hourly buckets
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.4 `system_settings` Table
Key-value store for global settings (e.g., `lto_system_paused`):
- `setting_key` TEXT PRIMARY KEY
- `setting_value` TEXT -- JSON serialized
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

---

## 4. REST API Specifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/state` | **Consolidated State**: returns `{ tickets: { queued, hold, accomplished }, calling: {...}, stats: {...}, paused: boolean }` in 1 fast roundtrip |
| `GET` | `/api/tickets?status=...` | List tickets filtered by status |
| `POST` | `/api/tickets` | Create/Insert a new ticket |
| `POST` | `/api/tickets/bulk-sync` | Atomically replaces queue state for given status |
| `PUT` | `/api/tickets/:id` | Update status, section, or metadata for a ticket |
| `DELETE` | `/api/tickets/:id` | Remove a ticket |
| `GET` | `/api/calling` | Get all active calling states |
| `POST` | `/api/calling/:windowId` | Set active calling ticket for window |
| `DELETE` | `/api/calling/:windowId` | Clear active calling ticket for window |
| `GET` | `/api/stats` | Get all window and global stats |
| `POST` | `/api/stats/:windowId` | Update stats for a window |
| `GET` | `/api/system/pause` | Get system pause state |
| `POST` | `/api/system/pause` | Set system pause state |

---

## 5. Frontend Sync Bridge (`public/js/api.js`)

### 5.1 Push Synchronization (Outbound)
- Hooks into `localStorage.setItem` and `localStorage.removeItem`.
- When an action is taken in the UI (e.g. "Print Ticket" in Window A, "Call Next" in Window B, "Accomplish" in Cashier):
  1. The page writes to `localStorage` immediately (instant local UI response).
  2. If `_isSyncing` is false, `api.js` asynchronously replicates the change to `/api/...` in the background.

### 5.2 Pull Synchronization (Inbound / "Barely-Live" Short Polling)
- Polls `GET /api/state` every **1.5 – 2.0 seconds**.
- Checks if incoming server state differs from local state.
- Sets `_isSyncing = true`, writes fresh data into `localStorage`, then resets `_isSyncing = false`.
- The native 3-second render intervals in each page automatically refresh the UI cleanly without reloading the page.

---

## 6. Error Handling & Wi-Fi Resilience
- **SQLite Concurrency**: Uses WAL (Write-Ahead Logging) mode (`PRAGMA journal_mode = WAL;`) for high concurrency without database locks.
- **Offline / Transient Disconnects**: If a Wi-Fi client temporarily drops connection, `apiFetch` suppresses uncaught exceptions and keeps using local state until connection recovers.
- **No Infinite Loops**: Strict write-locking (`_isSyncing`) guarantees local reads triggered by server sync do not bounce back as new writes.

---

## 7. Verification & Testing Plan
1. **Server Verification**:
   - Run `node server.js` on host PC and verify SQLite initialization.
   - Verify `http://localhost:3000` and `http://<LOCAL_IP>:3000` respond.
2. **Functional Queue Verification**:
   - Open `windowA.html` on Device 1 -> Print Ticket `T-001`.
   - Verify `T-001` is stored in SQLite database (`data/lto.sqlite`).
   - Open `windowB.html` on Device 2 (or second browser tab) -> Verify `T-001` appears in queue within polling interval.
   - Click "Call Next" in `windowB.html` -> Verify Calling status updates on `viewQueuing.html` and `controlPanel.html`.
   - Click "Accomplish" -> Verify moved to accomplished queue across all devices.
