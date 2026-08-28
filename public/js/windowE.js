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

/* ===================================================================
           LIVE CLOCK
        =================================================================== */
        function updateClock() {
            try {
                var now = new Date();
                var dateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: '2-digit', year: 'numeric' });
                var timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\s*[a-zA-Z]+/g, '');
                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) { }
        }
        updateClock();
        setInterval(updateClock, 1000);

        /* ===================================================================
           LOCALSTORAGE & ROUTING HELPERS
        =================================================================== */
        var WINDOW_SECTION = 'D_E_or_E_J';
        var WINDOW_ID = 'windowE';

        var LS_QUEUE = 'lto_ticket_queue';
        var LS_STATS = 'lto_stats';
        var LS_HOLD = 'lto_onhold_queue';
        var LS_ACC = 'lto_accomplished_queue';
        var LS_CALLING = 'lto_' + WINDOW_ID + '_active_calling';

        function _addHistory(ticket, desc, action) {
            if (!ticket) return;
            if (!ticket.history) ticket.history = [];
            var now = new Date();
            var ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            ticket.history.push({
                time: ts,
                action: action || 'INFO',
                window: _winLabel(),
                desc: desc
            });
        }

        function _winLabel() {
            return WINDOW_ID.replace(/^window/i, 'Window ').replace('cashier', 'Cashier');
        }


        function getNextSection(purpose, currentSec) {
            var p = (purpose || '').toLowerCase();
            var cur = currentSec || '';

            if (p === 'miscellaneous' || p === 'misc') {
                if (!cur || cur === 'D_E' || cur === 'misc') return 'Cashier';
                if (cur === 'Cashier') return 'M_N';
                if (cur === 'M_N') return 'Complete';
            } else if (p === 'letas') {
                if (!cur || cur === 'C_B' || cur === 'letas') return 'Cashier';
                if (cur === 'Cashier') return 'Complete';
            } else if (p === 'renewal') {
                if (!cur || cur === 'E_J' || cur === 'renewal') return 'Cashier';
                if (cur === 'Cashier') return 'Complete';
            } else if (p === 'other') {
                if (!cur || cur === 'E_J' || cur === 'other') return 'Complete';
            }
            return 'Complete';
        }

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

        function getQueue() {
            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            var filtered = raw.filter(function (ticket) {
                return isTicketInWindowSection(ticket, WINDOW_SECTION);
            });
            return filtered.sort(function (a, b) {
                if (a.nextToBeCalled && !b.nextToBeCalled) return -1;
                if (!a.nextToBeCalled && b.nextToBeCalled) return 1;

                var aP = (a.type && a.type.toLowerCase() === 'priority') || (a.id && a.id.startsWith('P-'));
                var bP = (b.type && b.type.toLowerCase() === 'priority') || (b.id && b.id.startsWith('P-'));
                if (aP && !bP) return -1;
                if (!aP && bP) return 1;

                return 0;
            });
        }

        function getHold() {
            var raw = JSON.parse(localStorage.getItem(LS_HOLD) || '[]');
            return raw.filter(function (ticket) {
                return isTicketInWindowSection(ticket, WINDOW_SECTION);
            });
        }

        function getStatsForWindow(wId) {
            var rawQ = JSON.parse(localStorage.getItem('lto_ticket_queue') || '[]');
            var rawH = JSON.parse(localStorage.getItem('lto_onhold_queue') || '[]');
            var rawA = JSON.parse(localStorage.getItem('lto_accomplished_queue') || '[]');

            var allTickets = rawQ.concat(rawH).concat(rawA);

            var windowIds = ['windowA', 'windowB', 'windowC', 'windowD', 'windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ', 'windowM', 'windowN', 'cashier'];
            windowIds.forEach(function (id) {
                try {
                    var callingData = JSON.parse(localStorage.getItem('lto_' + id + '_active_calling'));
                    if (callingData && callingData.ticket) {
                        var exists = allTickets.some(function (t) { return getTicketKey(t) === getTicketKey(callingData.ticket); });
                        if (!exists) allTickets.push(callingData.ticket);
                    }
                } catch (e) { }
            });

            var entries = 0;
            var accomplished = 0;
            var hourly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            var accHourly = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

            allTickets.forEach(function (ticket) {
                if (!ticket || !ticket.purpose) return;
                var purp = (ticket.purpose || '').toLowerCase();
                var cur = ticket.currentSection || '';

                var initRoute = [];
                if (purp === 'miscellaneous' || purp === 'misc') initRoute = ['windowD', 'windowE'];
                else if (purp === 'letas') initRoute = ['windowB', 'windowC'];
                else initRoute = ['windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ'];

                var hr = ticket.printedAt ? new Date(ticket.printedAt).getHours() : new Date().getHours();
                if (hr < 0 || hr > 23) hr = new Date().getHours();

                if (initRoute.indexOf(wId) !== -1) {
                    entries++;
                    hourly[hr] = (hourly[hr] || 0) + 1;

                    if (cur === 'Cashier' || cur === 'M_N' || ticket.status === 'accomplished') {
                        accomplished++;
                        var accHr = ticket.accomplishedAt ? new Date(ticket.accomplishedAt).getHours() : hr;
                        if (accHr < 0 || accHr > 23) accHr = hr;
                        accHourly[accHr] = (accHourly[accHr] || 0) + 1;
                    }
                }

                if (wId === 'cashier') {
                    if (cur === 'Cashier' || cur === 'M_N' || ticket.status === 'accomplished') {
                        entries++;
                        hourly[hr] = (hourly[hr] || 0) + 1;
                        if (cur === 'M_N' || ticket.status === 'accomplished') {
                            accomplished++;
                            accHourly[hr] = (accHourly[hr] || 0) + 1;
                        }
                    }
                }

                if (wId === 'windowM' || wId === 'windowN') {
                    if (cur === 'M_N' || ticket.status === 'accomplished') {
                        entries++;
                        hourly[hr] = (hourly[hr] || 0) + 1;
                        if (ticket.status === 'accomplished') {
                            accomplished++;
                            accHourly[hr] = (accHourly[hr] || 0) + 1;
                        }
                    }
                }
            });

            return {
                entries: entries,
                accomplished: accomplished,
                hourly: hourly,
                accHourly: accHourly
            };
        }

        function getStats() { return getStatsForWindow(WINDOW_ID); }
        function getAccList() { return JSON.parse(localStorage.getItem(LS_ACC) || '[]'); }

        function saveQueue(q) {
            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            var remaining = raw.filter(function (ticket) {
                return !isTicketInWindowSection(ticket, WINDOW_SECTION);
            });
            var combined = remaining.concat(q);
            localStorage.setItem(LS_QUEUE, JSON.stringify(combined));
        }

        function saveHold(h) {
            var raw = JSON.parse(localStorage.getItem(LS_HOLD) || '[]');
            var remaining = raw.filter(function (ticket) {
                return !isTicketInWindowSection(ticket, WINDOW_SECTION);
            });
            var combined = remaining.concat(h);
            localStorage.setItem(LS_HOLD, JSON.stringify(combined));
        }

        function saveStats(s) { localStorage.setItem(LS_STATS, JSON.stringify(s)); }
        function saveAccList(a) { localStorage.setItem(LS_ACC, JSON.stringify(a)); }

        function getActiveCallingData() {
            try {
                return JSON.parse(localStorage.getItem(LS_CALLING));
            } catch (e) {
                return null;
            }
        }

        function saveActiveCalling(ticket, startTime) {
            if (ticket) {
                localStorage.setItem(LS_CALLING, JSON.stringify({
                    ticket: ticket,
                    startTime: startTime || Date.now()
                }));
            } else {
                localStorage.removeItem(LS_CALLING);
            }
        }

        function getWindowsForSection(section) {
            if (section === 'C_B') return ['windowB', 'windowC'];
            if (section === 'D_E') return ['windowD', 'windowE'];
            if (section === 'E_J') return ['windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ'];
            if (section === 'Cashier') return ['cashier'];
            if (section === 'M_N') return ['windowM', 'windowN'];
            return [WINDOW_ID];
        }

        function getTicketSectionRoute(ticket) {
            if (!ticket) return WINDOW_SECTION;
            var cur = ticket.currentSection;
            if (cur === 'C_B' || cur === 'D_E' || cur === 'E_J' || cur === 'Cashier' || cur === 'M_N') {
                return cur;
            }
            var purp = (ticket.purpose || '').toLowerCase();
            if (purp === 'miscellaneous' || purp === 'misc') return 'D_E';
            if (purp === 'letas') return 'C_B';
            if (purp === 'renewal' || purp === 'other') return 'E_J';
            return 'E_J';
        }

        function recordSectionEntry(section) {
            var windows = getWindowsForSection(section);
            var hr = new Date().getHours();
            windows.forEach(function (wId) {
                var statsKey = 'lto_stats_' + wId;
                var st = JSON.parse(localStorage.getItem(statsKey) || '{"entries":0,"accomplished":0,"hourly":[],"accHourly":[]}');
                st.entries = (st.entries || 0) + 1;
                if (!Array.isArray(st.hourly)) st.hourly = [];
                while (st.hourly.length <= hr) st.hourly.push(0);
                st.hourly[hr] = (st.hourly[hr] || 0) + 1;
                localStorage.setItem(statsKey, JSON.stringify(st));
            });
        }

        function recordSectionAccomplished(section) {
            var windows = getWindowsForSection(section);
            var hr = new Date().getHours();
            windows.forEach(function (wId) {
                var statsKey = 'lto_stats_' + wId;
                var st = JSON.parse(localStorage.getItem(statsKey) || '{"entries":0,"accomplished":0,"hourly":[],"accHourly":[]}');
                st.accomplished = (st.accomplished || 0) + 1;
                if (!Array.isArray(st.accHourly)) st.accHourly = [];
                while (st.accHourly.length <= hr) st.accHourly.push(0);
                st.accHourly[hr] = (st.accHourly[hr] || 0) + 1;
                localStorage.setItem(statsKey, JSON.stringify(st));
            });
        }

        function advanceTicket(ticket) {
            var currentSec = getTicketSectionRoute(ticket);
            var nextSec = getNextSection(ticket.purpose, currentSec);

            // Record accomplished stats for the section route handling this ticket
            recordSectionAccomplished(currentSec);

            if (nextSec === 'Complete') {
                ticket.status = 'accomplished';
                ticket.accomplishedAt = Date.now();
                ticket.currentWindow = _winLabel() + ' (Completed)';
                _addHistory(ticket, 'Completed/accomplished at ' + _winLabel(), 'COMPLETED');
                var acc = getAccList();
                acc.push(ticket);
                saveAccList(acc);
            } else {
                ticket.currentSection = nextSec;
                ticket.status = 'pending';
                ticket.nextToBeCalled = false;
                ticket.currentWindow = 'Queue for ' + nextSec;
                _addHistory(ticket, 'Advanced from ' + _winLabel() + ' to ' + nextSec, 'ADVANCED');
                var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
                raw = raw.filter(function (item) { return getTicketKey(item) !== getTicketKey(ticket); });
                raw.push(ticket);
                localStorage.setItem(LS_QUEUE, JSON.stringify(raw));

                // Record entries for target window section route
                recordSectionEntry(nextSec);
            }
        }

        /* ===================================================================
           STATE
        =================================================================== */
        var currentCalling = null;
        var timerSec = 0;
        var timerIv = null;
        var callingStartTime = 0;
        var currentTab = 'pending';
        var listPage = 0;
        var ITEMS_PP = 6;

        /* ===================================================================
           RENDER LIST
        =================================================================== */
        function activeList() { return currentTab === 'pending' ? getQueue() : getHold(); }

        function renderList() {
            var list = activeList();
            var searchInput = document.getElementById('list-search-input');
            var searchQuery = (searchInput ? searchInput.value : '').trim().toLowerCase();

            if (searchQuery) {
                list = list.filter(function (ticket) {
                    var tid = (ticket.id || '').toLowerCase();
                    var fno = fileNo(ticket).toLowerCase();
                    var name = (ticket.name || '').toLowerCase();
                    return tid.indexOf(searchQuery) !== -1 || fno.indexOf(searchQuery) !== -1 || name.indexOf(searchQuery) !== -1;
                });
            }

            var body = document.getElementById('list-body');
            var dotsEl = document.getElementById('list-dots-row');
            var total = Math.max(1, Math.ceil(list.length / ITEMS_PP));

            document.getElementById('list-tab-title').textContent = currentTab === 'pending' ? 'PENDING' : 'ON HOLD';
            document.getElementById('list-count-txt').textContent = '| ' + list.length;

            if (listPage >= total) listPage = total - 1;

            // Dots
            if (dotsEl) {
                dotsEl.innerHTML = '';
                for (var i = 0; i < total; i++) {
                    var dot = document.createElement('div');
                    dot.className = 'wb-list-dot' + (i === listPage ? ' active' : '');
                    (function (pg) { dot.onclick = function () { listPage = pg; renderList(); }; })(i);
                    dotsEl.appendChild(dot);
                }
            }

            body.innerHTML = '';
            var slice = list.slice(listPage * ITEMS_PP, listPage * ITEMS_PP + ITEMS_PP);

            if (slice.length === 0) {
                body.innerHTML = '<div class="wb-list-empty">' + (searchQuery ? 'No matching items' : 'No items') + '</div>';
                return;
            }

            slice.forEach(function (ticket, idx) {
                var globalIdx = listPage * ITEMS_PP + idx;
                var row = document.createElement('div');
                var isPrio = (ticket.type && ticket.type.toLowerCase() === 'priority') || (ticket.id && ticket.id.startsWith('P-'));
                var isNext = (listPage === 0 && idx === 0 && !searchQuery);
                row.className = 'wb-list-row' + (isPrio ? ' wb-prio-row' : '') + (isNext ? ' wb-next-called-row' : '');
                row.innerHTML =
                    '<span class="wbl-ticket">' + ticket.id + (isNext ? ' <span style="font-size:0.52rem;background:#0052FF;color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;">NEXT</span>' : '') + '</span>' +
                    '<span><span class="wbl-badge ' + purposeClass(ticket.purpose) + '">' + ticket.purpose.toUpperCase() + '</span></span>';
                (function (t, gi, tab) { row.onclick = function () { openModal(t, gi, tab); }; })(ticket, globalIdx, currentTab);
                body.appendChild(row);

                // Insert visual separator after the next-to-be-called ticket
                if (isNext && slice.length > 1) {
                    var sep = document.createElement('div');
                    sep.className = 'wb-list-separator';
                    sep.innerHTML = '<span>NEXT TO BE CALLED</span>';
                    body.appendChild(sep);
                }
            });
        }

        // Live automatic search handler for ticket or file number
        document.getElementById('list-search-input').addEventListener('input', function () {
            listPage = 0;
            renderList();
        });

        function purposeClass(p) {
            p = (p || '').toLowerCase();
            if (p === 'renewal') return 'renewal';
            if (p === 'miscellaneous' || p === 'misc') return 'misc';
            if (p === 'letas') return 'letas';
            if (p === 'priority') return 'priority';
            return 'renewal';
        }

        function switchTab(tab) {
            currentTab = tab;
            listPage = 0;
            document.getElementById('tab-pending').classList.toggle('active', tab === 'pending');
            document.getElementById('tab-onhold').classList.toggle('active', tab === 'onhold');
            renderList();
        }

        function advanceListPage() {
            var list = activeList();
            var total = Math.max(1, Math.ceil(list.length / ITEMS_PP));
            listPage = (listPage + 1) % total;
            renderList();
        }

        /* ===================================================================
           CALLING LOGIC
        =================================================================== */
        function fileNo(t) {
            if (!t) return '\u2014';
            if (typeof t === 'object' && t.fileNo) return t.fileNo;
            var id = typeof t === 'object' ? (t.id || '') : String(t);
            if (!id) return '\u2014';
            var h = 0;
            for (var i = 0; i < id.length; i++) h += id.charCodeAt(i);
            return id.replace('-', '') + '-' + ((h * 4317) % 90000000 + 10000000);
        }

        
        function getTicketKey(t) {
            if (!t) return '';
            if (typeof t === 'string') return t;
            return t.fileNo || (t.id + '_' + (t.printedAt || '') + '_' + (t.name || ''));
        }

        function refreshCallingUI() {
            var t = currentCalling;
            document.getElementById('txn-file').textContent = t ? fileNo(t) : '\u2014';
            document.getElementById('txn-name').textContent = t ? t.name : '\u2014';
            document.getElementById('txn-date').textContent = t ? t.date : '\u2014';
            document.getElementById('txn-time').textContent = t ? t.time : '\u2014';
            document.getElementById('txn-type').textContent = t ? t.type : '\u2014';
            document.getElementById('txn-purpose').textContent = t ? t.purpose : '\u2014';
            document.getElementById('txn-comment').textContent = t ? (t.comment || '\u2014') : '\u2014';

            var numEl = document.getElementById('calling-num');
            var fileEl = document.getElementById('calling-file');

            if (t) {
                numEl.textContent = t.displayId || t.id;
                numEl.classList.remove('wb-empty');
                fileEl.textContent = 'Ticket ID: ' + fileNo(t);
            } else {
                numEl.textContent = 'NONE';
                numEl.classList.add('wb-empty');
                fileEl.textContent = '';
            }

            var has = !!t;
            document.getElementById('btn-again').disabled = !has;
            document.getElementById('btn-cancel').disabled = !has;
            document.getElementById('btn-hold').disabled = !has;
            document.getElementById('btn-next').disabled = (getQueue().length === 0 && !has);
        }

        function startTimer(customStartTime) {
            stopTimer();
            callingStartTime = customStartTime || Date.now();
            timerSec = Math.floor((Date.now() - callingStartTime) / 1000);
            if (timerSec < 0) timerSec = 0;
            renderTimer();
            timerIv = setInterval(function () {
                timerSec = Math.floor((Date.now() - callingStartTime) / 1000);
                renderTimer();
            }, 1000);
        }

        function stopTimer() {
            if (timerIv) { clearInterval(timerIv); timerIv = null; }
            timerSec = 0;
            callingStartTime = 0;
            renderTimer();
        }

        function renderTimer() {
            var el = document.getElementById('calling-timer');
            var m = String(Math.floor(timerSec / 60)).padStart(2, '0');
            var s = String(timerSec % 60).padStart(2, '0');
            el.textContent = m + ':' + s;
            el.classList.remove('wb-warn', 'wb-danger');
            if (timerSec >= 300) el.classList.add('wb-danger');
            else if (timerSec >= 120) el.classList.add('wb-warn');
        }

        function callNext() {
            if (localStorage.getItem('lto_system_paused') === 'true') {
                showToast('SYSTEM PAUSED by Control Panel.', 'logout');
                return;
            }
            var q = getQueue();
            if (q.length === 0 && !currentCalling) { showToast('No pending tickets in queue.', 'logout'); return; }

            // Advance current calling ticket to its next section
            if (currentCalling) {
                var prevTicket = currentCalling;
                advanceTicket(prevTicket);
            }

            // Re-fetch queue after advancing
            q = getQueue();
            if (q.length === 0) {
                stopTimer();
                currentCalling = null;
                saveActiveCalling(null);
                refreshCallingUI();
                renderList();
                refreshStats();
                showToast('Previous ticket proceeded. No more pending tickets.', 'login');
                return;
            }

            var next = q.shift();
            // Remove 'next' from raw ticket queue so it is in calling state
            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            raw = raw.filter(function (item) { return getTicketKey(item) !== getTicketKey(next); });
            localStorage.setItem(LS_QUEUE, JSON.stringify(raw));

            currentCalling = next;
            next.currentWindow = _winLabel();
            next.status = 'calling';
            _addHistory(next, 'Called at ' + _winLabel(), 'CALLED');
            var nowTime = Date.now();
            saveActiveCalling(next, nowTime);
            refreshCallingUI();
            startTimer(nowTime);
            renderList();
            refreshStats();
            showToast('Now calling: ' + next.id + ' \u2014 ' + next.name, 'login');
        }

        function callAgain() {
            if (!currentCalling) return;
            var nowTime = Date.now();
            _addHistory(currentCalling, 'Re-called at ' + _winLabel(), 'RECALLED');
            saveActiveCalling(currentCalling, nowTime);
            startTimer(nowTime);
            showToast('Calling again: ' + currentCalling.id, 'login');
        }

        function cancelCall() {
            if (!currentCalling) return;
            var ticket = currentCalling;
            ticket.status = 'pending';
            ticket.currentWindow = 'Queue for ' + WINDOW_SECTION;
            _addHistory(ticket, 'Call cancelled at ' + _winLabel() + ', returned to queue', 'CANCEL_CALL');

            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            raw.unshift(ticket);
            localStorage.setItem(LS_QUEUE, JSON.stringify(raw));

            saveActiveCalling(null);
            stopTimer();
            currentCalling = null;
            refreshCallingUI();
            renderList();
            showToast(ticket.id + ' returned to waiting list.', 'logout');
        }

        function putOnHold() {
            if (!currentCalling) return;
            var h = JSON.parse(localStorage.getItem(LS_HOLD) || '[]');
            currentCalling.status = 'onhold';
            currentCalling.heldByWindow = _winLabel();
            currentCalling.currentWindow = 'On Hold at ' + _winLabel();
            _addHistory(currentCalling, 'Put on hold at ' + _winLabel(), 'ON_HOLD');
            h.push(currentCalling);
            localStorage.setItem(LS_HOLD, JSON.stringify(h));
            saveActiveCalling(null);
            showToast(currentCalling.id + ' put on hold.', 'logout');
            stopTimer();
            currentCalling = null;
            refreshCallingUI();
            renderList();
        }

        /* ===================================================================
           MODAL
        =================================================================== */
        var mIdx = -1;
        var mTab = 'pending';

        function openModal(ticket, idx, tab) {
            mIdx = idx; mTab = tab;
            document.getElementById('m-ctx').textContent = tab === 'pending' ? 'Pending Ticket' : 'On Hold Ticket';
            document.getElementById('m-num').textContent = ticket.id;
            document.getElementById('m-file').textContent = fileNo(ticket);
            document.getElementById('m-name').textContent = ticket.name || '\u2014';
            document.getElementById('m-date').textContent = ticket.date || '\u2014';
            document.getElementById('m-time').textContent = ticket.time || '\u2014';
            document.getElementById('m-type').textContent = ticket.type || '\u2014';
            document.getElementById('m-purpose').textContent = ticket.purpose || '\u2014';
            document.getElementById('m-comment').textContent = ticket.comment || '\u2014';

            var acts = document.getElementById('m-actions');
            if (tab === 'pending') {
                acts.innerHTML =
                    '<button class="wb-modal-btn wbm-proceed"   onclick="mProceed()">\u25BA Proceed</button>' +
                    '<button class="wb-modal-btn wbm-makenext"  onclick="mMakeNextToBeCalled()">\u2605 To Be Called Next</button>' +
                    '<button class="wb-modal-btn wbm-makefirst" onclick="mMakeFirst()">\u25B2 Make First</button>' +
                    '<button class="wb-modal-btn wbm-tohold"    onclick="mToHold()">\u258E\u258E Put On Hold</button>' +
                    '<button class="wb-modal-btn wbm-close"     onclick="closeModal()">\u2716 Close</button>';
            } else {
                acts.innerHTML =
                    '<button class="wb-modal-btn wbm-proceed"  onclick="mProceed()">\u25BA Proceed</button>' +
                    '<button class="wb-modal-btn wbm-towait"   onclick="mToWait()">\u25C4 Put on Waiting</button>' +
                    '<button class="wb-modal-btn wbm-close"    onclick="closeModal()">\u2716 Close</button>';
            }
            document.getElementById('wb-overlay').classList.add('open');
        }

        function closeModal() { document.getElementById('wb-overlay').classList.remove('open'); }
        function overlayClick(e) { if (e.target === document.getElementById('wb-overlay')) closeModal(); }

        function mProceed() {
            var list = mTab === 'pending' ? getQueue() : getHold();
            var ticket = list[mIdx];
            if (!ticket) { closeModal(); return; }

            if (mTab === 'pending') {
                var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
                raw = raw.filter(function (item) { return getTicketKey(item) !== getTicketKey(ticket); });
                localStorage.setItem(LS_QUEUE, JSON.stringify(raw));
            } else {
                var rawH = JSON.parse(localStorage.getItem(LS_HOLD) || '[]');
                rawH = rawH.filter(function (item) { return getTicketKey(item) !== getTicketKey(ticket); });
                localStorage.setItem(LS_HOLD, JSON.stringify(rawH));
            }

            var nextSec = getNextSection(ticket.purpose, ticket.currentSection || WINDOW_SECTION);
            advanceTicket(ticket);

            showToast(ticket.id + (nextSec === 'Complete' ? ' completed.' : ' transferred to ' + nextSec + '.'), 'login');
            closeModal();
            renderList();
            refreshStats();
        }

        function mMakeNextToBeCalled() {
            var q = getQueue();
            var t = q[mIdx];
            if (!t) { closeModal(); return; }
            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            raw.forEach(function (item) { item.nextToBeCalled = false; });
            var found = raw.find(function (item) { return getTicketKey(item) === getTicketKey(t); });
            if (found) {
                found.nextToBeCalled = true;
                _addHistory(found, 'Designated as Next to be Called at ' + _winLabel(), 'PRIORITIZED');
            }
            saveQueue(raw);
            listPage = 0;
            showToast(t.id + ' designated to be called next.', 'login');
            closeModal();
            renderList();
        }

        function mMakeFirst() {
            var q = getQueue();
            var t = q[mIdx];
            if (!t) { closeModal(); return; }
            var raw = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
            var idxInRaw = -1;
            for (var i = 0; i < raw.length; i++) {
                if (raw[i].id === t.id) { idxInRaw = i; break; }
            }
            if (idxInRaw !== -1) {
                var item = raw.splice(idxInRaw, 1)[0];
                item.nextToBeCalled = false;
                _addHistory(item, 'Moved to top of queue at ' + _winLabel(), 'PRIORITIZED');
                var isPrio = (item.type && item.type.toLowerCase() === 'priority') || (item.id && item.id.startsWith('P-'));
                if (isPrio) {
                    raw.unshift(item);
                } else {
                    var insertIdx = 0;
                    for (var k = 0; k < raw.length; k++) {
                        var kPrio = (raw[k].type && raw[k].type.toLowerCase() === 'priority') || (raw[k].id && raw[k].id.startsWith('P-'));
                        if (kPrio) {
                            insertIdx = k + 1;
                        }
                    }
                    raw.splice(insertIdx, 0, item);
                }
                saveQueue(raw);
            }
            listPage = 0;
            showToast(t.id + ' moved to top of its list.', 'login');
            closeModal();
            renderList();
        }

        function mToHold() {
            var q = getQueue();
            var t = q[mIdx];
            if (!t) { closeModal(); return; }
            q.splice(mIdx, 1);
            saveQueue(q);
            var h = getHold();
            t.status = 'onhold';
            _addHistory(t, 'Put on hold from ' + _winLabel() + ' queue');
            h.push(t);
            saveHold(h);
            showToast(t.id + ' moved to on hold.', 'logout');
            closeModal();
            renderList();
        }

        function mToWait() {
            var h = getHold();
            var t = h[mIdx];
            if (!t) { closeModal(); return; }
            h.splice(mIdx, 1);
            saveHold(h);
            var q = getQueue();
            t.status = 'pending';
            _addHistory(t, 'Released from hold back to ' + _winLabel() + ' queue');
            q.push(t);
            saveQueue(q);
            showToast(t.id + ' moved back to pending.', 'login');
            closeModal();
            renderList();
        }

        /* ===================================================================
           STATISTICS � real data from localStorage
        =================================================================== */
        var statsSlide = 0;

        function toggleStatsSlide() { setStatsSlide(statsSlide === 0 ? 1 : 0); }

        function setStatsSlide(n) {
            document.getElementById('slide-' + statsSlide).classList.remove('active');
            document.getElementById('sdot-' + statsSlide).classList.remove('active');
            statsSlide = n;
            document.getElementById('slide-' + statsSlide).classList.add('active');
            document.getElementById('sdot-' + statsSlide).classList.add('active');
            document.getElementById('stats-title-txt').textContent = n === 0 ? 'STATISTICS | Entries' : 'STATISTICS | Accomplished';
        }

        function trackQueueEntries() {
            // Disabled auto-incrementing on page view to prevent double-counting
        }

        function refreshStats() {
            trackQueueEntries();
            var st = getStats();
            var entries = Array.isArray(st.hourly) ? st.hourly : [];
            var acc = Array.isArray(st.accHourly) ? st.accHourly : [];

            // Pad both arrays to 24 slots
            while (entries.length < 24) entries.push(0);
            while (acc.length < 24) acc.push(0);

            // Display totals
            document.getElementById('stat-entries-num').textContent = st.entries || 0;
            document.getElementById('stat-acc-num').textContent = st.accomplished || 0;

            // Only show hours that have any data (up to current hour)
            var curHr = new Date().getHours();
            var eSlice = entries.slice(0, curHr + 1);
            var aSlice = acc.slice(0, curHr + 1);

            // Ensure at least 2 points so the line draws
            if (eSlice.length < 2) { eSlice = [0, 0]; aSlice = [0, 0]; }

            drawChart(eSlice, 'e-area', 'e-line', 'e-dots', 'e-xlbl', false);
            drawChart(aSlice, 'a-area', 'a-line', 'a-dots', 'a-xlbl', true);
        }

        function drawChart(data, areaId, lineId, dotsId, xlbId, isAcc) {
            var pL = 38, pR = 6, pT = 8, pB = 10, W = 500, H = 128;
            var cW = W - pL - pR, cH = H - pT - pB;
            var maxV = Math.max.apply(null, data) || 1;
            // Always use scale up to at least 10 or the real max for nice rendering
            if (maxV < 10) maxV = 10;
            var step = cW / Math.max(data.length - 1, 1);

            var pts = data.map(function (v, i) {
                return { x: pL + i * step, y: pT + cH - (v / maxV) * cH };
            });

            document.getElementById(lineId).setAttribute('points',
                pts.map(function (p) { return p.x + ',' + p.y; }).join(' '));

            var bY = pT + cH;
            document.getElementById(areaId).setAttribute('d',
                'M' + pts[0].x + ',' + bY + ' ' + pts.map(function (p) { return 'L' + p.x + ',' + p.y; }).join(' ') + ' L' + pts[pts.length - 1].x + ',' + bY + ' Z');

            var ns = 'http://www.w3.org/2000/svg';
            var dg = document.getElementById(dotsId); dg.innerHTML = '';
            pts.forEach(function (p) {
                var c = document.createElementNS(ns, 'circle');
                c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 4);
                c.setAttribute('class', isAcc ? 'wbc-dot-a' : 'wbc-dot-e');
                dg.appendChild(c);
            });

            var xg = document.getElementById(xlbId); xg.innerHTML = '';
            pts.forEach(function (p, i) {
                var t = document.createElementNS(ns, 'text');
                t.setAttribute('x', p.x); t.setAttribute('y', H);
                t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'wbc-lbl');
                t.textContent = i;
                xg.appendChild(t);
            });
        }

        /* ===================================================================
           TOAST
        =================================================================== */
        function showToast(msg, type) {
            var c = document.getElementById('toast-container');
            var t = document.createElement('div');
            t.className = 'toast toast-' + type;
            t.innerHTML = '<span>' + msg + '</span>';
            c.appendChild(t);
            setTimeout(function () { t.classList.add('show'); }, 50);
            setTimeout(function () {
                t.classList.remove('show');
                setTimeout(function () { t.remove(); }, 300);
            }, 2200);
        }

        /* ===================================================================
           LOGOUT
        =================================================================== */
        document.getElementById('logout-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showToast('Logging out\u2026', 'logout');
            setTimeout(function () { window.location.href = 'index.html'; }, 1800);
        });

        /* ===================================================================
           LIVE REFRESH � poll localStorage every 3 seconds to catch new
           tickets printed from Window A in another tab
        =================================================================== */
        setInterval(function () {
            renderList();
            refreshStats();
            refreshCallingUI();
        }, 3000);

        /* ===================================================================
           INIT
        =================================================================== */
        (function () {
            var activeData = getActiveCallingData();
            if (activeData && activeData.ticket) {
                currentCalling = activeData.ticket;
                refreshCallingUI();
                startTimer(activeData.startTime);
            } else {
                refreshCallingUI();
            }
            renderList();
            refreshStats();
        })();