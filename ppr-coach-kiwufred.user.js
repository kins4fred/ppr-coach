
// ==UserScript==
// @name         PPR Coach - kiwufred
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Coaching report + Rate Dilution Impact for Function Rollup. Inserts Login/LC columns, performance %, end-of-shift dilution summary.
// @author       Kiwufred
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @match        https://fclm-portal-iad.iad.proxy.amazon.com/reports/functionRollup*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      adapt-iad.amazon.com
// @connect      adapt.amazon.com
// @connect      fclm-portal.amazon.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @updateURL    https://raw.githubusercontent.com/kiwufred/ppr-coach/main/ppr-coach.user.js
// @downloadURL  https://raw.githubusercontent.com/kiwufred/ppr-coach/main/ppr-coach.user.js
// ==/UserScript==

(function() {
    'use strict';

    const AUTHOR = 'Kiwufred';
    const VERSION = '4.0';
    const DEFAULTS = {
        targetSmall: 42, targetMedium: 43, targetLarge: 31,
        minMinutes: 30,
        dsStart: { h: 7, m: 0 }, dsEnd: { h: 17, m: 30 },
        nsStart: { h: 20, m: 0 }, nsEnd: { h: 6, m: 30 }
    };

    let sp = new URLSearchParams(window.location.search);
    let building = sp.get('warehouseId') || '';
    let adaptBase = 'https://adapt-iad.amazon.com';
    let profileCache = {};
    let lcCache = {};

    try { profileCache = JSON.parse(GM_getValue('pprcoach_profiles', '{}')); } catch(e) { profileCache = {}; }

    // ============================================
    // STYLES
    // ============================================
    GM_addStyle(`
        #ppr-coach-tag { position:fixed;top:0;right:0;z-index:100001;font-family:'Amazon Ember',Arial,sans-serif;font-size:10px;color:#aaa;background:#232f3e;padding:4px 12px;border-radius:0 0 0 8px; }
        #ppr-coach-tag b { color:#ff9900; }

        /* MAIN PANEL */
        #cp { position:fixed;top:22px;right:8px;width:380px;background:#232f3e;color:#fff;border-radius:8px;padding:12px;z-index:100000;font-family:Arial,sans-serif;font-size:11px;box-shadow:0 4px 16px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto; }
        #cp h3 { margin:0 0 6px;color:#ff9900;font-size:13px;display:flex;align-items:center;gap:6px; }
        #cp .sec { color:#ff9900;margin:8px 0 3px;font-size:10px;border-bottom:1px solid #444;padding-bottom:2px;font-weight:bold; }
        #cp .btn { width:100%;padding:7px;margin-top:6px;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px;color:#000; }
        #cp .btn-primary { background:#ff9900; } #cp .btn-primary:hover { background:#ffad33; }
        #cp .btn-danger { background:#e74c3c;color:#fff; }
        #cp .btn-success { background:#27ae60;color:#fff; }
        #cp .btn-info { background:#3498db;color:#fff; }
        #cp .btn-sm { padding:3px 6px;font-size:9px;margin:0;width:auto; }
        #cp .toggle { position:absolute;top:4px;right:10px;background:none;border:none;color:#ff9900;font-size:16px;cursor:pointer; }
        #cp .date-btns { display:flex;gap:3px;margin-top:4px;flex-wrap:wrap; }
        #cp .date-btns button { flex:1;min-width:70px; }
        #cp .status { margin-top:5px;padding:3px 6px;background:#1a2332;border-radius:3px;font-size:9px;color:#888;text-align:center;border:1px solid #333; }
        #cp .tab-bar { display:flex;gap:2px;margin:6px 0; }
        #cp .tab-bar button { flex:1;padding:5px;border:none;border-radius:4px 4px 0 0;background:#1a2332;color:#888;cursor:pointer;font-size:10px;font-weight:bold; }
        #cp .tab-bar button.active { background:#ff9900;color:#000; }
        #cp-results { margin-top:8px; }
        #cp-results .func-section { margin-bottom:10px; }
        #cp-results .func-header { color:#ff9900;font-weight:bold;font-size:11px;margin:6px 0 3px;border-bottom:1px solid #555;padding-bottom:2px; }
        #cp-results table { width:100%;border-collapse:collapse;font-size:9px; }
        #cp-results th { background:#ff9900;color:#000;padding:3px 2px;text-align:left;cursor:pointer;user-select:none;position:sticky;top:0; }
        #cp-results th:hover { background:#ffcc66; }
        #cp-results th.sort-asc::after { content:' \\25B2'; }
        #cp-results th.sort-desc::after { content:' \\25BC'; }
        #cp-results td { padding:2px 3px;border-bottom:1px solid #333;white-space:nowrap; }
        #cp-results .summary { background:#1a2332;border:1px solid #444;border-radius:3px;padding:4px 6px;font-size:10px;margin-bottom:4px; }
        #cp-results .summary .s { display:flex;justify-content:space-between;margin:1px 0; }
        #cp-results .summary .v { color:#ff9900;font-weight:bold; }

        /* DILUTION PANEL */
        .dil-card { background:#1a2332;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0; }
        .dil-card .dil-title { color:#ff9900;font-weight:bold;font-size:10px;margin-bottom:3px; }
        .dil-kpi { display:flex;gap:8px;flex-wrap:wrap; }
        .dil-kpi .kpi { text-align:center; }
        .dil-kpi .kpi .val { font-size:14px;font-weight:bold;color:#ff6b6b; }
        .dil-kpi .kpi .lbl { font-size:8px;color:#888; }
        .dil-kpi .kpi.good .val { color:#6bff8e; }
        .dil-tbl { width:100%;border-collapse:collapse;font-size:9px;margin-top:4px; }
        .dil-tbl th { background:#333;color:#ff9900;padding:2px 4px;text-align:left;font-size:8px; }
        .dil-tbl td { padding:2px 4px;border-bottom:1px solid #333; }
        .dil-tbl .loss { color:#ff6b6b;font-weight:bold; }

        /* SETTINGS OVERLAY */
        #cp-settings { display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:420px;max-height:80vh;overflow-y:auto;background:#232f3e;color:#fff;border-radius:10px;padding:16px;z-index:100002;box-shadow:0 8px 32px rgba(0,0,0,0.7);font-family:Arial,sans-serif;font-size:11px; }
        #cp-settings h3 { color:#ff9900;margin:0 0 10px;font-size:14px; }
        #cp-settings .sec { color:#ff9900;margin:10px 0 4px;font-size:10px;border-bottom:1px solid #444;padding-bottom:2px;font-weight:bold; }
        #cp-settings label { display:block;margin:3px 0 1px;color:#ccc;font-size:10px; }
        #cp-settings input[type="number"] { width:100%;padding:4px 6px;border:1px solid #555;border-radius:3px;background:#1a2332;color:#fff;box-sizing:border-box;font-size:11px; }
        #cp-settings .shift-grid { display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr;gap:4px;align-items:center;font-size:10px; }
        #cp-settings .shift-grid input { width:45px;text-align:center;padding:3px; }
        #cp-settings .shift-grid span { color:#ccc; }
        #cp-settings .func-row { display:flex;align-items:center;gap:6px;margin:4px 0;padding:5px 8px;background:#1a2332;border-radius:3px;border:1px solid #555; }
        #cp-settings .func-row label { margin:0;flex:1;font-size:10px;color:#ccc;font-weight:normal; }
        #cp-settings .func-row input[type="checkbox"] { accent-color:#ff9900; }
        #cp-settings .func-targets { display:flex;gap:4px; }
        #cp-settings .func-targets input { width:45px;text-align:center;padding:3px; }
        #cp-settings .lc-row { display:flex;flex-wrap:wrap;gap:5px;padding:5px;background:#1a2332;border-radius:3px;border:1px solid #555;margin-top:3px; }
        #cp-settings .lc-row label { display:inline-flex;align-items:center;gap:3px;margin:0;font-size:10px;cursor:pointer;color:#ccc;font-weight:normal; }
        #cp-settings .lc-row input { accent-color:#ff9900; }
        #cp-settings .lc-btns { display:flex;gap:3px;margin-top:4px; }
        #cp-settings .lc-btns button { flex:1; }
        #cp-settings .btn { width:100%;padding:8px;margin-top:8px;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px; }
        #cp-settings .btn-save { background:#ff9900;color:#000; }
        #cp-settings .btn-close { background:#555;color:#fff;margin-top:4px; }
        #cp-overlay { display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100001; }

        /* PAGE HIGHLIGHTS (light, readable) */
        tr.empl-all.coach-below td { background:rgba(255,80,80,0.12) !important; border-bottom:1px solid rgba(255,80,80,0.3) !important; }
        tr.empl-all.coach-meets td { background:rgba(80,255,120,0.08) !important; }
        .coach-cell-bad { color:#cc0000 !important;font-weight:bold !important; }
        .coach-cell-good { color:#007a33 !important;font-weight:bold !important; }
        .ppr-coach-col { background:#f9f9f9; }
        #coach-toast { position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:6px;z-index:999999;font-size:11px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:#fff;transition:opacity 0.3s; }
        .perf-above { color:#6bff8e !important;font-weight:bold; }
        .perf-below { color:#ff6b6b !important;font-weight:bold; }
    `);

    // ============================================
    // UTILITY
    // ============================================
    function toast(msg, type) {
        let el = document.getElementById('coach-toast'); if (el) el.remove();
        let bg = type === 'ok' ? '#27ae60' : type === 'warn' ? '#f39c12' : '#e74c3c';
        let div = document.createElement('div'); div.id = 'coach-toast'; div.style.background = bg; div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
    }
    function setStatus(msg) { let el = document.getElementById('cp-status'); if (el) el.textContent = msg; }
    function loadSettings() { try { return JSON.parse(GM_getValue('pprcoach_settings', '{}')); } catch(e) { return {}; } }
    function saveAllSettings() {
        let s = {
            dsStartH: $('#s-ds-sh').val(), dsStartM: $('#s-ds-sm').val(), dsEndH: $('#s-ds-eh').val(), dsEndM: $('#s-ds-em').val(),
            nsStartH: $('#s-ns-sh').val(), nsStartM: $('#s-ns-sm').val(), nsEndH: $('#s-ns-eh').val(), nsEndM: $('#s-ns-em').val(),
            minMins: $('#s-min-mins').val(),
            fnCrb: $('#s-fn-crb').is(':checked'), tCrbS: $('#s-t-crb-s').val(), tCrbM: $('#s-t-crb-m').val(), tCrbL: $('#s-t-crb-l').val(),
            fnCr: $('#s-fn-cr').is(':checked'), tCrS: $('#s-t-cr-s').val(), tCrM: $('#s-t-cr-m').val(), tCrL: $('#s-t-cr-l').val(),
            fnPg: $('#s-fn-pg').is(':checked'), tPgS: $('#s-t-pg-s').val(), tPgM: $('#s-t-pg-m').val(), tPgL: $('#s-t-pg-l').val(),
            lcChecks: []
        };
        $('#s-lc-checks input').each(function(){ if($(this).is(':checked')) s.lcChecks.push($(this).val()); });
        GM_setValue('pprcoach_settings', JSON.stringify(s));
        toast('Settings saved', 'ok');
        closeSettings();
    }

    // ============================================
    // KEY RESOLVER
    // ============================================
    function resolveProfile(id, login) {
        if (id && profileCache[id]) return profileCache[id];
        if (login && profileCache[login]) return profileCache[login];
        return null;
    }
    function resolveLC(id, login, funcName) {
        let clean = (funcName || '').replace(/[12]/g, '').trim();
        let keys = [id + '|' + clean, login + '|' + clean, id, login].filter(k => k && k !== '|' + clean);
        for (let k of keys) { if (lcCache[k]) return lcCache[k]; }
        return null;
    }
    function storeProfile(id, login, data) {
        let rec = { id, login, shiftCode: data.shiftCode || '', badgeBarcode: data.badgeBarcode || '', timestamp: Date.now() };
        if (id) profileCache[id] = rec; if (login) profileCache[login] = rec;
    }
    function storeLC(id, login, funcName, lcLevel) {
        let clean = (funcName || '').replace(/[12]/g, '').trim();
        let rec = { lc: lcLevel, id, login };
        if (id) { lcCache[id + '|' + clean] = rec; if (!lcCache[id] || parseInt(lcLevel) > parseInt(lcCache[id].lc || '0')) lcCache[id] = rec; }
        if (login) { lcCache[login + '|' + clean] = rec; if (!lcCache[login] || parseInt(lcLevel) > parseInt(lcCache[login].lc || '0')) lcCache[login] = rec; }
    }

    // ============================================
    // ADAPT API
    // ============================================
    function fetchProfiles(ids, callback) {
        let now = Date.now();
        let toFetch = ids.filter(id => { let c = profileCache[id]; return !c || !c.timestamp || (now - c.timestamp) > 7*24*60*60*1000; });
        if (!toFetch.length) { if (callback) callback(); return; }
        setStatus('Fetching profiles (' + toFetch.length + ')...');
        let batches = []; for (let i = 0; i < toFetch.length; i += 100) batches.push(toFetch.slice(i, i + 100));
        let done = 0;
        batches.forEach(batch => {
            GM_xmlhttpRequest({ method: "GET", url: adaptBase + '/api/employee-profile-svc/GetEmployeeProfiles?employeeLogins=' + JSON.stringify(batch),
                onload: function(r) {
                    try { let d = JSON.parse(r.responseText); Object.keys(d).forEach(k => storeProfile(k, d[k].login || '', { shiftCode: d[k].shiftCode || '', badgeBarcode: d[k].badgeBarcodeId || '' })); GM_setValue('pprcoach_profiles', JSON.stringify(profileCache)); } catch(e) {}
                    done++; if (done >= batches.length) { setStatus('Profiles loaded'); if (callback) callback(); }
                },
                onerror: function() { done++; if (done >= batches.length) { if (callback) callback(); } }
            });
        });
    }

    function fetchLCData(callback) {
        setStatus('Fetching LC...');
        let startDate = getURLDate('start'), endDate = getURLDate('end');
        let url = adaptBase + '/api/femida-svc/GetRatePublishingReportV2?dateRangeType=CUSTOM&managerLogins=[]&reportColumns=["EMPLOYEE_ID","EMPLOYEE_LOGIN","LEARNING_CURVE_FAMILY","PROCESS_NAME","FUNCTION_NAME","LEARNING_CURVE_LEVEL","TIME_WORKED","UNITS_PER_HOUR"]&reportEndTimeUtc=' + encodeURIComponent(endDate) + '&reportStartTimeUtc=' + encodeURIComponent(startDate) + '&spprType=WEDNESDAY_SPPR_MEETING&warehouseId=' + building;
        GM_xmlhttpRequest({ method: "GET", url: url,
            onload: function(r) {
                try { let d = JSON.parse(r.responseText); if (d.ratePublishingReportContent && d.ratePublishingReportContent.rows) { d.ratePublishingReportContent.rows.forEach(row => storeLC(row[0]||'', row[1]||'', row[4]||'', row[5]||'-')); setStatus('LC loaded (' + d.ratePublishingReportContent.rows.length + ')'); } else { setStatus('LC: no records'); } } catch(e) { setStatus('LC error'); }
                if (callback) callback();
            },
            onerror: function() { setStatus('LC failed'); if (callback) callback(); }
        });
    }

    function getURLDate(which) {
        let d = sp.get(which + 'Date') || sp.get(which + 'DateWeek') || sp.get(which + 'DateIntraday') || sp.get(which + 'DateDay');
        if (d) { let h = sp.get(which + 'HourIntraday') || (which === 'start' ? '0' : '23'); let m = sp.get(which + 'MinuteIntraday') || (which === 'start' ? '0' : '59'); return new Date(d.replace(/\//g, '-') + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':00').toISOString(); }
        let now = new Date(); if (which === 'start') now.setHours(0,0,0,0); else now.setHours(23,59,59,0); return now.toISOString();
    }

    // ============================================
    // DATE RANGE
    // ============================================
    function applyDateRange(type) {
        let saved = loadSettings();
        let today = new Date(), yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        let dsH0=parseInt(saved.dsStartH)||DEFAULTS.dsStart.h, dsM0=parseInt(saved.dsStartM)||DEFAULTS.dsStart.m, dsH1=parseInt(saved.dsEndH)||DEFAULTS.dsEnd.h, dsM1=parseInt(saved.dsEndM)||DEFAULTS.dsEnd.m;
        let nsH0=parseInt(saved.nsStartH)||DEFAULTS.nsStart.h, nsM0=parseInt(saved.nsStartM)||DEFAULTS.nsStart.m, nsH1=parseInt(saved.nsEndH)||DEFAULTS.nsEnd.h, nsM1=parseInt(saved.nsEndM)||DEFAULTS.nsEnd.m;
        let sd, ed, sH, sM, eH, eM;
        switch(type) {
            case 'ds-today': sd=today; ed=today; sH=dsH0; sM=dsM0; eH=dsH1; eM=dsM1; break;
            case 'ns-today': sd=today; ed=new Date(today.getTime()+86400000); sH=nsH0; sM=nsM0; eH=nsH1; eM=nsM1; break;
            case 'ds-yest': sd=yesterday; ed=yesterday; sH=dsH0; sM=dsM0; eH=dsH1; eM=dsM1; break;
            case 'ns-yest': sd=yesterday; ed=today; sH=nsH0; sM=nsM0; eH=nsH1; eM=nsM1; break;
        }
        let spans = document.getElementsByName('spanType');
        for (let i = 0; i < spans.length; i++) { if (spans[i].value === 'intraday' || i === spans.length-1) { spans[i].checked = true; spans[i].dispatchEvent(new Event('change',{bubbles:true})); spans[i].click(); break; } }
        setTimeout(() => {
            setFormVal('startDateIntraday', fmtD(sd)); setFormVal('endDateIntraday', fmtD(ed));
            setSelVal('startHourIntraday', sH); setSelVal('startMinuteIntraday', sM);
            setSelVal('endHourIntraday', eH); setSelVal('endMinuteIntraday', eM);
            toast('Date: ' + type.replace(/-/g,' ').toUpperCase(), 'ok');
        }, 300);
    }
    function fmtD(d) { return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0'); }
    function setFormVal(id,v) { let e=document.getElementById(id); if(e){e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));} }
    function setSelVal(id,v) { let e=document.getElementById(id); if(!e)return; for(let i=0;i<e.options.length;i++){if(parseInt(e.options[i].value)===parseInt(v)){e.selectedIndex=i;e.dispatchEvent(new Event('change',{bubbles:true}));return;}} }

    // ============================================
    // INSERT LOGIN, SHIFT CODE & LC COLUMNS
    // ============================================
    function insertPageColumns() {
        let tbls = getTables();
        let insertPos = 4; // After Type(0), ID(1), Name(2), Manager(3)

        for (let i = 0; i < tbls.length; i++) {
            let tbl = tbls[i];
            if (tbl.querySelectorAll('.ppr-coach-hdr').length > 0) continue;
            if (tbl.querySelectorAll('.headerCompleter').length > 0) continue;

            let thead = tbl.querySelector('thead');
            if (!thead || !thead.children[0]) continue;
            let firstHeaderRow = thead.children[0];

            // Insert headers: Shift Code, Login, LC (inserted in reverse so position stays correct)
            ['Shift Code', 'Login', 'LC'].forEach(name => {
                let hd = firstHeaderRow.children[0].cloneNode(true);
                hd.innerText = name;
                hd.classList.add('ppr-coach-hdr');
                hd.removeAttribute('colspan'); hd.removeAttribute('rowspan');
                let rs = parseInt(firstHeaderRow.children[0].getAttribute('rowspan')) || 1;
                if (rs > 1) hd.setAttribute('rowspan', rs);
                if (firstHeaderRow.children[insertPos]) firstHeaderRow.insertBefore(hd, firstHeaderRow.children[insertPos]);
                else firstHeaderRow.appendChild(hd);
            });

            // Insert cells into employee rows
            let rows = tbl.querySelectorAll('tr.empl-all');
            let funcName = getFuncName(tbl);

            for (let j = 0; j < rows.length; j++) {
                let row = rows[j];
                if (row.children[0] && row.children[0].colSpan > 1) { row.children[0].colSpan += 3; continue; }

                let empId = (row.children[1] && row.children[1].innerText) ? row.children[1].innerText.trim() : '';
                let profile = resolveProfile(empId, '');
                let login = profile ? (profile.login || '-') : '-';
                let shiftCode = profile ? (profile.shiftCode || '-') : '-';
                let lcRec = resolveLC(empId, login, funcName);
                let lcLevel = lcRec ? (lcRec.lc || '-') : '-';

                // Insert Shift Code
                let td = document.createElement('td');
                td.innerText = shiftCode; td.className = 'ppr-coach-col';
                if (row.children[insertPos]) row.insertBefore(td, row.children[insertPos]); else row.appendChild(td);

                // Insert Login (click to copy badge)
                td = document.createElement('td');
                td.innerText = login; td.className = 'ppr-coach-col'; td.style.cursor = 'pointer';
                td.addEventListener('click', function() {
                    let id = this.parentElement.children[1] ? this.parentElement.children[1].innerText.trim() : '';
                    let p = resolveProfile(id, '');
                    if (p && p.badgeBarcode) navigator.clipboard.writeText(p.badgeBarcode).then(() => toast('Badge: ' + p.badgeBarcode, 'ok'));
                });
                if (row.children[insertPos]) row.insertBefore(td, row.children[insertPos]); else row.appendChild(td);

                // Insert LC
                td = document.createElement('td');
                td.innerText = lcLevel; td.className = 'ppr-coach-col';
                if (row.children[insertPos]) row.insertBefore(td, row.children[insertPos]); else row.appendChild(td);
            }
        }
    }

    // ============================================
    // TABLE PARSER
    // ============================================
    function getTables() {
        let tbls = document.getElementsByClassName('sortable result-table align-left');
        if (tbls.length === 0) tbls = document.getElementsByClassName('sortable result-table');
        return tbls;
    }

    function buildColumnMap(tbl) {
        let thead = tbl.querySelector('thead');
        if (!thead) return { map: {}, totalCols: 0 };
        let headerRows = thead.querySelectorAll('tr');
        let numRows = headerRows.length;
        if (numRows === 0) return { map: {}, totalCols: 0 };
        let dataRow = tbl.querySelector('tr.empl-all');
        let totalCols = dataRow ? dataRow.children.length : 0;
        let grid = [];
        for (let r = 0; r < numRows; r++) grid[r] = new Array(totalCols).fill(null);
        for (let r = 0; r < numRows; r++) {
            let cells = headerRows[r].querySelectorAll('th');
            let colPtr = 0;
            for (let c = 0; c < cells.length; c++) {
                while (colPtr < totalCols && grid[r][colPtr] !== null) colPtr++;
                if (colPtr >= totalCols) break;
                let cell = cells[c], text = (cell.innerText || cell.textContent || '').trim();
                let colspan = parseInt(cell.getAttribute('colspan')) || 1;
                let rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
                for (let rs = 0; rs < rowspan && (r + rs) < numRows; rs++)
                    for (let cs = 0; cs < colspan && (colPtr + cs) < totalCols; cs++)
                        grid[r + rs][colPtr + cs] = text;
                colPtr += colspan;
            }
        }
        let map = {};
        for (let col = 0; col < totalCols; col++) {
            let texts = []; for (let r = 0; r < numRows; r++) texts.push(grid[r][col] || '');
            let name = texts[0], group = '', subgroup = '';
            if (numRows >= 3) {
                if (texts[0] === texts[1] && texts[1] === texts[2]) name = texts[0];
                else if (texts[0] === texts[1]) { name = texts[0]; subgroup = texts[numRows - 1]; }
                else { group = texts[0]; subgroup = texts[1]; name = texts[numRows - 1]; }
            } else if (numRows === 2) {
                if (texts[0] === texts[1]) name = texts[0]; else { group = texts[0]; name = texts[1]; }
            }
            map[col] = { name, group, subgroup, allTexts: texts };
        }
        return { map, totalCols, grid };
    }

    function findColByName(colMap, name) {
        let n = name.toLowerCase(), keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) { if (colMap.map[parseInt(keys[i])].name.toLowerCase() === n) return parseInt(keys[i]); }
        return -1;
    }

    function findUPHBySize(colMap, size) {
        let sizeLower = size.toLowerCase(), keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) {
            let col = parseInt(keys[i]), entry = colMap.map[col];
            if (entry.name.toLowerCase() !== 'uph') continue;
            let allText = entry.allTexts.join(' ').toLowerCase();
            if (allText.indexOf('problem') !== -1 || allText.indexOf(' ps') !== -1) continue;
            if (allText.indexOf('each-' + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function findUnitsBySize(colMap, size) {
        let sizeLower = size.toLowerCase(), keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) {
            let col = parseInt(keys[i]), entry = colMap.map[col];
            if (entry.name.toLowerCase() !== 'unit') continue;
            let allText = entry.allTexts.join(' ').toLowerCase();
            if (allText.indexOf('problem') !== -1 || allText.indexOf(' ps') !== -1) continue;
            if (allText.indexOf('each-' + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function findPSUnits(colMap) {
        let psCols = [], keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) {
            let col = parseInt(keys[i]), entry = colMap.map[col];
            if (entry.name.toLowerCase() !== 'unit') continue;
            let allText = entry.allTexts.join(' ').toLowerCase();
            if (allText.indexOf('problem') !== -1 || allText.indexOf(' ps') !== -1) psCols.push(col);
        }
        return psCols;
    }

    function findTotalPaidHours(colMap) {
        let keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) { let col = parseInt(keys[i]), e = colMap.map[col]; if (e.name.toLowerCase() === 'paid hours' && (!e.group || e.group.toLowerCase() === 'total' || e.allTexts[0].toLowerCase() === 'paid hours')) return col; }
        for (let i = 0; i < keys.length; i++) { if (colMap.map[parseInt(keys[i])].name.toLowerCase() === 'paid hours') return parseInt(keys[i]); }
        return -1;
    }

    function findSizePaidHours(colMap, size) {
        let sizeLower = size.toLowerCase(), keys = Object.keys(colMap.map);
        for (let i = 0; i < keys.length; i++) {
            let col = parseInt(keys[i]), entry = colMap.map[col];
            if (entry.name.toLowerCase() !== 'paid hours') continue;
            let allText = entry.allTexts.join(' ').toLowerCase();
            if (allText.indexOf('problem') !== -1 || allText.indexOf(' ps') !== -1) continue;
            if (allText.indexOf('each-' + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function getFuncName(tbl) {
        let caption = tbl.querySelector('caption');
        if (caption) { let t = (caption.innerText || caption.textContent || '').trim(); if (t.indexOf('[') > 0) t = t.substring(0, t.indexOf('[')).trim(); return t; }
        let el = tbl.previousElementSibling, tries = 0;
        while (el && tries < 5) { let t = (el.innerText || el.textContent || '').trim(); if (t.indexOf('C-Return') !== -1) return 'C-Return Bypass'; if (t.indexOf('Customer Returns') !== -1) return 'Customer Returns'; if (t.indexOf('Primary Grading') !== -1) return 'Primary Grading'; if (t.length > 2 && t.length < 80) return t.split('\n')[0].trim(); el = el.previousElementSibling; tries++; }
        return 'Unknown';
    }

    function cellText(row, idx) { if (idx < 0 || idx >= row.children.length) return ''; return (row.children[idx].innerText || row.children[idx].textContent || '').trim(); }
    function cellNum(row, idx) { let t = cellText(row, idx), v = parseFloat(t); return (!isNaN(v) && v > 0) ? v : null; }
    function parseLCNum(text) { let t = (text || '').trim(); if (!t || t === '-' || t === 'N/A' || t === 'null') return '0'; let m = t.match(/(\d+)/); return m ? m[1] : '0'; }

    // ============================================
    // PERFORMANCE % & RATE DILUTION
    // ============================================
    function calcPerformance(aa, targets) {
        let sizes = [];
        if (targets.s && aa.sUPH !== null) sizes.push({ uph: aa.sUPH, target: targets.s, hours: aa.hoursS || 0 });
        if (targets.m && aa.mUPH !== null) sizes.push({ uph: aa.mUPH, target: targets.m, hours: aa.hoursM || 0 });
        if (targets.l && aa.lUPH !== null) sizes.push({ uph: aa.lUPH, target: targets.l, hours: aa.hoursL || 0 });
        if (sizes.length === 0) return null;
        let totalHours = sizes.reduce((sum, s) => sum + s.hours, 0);
        if (totalHours > 0) { return (sizes.reduce((sum, s) => sum + (s.hours * (s.uph / s.target)), 0) / totalHours) * 100; }
        return (sizes.reduce((sum, s) => sum + (s.uph / s.target), 0) / sizes.length) * 100;
    }

    // Rate Dilution: compare LC1-4 performance against LC5 baseline (target UPH)
    // Hours Lost = actual_hours - (units / target_UPH)
    // Volume Lost = hours_lost * target_UPH
    function calcDilution(allData, funcs) {
        let dilution = { totHoursLost: 0, totVolLost: 0, totLC14Hours: 0, totLC14Units: 0, byFunc: {} };

        funcs.forEach(func => {
            let fd = allData.filter(aa => matchFunc(aa.func, func.name));
            let lc14 = fd.filter(aa => { let n = parseInt(aa.lcNum); return n >= 1 && n <= 4; });

            let funcDil = { hoursLost: 0, volLost: 0, hours: 0, units: 0, target: func, byLevel: {} };

            lc14.forEach(aa => {
                let lcN = aa.lcNum;
                if (!funcDil.byLevel[lcN]) funcDil.byLevel[lcN] = { hours: 0, units: 0, hoursLost: 0, volLost: 0 };

                // Per size calculation
                let sizes = [];
                if (func.s && aa.sUPH !== null && aa.hoursS > 0) sizes.push({ hours: aa.hoursS, units: aa.hoursS * aa.sUPH, target: func.s });
                if (func.m && aa.mUPH !== null && aa.hoursM > 0) sizes.push({ hours: aa.hoursM, units: aa.hoursM * aa.mUPH, target: func.m });
                if (func.l && aa.lUPH !== null && aa.hoursL > 0) sizes.push({ hours: aa.hoursL, units: aa.hoursL * aa.lUPH, target: func.l });

                // If no per-size hours, use total
                if (sizes.length === 0 && aa.totalHours > 0 && aa.totalUnits > 0) {
                    let avgTarget = (func.s + func.m + func.l) / 3;
                    sizes.push({ hours: aa.totalHours, units: aa.totalUnits, target: avgTarget });
                }

                sizes.forEach(s => {
                    let expectedHours = s.units / s.target; // hours LC5 would need
                    let hLost = Math.max(0, s.hours - expectedHours);
                    let vLost = hLost * s.target;

                    funcDil.hours += s.hours;
                    funcDil.units += s.units;
                    funcDil.hoursLost += hLost;
                    funcDil.volLost += vLost;

                    funcDil.byLevel[lcN].hours += s.hours;
                    funcDil.byLevel[lcN].units += s.units;
                    funcDil.byLevel[lcN].hoursLost += hLost;
                    funcDil.byLevel[lcN].volLost += vLost;
                });
            });

            dilution.totHoursLost += funcDil.hoursLost;
            dilution.totVolLost += funcDil.volLost;
            dilution.totLC14Hours += funcDil.hours;
            dilution.totLC14Units += funcDil.units;
            dilution.byFunc[func.name] = funcDil;
        });

        return dilution;
    }

    function parseAllTables() {
        let tbls = getTables(), allData = [];
        for (let t = 0; t < tbls.length; t++) {
            let tbl = tbls[t], funcName = getFuncName(tbl), colMap = buildColumnMap(tbl);
            if (colMap.totalCols === 0) continue;
            let idCol = findColByName(colMap, 'ID'), nameCol = findColByName(colMap, 'Name'), managerCol = findColByName(colMap, 'Manager');
            let loginCol = findColByName(colMap, 'Login'), shiftCol = findColByName(colMap, 'Shift Code'), lcCol = findColByName(colMap, 'LC');
            let totalHoursCol = findTotalPaidHours(colMap);
            let smallUPH = findUPHBySize(colMap, 'small'), mediumUPH = findUPHBySize(colMap, 'medium'), largeUPH = findUPHBySize(colMap, 'large');
            let smallUnitsCol = findUnitsBySize(colMap, 'small'), mediumUnitsCol = findUnitsBySize(colMap, 'medium'), largeUnitsCol = findUnitsBySize(colMap, 'large');
            let psUnitsCols = findPSUnits(colMap);
            let smallHoursCol = findSizePaidHours(colMap, 'small'), mediumHoursCol = findSizePaidHours(colMap, 'medium'), largeHoursCol = findSizePaidHours(colMap, 'large');
            let rows = tbl.querySelectorAll('tr.empl-all');

            for (let r = 0; r < rows.length; r++) {
                let row = rows[r];
                if (row.children[0] && row.children[0].colSpan > 1) continue;
                let firstText = cellText(row, 0); if (firstText === 'Total' || firstText === 'Grand Total') continue;
                let empId = cellText(row, idCol), empName = cellText(row, nameCol), manager = cellText(row, managerCol);
                let login = cellText(row, loginCol), shift = cellText(row, shiftCol), pageLc = cellText(row, lcCol);

                if (!login || login === '-') { let p = resolveProfile(empId, login); if (p) { login = p.login || ''; if (!shift || shift === '-') shift = p.shiftCode || ''; } }
                if (!shift || shift === '-') { let p = resolveProfile(empId, login); if (p) shift = p.shiftCode || ''; }
                let lc = pageLc;
                if (!lc || lc === '-' || lc === '') { let lcRec = resolveLC(empId, login, funcName); if (lcRec) { lc = lcRec.lc || '-'; if (!login || login === '-') login = lcRec.login || ''; } }
                if (!lc) lc = '-';

                let totalHours = 0; if (totalHoursCol >= 0) { let v = parseFloat(cellText(row, totalHoursCol)); if (!isNaN(v)) totalHours = v; }
                let sUPH = cellNum(row, smallUPH), mUPH = cellNum(row, mediumUPH), lUPH = cellNum(row, largeUPH);
                let hoursS = cellNum(row, smallHoursCol) || 0, hoursM = cellNum(row, mediumHoursCol) || 0, hoursL = cellNum(row, largeHoursCol) || 0;
                let unitsS = cellNum(row, smallUnitsCol) || 0, unitsM = cellNum(row, mediumUnitsCol) || 0, unitsL = cellNum(row, largeUnitsCol) || 0;
                let totalUnits = unitsS + unitsM + unitsL;
                let psUnits = 0; psUnitsCols.forEach(col => { psUnits += (cellNum(row, col) || 0); });
                if (!empId && !login) continue;

                allData.push({ tableIdx: t, rowElement: row, empId: empId || '', empName: empName || '', manager: manager || '', login: login || '', shift: shift || '', lc, lcNum: parseLCNum(lc), func: funcName, totalHours, sUPH, mUPH, lUPH, hoursS, hoursM, hoursL, totalUnits, psUnits, _sCol: smallUPH, _mCol: mediumUPH, _lCol: largeUPH });
            }
        }
        return allData;
    }

    // ============================================
    // SETTINGS PANEL (separate overlay)
    // ============================================
    function buildSettingsPanel() {
        let saved = loadSettings();
        let lcChecks = saved.lcChecks || ['1','2','3','4','5','0'];

        let overlay = document.createElement('div'); overlay.id = 'cp-overlay';
        overlay.addEventListener('click', closeSettings);
        document.body.appendChild(overlay);

        let panel = document.createElement('div'); panel.id = 'cp-settings';
        panel.innerHTML = `
            <h3>\u2699 PPR Coach Settings</h3>
            <div class="sec">SHIFT TIMES (Start H:M \u2192 End H:M)</div>
            <div class="shift-grid">
                <span>DS:</span>
                <input type="number" id="s-ds-sh" value="${saved.dsStartH||DEFAULTS.dsStart.h}" min="0" max="23">
                <input type="number" id="s-ds-sm" value="${saved.dsStartM||DEFAULTS.dsStart.m}" min="0" max="59">
                <input type="number" id="s-ds-eh" value="${saved.dsEndH||DEFAULTS.dsEnd.h}" min="0" max="23">
                <input type="number" id="s-ds-em" value="${saved.dsEndM||DEFAULTS.dsEnd.m}" min="0" max="59">
                <span>NS:</span>
                <input type="number" id="s-ns-sh" value="${saved.nsStartH||DEFAULTS.nsStart.h}" min="0" max="23">
                <input type="number" id="s-ns-sm" value="${saved.nsStartM||DEFAULTS.nsStart.m}" min="0" max="59">
                <input type="number" id="s-ns-eh" value="${saved.nsEndH||DEFAULTS.nsEnd.h}" min="0" max="23">
                <input type="number" id="s-ns-em" value="${saved.nsEndM||DEFAULTS.nsEnd.m}" min="0" max="59">
            </div>
            <div class="sec">FUNCTIONS & TARGETS (S | M | L)</div>
            <div class="func-row"><input type="checkbox" id="s-fn-crb" ${saved.fnCrb!==false?'checked':''}><label for="s-fn-crb">C-Return Bypass</label><div class="func-targets"><input type="number" id="s-t-crb-s" value="${saved.tCrbS||DEFAULTS.targetSmall}"><input type="number" id="s-t-crb-m" value="${saved.tCrbM||DEFAULTS.targetMedium}"><input type="number" id="s-t-crb-l" value="${saved.tCrbL||DEFAULTS.targetLarge}"></div></div>
            <div class="func-row"><input type="checkbox" id="s-fn-cr" ${saved.fnCr!==false?'checked':''}><label for="s-fn-cr">Customer Returns</label><div class="func-targets"><input type="number" id="s-t-cr-s" value="${saved.tCrS||DEFAULTS.targetSmall}"><input type="number" id="s-t-cr-m" value="${saved.tCrM||DEFAULTS.targetMedium}"><input type="number" id="s-t-cr-l" value="${saved.tCrL||DEFAULTS.targetLarge}"></div></div>
            <div class="func-row"><input type="checkbox" id="s-fn-pg" ${saved.fnPg!==false?'checked':''}><label for="s-fn-pg">Primary Grading</label><div class="func-targets"><input type="number" id="s-t-pg-s" value="${saved.tPgS||DEFAULTS.targetSmall}"><input type="number" id="s-t-pg-m" value="${saved.tPgM||DEFAULTS.targetMedium}"><input type="number" id="s-t-pg-l" value="${saved.tPgL||DEFAULTS.targetLarge}"></div></div>
            <div class="sec">LC FILTER</div>
            <div class="lc-row" id="s-lc-checks">
                <label><input type="checkbox" value="1" ${lcChecks.includes('1')?'checked':''}> 1</label>
                <label><input type="checkbox" value="2" ${lcChecks.includes('2')?'checked':''}> 2</label>
                <label><input type="checkbox" value="3" ${lcChecks.includes('3')?'checked':''}> 3</label>
                <label><input type="checkbox" value="4" ${lcChecks.includes('4')?'checked':''}> 4</label>
                <label><input type="checkbox" value="5" ${lcChecks.includes('5')?'checked':''}> 5</label>
                <label><input type="checkbox" value="0" ${lcChecks.includes('0')?'checked':''}> N/A</label>
            </div>
            <div class="lc-btns">
                <button class="btn btn-sm btn-info" id="s-lc-all">All</button>
                <button class="btn btn-sm btn-info" id="s-lc-none">None</button>
                <button class="btn btn-sm btn-info" id="s-lc-13">1-3</button>
                <button class="btn btn-sm btn-info" id="s-lc-45">4-5</button>
                <button class="btn btn-sm btn-info" id="s-lc-5">5 only</button>
            </div>
            <div class="sec">MIN HOURS (ignore AAs below)</div>
            <label>Minutes</label><input type="number" id="s-min-mins" value="${saved.minMins||DEFAULTS.minMinutes}" min="0" step="5">
            <button class="btn btn-save" id="s-save">Save Settings</button>
            <button class="btn btn-close" id="s-close">Cancel</button>`;
        document.body.appendChild(panel);

        $('#s-save').click(saveAllSettings);
        $('#s-close').click(closeSettings);
        $('#s-lc-all').click(()=>{$('#s-lc-checks input').prop('checked',true);});
        $('#s-lc-none').click(()=>{$('#s-lc-checks input').prop('checked',false);});
        $('#s-lc-13').click(()=>{$('#s-lc-checks input').each(function(){$(this).prop('checked',['1','2','3'].includes($(this).val()));});});
        $('#s-lc-45').click(()=>{$('#s-lc-checks input').each(function(){$(this).prop('checked',['4','5'].includes($(this).val()));});});
        $('#s-lc-5').click(()=>{$('#s-lc-checks input').each(function(){$(this).prop('checked',$(this).val()==='5');});});
    }

    function openSettings() { $('#cp-settings').show(); $('#cp-overlay').show(); }
    function closeSettings() { $('#cp-settings').hide(); $('#cp-overlay').hide(); }

    function getEnabledFuncs() {
        let saved = loadSettings(), f = [];
        if (saved.fnCrb !== false) f.push({ name: 'C-Return Bypass', s: parseFloat(saved.tCrbS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrbM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrbL) || DEFAULTS.targetLarge });
        if (saved.fnCr !== false) f.push({ name: 'Customer Returns', s: parseFloat(saved.tCrS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrL) || DEFAULTS.targetLarge });
        if (saved.fnPg !== false) f.push({ name: 'Primary Grading', s: parseFloat(saved.tPgS) || DEFAULTS.targetSmall, m: parseFloat(saved.tPgM) || DEFAULTS.targetMedium, l: parseFloat(saved.tPgL) || DEFAULTS.targetLarge });
        return f;
    }
    function getSelectedLCs() { let saved = loadSettings(); return saved.lcChecks || ['1','2','3','4','5','0']; }
    function getMinHours() { let saved = loadSettings(); return (parseFloat(saved.minMins) || DEFAULTS.minMinutes) / 60; }

    function matchFunc(aaFunc, target) {
        let a = (aaFunc || '').toLowerCase(), t = target.toLowerCase();
        if (a === t) return true; if (a.indexOf(t) !== -1 || t.indexOf(a) !== -1) return true;
        if (t === 'c-return bypass' && a.indexOf('c-return') !== -1) return true;
        if (t === 'customer returns' && a.indexOf('customer') !== -1) return true;
        if (t === 'primary grading' && a.indexOf('primary') !== -1) return true;
        return false;
    }

    // ============================================
    // MAIN PANEL (clean, results-focused)
    // ============================================
    function buildMainPanel() {
        let panel = document.createElement('div'); panel.id = 'cp';
        panel.innerHTML = `
            <button class="toggle" id="cp-tog">\u2212</button>
            <h3>PPR Coach <button class="btn btn-sm btn-info" id="btn-settings" style="margin-left:auto;">\u2699 Settings</button></h3>
            <div id="cp-body">
                <div class="date-btns">
                    <button class="btn btn-sm btn-info" id="dr-ds-today">\u2600 DS Today</button>
                    <button class="btn btn-sm btn-info" id="dr-ns-today">\u263D NS Today</button>
                    <button class="btn btn-sm btn-info" id="dr-ds-yest">\u2600 DS Yest</button>
                    <button class="btn btn-sm btn-info" id="dr-ns-yest">\u263D NS Yest</button>
                </div>
                <div class="tab-bar">
                    <button class="active" id="tab-coach">Coaching</button>
                    <button id="tab-dilution">Rate Dilution</button>
                </div>
                <button class="btn btn-primary" id="btn-run">Run Report</button>
                <button class="btn btn-danger" id="btn-hl" style="margin-top:4px;">Highlight on Page</button>
                <button class="btn btn-success" id="btn-csv" style="margin-top:4px;display:none;">Export CSV</button>
                <div class="status" id="cp-status">Initializing...</div>
                <div id="cp-results"></div>
            </div>`;
        document.body.appendChild(panel);

        $('#cp-tog').click(() => { let b = $('#cp-body'); b.toggle(); $('#cp-tog').text(b.is(':visible') ? '\u2212' : '+'); });
        $('#btn-settings').click(openSettings);
        $('#dr-ds-today').click(() => applyDateRange('ds-today'));
        $('#dr-ns-today').click(() => applyDateRange('ns-today'));
        $('#dr-ds-yest').click(() => applyDateRange('ds-yest'));
        $('#dr-ns-yest').click(() => applyDateRange('ns-yest'));
        $('#tab-coach').click(() => { $('#tab-coach').addClass('active'); $('#tab-dilution').removeClass('active'); window._coachTab = 'coach'; runReport(); });
        $('#tab-dilution').click(() => { $('#tab-dilution').addClass('active'); $('#tab-coach').removeClass('active'); window._coachTab = 'dilution'; runReport(); });
        $('#btn-run').click(runReport);
        $('#btn-hl').click(highlightPage);
        $('#btn-csv').click(exportCSV);

        window._coachTab = 'coach';
    }

    // ============================================
    // RUN REPORT
    // ============================================
    function runReport() {
        let funcs = getEnabledFuncs(), lcs = getSelectedLCs(), minH = getMinHours();
        if (!funcs.length) { toast('Enable functions in Settings', 'warn'); return; }

        setStatus('Parsing...');
        let allData = parseAllTables();

        if (!allData.length) {
            let tbls = getTables(), debug = 'Tables: ' + tbls.length;
            if (tbls.length > 0) { let colMap = buildColumnMap(tbls[0]); let rows = tbls[0].querySelectorAll('tr.empl-all'); debug += ' | Rows: ' + rows.length + ' | Cols: ' + colMap.totalCols; }
            $('#cp-results').html('<p style="color:#ff9900;font-size:10px;margin-top:6px;">No AA data found.<br><span style="color:#888;font-size:8px;">' + debug + '</span></p>');
            setStatus('No data'); return;
        }

        if (window._coachTab === 'dilution') {
            let dilution = calcDilution(allData, funcs);
            displayDilution(dilution);
            window._coachDilution = dilution;
        } else {
            let results = {}, gT = 0, gB = 0;
            funcs.forEach(func => {
                let fd = allData.filter(aa => matchFunc(aa.func, func.name));
                let filtered = fd.filter(aa => lcs.includes(aa.lcNum) && aa.totalHours >= minH);
                let coaching = [];
                filtered.forEach(aa => {
                    let below = false, gS = 0, gM = 0, gL = 0;
                    if (func.s && aa.sUPH !== null && aa.sUPH < func.s) { below = true; gS = func.s - aa.sUPH; }
                    if (func.m && aa.mUPH !== null && aa.mUPH < func.m) { below = true; g
