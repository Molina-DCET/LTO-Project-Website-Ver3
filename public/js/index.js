function updateClock() {
            try {
                const now = new Date();
                
                // Format date in Manila/Philippine timezone (UTC+8)
                const dateOptions = {
                    timeZone: 'Asia/Manila',
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric'
                };
                // Example format: "August 02, 2026"
                const dateStr = now.toLocaleDateString('en-US', dateOptions);
                
                // Format time in Manila/Philippine timezone (military / 24-hour style)
                const timeOptions = {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                };
                // Example format: "14:34"
                let timeStr = now.toLocaleTimeString('en-US', timeOptions);
                
                // Safeguard 24-hour style if locale defaults otherwise
                // (some localizations might return a space and AM/PM even with hour12: false)
                timeStr = timeStr.replace(/\s*[a-zA-Z]+/g, '');
                
                // Update DOM elements
                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) {
                console.error("Error updating Philippine Time: ", e);
            }
        }

        // Run immediately on page load
        updateClock();
        // Update every 1 second (1000 milliseconds)
        setInterval(updateClock, 1000);

        // Live Queue Stats Bar
        function updateStats() {
            try {
                const queue = JSON.parse(localStorage.getItem('lto_ticket_queue') || '[]');

                const nowServingEl = document.getElementById('stat-now-serving');
                const inQueueEl = document.getElementById('stat-in-queue');
                const avgWaitEl = document.getElementById('stat-avg-wait');

                // "Now Serving" — most recently called ticket (has calledAt timestamp)
                const calledTickets = queue.filter(t => t.calledAt);
                if (calledTickets.length > 0) {
                    calledTickets.sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0));
                    nowServingEl.textContent = calledTickets[0].ticketNumber || '—';
                } else {
                    nowServingEl.textContent = queue.length > 0 ? 'N/A' : '—';
                }

                // "In Queue" — tickets not yet completed
                const waiting = queue.filter(t => !t.completedAt && t.status !== 'done' && t.status !== 'completed');
                inQueueEl.textContent = String(waiting.length);

                // "Avg. Wait" — 3 minutes per person estimate
                if (waiting.length > 0) {
                    const est = waiting.length * 3;
                    avgWaitEl.textContent = est < 60 ? est + ' min' : Math.round(est / 60) + ' hr';
                } else {
                    avgWaitEl.textContent = queue.length > 0 ? '< 1 min' : '—';
                }
            } catch (e) {
                console.error('Error updating stats:', e);
            }
        }

        updateStats();
        setInterval(updateStats, 2000);