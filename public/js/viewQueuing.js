function updateClock() {
            try {
                const now = new Date();
                const dateOptions = { timeZone: 'Asia/Manila', month: 'long', day: '2-digit', year: 'numeric' };
                const dateStr = now.toLocaleDateString('en-US', dateOptions);
                const timeOptions = { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
                let timeStr = now.toLocaleTimeString('en-US', timeOptions).replace(/\s*[a-zA-Z]+/g, '');

                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) { console.error("Clock update error:", e); }
        }
        updateClock();
        setInterval(updateClock, 1000);

// Skeleton: shimmer queue panels while data loads from localStorage
        (function() {
            const skStart = Date.now();
            document.querySelectorAll('.vq-container-box, .now-calling-box').forEach(function(box) {
                box.classList.add('skeleton-card');
            });
            setTimeout(function() {
                document.querySelectorAll('.vq-container-box, .now-calling-box').forEach(function(box, i) {
                    setTimeout(function() {
                        box.classList.remove('skeleton-card');
                        box.classList.add('card-revealed');
                    }, i * 80);
                });
            }, Math.max(0, 300 - (Date.now() - skStart)));
        })();

        /* ===================================================================
           1. AUDIO SYNTHESIZER & SPEECH ANNOUNCEMENT ENGINE
           =================================================================== */
        let audioCtx = null;
        let audioEnabled = false;

        function enableAudioContext() {
            if (!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) audioCtx = new AudioContext();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            audioEnabled = true;
            document.getElementById('audio-banner').classList.add('hidden');
        }
        document.addEventListener('click', enableAudioContext, { once: true });

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function playTripleChime() {
            return new Promise((resolve) => {
                try {
                    if (!audioCtx) {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        if (AudioContext) audioCtx = new AudioContext();
                    }
                    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

                    const now = audioCtx ? audioCtx.currentTime : 0;
                    const chimes = [0, 0.35, 0.70];

                    chimes.forEach((d) => {
                        if (!audioCtx) return;
                        const osc1 = audioCtx.createOscillator();
                        const osc2 = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();

                        osc1.type = 'sine';
                        osc2.type = 'sine';
                        osc1.frequency.setValueAtTime(659.25, now + d);
                        osc2.frequency.setValueAtTime(987.77, now + d);

                        gain.gain.setValueAtTime(0.001, now + d);
                        gain.gain.exponentialRampToValueAtTime(0.35, now + d + 0.03);
                        gain.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.32);

                        osc1.connect(gain);
                        osc2.connect(gain);
                        gain.connect(audioCtx.destination);

                        osc1.start(now + d);
                        osc2.start(now + d);
                        osc1.stop(now + d + 0.33);
                        osc2.stop(now + d + 0.33);
                    });

                    setTimeout(resolve, 1150);
                } catch (e) {
                    console.warn("Audio Context playback error:", e);
                    setTimeout(resolve, 500);
                }
            });
        }

        const audioQueue = [];
        let isAudioAnnouncing = false;
        const activeCallsMap = {};
        const lastCallTimestamps = {};
        let visualLoopIndex = 0;

        function queueAudioAnnouncement(callData) {
            audioQueue.push(callData);
            if (!isAudioAnnouncing) {
                processAudioQueue();
            }
        }

        function speakText(text) {
            return new Promise((resolve) => {
                if (!('speechSynthesis' in window)) {
                    setTimeout(resolve, 1500);
                    return;
                }

                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.88;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Samantha')));
                if (preferredVoice) utterance.voice = preferredVoice;

                utterance.onend = () => setTimeout(resolve, 350);
                utterance.onerror = () => setTimeout(resolve, 350);

                window.speechSynthesis.speak(utterance);
            });
        }

        function formatTicketForSpeech(ticketId) {
            if (!ticketId) return "";
            return ticketId.replace('-', ' ');
        }

        async function processAudioQueue() {
            if (localStorage.getItem('lto_system_paused') === 'true') {
                isAudioAnnouncing = false;
                audioQueue.length = 0;
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                return;
            }

            if (audioQueue.length === 0) {
                isAudioAnnouncing = false;
                syncScreenDisplay();
                return;
            }

            isAudioAnnouncing = true;
            const currentCall = audioQueue.shift();

            renderSingleCallUI(currentCall);

            const spokenTicket = formatTicketForSpeech(currentCall.ticketId);
            let speechPhrase = "";
            if (currentCall.isCashier) {
                speechPhrase = "Go to Window K/L (Cashier), " + spokenTicket;
            } else {
                speechPhrase = spokenTicket + ", Go to " + currentCall.windowName;
            }

            for (let rep = 0; rep < 3; rep++) {
                await playTripleChime();
                await speakText(speechPhrase);
                if (rep < 2) await delay(400);
            }

            await delay(5000);

            if (audioQueue.length > 0) {
                processAudioQueue();
            } else {
                isAudioAnnouncing = false;
                syncScreenDisplay();
            }
        }

        /* ===================================================================
           2. SILENT VISUAL DISPLAY LOOP & SCREEN CLEARANCE
           =================================================================== */

        function getCategoryInfo(ticketId, purpose, type) {
            const id = (ticketId || '').toUpperCase();
            const purp = (purpose || '').toLowerCase();
            const t = (type || '').toLowerCase();

            if (t === 'priority' || id.startsWith('P-')) {
                return { key: 'priority', name: 'PRIORITY', cssClass: 'cat-priority' };
            }
            if (purp === 'renewal' || id.startsWith('R-')) {
                return { key: 'renewal', name: 'RENEWAL', cssClass: 'cat-renewal' };
            }
            if (purp === 'miscellaneous' || purp === 'misc' || id.startsWith('M-')) {
                return { key: 'misc', name: 'MISCELLANEOUS', cssClass: 'cat-misc' };
            }
            if (purp === 'letas' || id.startsWith('L-')) {
                return { key: 'letas', name: 'LETAS', cssClass: 'cat-letas' };
            }
            return { key: 'renewal', name: 'RENEWAL', cssClass: 'cat-renewal' };
        }

        function formatWindowName(wId) {
            if (!wId) return 'WINDOW ?';
            const lower = wId.toLowerCase();
            if (lower === 'cashier' || lower === 'windowk' || lower === 'windowl') return 'WINDOW K/L (Cashier)';
            if (lower.startsWith('window')) {
                return 'WINDOW ' + wId.replace(/^window/i, '').toUpperCase();
            }
            return wId.toUpperCase();
        }

        function renderCashierSection(activeCashierCalls) {
            ['renewal', 'misc', 'letas', 'priority'].forEach(catKey => {
                const activeCallForCat = (activeCashierCalls || []).find(c => {
                    const info = getCategoryInfo(c.ticketId, c.purpose, c.type);
                    return info.key === catKey;
                });

                const cardEl = document.getElementById('cashier-card-' + catKey);
                const numEl = document.getElementById('cashier-num-' + catKey);

                if (cardEl && numEl) {
                    if (activeCallForCat) {
                        numEl.textContent = activeCallForCat.ticketId;
                        cardEl.classList.remove('idle', 'flash-green', 'flash-red');
                        void cardEl.offsetWidth;
                        if (activeCallForCat.isRecall) {
                            cardEl.classList.add('flash-red');
                        } else {
                            cardEl.classList.add('flash-green');
                        }
                    } else {
                        numEl.textContent = '---';
                        cardEl.classList.remove('flash-green', 'flash-red');
                        cardEl.classList.add('idle');
                    }
                }
            });
        }

        function renderSingleCallUI(callData) {
            if (!callData) return;
            const { windowId, windowName, ticketId, purpose, type, isCashier, isRecall } = callData;
            const cat = getCategoryInfo(ticketId, purpose, type);

            if (isCashier) {
                renderCashierSection([callData]);
            } else {
                const titleEl = document.getElementById('nc-window-title');
                const cardEl = document.getElementById('nc-cat-card');
                const numEl = document.getElementById('nc-ticket-num');
                const labelEl = document.getElementById('nc-cat-label');

                titleEl.textContent = formatWindowName(windowId);
                numEl.textContent = ticketId;
                labelEl.textContent = cat.name;

                // Gold pulse on ticket number update
                numEl.classList.remove('value-updated');
                void numEl.offsetWidth; // force reflow to restart animation
                numEl.classList.add('value-updated');

                cardEl.className = 'cat-card ' + cat.cssClass;
                cardEl.classList.remove('flash-green', 'flash-red', 'idle');

                void cardEl.offsetWidth;

                if (isRecall) {
                    cardEl.classList.add('flash-red');
                } else {
                    cardEl.classList.add('flash-green');
                }
            }
        }

        function syncScreenDisplay() {
            if (isAudioAnnouncing) return;

            const activeCalls = Object.values(activeCallsMap);
            const activeOtherCalls = activeCalls.filter(c => !c.isCashier);
            const activeCashierCalls = activeCalls.filter(c => c.isCashier);

            // 1. Render/Clear Cashier Section per category card
            renderCashierSection(activeCashierCalls);

            // 2. Render/Clear Other Windows Section (Visual Loop, NO SOUND)
            if (activeOtherCalls.length === 0) {
                const titleEl = document.getElementById('nc-window-title');
                const cardEl = document.getElementById('nc-cat-card');
                const numEl = document.getElementById('nc-ticket-num');
                const labelEl = document.getElementById('nc-cat-label');

                if (titleEl && cardEl && numEl && labelEl) {
                    titleEl.textContent = 'WINDOW ?';
                    numEl.textContent = '---';
                    labelEl.textContent = 'STANDBY';
                    cardEl.className = 'cat-card cat-renewal idle';
                    cardEl.classList.remove('flash-green', 'flash-red');
                }
            } else {
                visualLoopIndex = visualLoopIndex % activeOtherCalls.length;
                const currentCall = activeOtherCalls[visualLoopIndex];
                renderSingleCallUI(currentCall);
            }
        }

        setInterval(() => {
            if (isAudioAnnouncing) return;
            const activeOtherCalls = Object.values(activeCallsMap).filter(c => !c.isCashier);
            if (activeOtherCalls.length > 1) {
                visualLoopIndex = (visualLoopIndex + 1) % activeOtherCalls.length;
                syncScreenDisplay();
            }
        }, 5000);

        /* ===================================================================
           3. ON-HOLD AUTOMATIC ROTATION (10 Seconds Interval)
           =================================================================== */
        const holdCategoryPairs = [
            [
                { key: 'renewal', name: 'RENEWAL', cssClass: 'cat-renewal' },
                { key: 'misc', name: 'MISCELLANEOUS', cssClass: 'cat-misc' }
            ],
            [
                { key: 'letas', name: 'LETAS', cssClass: 'cat-letas' },
                { key: 'priority', name: 'PRIORITY', cssClass: 'cat-priority' }
            ]
        ];

        let currentPairIndex = 0;

        function getOnHoldTickets() {
            try {
                return JSON.parse(localStorage.getItem('lto_onhold_queue') || '[]');
            } catch (e) { return []; }
        }

        function renderOnHoldPanels() {
            const holdTickets = getOnHoldTickets();
            const pair = holdCategoryPairs[currentPairIndex];

            [1, 2].forEach((panelNum) => {
                const catObj = pair[panelNum - 1];
                const panelEl = document.getElementById('hold-panel-' + panelNum);
                const subTitleEl = document.getElementById('hold-cat-' + panelNum);
                const bodyEl = document.getElementById('hold-body-' + panelNum);

                subTitleEl.textContent = catObj.name;
                subTitleEl.className = 'hold-cat-subtitle ' + catObj.cssClass;

                const filtered = holdTickets.filter(t => {
                    const c = getCategoryInfo(t.displayId || t.id, t.purpose, t.type);
                    return c.key === catObj.key;
                });

                bodyEl.innerHTML = '';
                if (filtered.length === 0) {
                    bodyEl.innerHTML = '<tr><td colspan="2" class="hold-empty-row">No tickets on hold</td></tr>';
                } else {
                    filtered.forEach(t => {
                        const tr = document.createElement('tr');
                        const targetWin = t.heldByWindow || t.currentWindow || t.calledBy || formatWindowName(t.currentSection || 'Window B');
                        tr.innerHTML = `<td>${t.displayId || t.id}</td><td>${targetWin}</td>`;
                        bodyEl.appendChild(tr);
                    });
                }
            });
        }

        function rotateOnHoldCategories() {
            const panel1 = document.getElementById('hold-panel-1');
            const panel2 = document.getElementById('hold-panel-2');

            panel1.classList.add('rotating-fade');
            panel2.classList.add('rotating-fade');

            setTimeout(() => {
                currentPairIndex = (currentPairIndex + 1) % holdCategoryPairs.length;
                renderOnHoldPanels();
                panel1.classList.remove('rotating-fade');
                panel2.classList.remove('rotating-fade');
            }, 400);
        }

        setInterval(rotateOnHoldCategories, 10000);
        renderOnHoldPanels();

        /* ===================================================================
           4. REAL-TIME STORAGE MONITORING & TICKET CLEARANCE
           =================================================================== */
        const windowIds = ['cashier', 'windowA', 'windowB', 'windowC', 'windowD', 'windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ', 'windowM', 'windowN'];

        function checkOfflineState() {
            const isOffline = localStorage.getItem('lto_system_paused') === 'true';
            const overlay = document.getElementById('vq-offline-overlay');
            if (overlay) {
                overlay.style.display = isOffline ? 'flex' : 'none';
            }
            if (isOffline && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        }

        function checkCallingUpdates() {
            checkOfflineState();
            windowIds.forEach((wId) => {
                try {
                    const key = 'lto_' + wId + '_active_calling';
                    const raw = localStorage.getItem(key);

                    if (!raw) {
                        if (activeCallsMap[wId]) {
                            delete activeCallsMap[wId];
                        }
                        return;
                    }

                    const data = JSON.parse(raw);
                    if (!data || !data.ticket || !data.startTime) {
                        if (activeCallsMap[wId]) delete activeCallsMap[wId];
                        return;
                    }

                    const isCashier = (wId === 'cashier' || wId === 'windowK' || wId === 'windowL');
                    const lastTime = lastCallTimestamps[wId] || 0;
                    const isNewCall = data.startTime > lastTime;

                    const callObj = {
                        windowId: wId,
                        windowName: formatWindowName(wId),
                        ticketId: data.ticket.displayId || data.ticket.id,  // show short R-001 format
                        purpose: data.ticket.purpose,
                        type: data.ticket.type,
                        isCashier: isCashier,
                        isRecall: !!data.isRecall,
                        startTime: data.startTime
                    };

                    activeCallsMap[wId] = callObj;

                    if (isNewCall) {
                        lastCallTimestamps[wId] = data.startTime;
                        queueAudioAnnouncement(callObj);
                    }
                } catch (e) { }
            });

            renderOnHoldPanels();
            syncScreenDisplay();
        }

        window.addEventListener('storage', checkCallingUpdates);
        setInterval(checkCallingUpdates, 300);
        checkOfflineState();

        /* ===================================================================
           5. TEST & DEMO SIMULATION HELPERS
           =================================================================== */
        function testCall(wId, tId, purp, isRecall) {
            enableAudioContext();
            const nowTime = Date.now();
            const testPayload = {
                ticket: { id: tId, purpose: purp, type: purp === 'priority' ? 'priority' : 'regular' },
                startTime: nowTime,
                isRecall: isRecall,
                windowId: wId
            };
            localStorage.setItem('lto_' + wId + '_active_calling', JSON.stringify(testPayload));
            checkCallingUpdates();
        }

        function clearActiveCall(wId) {
            localStorage.removeItem('lto_' + wId + '_active_calling');
            if (activeCallsMap[wId]) delete activeCallsMap[wId];
            checkCallingUpdates();
        }

        function clearAllActiveCalls() {
            windowIds.forEach(wId => {
                localStorage.removeItem('lto_' + wId + '_active_calling');
                delete activeCallsMap[wId];
            });
            checkCallingUpdates();
        }

        function seedSampleHoldData() {
            const sampleHolds = [
                { id: 'R-002', purpose: 'renewal', heldByWindow: 'WINDOW B', status: 'onhold' },
                { id: 'R-005', purpose: 'renewal', heldByWindow: 'WINDOW C', status: 'onhold' },
                { id: 'M-002', purpose: 'miscellaneous', heldByWindow: 'WINDOW D', status: 'onhold' },
                { id: 'M-008', purpose: 'miscellaneous', heldByWindow: 'WINDOW E', status: 'onhold' },
                { id: 'L-004', purpose: 'letas', heldByWindow: 'WINDOW B', status: 'onhold' },
                { id: 'P-003', purpose: 'renewal', type: 'priority', heldByWindow: 'WINDOW Cashier', status: 'onhold' }
            ];
            localStorage.setItem('lto_onhold_queue', JSON.stringify(sampleHolds));
            renderOnHoldPanels();
            alert("Sample On-Hold data populated!");
        }

        function toggleTestPanel() {
            const panel = document.getElementById('test-panel');
            panel.classList.toggle('collapsed');
            document.getElementById('test-panel-icon').textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
        }