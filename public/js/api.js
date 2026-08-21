/**
 * api.js — LTO Queuing System Transparent Sync Bridge
 *
 * How it works:
 * 1. The original page JS (windowA.js, cashier.js, controlPanel.js, etc.) continues
 *    reading and writing to localStorage exactly as designed.
 * 2. This file hooks into `localStorage.setItem` and `localStorage.removeItem`.
 *    Whenever a queue or active calling state is modified locally, it mirrors the
 *    change to the Express REST API in the background.
 * 3. A short-polling sync loop runs every 1500ms (1.5s), fetching the consolidated
 *    snapshot from `/api/state` and writing it into `localStorage` safely using
 *    a write-lock flag (`_isSyncing`) to eliminate infinite loops and race conditions.
 * 4. Each page's existing 3-second UI refresh interval automatically renders the
 *    fresh data across all connected Wi-Fi devices.
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. LOW-LEVEL FETCH HELPER
    // ─────────────────────────────────────────────────────────────────────────
    async function apiFetch(path, method, body) {
        try {
            const opts = {
                method: method || 'GET',
                headers: { 'Content-Type': 'application/json' }
            };
            if (body !== undefined) {
                opts.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
            const res = await fetch(path, opts);
            if (!res.ok) {
                return { success: false, status: res.status };
            }
            return await res.json();
        } catch (e) {
            // Graceful resilience if network is temporarily unreachable
            return { success: false, error: String(e) };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PUBLIC API OBJECT
    // ─────────────────────────────────────────────────────────────────────────
    const API = {
        async getState() {
            return await apiFetch('/api/state');
        },
        async getTickets(params) {
            const q = params ? '?' + new URLSearchParams(params).toString() : '';
            const r = await apiFetch('/api/tickets' + q);
            return r.success ? r.data : [];
        },
        async createTicket(ticket) {
            return await apiFetch('/api/tickets', 'POST', ticket);
        },
        async bulkSync(status, items) {
            return await apiFetch('/api/tickets/bulk-sync', 'POST', { status, items });
        },
        async updateTicket(id, data) {
            return await apiFetch('/api/tickets/' + id, 'PUT', data);
        },
        async deleteTicket(id) {
            return await apiFetch('/api/tickets/' + id, 'DELETE');
        },
        async getCalling(windowId) {
            const r = await apiFetch('/api/calling/' + (windowId || ''));
            return r.success ? r.data : null;
        },
        async setCalling(windowId, ticketData) {
            return await apiFetch('/api/calling/' + windowId, 'POST', {
                window_id: windowId,
                ticket_data: ticketData
            });
        },
        async clearCalling(windowId) {
            return await apiFetch('/api/calling/' + windowId, 'DELETE');
        },
        async getStats(windowId) {
            const r = await apiFetch('/api/stats/' + (windowId || ''));
            return r.success ? r.data : null;
        },
        async saveStats(windowId, stats) {
            return await apiFetch('/api/stats/' + windowId, 'POST', stats);
        },
        async getSystemPause() {
            const r = await apiFetch('/api/system/pause');
            return r.success ? r.data.paused : false;
        },
        async setSystemPause(isPaused) {
            return await apiFetch('/api/system/pause', 'POST', { paused: !!isPaused });
        },
        pullSync: pullSyncState
    };

    if (typeof window !== 'undefined') {
        window.API = API;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. STORAGE INTERCEPTOR & WRITE-LOCK GUARD
    // ─────────────────────────────────────────────────────────────────────────
    let _isSyncing = false;

    // Preserve references to the native storage methods
    const storageProto = typeof Storage !== 'undefined' ? Storage.prototype : (typeof localStorage !== 'undefined' ? localStorage : {});
    const _origSet = storageProto.setItem ? storageProto.setItem.bind(typeof localStorage !== 'undefined' ? localStorage : storageProto) : function () {};
    const _origRemove = storageProto.removeItem ? storageProto.removeItem.bind(typeof localStorage !== 'undefined' ? localStorage : storageProto) : function () {};

    function safeParse(str, fallback) {
        try {
            return JSON.parse(str);
        } catch (_) {
            return fallback;
        }
    }

    // Intercept localStorage.setItem
    storageProto.setItem = function (key, value) {
        // 1. Perform local write immediately
        _origSet(key, value);

        // 2. If this write was initiated by inbound pull sync, do not mirror back
        if (_isSyncing) return;

        // 3. Asynchronously push changed key to backend
        try {
            if (key === 'lto_ticket_queue') {
                const items = safeParse(value, []);
                API.bulkSync('QUEUED', items).catch(() => {});
            } else if (key === 'lto_onhold_queue') {
                const items = safeParse(value, []);
                API.bulkSync('HOLD', items).catch(() => {});
            } else if (key === 'lto_accomplished_queue') {
                const items = safeParse(value, []);
                API.bulkSync('ACCOMPLISHED', items).catch(() => {});
            } else if (key.startsWith('lto_') && key.endsWith('_active_calling')) {
                const windowId = key.slice(4, -15); // e.g. 'lto_windowB_active_calling' -> 'windowB'
                const data = safeParse(value, {});
                API.setCalling(windowId, data).catch(() => {});
            } else if (key.startsWith('lto_stats_')) {
                const windowId = key.slice(10);
                const s = safeParse(value, {});
                API.saveStats(windowId, {
                    entries_count: s.entries || 0,
                    accomplished_count: s.accomplished || 0,
                    hourly_data: s.hourly || [],
                    acc_hourly_data: s.accHourly || []
                }).catch(() => {});
            } else if (key === 'lto_stats') {
                const s = safeParse(value, {});
                API.saveStats('global', {
                    entries_count: s.entries || 0,
                    accomplished_count: s.accomplished || 0,
                    hourly_data: s.hourly || [],
                    acc_hourly_data: []
                }).catch(() => {});
            } else if (key === 'lto_system_paused') {
                API.setSystemPause(value === 'true').catch(() => {});
            }
        } catch (_) {}
    };

    // Intercept localStorage.removeItem
    storageProto.removeItem = function (key) {
        _origRemove(key);
        if (_isSyncing) return;

        try {
            if (key.startsWith('lto_') && key.endsWith('_active_calling')) {
                const windowId = key.slice(4, -15);
                API.clearCalling(windowId).catch(() => {});
            }
        } catch (_) {}
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 4. INBOUND PULL SYNC (Short-Polling every 1.5s)
    // ─────────────────────────────────────────────────────────────────────────
    let _lastStateHash = '';

    async function pullSyncState() {
        try {
            const res = await API.getState();
            if (!res || !res.success || !res.data) return;

            const state = res.data;
            const currentHash = JSON.stringify(state);
            if (currentHash === _lastStateHash) {
                return; // Nothing changed on server, skip writing
            }
            _lastStateHash = currentHash;

            _isSyncing = true;

            // 1. Sync queues
            if (state.tickets) {
                if (Array.isArray(state.tickets.queued)) {
                    _origSet('lto_ticket_queue', JSON.stringify(state.tickets.queued));
                }
                if (Array.isArray(state.tickets.hold)) {
                    _origSet('lto_onhold_queue', JSON.stringify(state.tickets.hold));
                }
                if (Array.isArray(state.tickets.accomplished)) {
                    _origSet('lto_accomplished_queue', JSON.stringify(state.tickets.accomplished));
                }
            }

            // 2. Sync active calling for all windows
            if (state.calling && typeof state.calling === 'object') {
                const allWindows = ['windowA', 'windowB', 'windowC', 'windowD', 'windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ', 'windowM', 'windowN', 'cashier'];
                allWindows.forEach(wId => {
                    const lsKey = 'lto_' + wId + '_active_calling';
                    if (state.calling[wId]) {
                        _origSet(lsKey, JSON.stringify(state.calling[wId]));
                    } else {
                        // Clear if not active on server
                        const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(lsKey) : null;
                        if (existing) {
                            _origRemove(lsKey);
                        }
                    }
                });
            }

            // 3. Sync stats
            if (state.stats && typeof state.stats === 'object') {
                Object.keys(state.stats).forEach(wId => {
                    const st = state.stats[wId];
                    if (wId === 'global') {
                        _origSet('lto_stats', JSON.stringify(st));
                    } else {
                        _origSet('lto_stats_' + wId, JSON.stringify(st));
                    }
                });
            }

            // 4. Sync system pause
            if (typeof state.paused === 'boolean') {
                _origSet('lto_system_paused', state.paused ? 'true' : 'false');
            }

        } catch (_) {
            // Suppress errors during network hiccups
        } finally {
            _isSyncing = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. STARTUP & POLLING TIMER
    // ─────────────────────────────────────────────────────────────────────────
    if (typeof window !== 'undefined') {
        // Initial state sync when script loads
        pullSyncState();

        // 1.5-second short polling interval for "barely-live" sync
        setInterval(pullSyncState, 1500);
    }

})();
