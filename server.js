require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATABASE SETUP (Persistent SQLite with WAL mode)
// ─────────────────────────────────────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'lto.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency across local Wi-Fi devices
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialize tables if they do not exist
db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL,
        transaction_type TEXT,
        priority_status TEXT DEFAULT 'Normal',
        status TEXT NOT NULL DEFAULT 'QUEUED',
        window_id TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS active_calling (
        window_id TEXT PRIMARY KEY,
        ticket_number TEXT,
        ticket_data TEXT DEFAULT '{}',
        called_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS window_stats (
        window_id TEXT PRIMARY KEY,
        entries_count INTEGER DEFAULT 0,
        accomplished_count INTEGER DEFAULT 0,
        hourly_data TEXT DEFAULT '[]',
        acc_hourly_data TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
`);

console.log(`[Database] SQLite database initialized at ${dbPath}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MIDDLEWARE & STATIC ASSETS
// ─────────────────────────────────────────────────────────────────────────────
app.use(cors());
app.use('/api/print', express.raw({ type: ['application/octet-stream', 'application/x-www-form-urlencoded', '*/*'], limit: '2mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// RAW ESC/POS Thermal Printer Proxy Endpoint (forwards to printerbridge.py on port 9100)
app.post('/api/print', (req, res) => {
    const data = req.body;
    if (!data || !data.length) {
        return res.status(400).send('No binary print payload provided');
    }

    const http = require('http');
    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: 9100,
        path: '/print',
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length
        }
    }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
            res.status(proxyRes.statusCode).send(body);
        });
    });

    proxyReq.on('error', (err) => {
        console.error('[API Print Proxy Error]:', err.message);
        res.status(500).send('Printer bridge offline or unreachable: ' + err.message);
    });

    proxyReq.write(data);
    proxyReq.end();
});

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Helper for parsing JSON safely
function safeJson(str, fallback) {
    try {
        return JSON.parse(str);
    } catch (_) {
        return fallback;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONSOLIDATED STATE ENDPOINT (/api/state)
//    Returns full snapshot in 1 fast roundtrip for short-polling sync
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/state', (req, res) => {
    try {
        // Tickets by status
        const ticketsStmt = db.prepare('SELECT * FROM tickets ORDER BY id ASC');
        const allTickets = ticketsStmt.all().map(t => {
            const meta = safeJson(t.metadata, {});
            return {
                ...meta,
                dbId: t.id,
                id: meta.id || t.ticket_number,
                ticket_number: t.ticket_number,
                type: t.priority_status,
                purpose: t.transaction_type,
                status: t.status,
                windowId: t.window_id,
                created_at: t.created_at,
                updated_at: t.updated_at
            };
        });

        const queued = allTickets.filter(t => t.status === 'QUEUED');
        const hold = allTickets.filter(t => t.status === 'HOLD');
        const accomplished = allTickets.filter(t => t.status === 'ACCOMPLISHED');

        // Active calling
        const callingStmt = db.prepare('SELECT * FROM active_calling');
        const callingRows = callingStmt.all();
        const calling = {};
        callingRows.forEach(row => {
            calling[row.window_id] = safeJson(row.ticket_data, { ticket_number: row.ticket_number });
        });

        // Stats
        const statsStmt = db.prepare('SELECT * FROM window_stats');
        const statsRows = statsStmt.all();
        const stats = {};
        statsRows.forEach(row => {
            stats[row.window_id] = {
                entries: row.entries_count,
                accomplished: row.accomplished_count,
                hourly: safeJson(row.hourly_data, []),
                accHourly: safeJson(row.acc_hourly_data, [])
            };
        });

        // System pause setting
        const pauseStmt = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'lto_system_paused'");
        const pauseRow = pauseStmt.get();
        const isPaused = pauseRow ? !!safeJson(pauseRow.setting_value, {}).paused : false;

        res.json({
            success: true,
            timestamp: Date.now(),
            data: {
                tickets: {
                    queued,
                    hold,
                    accomplished
                },
                calling,
                stats,
                paused: isPaused
            }
        });
    } catch (err) {
        console.error('[API /api/state Error]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TICKETS CRUD & BULK SYNC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tickets', (req, res) => {
    try {
        const { status, window_id } = req.query;
        let query = 'SELECT * FROM tickets';
        const conditions = [];
        const params = [];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (window_id) {
            conditions.push('window_id = ?');
            params.push(window_id);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY id ASC';

        const stmt = db.prepare(query);
        const rows = stmt.all(...params).map(r => ({
            ...r,
            metadata: safeJson(r.metadata, {})
        }));

        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/tickets', (req, res) => {
    try {
        const {
            ticket_number,
            transaction_type,
            priority_status,
            status,
            window_id,
            metadata
        } = req.body;

        const ticketNum = ticket_number || (metadata && metadata.id) || 'T-000';
        const transType = transaction_type || (metadata && metadata.purpose) || 'General';
        const prio = priority_status || ((metadata && metadata.type && metadata.type.toLowerCase() === 'priority') ? 'Priority' : 'Normal');
        const stat = status || (metadata && metadata.status === 'accomplished' ? 'ACCOMPLISHED' : (metadata && metadata.status === 'hold' ? 'HOLD' : 'QUEUED'));
        const metaStr = JSON.stringify(metadata || {});

        const stmt = db.prepare(`
            INSERT INTO tickets (ticket_number, transaction_type, priority_status, status, window_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(ticketNum, transType, prio, stat, window_id || null, metaStr);
        const id = Number(result.lastInsertRowid);

        res.status(201).json({
            success: true,
            data: {
                id,
                ticket_number: ticketNum,
                transaction_type: transType,
                priority_status: prio,
                status: stat,
                window_id: window_id || null,
                metadata: metadata || {}
            }
        });
    } catch (err) {
        console.error('[POST /api/tickets Error]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Atomic Bulk Queue Sync (used when an entire queue changes in localStorage)
app.post('/api/tickets/bulk-sync', (req, res) => {
    try {
        const { status, items } = req.body;
        if (!status || !Array.isArray(items)) {
            return res.status(400).json({ success: false, error: 'Invalid parameters: status and items array required.' });
        }

        // Use transaction for atomic consistency
        db.exec('BEGIN TRANSACTION;');
        try {
            const deleteStmt = db.prepare('DELETE FROM tickets WHERE status = ?');
            deleteStmt.run(status);

            const insertStmt = db.prepare(`
                INSERT INTO tickets (ticket_number, transaction_type, priority_status, status, window_id, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const item of items) {
                const ticketNum = item.id || item.ticket_number || 'T-000';
                const transType = item.purpose || item.transaction_type || 'General';
                const prio = (item.type && item.type.toLowerCase() === 'priority') ? 'Priority' : 'Normal';
                insertStmt.run(ticketNum, transType, prio, status, item.windowId || null, JSON.stringify(item));
            }

            db.exec('COMMIT;');
            res.json({ success: true, message: `Bulk sync for status ${status} completed (${items.length} items).` });
        } catch (txnErr) {
            db.exec('ROLLBACK;');
            throw txnErr;
        }
    } catch (err) {
        console.error('[POST /api/tickets/bulk-sync Error]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/tickets/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { status, window_id, priority_status, metadata } = req.body;

        const getStmt = db.prepare('SELECT * FROM tickets WHERE id = ?');
        const existing = getStmt.get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Ticket not found' });
        }

        const newStatus = status !== undefined ? status : existing.status;
        const newWindow = window_id !== undefined ? window_id : existing.window_id;
        const newPrio = priority_status !== undefined ? priority_status : existing.priority_status;
        const newMeta = metadata !== undefined ? JSON.stringify(metadata) : existing.metadata;

        const updateStmt = db.prepare(`
            UPDATE tickets
            SET status = ?, window_id = ?, priority_status = ?, metadata = ?, updated_at = (datetime('now', 'localtime'))
            WHERE id = ?
        `);
        updateStmt.run(newStatus, newWindow, newPrio, newMeta, id);

        res.json({
            success: true,
            data: {
                id: Number(id),
                status: newStatus,
                window_id: newWindow,
                priority_status: newPrio,
                metadata: safeJson(newMeta, {})
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/tickets/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleteStmt = db.prepare('DELETE FROM tickets WHERE id = ?');
        deleteStmt.run(id);
        res.json({ success: true, message: `Ticket ${id} deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACTIVE CALLING ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/calling', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM active_calling');
        const rows = stmt.all().map(r => ({
            ...r,
            ticket_data: safeJson(r.ticket_data, {})
        }));
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/calling/:windowId', (req, res) => {
    try {
        const { windowId } = req.params;
        const stmt = db.prepare('SELECT * FROM active_calling WHERE window_id = ?');
        const row = stmt.get(windowId);
        if (!row) {
            return res.json({ success: true, data: null });
        }
        res.json({
            success: true,
            data: {
                ...row,
                ticket_data: safeJson(row.ticket_data, {})
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/calling/:windowId', (req, res) => {
    try {
        const { windowId } = req.params;
        const { ticket_number, ticket_data } = req.body;
        const ticketNum = ticket_number || (ticket_data && ticket_data.id) || (ticket_data && ticket_data.ticket && ticket_data.ticket.id) || null;
        const dataStr = JSON.stringify(ticket_data || {});

        const stmt = db.prepare(`
            INSERT INTO active_calling (window_id, ticket_number, ticket_data, called_at)
            VALUES (?, ?, ?, (datetime('now', 'localtime')))
            ON CONFLICT(window_id) DO UPDATE SET
                ticket_number = excluded.ticket_number,
                ticket_data = excluded.ticket_data,
                called_at = (datetime('now', 'localtime'))
        `);
        stmt.run(windowId, ticketNum, dataStr);

        res.json({
            success: true,
            data: {
                window_id: windowId,
                ticket_number: ticketNum,
                ticket_data: ticket_data || {}
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/calling/:windowId', (req, res) => {
    try {
        const { windowId } = req.params;
        const stmt = db.prepare('DELETE FROM active_calling WHERE window_id = ?');
        stmt.run(windowId);
        res.json({ success: true, message: `Active calling cleared for ${windowId}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. WINDOW STATS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM window_stats');
        const rows = stmt.all().map(r => ({
            window_id: r.window_id,
            entries_count: r.entries_count,
            accomplished_count: r.accomplished_count,
            hourly_data: safeJson(r.hourly_data, []),
            acc_hourly_data: safeJson(r.acc_hourly_data, []),
            updated_at: r.updated_at
        }));
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/stats/:windowId', (req, res) => {
    try {
        const { windowId } = req.params;
        const { entries_count, accomplished_count, hourly_data, acc_hourly_data } = req.body;

        const entries = entries_count !== undefined ? entries_count : 0;
        const accomplished = accomplished_count !== undefined ? accomplished_count : 0;
        const hourlyStr = JSON.stringify(hourly_data || []);
        const accHourlyStr = JSON.stringify(acc_hourly_data || []);

        const stmt = db.prepare(`
            INSERT INTO window_stats (window_id, entries_count, accomplished_count, hourly_data, acc_hourly_data, updated_at)
            VALUES (?, ?, ?, ?, ?, (datetime('now', 'localtime')))
            ON CONFLICT(window_id) DO UPDATE SET
                entries_count = excluded.entries_count,
                accomplished_count = excluded.accomplished_count,
                hourly_data = excluded.hourly_data,
                acc_hourly_data = excluded.acc_hourly_data,
                updated_at = (datetime('now', 'localtime'))
        `);
        stmt.run(windowId, entries, accomplished, hourlyStr, accHourlyStr);

        res.json({
            success: true,
            data: {
                window_id: windowId,
                entries_count: entries,
                accomplished_count: accomplished,
                hourly_data: hourly_data || [],
                acc_hourly_data: acc_hourly_data || []
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SYSTEM SETTINGS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/system/pause', (req, res) => {
    try {
        const stmt = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'lto_system_paused'");
        const row = stmt.get();
        const isPaused = row ? !!safeJson(row.setting_value, {}).paused : false;
        res.json({ success: true, data: { paused: isPaused } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/system/pause', (req, res) => {
    try {
        const { paused } = req.body;
        const valStr = JSON.stringify({ paused: !!paused });

        const stmt = db.prepare(`
            INSERT INTO system_settings (setting_key, setting_value, updated_at)
            VALUES ('lto_system_paused', ?, (datetime('now', 'localtime')))
            ON CONFLICT(setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                updated_at = (datetime('now', 'localtime'))
        `);
        stmt.run(valStr);

        res.json({ success: true, data: { paused: !!paused } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Reset counters only — no DB data deleted (counters live in localStorage client-side)
app.post('/api/system/reset-counters', (req, res) => {
    res.json({ success: true, message: 'Counter reset acknowledged. Client will clear localStorage counters.' });
});

// Full system reset — returns DB snapshot first, then deletes all data
app.post('/api/system/reset-full', (req, res) => {
    try {
        // 1. Collect full snapshot before deleting
        const tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at ASC').all();
        const calling = db.prepare('SELECT * FROM active_calling').all();
        const stats   = db.prepare('SELECT * FROM window_stats').all();

        // 2. Delete all data
        db.exec(`
            DELETE FROM tickets;
            DELETE FROM active_calling;
            DELETE FROM window_stats;
        `);

        res.json({
            success: true,
            message: 'Full system reset complete.',
            snapshot: { tickets, calling, stats, printedAt: new Date().toISOString() }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Legacy endpoint kept for compatibility
app.post('/api/system/reset', (req, res) => {
    try {
        db.exec(`
            DELETE FROM tickets;
            DELETE FROM active_calling;
            DELETE FROM window_stats;
        `);
        res.json({ success: true, message: 'System queue database reset to 0' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Server-side 24-hour cycle daily reset check (Manila timezone)
let lastServerResetDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
setInterval(() => {
    try {
        const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        if (currentDate !== lastServerResetDate) {
            console.log(`[Auto-Reset] Server 24h transition detected (${currentDate}). Resetting DB queues & stats.`);
            db.exec(`
                DELETE FROM tickets;
                DELETE FROM active_calling;
                DELETE FROM window_stats;
            `);
            lastServerResetDate = currentDate;
        }
    } catch (err) {
        console.error('[Auto-Reset Error]', err.message);
    }
}, 60000);

// ─────────────────────────────────────────────────────────────────────────────
// 8. SPA FALLBACK ROUTING
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. START SERVER & AUTO-SPAWN PRINTER BRIDGE
// ─────────────────────────────────────────────────────────────────────────────
let pyBridgeProcess = null;

const server = app.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(` LTO Queuing System Server (SQLite + Short Polling)`);
    console.log(` Running on: http://${HOST}:${PORT}`);
    console.log(` Database:   ${dbPath}`);

    // Auto-launch Python printer bridge if available
    const bridgePath = path.join(__dirname, '..', 'printtest', 'printerbridge.py');
    if (fs.existsSync(bridgePath)) {
        try {
            pyBridgeProcess = spawn('python', [bridgePath], { stdio: 'ignore', detached: false });
            console.log(` Printer Bridge: Running printerbridge.py on http://127.0.0.1:9100`);
        } catch (e) {
            console.warn(` Printer Bridge Notice: Could not spawn python bridge:`, e.message);
        }
    }
    console.log(`=======================================================`);
});

process.on('SIGINT', () => {
    if (pyBridgeProcess) {
        try { pyBridgeProcess.kill(); } catch (_) {}
    }
    process.exit(0);
});

module.exports = { app, server, db };
