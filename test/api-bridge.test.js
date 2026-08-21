const assert = require('assert');

// Mock localStorage and fetch for Node environment
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; }
};
global.Storage = { prototype: global.localStorage };
global.window = { localStorage: global.localStorage };

// Mock fetch
const apiCalls = [];
global.fetch = async function(url, options) {
    apiCalls.push({ url, options });
    if (url === '/api/state') {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                data: {
                    tickets: {
                        queued: [{ id: 'T-100', purpose: 'renewal', status: 'QUEUED' }],
                        hold: [],
                        accomplished: []
                    },
                    calling: {
                        windowB: { id: 'T-100', startTime: 123456789 }
                    },
                    stats: {},
                    paused: false
                }
            })
        };
    }
    return {
        ok: true,
        status: 200,
        json: async () => ({ success: true })
    };
};

// Load api.js
require('../public/js/api.js');

async function testApiBridge() {
    console.log('--- Starting API Bridge Test ---');

    // 1. Verify window.API exists
    assert.ok(global.window.API, 'window.API should be defined');
    console.log('✔ window.API is defined');

    // 2. Test outbound write interception for ticket queue
    const sampleQueue = [{ id: 'T-001', purpose: 'renewal' }];
    global.localStorage.setItem('lto_ticket_queue', JSON.stringify(sampleQueue));

    // Allow async microtask to execute
    await new Promise(r => setTimeout(r, 50));

    const bulkSyncCall = apiCalls.find(c => c.url === '/api/tickets/bulk-sync');
    assert.ok(bulkSyncCall, 'Writing lto_ticket_queue should trigger /api/tickets/bulk-sync');
    const body = JSON.parse(bulkSyncCall.options.body);
    assert.strictEqual(body.status, 'QUEUED');
    assert.strictEqual(body.items.length, 1);
    assert.strictEqual(body.items[0].id, 'T-001');
    console.log('✔ Outbound localStorage.setItem interception passed');

    // 3. Test inbound sync via API.pullSync
    await global.window.API.pullSync();

    // Verify localStorage has the pulled state
    const pulledQueue = JSON.parse(global.localStorage.getItem('lto_ticket_queue'));
    assert.strictEqual(pulledQueue.length, 1);
    assert.strictEqual(pulledQueue[0].id, 'T-100');

    const pulledCalling = JSON.parse(global.localStorage.getItem('lto_windowB_active_calling'));
    assert.strictEqual(pulledCalling.id, 'T-100');
    console.log('✔ Inbound pullSync updates localStorage successfully');

    console.log('--- ALL API BRIDGE TESTS PASSED! ---');
}

testApiBridge().catch(err => {
    console.error('API Bridge Test failed:', err);
    process.exit(1);
});
