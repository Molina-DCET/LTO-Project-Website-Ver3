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

// Skeleton loading: shimmer purpose cards on load
        (function() {
            const skStart = Date.now();
            document.querySelectorAll('.purpose-card').forEach(function(card) {
                card.classList.add('skeleton-card');
            });
            // Read any localStorage data needed, then reveal after min 300ms
            const elapsed = Date.now() - skStart;
            setTimeout(function() {
                document.querySelectorAll('.purpose-card').forEach(function(card, i) {
                    setTimeout(function() {
                        card.classList.remove('skeleton-card');
                        card.classList.add('card-revealed');
                    }, i * 60); // 60ms stagger per card
                });
            }, Math.max(0, 300 - elapsed));
        })();

        // Live Header Clock script (PST UTC+8 / Asia/Manila)
        function updateClock() {
            try {
                const now = new Date();

                const dateOptions = {
                    timeZone: 'Asia/Manila',
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric'
                };
                const dateStr = now.toLocaleDateString('en-US', dateOptions);

                const timeOptions = {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                };
                let timeStr = now.toLocaleTimeString('en-US', timeOptions);
                timeStr = timeStr.replace(/\s*[a-zA-Z]+/g, '');

                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) {
                console.error("Error updating Philippine Time: ", e);
            }
        }

        updateClock();
        setInterval(updateClock, 1000);

        // Selection variables
        let selectedPurpose = '';
        let isPriority = false;
        let isCommentImportant = false;
        let pendingTicketPrefix = '';

        // Helper to update Generate button state based on selections and required fields
        function updateGenerateButtonState() {
            const genBtn = document.getElementById('generate-button');
            if (!selectedPurpose) {
                genBtn.setAttribute('disabled', 'true');
                return;
            }
            if (selectedPurpose === 'other') {
                const commentVal = document.getElementById('comment-input').value.trim();
                if (!commentVal) {
                    genBtn.setAttribute('disabled', 'true');
                } else {
                    genBtn.removeAttribute('disabled');
                }
            } else {
                genBtn.removeAttribute('disabled');
            }
        }

        // Helper to update comment field UI when Other is selected
        function updateCommentRequiredUI() {
            const commentGroup = document.querySelector('.comment-textarea-group');
            const commentLabel = commentGroup ? commentGroup.querySelector('label') : null;
            if (selectedPurpose === 'other') {
                if (commentGroup) commentGroup.classList.add('required');
                if (commentLabel) commentLabel.textContent = 'COMMENT (REQUIRED FOR OTHER)';
            } else {
                if (commentGroup) commentGroup.classList.remove('required');
                if (commentLabel) commentLabel.textContent = 'COMMENT';
            }
        }

        // selectPurpose implementation
        function selectPurpose(purpose) {
            const card = document.getElementById('card-' + purpose);

            if (selectedPurpose === purpose) {
                // Clicked the already selected card, so UNCLICK it
                selectedPurpose = '';
                card.classList.remove('selected');
            } else {
                // Select this card and deselect all others
                selectedPurpose = purpose;
                document.querySelectorAll('.purpose-card').forEach(c => {
                    c.classList.remove('selected');
                });
                card.classList.add('selected');
            }
            updateGenerateButtonState();
            updateCommentRequiredUI();
        }

        // Listen for user typing in comment field to dynamically toggle generate button when Other is selected
        document.getElementById('comment-input').addEventListener('input', function () {
            updateGenerateButtonState();
        });

        // Toggle Switch functionality (Priority Toggle)
        const toggleSwitch = document.getElementById('priority-toggle');
        toggleSwitch.addEventListener('click', function () {
            isPriority = !isPriority;
            if (isPriority) {
                toggleSwitch.classList.add('active');
            } else {
                toggleSwitch.classList.remove('active');
            }
        });

        // Toggle Importance Circle on comment area
        function toggleCommentImportant() {
            isCommentImportant = !isCommentImportant;
            const circle = document.getElementById('important-circle');
            if (isCommentImportant) {
                circle.classList.add('active');
            } else {
                circle.classList.remove('active');
            }
        }

        // generateTicket implementation
        function generateTicket() {
            if (!selectedPurpose) return;
            if (selectedPurpose === 'other' && !document.getElementById('comment-input').value.trim()) {
                showToast('Comment is required when Other is selected.', 'logout');
                return;
            }

            let prefix = '';
            let boxTypeLabel = '';
            let colorName = '';

            // Priority override prefix rules
            if (isPriority) {
                prefix = 'P';
                boxTypeLabel = 'PRIORITY';
                colorName = 'PINK';
            } else {
                if (selectedPurpose === 'renewal') {
                    prefix = 'R';
                    boxTypeLabel = 'RENEWAL';
                    colorName = 'GREEN';
                } else if (selectedPurpose === 'misc') {
                    prefix = 'M';
                    boxTypeLabel = 'MISCELLANEOUS';
                    colorName = 'YELLOW';
                } else if (selectedPurpose === 'letas') {
                    prefix = 'L';
                    boxTypeLabel = 'LETAS';
                    colorName = 'WHITE';
                } else if (selectedPurpose === 'other') {
                    prefix = 'O';
                    boxTypeLabel = 'OTHER';
                    colorName = 'BLUE';
                }
            }

            // Store pending prefix for print commit
            pendingTicketPrefix = prefix;

            // Peek at next queue counter without incrementing localStorage before print
            const counterKey = 'counter_' + prefix;
            let currentCount = parseInt(localStorage.getItem(counterKey) || '0');
            let nextCount = (currentCount + 1) % 1000;

            const formattedNum = String(nextCount).padStart(3, '0');
            const ticketId = `${prefix}-${formattedNum}`;

            // Format Manila Stamp
            const now = new Date();
            const dateOptions = {
                timeZone: 'Asia/Manila',
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
            };
            const dateStr = now.toLocaleDateString('en-US', dateOptions);

            const timeOptions = {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };
            const timeStr = now.toLocaleTimeString('en-US', timeOptions);

            // Update Ticket Preview Fields
            document.getElementById('ticket-box-type').textContent = boxTypeLabel;
            document.getElementById('ticket-box-num').textContent = ticketId;
            document.getElementById('ticket-box-color-label').textContent = 'COLOR: ' + colorName;

            const numBox = document.getElementById('ticket-num-box');
            numBox.className = 'ticket-number-box ticket-theme-' + colorName.toLowerCase();

            // Default blank name to "Unknown"
            const nameInputVal = document.getElementById('name-input').value.trim() || 'Unknown';
            document.getElementById('ticket-info-name').textContent = nameInputVal;
            document.getElementById('ticket-info-date').textContent = dateStr;
            document.getElementById('ticket-info-time').textContent = timeStr;
            document.getElementById('ticket-info-type').textContent = isPriority ? 'Priority' : 'Regular';

            let purposeLabel = selectedPurpose.charAt(0).toUpperCase() + selectedPurpose.slice(1);
            if (selectedPurpose === 'misc') purposeLabel = 'Miscellaneous';
            document.getElementById('ticket-info-purpose').textContent = purposeLabel;

            // Dynamic comment text insertion
            const commentVal = document.getElementById('comment-input').value.trim();
            const commentRow = document.getElementById('ticket-info-comment-row');
            if (commentVal) {
                commentRow.style.display = 'flex';
                const importantSuffix = isCommentImportant ? ' (IMPORTANT)' : '';
                document.getElementById('ticket-info-comment').textContent = commentVal + importantSuffix;
                if (isCommentImportant) {
                    document.getElementById('ticket-info-comment').style.color = '#e60000';
                    document.getElementById('ticket-info-comment').style.fontWeight = 'bold';
                } else {
                    document.getElementById('ticket-info-comment').style.color = 'inherit';
                    document.getElementById('ticket-info-comment').style.fontWeight = 'normal';
                }
            } else {
                commentRow.style.display = 'none';
            }

            // Display Barcode value as Plain Text
            const barcodeData = `${ticketId}-${dateStr.replace(/\//g, '')}-${timeStr.replace(/:/g, '')}`;
            const barcodeElem = document.getElementById('ticket-barcode-text');
            if (barcodeElem) barcodeElem.textContent = barcodeData;

            // Reveal ticket details
            document.getElementById('no-preview-placeholder').style.display = 'none';
            document.getElementById('ticket-paper').style.display = 'block';

            // Reveal and trigger left-to-right fill animation on print button
            const printBtn = document.getElementById('print-button');
            printBtn.style.display = 'block';
            setTimeout(() => {
                printBtn.classList.add('animate-fill');
            }, 50);
        }

        // Print Ticket Action & Page Reset Logic
        function printTicket() {
            const ticketNum = document.getElementById('ticket-box-num').textContent;

            // Advance ticket counter in localStorage ONLY when ticket is actually printed
            if (pendingTicketPrefix) {
                const counterKey = 'counter_' + pendingTicketPrefix;
                let count = parseInt(localStorage.getItem(counterKey) || '0');
                count = (count + 1) % 1000;
                localStorage.setItem(counterKey, count);
                pendingTicketPrefix = '';
            }

            const rawPurpose = document.getElementById('ticket-info-purpose').textContent;
            let initialSection = 'E_J';
            const purpLower = (rawPurpose || '').toLowerCase();
            if (purpLower === 'miscellaneous' || purpLower === 'misc') {
                initialSection = 'D_E';
            } else if (purpLower === 'letas') {
                initialSection = 'C_B';
            } else if (purpLower === 'renewal' || purpLower === 'other') {
                initialSection = 'E_J';
            }

            // === Save ticket object to shared localStorage queue ===
            let routeDesc = 'Section B/C (LETAS)';
            if (initialSection === 'D_E') routeDesc = 'Section D/E (Misc)';
            else if (initialSection === 'E_J') routeDesc = 'Section E-J (Renewal/Other)';

            const ticketObj = {
                id: ticketNum,
                name: document.getElementById('ticket-info-name').textContent,
                date: document.getElementById('ticket-info-date').textContent,
                time: document.getElementById('ticket-info-time').textContent,
                type: document.getElementById('ticket-info-type').textContent,
                purpose: rawPurpose,
                comment: document.getElementById('ticket-info-comment').textContent || '',
                status: 'pending',
                currentSection: initialSection,
                currentWindow: 'Window A (Registration)',
                currentRoute: routeDesc,
                history: [
                    {
                        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        action: 'CREATED',
                        window: 'Window A (Registration)',
                        desc: 'Created at Window A (Registration). Initial Route: ' + routeDesc
                    }
                ],
                printedAt: Date.now()
            };
            const queue = JSON.parse(localStorage.getItem('lto_ticket_queue') || '[]');
            queue.push(ticketObj);
            localStorage.setItem('lto_ticket_queue', JSON.stringify(queue));

            // Helper to record window entry stats
            function recordWindowEntry(wId) {
                const statsKey = 'lto_stats_' + wId;
                const st = JSON.parse(localStorage.getItem(statsKey) || '{"entries":0,"accomplished":0,"hourly":[],"accHourly":[]}');
                st.entries = (st.entries || 0) + 1;
                const hr = new Date().getHours();
                if (!Array.isArray(st.hourly)) st.hourly = [];
                while (st.hourly.length <= hr) st.hourly.push(0);
                st.hourly[hr] = (st.hourly[hr] || 0) + 1;
                localStorage.setItem(statsKey, JSON.stringify(st));
            }

            if (initialSection === 'C_B') {
                recordWindowEntry('windowB');
                recordWindowEntry('windowC');
            } else if (initialSection === 'D_E') {
                recordWindowEntry('windowD');
                recordWindowEntry('windowE');
            } else if (initialSection === 'E_J') {
                recordWindowEntry('windowE');
                recordWindowEntry('windowF');
                recordWindowEntry('windowG');
                recordWindowEntry('windowH');
                recordWindowEntry('windowI');
                recordWindowEntry('windowJ');
            }

            // === Update global stats ===
            const stats = JSON.parse(localStorage.getItem('lto_stats') || '{"entries":0,"accomplished":0,"hourly":[]}');
            stats.entries = (stats.entries || 0) + 1;
            const nowHr = new Date().getHours();
            if (!Array.isArray(stats.hourly)) stats.hourly = [];
            while (stats.hourly.length <= nowHr) stats.hourly.push(0);
            stats.hourly[nowHr] = (stats.hourly[nowHr] || 0) + 1;
            localStorage.setItem('lto_stats', JSON.stringify(stats));
            // =====================================================================

            // Show toast in lower right indicating print success
            showToast(`Printing Ticket ${ticketNum}... Please take your slip.`, "login");

            // Wait for toast duration, then reset registration page inputs
            setTimeout(() => {
                const printBtn = document.getElementById('print-button');
                printBtn.classList.remove('animate-fill');
                printBtn.style.display = 'none';

                selectedPurpose = '';
                document.querySelectorAll('.purpose-card').forEach(c => {
                    c.classList.remove('selected');
                });

                isPriority = false;
                document.getElementById('priority-toggle').classList.remove('active');

                isCommentImportant = false;
                document.getElementById('important-circle').classList.remove('active');
                document.getElementById('comment-input').value = '';
                document.getElementById('name-input').value = '';

                updateCommentRequiredUI();
                document.getElementById('generate-button').setAttribute('disabled', 'true');

                document.getElementById('no-preview-placeholder').style.display = 'flex';
                document.getElementById('ticket-paper').style.display = 'none';
            }, 1800);
        }

        // Action Toast Alert implementation
        function showToast(message, type) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<span>${message}</span>`;
            container.appendChild(toast);

            // Trigger opacity slide
            setTimeout(() => {
                toast.classList.add('show');
            }, 50);

            // Dismiss toast
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 1800);
        }

        // Logout handler
        document.getElementById('logout-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showToast('Logging out\u2026 Redirecting.', 'logout');
            setTimeout(function () { window.location.href = 'index.html'; }, 1800);
        });