const assert = require('assert');
const http = require('http');

function req(options, data) {
    return new Promise((resolve, reject) => {
        const r = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (_) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        r.on('error', reject);
        if (data) r.write(typeof data === 'string' ? data : JSON.stringify(data));
        r.end();
    });
}

async function runE2ETest() {
    console.log('=== STARTING END-TO-END MULTI-DEVICE SIMULATION TEST ===');

    // Step 1: Window A prints ticket T-500
    console.log('\n[Step 1] Device 1 (Window A Registration): Creating ticket T-500...');
    const ticketT500 = {
        id: 'T-500',
        name: 'Juan Dela Cruz',
        date: 'August 20, 2026',
        time: '14:30:00',
        type: 'Normal',
        purpose: 'renewal',
        comment: 'Driver License Renewal',
        status: 'pending',
        currentSection: 'E_J',
        currentWindow: 'Window A (Registration)',
        currentRoute: 'Section E-J (Renewal/Other)',
        history: [{
            time: '14:30:00',
            action: 'CREATED',
            window: 'Window A (Registration)',
            desc: 'Created at Window A'
        }],
        printedAt: Date.now()
    };

    // Simulate Window A writing to queue and syncing
    const createRes = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        ticket_number: 'T-500',
        transaction_type: 'renewal',
        priority_status: 'Normal',
        status: 'QUEUED',
        metadata: ticketT500
    });
    assert.strictEqual(createRes.status, 201);
    console.log('✔ Window A registered T-500 in SQLite database');

    // Step 2: Device 2 (Window E) pulls state
    console.log('\n[Step 2] Device 2 (Window E): Polling /api/state for pending tickets...');
    const stateRes1 = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    assert.strictEqual(stateRes1.status, 200);
    const queuedTickets = stateRes1.data.data.tickets.queued;
    const foundInQueue = queuedTickets.find(t => t.id === 'T-500');
    assert.ok(foundInQueue, 'T-500 must be present in queued tickets');
    assert.strictEqual(foundInQueue.currentSection, 'E_J');
    console.log('✔ Window E received T-500 via short polling snapshot');

    // Step 3: Window E calls ticket T-500
    console.log('\n[Step 3] Device 2 (Window E): Calling T-500 at Window E...');
    const callRes = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/calling/windowE',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        ticket_number: 'T-500',
        ticket_data: {
            id: 'T-500',
            ticket: foundInQueue,
            startTime: Date.now()
        }
    });
    assert.strictEqual(callRes.status, 200);
    console.log('✔ Window E active calling set in SQLite');

    // Step 4: Display Screen (viewQueuing.html) checks active calling
    console.log('\n[Step 4] Device 3 (TV Queue Display): Polling /api/state to render Calling status...');
    const stateRes2 = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    assert.ok(stateRes2.data.data.calling.windowE, 'Window E should be actively calling on display');
    assert.strictEqual(stateRes2.data.data.calling.windowE.id, 'T-500');
    console.log('✔ Display screen successfully shows T-500 is being called at Window E');

    // Step 5: Window E forwards ticket to Cashier
    console.log('\n[Step 5] Device 2 (Window E): Completing Window E stage, forwarding to Cashier...');
    foundInQueue.currentSection = 'Cashier';
    foundInQueue.history.push({
        time: '14:35:00',
        action: 'FORWARDED',
        window: 'Window E',
        desc: 'Forwarded to Cashier'
    });

    // Bulk sync updated queued list
    const syncRes = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets/bulk-sync',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        status: 'QUEUED',
        items: [foundInQueue]
    });
    assert.strictEqual(syncRes.status, 200);
    // Clear Window E active calling
    await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/calling/windowE',
        method: 'DELETE'
    });
    console.log('✔ Ticket T-500 updated to Cashier section in SQLite');

    // Step 6: Device 4 (Cashier) processes payment and accomplishes ticket
    console.log('\n[Step 6] Device 4 (Cashier): Fetching Cashier queue and marking Accomplished...');
    const stateRes3 = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    const cashierTicket = stateRes3.data.data.tickets.queued.find(t => t.id === 'T-500');
    assert.ok(cashierTicket, 'Ticket T-500 should be in Cashier queue');
    assert.strictEqual(cashierTicket.currentSection, 'Cashier');

    // Move to accomplished queue
    cashierTicket.status = 'accomplished';
    cashierTicket.accomplishedAt = Date.now();
    cashierTicket.history.push({
        time: '14:40:00',
        action: 'ACCOMPLISHED',
        window: 'Cashier',
        desc: 'Payment completed. Transaction Accomplished.'
    });

    // Remove from queued and add to accomplished
    await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets/bulk-sync',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        status: 'QUEUED',
        items: []
    });

    await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets/bulk-sync',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        status: 'ACCOMPLISHED',
        items: [cashierTicket]
    });
    console.log('✔ Ticket T-500 moved to ACCOMPLISHED list');

    // Step 7: Final Global Verification
    console.log('\n[Step 7] Final System Verification across all devices...');
    const finalState = await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/state',
        method: 'GET'
    });
    assert.strictEqual(finalState.data.data.tickets.queued.length, 0, 'Queued list should be empty');
    assert.strictEqual(finalState.data.data.tickets.accomplished.length, 1, 'Accomplished list should have 1 item');
    assert.strictEqual(finalState.data.data.tickets.accomplished[0].id, 'T-500');
    assert.strictEqual(finalState.data.data.tickets.accomplished[0].history.length, 3);
    console.log('✔ All history entries, status transitions, and SQLite queues verified!');

    // Clean up
    await req({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/tickets/bulk-sync',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { status: 'ACCOMPLISHED', items: [] });

    console.log('\n=======================================================');
    console.log('🎉 END-TO-END MULTI-DEVICE TEST COMPLETED WITH 100% SUCCESS!');
    console.log('=======================================================');
}

runE2ETest().catch(err => {
    console.error('E2E Test Failure:', err);
    process.exit(1);
});
