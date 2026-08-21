// Page transition: fade-exit on any internal link click
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a[href]');
            if (link && !link.href.startsWith('#') && link.target !== '_blank' && !link.href.startsWith('javascript')) {
                e.preventDefault();
                const dest = link.href;
                document.body.classList.add('page-exit');
                setTimeout(function() { window.location.href = dest; }, 250);
            }
        });

function isTicketInWindowSection(ticket, section) {
            if (!ticket) return false;
            var cur = ticket.currentSection;
            var purp = (ticket.purpose || '').toLowerCase();

            if (section === 'C_B') {
                return cur === 'C_B' || (!cur && purp === 'letas');
            }
            if (section === 'D_E') {
                return cur === 'D_E' || (!cur && (purp === 'miscellaneous' || purp === 'misc'));
            }
            if (section === 'E_J') {
                return cur === 'E_J' || (!cur && (purp === 'renewal' || purp === 'other'));
            }
            if (section === 'D_E_or_E_J') {
                return cur === 'D_E' || cur === 'E_J' || (!cur && (purp === 'miscellaneous' || purp === 'misc' || purp === 'renewal' || purp === 'other'));
            }
            if (section === 'Cashier') {
                return cur === 'Cashier';
            }
            if (section === 'M_N') {
                return cur === 'M_N';
            }
            return false;
        }

        function updateBadges() {
            var raw = JSON.parse(localStorage.getItem('lto_ticket_queue') || '[]');

            var counts = {
                'windowB': 0, 'windowC': 0,
                'windowD': 0, 'windowE': 0,
                'windowF': 0, 'windowG': 0, 'windowH': 0, 'windowI': 0, 'windowJ': 0,
                'windowM': 0, 'windowN': 0,
                'cashier': 0
            };

            raw.forEach(function (ticket) {
                if (isTicketInWindowSection(ticket, 'C_B')) {
                    counts['windowB']++;
                    counts['windowC']++;
                }
                if (isTicketInWindowSection(ticket, 'D_E')) {
                    counts['windowD']++;
                    counts['windowE']++;
                }
                if (isTicketInWindowSection(ticket, 'E_J')) {
                    counts['windowE']++;
                    counts['windowF']++;
                    counts['windowG']++;
                    counts['windowH']++;
                    counts['windowI']++;
                    counts['windowJ']++;
                }
                if (isTicketInWindowSection(ticket, 'Cashier')) {
                    counts['cashier']++;
                }
                if (isTicketInWindowSection(ticket, 'M_N')) {
                    counts['windowM']++;
                    counts['windowN']++;
                }
            });

            for (var wId in counts) {
                var badgeEl = document.getElementById('badge-' + wId);
                if (badgeEl) {
                    var count = counts[wId];
                    badgeEl.textContent = count;
                    if (count > 0) {
                        badgeEl.style.display = 'flex';
                    } else {
                        badgeEl.style.display = 'none';
                    }
                }
            }
        }

        // Skeleton loading: apply shimmer to all window buttons on load
        const skeletonStart = Date.now();
        document.querySelectorAll('.window-btn').forEach(function(btn) {
            btn.classList.add('skeleton-card');
        });

        // Read data, then reveal cards after min 300ms
        updateBadges();
        const elapsed = Date.now() - skeletonStart;
        setTimeout(function() {
            document.querySelectorAll('.window-btn').forEach(function(btn, i) {
                setTimeout(function() {
                    btn.classList.remove('skeleton-card');
                    btn.classList.add('card-revealed');
                }, i * 30); // stagger 30ms per card for cascade effect
            });
        }, Math.max(0, 300 - elapsed));

        setInterval(updateBadges, 1000);
        // Live Clock script (Philippine Standard Time UTC+8 / Asia/Manila)
        function updateClock() {
            try {
                const now = new Date();

                // Format date in Manila timezone
                const dateOptions = {
                    timeZone: 'Asia/Manila',
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric'
                };
                const dateStr = now.toLocaleDateString('en-US', dateOptions);

                // Format time in Manila timezone (military / 24-hour style)
                const timeOptions = {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit', // Showing seconds in window list matches visual feedback of clock live updating
                    hour12: false
                };
                let timeStr = now.toLocaleTimeString('en-US', timeOptions);

                // Clean up non-numeric letters (e.g. AM/PM check)
                timeStr = timeStr.replace(/\s*[a-zA-Z]+/g, '');

                // Update elements
                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) {
                console.error("Error updating Philippine Time: ", e);
            }
        }

        updateClock();
        setInterval(updateClock, 1000);

        // Logout Event handler & Toast notification
        const logoutButton = document.getElementById('logout-button');
        logoutButton.addEventListener('click', function (event) {
            event.preventDefault();
            showToast("Successfully logged out! Redirecting...", "logout", function () {
                window.location.href = 'index.html';
            });
        });

        function showToast(message, type, callback) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<span>${message}</span>`;
            container.appendChild(toast);

            // Trigger animation
            setTimeout(() => {
                toast.classList.add('show');
            }, 50);

            // Hide and execute callback
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.remove();
                    if (callback) callback();
                }, 300);
            }, 1500);
        }