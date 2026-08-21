const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Ensure data folder exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, body, headers: res.headers });
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('--- Starting Backend Server Endpoints Test ---');

    // 1. Test GET /api/state initial response
    const stateRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    assert.strictEqual(stateRes.status, 200, 'GET /api/state should return 200');
    assert.strictEqual(stateRes.data.success, true, 'GET /api/state should be successful');
    assert.ok(stateRes.data.data.tickets, 'State should include tickets object');
    assert.ok(Array.isArray(stateRes.data.data.tickets.queued), 'Queued tickets should be an array');
    console.log('✔ GET /api/state initial check passed');

    // 2. Test POST /api/tickets (Create a ticket)
    const createRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        ticket_number: 'T-999',
        transaction_type: 'Renewal',
        priority_status: 'Normal',
        status: 'QUEUED',
        window_id: null,
        metadata: {
            id: 'T-999',
            purpose: 'renewal',
            currentSection: 'E_J',
            history: [{ time: '12:00:00', action: 'CREATED', window: 'Window A', desc: 'Created' }]
        }
    });
    assert.strictEqual(createRes.status, 201, 'POST /api/tickets should return 201');
    assert.strictEqual(createRes.data.success, true, 'POST /api/tickets should be successful');
    assert.strictEqual(createRes.data.data.ticket_number, 'T-999');
    const createdId = createRes.data.data.id;
    console.log('✔ POST /api/tickets passed, created ID:', createdId);

    // 3. Test GET /api/tickets?status=QUEUED
    const listRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets?status=QUEUED',
        method: 'GET'
    });
    assert.strictEqual(listRes.status, 200);
    const found = listRes.data.data.some(t => t.ticket_number === 'T-999');
    assert.ok(found, 'Created ticket should be in QUEUED list');
    console.log('✔ GET /api/tickets?status=QUEUED passed');

    // 4. Test POST /api/calling/:windowId
    const callRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/calling/windowB',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        ticket_number: 'T-999',
        ticket_data: { id: 'T-999', purpose: 'renewal', startTime: Date.now() }
    });
    assert.strictEqual(callRes.status, 200);
    assert.strictEqual(callRes.data.success, true);
    console.log('✔ POST /api/calling/windowB passed');

    // 5. Test GET /api/calling
    const allCallingRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/calling',
        method: 'GET'
    });
    assert.strictEqual(allCallingRes.status, 200);
    assert.ok(allCallingRes.data.data.some(c => c.window_id === 'windowB' && c.ticket_number === 'T-999'));
    console.log('✔ GET /api/calling passed');

    // 6. Test POST /api/system/pause
    const pauseRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/system/pause',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { paused: true });
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.data.data.paused, true);
    console.log('✔ POST /api/system/pause passed');

    // 7. Test consolidated GET /api/state after modifications
    const finalStateRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    assert.strictEqual(finalStateRes.data.data.paused, true);
    assert.ok(finalStateRes.data.data.calling.windowB, 'windowB active calling should be present in state');
    console.log('✔ Consolidated GET /api/state state verification passed');

    // Clean up created test ticket
    await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets/' + createdId,
        method: 'DELETE'
    });
    await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/calling/windowB',
        method: 'DELETE'
    });
    await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/system/pause',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { paused: false });

    console.log('--- ALL BACKEND ENDPOINT TESTS PASSED SUCCESSFULLY! ---');
}

module.exports = { runTests };

if (require.main === module) {
    runTests().catch((err) => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}
