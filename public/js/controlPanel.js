// Page transition: fade-exit on any internal link click
        document.addEventListener('click', function(e) {
            var link = e.target.closest('a[href]');
            if (link && !link.href.startsWith('#') && link.target !== '_blank' && !link.href.startsWith('javascript')) {
                e.preventDefault();
                var dest = link.href;
                document.body.classList.add('page-exit');
                setTimeout(function() { window.location.href = dest; }, 250);
            }
        });

/* ===================================================================
           1. CLOCK (PST UTC+8 / Asia/Manila)
           =================================================================== */
        function updateClock() {
            try {
                var now = new Date();
                var dateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: '2-digit', year: 'numeric' });
                var timeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\s*[a-zA-Z]+/g, '');
                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) { console.error("Clock error:", e); }
        }
        updateClock();
        setInterval(updateClock, 1000);

        /* ===================================================================
           2. DATA STORAGE LAYER (mirrors all window pages)
           =================================================================== */
        var LS_QUEUE = 'lto_ticket_queue';
        var LS_HOLD = 'lto_onhold_queue';
        var LS_ACC = 'lto_accomplished_queue';
        var LS_PAUSED = 'lto_system_paused';

        function getRawQueue() { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); }
        function getRawHold() { return JSON.parse(localStorage.getItem(LS_HOLD) || '[]'); }
        function getRawAcc() { return JSON.parse(localStorage.getItem(LS_ACC) || '[]'); }

        function saveRawQueue(q) { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); }
        function saveRawHold(h) { localStorage.setItem(LS_HOLD, JSON.stringify(h)); }
        function saveRawAcc(a) { localStorage.setItem(LS_ACC, JSON.stringify(a)); }

        /* ===================================================================
           3. TICKET ROUTING LOGIC (copied verbatim from Window B)
           =================================================================== */
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

        /* ===================================================================
           4. getStatsForWindow() — EXACT COPY from Window B (lines 1319-1396)
              Computes entries, accomplished, hourly arrays from REAL data
           =================================================================== */
        function getStatsForWindow(wId) {
            var rawQ = JSON.parse(localStorage.getItem('lto_ticket_queue') || '[]');
            var rawH = JSON.parse(localStorage.getItem('lto_onhold_queue') || '[]');
            var rawA = JSON.parse(localStorage.getItem('lto_accomplished_queue') || '[]');

            var allTickets = rawQ.concat(rawH).concat(rawA);

            // Include tickets currently being called at each window
            var windowIds = ['windowA', 'windowB', 'windowC', 'windowD', 'windowE', 'windowF', 'windowG', 'windowH', 'windowI', 'windowJ', 'windowM', 'windowN', 'cashier'];
            windowIds.forEach(function (id) {
                try {
                    var callingData = JSON.parse(localStorage.getItem('lto_' + id + '_active_calling'));
                    if (callingData && callingData.ticket) {
                        var exists = allTickets.some(function (t) { return t.id === callingData.ticket.id; });
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

        /* ===================================================================
           5. WINDOW MAPPING & SECTION LOOKUP
           =================================================================== */
        var WINDOW_MAP = {
            'windowB': { label: 'B', section: 'C_B' },
            'windowC': { label: 'C', section: 'C_B' },
            'windowE': { label: 'E', section: 'D_E_or_E_J' },
            'windowF': { label: 'F', section: 'E_J' },
            'windowG': { label: 'G', section: 'E_J' },
            'windowH': { label: 'H', section: 'E_J' },
            'windowI': { label: 'I', section: 'E_J' },
            'windowJ': { label: 'J', section: 'E_J' },
            'cashier':  { label: 'Cashier', section: 'Cashier' },
            'windowM': { label: 'M', section: 'M_N' },
            'windowN': { label: 'L', section: 'M_N' }
        };

        var ALL_WINDOW_IDS = Object.keys(WINDOW_MAP);

        function getWindowSection(wId) {
            return WINDOW_MAP[wId] ? WINDOW_MAP[wId].section : null;
        }

        function getWindowLabel(wId) {
            return WINDOW_MAP[wId] ? WINDOW_MAP[wId].label : wId;
        }

        /* ===================================================================
           6. STATISTICS COMPUTATION ENGINE (REAL DATA ONLY)
           =================================================================== */
        var selectedWindow = 'Overall';
        var currentChartSlide = 0; // 0 = Entries, 1 = On Hold

        function computeMetrics() {
            var rawQ = getRawQueue();
            var rawH = getRawHold();
            var rawA = getRawAcc();

            if (selectedWindow === 'Overall') {
                // Deduplicate: count each ticket once based on its actual state
                var allTicketsMap = {};
                rawQ.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });
                rawH.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });
                rawA.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });

                // Include active calling tickets
                ALL_WINDOW_IDS.forEach(function(wId) {
                    try {
                        var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                        if (cd && cd.ticket && cd.ticket.id) allTicketsMap[cd.ticket.id] = cd.ticket;
                    } catch(e){}
                });

                var allTickets = Object.values(allTicketsMap);
                var totalEntries = allTickets.length;
                var waiting = 0, done = 0, onhold = 0;

                allTickets.forEach(function(t) {
                    var st = (t.status || '').toLowerCase();
                    if (st === 'accomplished' || st === 'completed') done++;
                    else if (rawH.some(function(h) { return h.id === t.id; })) onhold++;
                    else waiting++;
                });

                return { entries: totalEntries, waiting: waiting, done: done, onhold: onhold };
            } else {
                // Per-window: filter by section
                var section = getWindowSection(selectedWindow);
                if (!section) return { entries: 0, waiting: 0, done: 0, onhold: 0 };

                var qFiltered = rawQ.filter(function(t) { return isTicketInWindowSection(t, section); });
                var hFiltered = rawH.filter(function(t) { return isTicketInWindowSection(t, section); });

                // Use getStatsForWindow for entries/accomplished (it accounts for routing)
                var st = getStatsForWindow(selectedWindow);

                return {
                    entries: st.entries,
                    waiting: qFiltered.length,
                    done: st.accomplished,
                    onhold: hFiltered.length
                };
            }
        }

        function computeHourlyData() {
            if (selectedWindow === 'Overall') {
                // Aggregate hourly from all windows (deduplicated via getStatsForWindow logic)
                // Use a combined approach: sum unique ticket hourly data
                var combinedEntries = new Array(24).fill(0);
                var combinedOnHold = new Array(24).fill(0);

                // For entries: use getStatsForWindow across all unique purpose routes
                // To avoid double counting, process tickets directly
                var rawQ = getRawQueue();
                var rawH = getRawHold();
                var rawA = getRawAcc();
                var allTicketsMap = {};
                rawQ.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });
                rawH.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });
                rawA.forEach(function(t) { if (t && t.id) allTicketsMap[t.id] = t; });

                ALL_WINDOW_IDS.forEach(function(wId) {
                    try {
                        var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                        if (cd && cd.ticket && cd.ticket.id) allTicketsMap[cd.ticket.id] = cd.ticket;
                    } catch(e){}
                });

                var allTickets = Object.values(allTicketsMap);
                allTickets.forEach(function(t) {
                    if (!t) return;
                    var hr = t.printedAt ? new Date(t.printedAt).getHours() : new Date().getHours();
                    if (hr < 0 || hr > 23) hr = new Date().getHours();
                    combinedEntries[hr]++;
                });

                // On hold hourly
                rawH.forEach(function(t) {
                    if (!t) return;
                    var hr = t.printedAt ? new Date(t.printedAt).getHours() : new Date().getHours();
                    if (hr < 0 || hr > 23) hr = new Date().getHours();
                    combinedOnHold[hr]++;
                });

                return { entries: combinedEntries, onhold: combinedOnHold };
            } else {
                var st = getStatsForWindow(selectedWindow);
                var entryHourly = Array.isArray(st.hourly) ? st.hourly.slice() : new Array(24).fill(0);
                while (entryHourly.length < 24) entryHourly.push(0);

                // On hold hourly for this window's section
                var section = getWindowSection(selectedWindow);
                var onholdHourly = new Array(24).fill(0);
                getRawHold().forEach(function(t) {
                    if (isTicketInWindowSection(t, section)) {
                        var hr = t.printedAt ? new Date(t.printedAt).getHours() : new Date().getHours();
                        if (hr < 0 || hr > 23) hr = new Date().getHours();
                        onholdHourly[hr]++;
                    }
                });

                return { entries: entryHourly, onhold: onholdHourly };
            }
        }

        /* ===================================================================
           7. SVG CHART DRAWING (Window B drawChart verbatim adaptation)
           =================================================================== */
        function drawChart(data, areaId, lineId, dotsId, xlbId, isOnHold, nodataId) {
            var hasData = data.some(function(v) { return v > 0; });
            var svgParent = document.getElementById(areaId).closest('svg');
            var nodataEl = document.getElementById(nodataId);

            if (!hasData) {
                svgParent.style.display = 'none';
                if (nodataEl) nodataEl.style.display = 'flex';
                return;
            }
            svgParent.style.display = '';
            if (nodataEl) nodataEl.style.display = 'none';

            var pL = 38, pR = 6, pT = 8, pB = 10, W = 500, H = 128;
            var cW = W - pL - pR, cH = H - pT - pB;
            var maxV = Math.max.apply(null, data) || 1;
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
                c.setAttribute('class', isOnHold ? 'cpc-dot-a' : 'cpc-dot-e');
                dg.appendChild(c);
            });

            var xg = document.getElementById(xlbId); xg.innerHTML = '';
            pts.forEach(function (p, i) {
                var t = document.createElementNS(ns, 'text');
                t.setAttribute('x', p.x); t.setAttribute('y', H);
                t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'cpc-lbl');
                t.textContent = i;
                xg.appendChild(t);
            });
        }

        function refreshCharts() {
            var hourlyData = computeHourlyData();
            var curHr = new Date().getHours();

            var eSlice = hourlyData.entries.slice(0, curHr + 1);
            var aSlice = hourlyData.onhold.slice(0, curHr + 1);

            if (eSlice.length < 2) { eSlice = [0, 0]; }
            if (aSlice.length < 2) { aSlice = [0, 0]; }

            drawChart(eSlice, 'cp-e-area', 'cp-e-line', 'cp-e-dots', 'cp-e-xlbl', false, 'cp-nodata-entries');
            drawChart(aSlice, 'cp-a-area', 'cp-a-line', 'cp-a-dots', 'cp-a-xlbl', true, 'cp-nodata-onhold');
        }

        // Chart slide toggle
        function setChartSlide(n) {
            currentChartSlide = n;
            document.getElementById('cp-slide-0').classList.toggle('active', n === 0);
            document.getElementById('cp-slide-1').classList.toggle('active', n === 1);
            document.getElementById('cp-sdot-0').classList.toggle('active', n === 0);
            document.getElementById('cp-sdot-1').classList.toggle('active', n === 1);
            document.getElementById('cp-graph-title').textContent =
                n === 0 ? 'STATISTICS | Entries' : 'STATISTICS | On Hold';
        }

        document.getElementById('graph-toggle-btn').addEventListener('click', function() {
            setChartSlide(currentChartSlide === 0 ? 1 : 0);
        });
        document.getElementById('cp-sdot-0').addEventListener('click', function() { setChartSlide(0); });
        document.getElementById('cp-sdot-1').addEventListener('click', function() { setChartSlide(1); });

        /* ===================================================================
           8. WINDOW SELECTION DROPDOWN
           =================================================================== */
        document.getElementById('cp-window-select').addEventListener('change', function() {
            selectedWindow = this.value;
            var label = selectedWindow === 'Overall' ? 'OVERALL' : ('WINDOW ' + getWindowLabel(selectedWindow));
            document.getElementById('cp-sub-title').textContent = label + ' | STATISTICS';
            refreshAllData();
        });

        /* ===================================================================
           9. MASTER REFRESH (recalculate everything from real data)
           =================================================================== */
        function refreshAllData() {
            // 1. Metrics
            var m = computeMetrics();
            document.getElementById('metric-entries').textContent = m.entries;
            document.getElementById('metric-waiting').textContent = m.waiting;
            document.getElementById('metric-done').textContent = m.done;
            document.getElementById('metric-onhold').textContent = m.onhold;

            // 2. Charts
            refreshCharts();

            // 3. Ticket List
            renderTicketList();

            // 4. Re-select ticket detail if one was selected
            if (selectedTicketId) {
                var all = getAllSystemTickets();
                var found = all.find(function(t) { return t.id === selectedTicketId; });
                if (found) {
                    selectTicket(found);
                } else {
                    clearTicketDetail();
                }
            }
        }

        /* ===================================================================
           10. TICKET LIST, SEARCH & SELECTION
           =================================================================== */
        var selectedTicketId = null;

        function fileNo(id) {
            if (!id) return '—';
            var h = 0;
            for (var i = 0; i < id.length; i++) h += id.charCodeAt(i);
            return id.replace('-', '') + '-' + ((h * 4317) % 90000000 + 10000000);
        }

        function getAllSystemTickets() {
            var rawQ = getRawQueue();
            var rawH = getRawHold();
            var rawA = getRawAcc();

            var map = {};
            rawQ.forEach(function(t) { if (t && t.id) map[t.id] = { ticket: t, source: 'queue' }; });
            rawH.forEach(function(t) { if (t && t.id) map[t.id] = { ticket: t, source: 'hold' }; });
            rawA.forEach(function(t) { if (t && t.id) map[t.id] = { ticket: t, source: 'acc' }; });

            // Include active calling tickets
            ALL_WINDOW_IDS.forEach(function(wId) {
                try {
                    var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                    if (cd && cd.ticket && cd.ticket.id && !map[cd.ticket.id]) {
                        map[cd.ticket.id] = { ticket: cd.ticket, source: 'calling' };
                    }
                } catch(e){}
            });

            return Object.values(map).map(function(entry) {
                var t = entry.ticket;
                var status = 'PENDING';
                if (entry.source === 'hold') status = 'ONHOLD';
                else if (entry.source === 'acc' || (t.status && t.status.toLowerCase() === 'accomplished')) status = 'COMPLETED';
                else if (entry.source === 'calling') status = 'CALLING';
                else if (t.status === 'TRANSFERRED') status = 'TRANSFERRED';
                t._displayStatus = status;
                return t;
            });
        }

        function getTicketDisplayStatus(t) {
            return t._displayStatus || 'PENDING';
        }

        function renderTicketList() {
            var listEl = document.getElementById('cp-tickets-list');
            var searchVal = (document.getElementById('cp-search-input').value || '').trim().toUpperCase();
            var tickets = getAllSystemTickets();

            listEl.innerHTML = '';

            var filtered = tickets.filter(function(t) {
                if (!searchVal) return true;
                var tNum = (t.id || '').toUpperCase();
                var fNum = fileNo(t.id).toUpperCase();
                var tName = (t.name || '').toUpperCase();
                return tNum.indexOf(searchVal) !== -1 || fNum.indexOf(searchVal) !== -1 || tName.indexOf(searchVal) !== -1;
            });

            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;color:#666;padding:20px;font-weight:bold;font-size:0.85rem;">NO MATCHING ENTRIES FOUND</div>';
                return;
            }

            filtered.forEach(function(t) {
                var item = document.createElement('div');
                var status = getTicketDisplayStatus(t);
                item.className = 'cp-ticket-item' + (t.id === selectedTicketId ? ' active' : '');

                var badgeClass = 'cp-badge-pending';
                if (status === 'CALLING') badgeClass = 'cp-badge-calling';
                if (status === 'ONHOLD') badgeClass = 'cp-badge-onhold';
                if (status === 'COMPLETED') badgeClass = 'cp-badge-completed';
                if (status === 'TRANSFERRED') badgeClass = 'cp-badge-transferred';

                item.innerHTML =
                    '<div class="cp-titem-left">' +
                        '<span class="cp-titem-num">' + (t.id || 'N/A') + '</span>' +
                        '<span class="cp-titem-file">' + fileNo(t.id) + '</span>' +
                    '</div>' +
                    '<div class="cp-titem-right">' +
                        '<span class="cp-badge ' + badgeClass + '">' + status + '</span>' +
                    '</div>';

                (function(ticket) {
                    item.addEventListener('click', function() { selectTicket(ticket); });
                })(t);
                listEl.appendChild(item);
            });
        }

        document.getElementById('cp-search-input').addEventListener('input', renderTicketList);

        function selectTicket(t) {
            if (!t) return;
            selectedTicketId = t.id;
            var status = getTicketDisplayStatus(t);

            document.getElementById('det-name').textContent = t.name || 'N/A';

            var printDate = t.printedAt ? new Date(t.printedAt) : null;
            document.getElementById('det-date').textContent = printDate
                ? printDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                : (t.date || 'N/A');
            document.getElementById('det-time').textContent = printDate
                ? printDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                : (t.time || 'N/A');

            document.getElementById('det-type').textContent = t.type || 'Regular';
            document.getElementById('det-purpose').textContent = t.purpose || 'N/A';
            document.getElementById('det-comment').textContent = t.comment || 'None';

            var statusEl = document.getElementById('det-status');
            statusEl.textContent = status;
            if (status === 'COMPLETED') statusEl.style.color = '#155724';
            else if (status === 'ONHOLD') statusEl.style.color = '#856404';
            else if (status === 'CALLING') statusEl.style.color = '#d60052';
            else statusEl.style.color = '#0052FF';

            document.getElementById('det-ticket-num').textContent = t.id || '---';
            document.getElementById('det-file-num').textContent = 'File No. ' + fileNo(t.id);

            document.getElementById('det-current-window').textContent = t.currentWindow || getCurrentWindowLabel(t);
            document.getElementById('det-current-route').textContent = t.currentRoute || (t.purpose ? t.purpose + ' Route' : 'Standard Route');

            // History
            var histList = document.getElementById('det-history-list');
            histList.innerHTML = '';
            var history = t.history || [];
            if (history.length === 0) {
                histList.innerHTML = '<div class="cp-history-item"><span class="cp-history-desc">No history recorded</span></div>';
            } else {
                history.forEach(function(h) {
                    var hRow = document.createElement('div');
                    hRow.className = 'cp-history-item';
                    var act = (h.action || '').toUpperCase();
                    var actClass = act ? 'cp-act-' + act.toLowerCase() : 'cp-act-info';
                    var actBadge = act ? '<span class="cp-action-tag ' + actClass + '">' + act + '</span>' : '';
                    hRow.innerHTML = '<span class="cp-history-time">' + (h.time || '') + '</span>' + actBadge + '<span class="cp-history-desc">' + (h.desc || '') + '</span>';
                    histList.appendChild(hRow);
                });
            }

            // Active state in list
            document.querySelectorAll('.cp-ticket-item').forEach(function(el) {
                el.classList.toggle('active', el.querySelector('.cp-titem-num').textContent === t.id);
            });

            // Enable/disable action buttons
            var isCompleted = status === 'COMPLETED';
            document.getElementById('btn-act-complete').disabled = isCompleted;
            document.getElementById('btn-act-transfer').disabled = isCompleted;
            document.getElementById('btn-act-delete').disabled = false;
        }

        function clearTicketDetail() {
            selectedTicketId = null;
            document.getElementById('det-name').textContent = '—';
            document.getElementById('det-date').textContent = '—';
            document.getElementById('det-time').textContent = '—';
            document.getElementById('det-type').textContent = '—';
            document.getElementById('det-purpose').textContent = '—';
            document.getElementById('det-comment').textContent = '—';
            document.getElementById('det-current-window').textContent = '—';
            document.getElementById('det-current-route').textContent = '—';
            document.getElementById('det-status').textContent = '—';
            document.getElementById('det-ticket-num').textContent = '---';
            document.getElementById('det-file-num').textContent = 'File No. —';
            document.getElementById('det-history-list').innerHTML = '<div class="cp-history-item"><span class="cp-history-desc">No ticket selected</span></div>';
            document.getElementById('btn-act-complete').disabled = true;
            document.getElementById('btn-act-transfer').disabled = true;
            document.getElementById('btn-act-delete').disabled = true;
        }

        /* ===================================================================
           11. SYSTEM PAUSE & RESET
           =================================================================== */
        function checkPauseState() {
            var isPaused = localStorage.getItem(LS_PAUSED) === 'true';
            var pauseBtn = document.getElementById('btn-system-pause');
            var banner = document.getElementById('cp-pause-banner');
            pauseBtn.textContent = isPaused ? 'RESUME' : 'PAUSE';
            pauseBtn.classList.toggle('is-paused', isPaused);
            banner.classList.toggle('show', isPaused);
        }
        checkPauseState();

        document.getElementById('btn-system-pause').addEventListener('click', function() {
            var isPaused = localStorage.getItem(LS_PAUSED) === 'true';
            showConfirmModal({
                icon: isPaused ? '▶️' : '⏸️',
                title: isPaused ? 'RESUME SYSTEM' : 'PAUSE SYSTEM',
                body: isPaused
                    ? 'Resume the system? Active ticket calling and user actions will be restored.'
                    : 'Pause the system? All active ticket calls will be suspended and actions disabled across all windows.',
                confirmText: isPaused ? 'RESUME SYSTEM' : 'PAUSE SYSTEM',
                confirmClass: 'cp-mbtn-confirm',
                onConfirm: function() {
                    localStorage.setItem(LS_PAUSED, (!isPaused).toString());
                    checkPauseState();
                }
            });
        });

        document.getElementById('btn-system-reset').addEventListener('click', function() {
            showConfirmModal({
                icon: '⚠️',
                title: 'RESET SYSTEM',
                body: 'WARNING: This will clear ALL active queues, tickets, on-hold records, accomplished data, and calling states across the entire system. This cannot be undone.',
                confirmText: 'RESET ALL DATA',
                confirmClass: 'cp-mbtn-danger',
                onConfirm: function() {
                    localStorage.removeItem(LS_QUEUE);
                    localStorage.removeItem(LS_HOLD);
                    localStorage.removeItem(LS_ACC);
                    localStorage.removeItem(LS_PAUSED);
                    ['A','B','C','D','E','F','G','H','I','J','M','N','Cashier','cashier'].forEach(function(id) {
                        localStorage.removeItem('lto_window' + id + '_active_calling');
                        localStorage.removeItem('lto_' + id + '_active_calling');
                        localStorage.removeItem('lto_stats_window' + id);
                        localStorage.removeItem('lto_stats_' + id);
                    });
                    checkPauseState();
                    selectedTicketId = null;
                    clearTicketDetail();
                    refreshAllData();
                    showToast('System reset complete. All data cleared.', 'login');
                }
            });
        });

        /* ===================================================================
           12. TICKET MODIFICATION ACTIONS (COMPLETE, TRANSFER, DELETE)
           =================================================================== */
        function getSelectedTicket() {
            if (!selectedTicketId) return null;
            return getAllSystemTickets().find(function(t) { return t.id === selectedTicketId; });
        }

        function getNowTimeStr() {
            return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        function addHistoryEntry(ticket, desc, action) {
            if (!ticket.history) ticket.history = [];
            ticket.history.push({
                time: getNowTimeStr(),
                action: action || 'INFO',
                window: 'Control Panel',
                desc: desc
            });
        }

        // Determine which window a ticket is currently at
        function getCurrentWindowLabel(ticket) {
            var cur = ticket.currentSection || '';
            if (cur === 'C_B') return 'B/C';
            if (cur === 'D_E') return 'D/E';
            if (cur === 'E_J') return 'E-J';
            if (cur === 'Cashier') return 'Cashier';
            if (cur === 'M_N') return 'M/L';
            if (cur === 'D_E_or_E_J') return 'E';
            return 'A (Registration)';
        }

        // COMPLETE
        document.getElementById('btn-act-complete').addEventListener('click', function() {
            var ticket = getSelectedTicket();
            if (!ticket) return;

            showConfirmModal({
                icon: '✅',
                title: 'COMPLETE TICKET',
                body: 'Mark ticket ' + ticket.id + ' (' + fileNo(ticket.id) + ') as COMPLETED? This bypasses normal window routing.',
                confirmText: 'MARK AS COMPLETED',
                confirmClass: 'cp-mbtn-confirm',
                onConfirm: function() {
                    addHistoryEntry(ticket, 'Bypassed & Marked Completed via Control Panel', 'COMPLETED');
                    ticket.currentWindow = 'Control Panel (Completed)';
                    ticket.status = 'accomplished';
                    ticket.accomplishedAt = Date.now();

                    // Remove from queue and hold
                    saveRawQueue(getRawQueue().filter(function(t) { return t.id !== ticket.id; }));
                    saveRawHold(getRawHold().filter(function(t) { return t.id !== ticket.id; }));

                    // Remove from active calling if present
                    ALL_WINDOW_IDS.forEach(function(wId) {
                        try {
                            var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                            if (cd && cd.ticket && cd.ticket.id === ticket.id) {
                                localStorage.removeItem('lto_' + wId + '_active_calling');
                            }
                        } catch(e){}
                    });

                    // Add to accomplished
                    var acc = getRawAcc().filter(function(t) { return t.id !== ticket.id; });
                    acc.push(ticket);
                    saveRawAcc(acc);

                    refreshAllData();
                    showToast('Ticket ' + ticket.id + ' marked as COMPLETED.', 'login');
                }
            });
        });

        // TRANSFER — restricted destinations
        document.getElementById('btn-act-transfer').addEventListener('click', function() {
            var ticket = getSelectedTicket();
            if (!ticket) return;

            var currentSection = ticket.currentSection || '';
            var currentLabel = getCurrentWindowLabel(ticket);

            // Build destination options excluding current section
            var destOptions = '';
            var transferDests = [
                { value: 'C_B', windowId: 'windowB', label: 'Window B' },
                { value: 'C_B', windowId: 'windowC', label: 'Window C' },
                { value: 'D_E_or_E_J', windowId: 'windowE', label: 'Window E' },
                { value: 'E_J', windowId: 'windowF', label: 'Window F' },
                { value: 'E_J', windowId: 'windowG', label: 'Window G' },
                { value: 'E_J', windowId: 'windowH', label: 'Window H' },
                { value: 'E_J', windowId: 'windowI', label: 'Window I' },
                { value: 'E_J', windowId: 'windowJ', label: 'Window J' },
                { value: 'Cashier', windowId: 'cashier', label: 'Cashier' },
                { value: 'M_N', windowId: 'windowM', label: 'Window M' },
                { value: 'M_N', windowId: 'windowN', label: 'Window L' }
            ];

            transferDests.forEach(function(d) {
                // Don't offer the ticket's current section as destination
                if (d.value === currentSection) return;
                destOptions += '<option value="' + d.value + '" data-label="' + d.label + '">' + d.label + '</option>';
            });

            var extraHTML =
                '<div style="text-align:left;font-size:0.8rem;margin-top:12px;color:#333;">' +
                    '<div style="margin-bottom:6px;"><strong>Ticket:</strong> ' + ticket.id + '</div>' +
                    '<div style="margin-bottom:6px;"><strong>File No.:</strong> ' + fileNo(ticket.id) + '</div>' +
                    '<div style="margin-bottom:6px;"><strong>Current Window:</strong> ' + currentLabel + '</div>' +
                    '<div style="margin-bottom:8px;font-weight:900;">Transfer Destination:</div>' +
                '</div>' +
                '<select id="transfer-dest-select" class="cp-modal-select">' + destOptions + '</select>';

            showConfirmModal({
                icon: '🔄',
                title: 'TRANSFER TICKET',
                body: 'Transfer ticket ' + ticket.id + ' to another window:',
                extraContentHTML: extraHTML,
                confirmText: 'EXECUTE TRANSFER',
                confirmClass: 'cp-mbtn-confirm',
                onConfirm: function() {
                    var sel = document.getElementById('transfer-dest-select');
                    var destSection = sel.value;
                    var destLabel = sel.options[sel.selectedIndex].getAttribute('data-label');

                    addHistoryEntry(ticket, 'Transferred from ' + currentLabel + ' to ' + destLabel + ' via Control Panel', 'TRANSFERRED');
                    ticket.currentSection = destSection;
                    ticket.currentWindow = 'Queue for ' + destLabel;
                    ticket.status = 'pending';

                    // Remove from hold
                    saveRawHold(getRawHold().filter(function(t) { return t.id !== ticket.id; }));
                    // Remove from acc
                    saveRawAcc(getRawAcc().filter(function(t) { return t.id !== ticket.id; }));

                    // Remove from active calling if present
                    ALL_WINDOW_IDS.forEach(function(wId) {
                        try {
                            var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                            if (cd && cd.ticket && cd.ticket.id === ticket.id) {
                                localStorage.removeItem('lto_' + wId + '_active_calling');
                            }
                        } catch(e){}
                    });

                    // Add/update in main queue
                    var q = getRawQueue().filter(function(t) { return t.id !== ticket.id; });
                    q.push(ticket);
                    saveRawQueue(q);

                    refreshAllData();
                    showToast('Ticket ' + ticket.id + ' transferred to ' + destLabel + '.', 'login');
                }
            });
        });

        // DELETE
        document.getElementById('btn-act-delete').addEventListener('click', function() {
            var ticket = getSelectedTicket();
            if (!ticket) return;

            showConfirmModal({
                icon: '🗑️',
                title: 'DELETE TICKET',
                body: 'WARNING: Permanently delete ticket ' + ticket.id + ' (' + fileNo(ticket.id) + ') from all system records? This cannot be undone.',
                confirmText: 'PERMANENTLY DELETE',
                confirmClass: 'cp-mbtn-danger',
                onConfirm: function() {
                    saveRawQueue(getRawQueue().filter(function(t) { return t.id !== ticket.id; }));
                    saveRawHold(getRawHold().filter(function(t) { return t.id !== ticket.id; }));
                    saveRawAcc(getRawAcc().filter(function(t) { return t.id !== ticket.id; }));

                    ALL_WINDOW_IDS.forEach(function(wId) {
                        try {
                            var cd = JSON.parse(localStorage.getItem('lto_' + wId + '_active_calling'));
                            if (cd && cd.ticket && cd.ticket.id === ticket.id) {
                                localStorage.removeItem('lto_' + wId + '_active_calling');
                            }
                        } catch(e){}
                    });

                    selectedTicketId = null;
                    clearTicketDetail();
                    refreshAllData();
                    showToast('Ticket ' + ticket.id + ' permanently deleted.', 'login');
                }
            });
        });

        /* ===================================================================
           13. MODAL CONFIRMATION ENGINE
           =================================================================== */
        var currentModalCallback = null;

        function showConfirmModal(opts) {
            document.getElementById('modal-icon').textContent = opts.icon || '⚠️';
            document.getElementById('modal-title').textContent = opts.title || 'CONFIRM ACTION';
            document.getElementById('modal-body').textContent = opts.body || '';
            document.getElementById('modal-extra-content').innerHTML = opts.extraContentHTML || '';

            var confirmBtn = document.getElementById('modal-btn-confirm');
            confirmBtn.textContent = opts.confirmText || 'CONFIRM';
            confirmBtn.className = 'cp-modal-btn ' + (opts.confirmClass || 'cp-mbtn-confirm');

            currentModalCallback = opts.onConfirm || null;
            document.getElementById('cp-modal-overlay').classList.add('show');
        }

        function hideConfirmModal() {
            document.getElementById('cp-modal-overlay').classList.remove('show');
            currentModalCallback = null;
        }

        document.getElementById('modal-btn-cancel').addEventListener('click', hideConfirmModal);
        document.getElementById('modal-btn-confirm').addEventListener('click', function() {
            if (currentModalCallback) currentModalCallback();
            hideConfirmModal();
        });

        /* ===================================================================
           14. TOAST NOTIFICATION (matching existing system)
           =================================================================== */
        function showToast(msg, type) {
            var c = document.getElementById('toast-container');
            var t = document.createElement('div');
            t.className = 'toast toast-' + (type || 'login');
            t.innerHTML = '<span>' + msg + '</span>';
            c.appendChild(t);
            setTimeout(function () { t.classList.add('show'); }, 50);
            setTimeout(function () {
                t.classList.remove('show');
                setTimeout(function () { t.remove(); }, 300);
            }, 2500);
        }

        /* ===================================================================
           15. SKELETON LOADING & INIT
           =================================================================== */
        (function() {
            // Apply skeleton to cards on initial load
            var skStart = Date.now();
            document.querySelectorAll('.cp-detail-card, .cp-list-card, .cp-graph-card').forEach(function(el) {
                el.classList.add('skeleton-card');
            });

            // Read data and reveal
            refreshAllData();
            var elapsed = Date.now() - skStart;
            setTimeout(function() {
                document.querySelectorAll('.cp-detail-card, .cp-list-card, .cp-graph-card').forEach(function(el, i) {
                    setTimeout(function() {
                        el.classList.remove('skeleton-card');
                        el.classList.add('card-revealed');
                    }, i * 80);
                });
            }, Math.max(0, 300 - elapsed));
        })();

        /* ===================================================================
           16. LIVE POLLING — 3-second interval (matching Window B)
           =================================================================== */
        setInterval(function() {
            refreshAllData();
            checkPauseState();
        }, 3000);