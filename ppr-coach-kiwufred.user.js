
// ==UserScript==
// @name         PPR Coach - kiwufred
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  Coaching report + Rate Dilution for FCLM Function Rollup. Inserts Login/LC/Shift columns, performance %, dilution summary, intraday buttons.
// @author       Kiwufred
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @match        https://fclm-portal-iad.iad.proxy.amazon.com/reports/functionRollup*
// @match        https://fclm-portal.amazon.com/reports/processPathRollup*
// @match        https://fclm-portal-iad.iad.proxy.amazon.com/reports/processPathRollup*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      adapt-iad.amazon.com
// @connect      adapt.amazon.com
// @connect      fclm-portal.amazon.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @updateURL    https://raw.githubusercontent.com/kins4fred/ppr-coach/main/ppr-coach-kiwufred.user.js
// @downloadURL  https://raw.githubusercontent.com/kins4fred/ppr-coach/main/ppr-coach-kiwufred.user.js
// ==/UserScript==

(function() {
    "use strict";

    var AUTHOR = "Kiwufred";
    var VERSION = "4.3";
    var DEFAULTS = {
        targetSmall: 42,
        targetMedium: 43,
        targetLarge: 31,
        minMinutes: 30,
        fontSize: 11,
        panelWidth: "compact",
        dsStart: {h: 7, m: 0},
        dsEnd: {h: 17, m: 30},
        nsStart: {h: 20, m: 0},
        nsEnd: {h: 6, m: 30},
        showPct: false,
        cols: {name: true, login: true, id: false, shift: true, lc: true, small: true, medium: true, large: true, perf: true, units: true, ps: true, hours: true, manager: false, gap: true}
    };

    var sp = new URLSearchParams(window.location.search);
    var building = sp.get("warehouseId") || "";
    var adaptBase = "https://adapt-iad.amazon.com";
    var profileCache = {};
    var lcCache = {};
    var resolvedAdaptUrl = "";
    var isPPRPage = window.location.pathname.indexOf("processPathRollup") !== -1;

    try { profileCache = JSON.parse(GM_getValue("pprcoach_profiles", "{}")); } catch(e) { profileCache = {}; }

    GM_addStyle([
        "#ppr-coach-tag{position:fixed;top:0;right:0;z-index:100001;font-family:Arial,sans-serif;font-size:10px;color:#aaa;background:#232f3e;padding:4px 12px;border-radius:0 0 0 8px}",
        "#ppr-coach-tag b{color:#ff9900}",
        "#cp{position:fixed;top:22px;right:8px;background:#232f3e;color:#fff;border-radius:8px;padding:12px;z-index:100000;font-family:Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto}",
        "#cp.compact{width:380px}#cp.compact #cp-results{max-height:55vh;overflow-y:auto}",
        "#cp.wide{width:620px}#cp.wide #cp-results table{font-size:10px}",
        "#cp h3{margin:0 0 6px;color:#ff9900;font-size:13px;display:flex;align-items:center;gap:6px}",
        "#cp .sec{color:#ff9900;margin:8px 0 3px;font-size:10px;border-bottom:1px solid #444;padding-bottom:2px;font-weight:bold}",
        "#cp .btn{width:100%;padding:7px;margin-top:6px;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px;color:#000}",
        "#cp .btn-primary{background:#ff9900}#cp .btn-primary:hover{background:#ffad33}",
        "#cp .btn-danger{background:#e74c3c;color:#fff}",
        "#cp .btn-success{background:#27ae60;color:#fff}",
        "#cp .btn-info{background:#3498db;color:#fff}",
        "#cp .btn-sm{padding:3px 6px;font-size:9px;margin:0;width:auto}",
        "#cp .toggle{position:absolute;top:4px;right:10px;background:none;border:none;color:#ff9900;font-size:16px;cursor:pointer}",
        "#cp .date-btns{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap}",
        "#cp .date-btns button{flex:1;min-width:70px}",
        "#cp .status{margin-top:5px;padding:3px 6px;background:#1a2332;border-radius:3px;font-size:9px;color:#888;text-align:center;border:1px solid #333}",
        "#cp .tab-bar{display:flex;gap:2px;margin:6px 0}",
        "#cp .tab-bar button{flex:1;padding:5px;border:none;border-radius:4px 4px 0 0;background:#1a2332;color:#888;cursor:pointer;font-size:10px;font-weight:bold}",
        "#cp .tab-bar button.active{background:#ff9900;color:#000}",
        "#cp-results{margin-top:8px}",
        "#cp-results .func-section{margin-bottom:10px}",
        "#cp-results .func-header{color:#ff9900;font-weight:bold;font-size:11px;margin:6px 0 3px;border-bottom:1px solid #555;padding-bottom:2px}",
        "#cp-results table{width:100%;border-collapse:collapse}",
        "#cp-results th{background:#ff9900;color:#000;padding:3px 2px;text-align:left;cursor:pointer;user-select:none;position:sticky;top:0;font-size:9px}",
        "#cp-results th:hover{background:#ffcc66}",
        "#cp-results th.sort-asc::after{content:' \\25B2'}",
        "#cp-results th.sort-desc::after{content:' \\25BC'}",
        "#cp-results td{padding:2px 3px;border-bottom:1px solid #333;white-space:nowrap}",
        "#cp-results .summary{background:#1a2332;border:1px solid #444;border-radius:3px;padding:4px 6px;font-size:10px;margin-bottom:4px}",
        "#cp-results .summary .s{display:flex;justify-content:space-between;margin:1px 0}",
        "#cp-results .summary .v{color:#ff9900;font-weight:bold}",
        ".dil-card{background:#1a2332;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0}",
        ".dil-card .dil-title{color:#ff9900;font-weight:bold;font-size:10px;margin-bottom:3px}",
        ".dil-kpi{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:6px 0}",
        ".dil-kpi .kpi{text-align:center;min-width:60px}",
        ".dil-kpi .kpi .val{font-size:14px;font-weight:bold;color:#ff6b6b}",
        ".dil-kpi .kpi .lbl{font-size:8px;color:#888}",
        ".dil-kpi .kpi.good .val{color:#6bff8e}",
        ".dil-tbl{width:100%;border-collapse:collapse;font-size:9px;margin-top:4px}",
        ".dil-tbl th{background:#333;color:#ff9900;padding:2px 4px;text-align:left;font-size:8px}",
        ".dil-tbl td{padding:2px 4px;border-bottom:1px solid #333}",
        ".dil-tbl .loss{color:#ff6b6b;font-weight:bold}",
        "#cp-settings{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:440px;max-height:85vh;overflow-y:auto;background:#232f3e;color:#fff;border-radius:10px;padding:16px;z-index:100002;box-shadow:0 8px 32px rgba(0,0,0,0.7);font-family:Arial,sans-serif;font-size:11px}",
        "#cp-settings h3{color:#ff9900;margin:0 0 10px;font-size:14px}",
        "#cp-settings .sec{color:#ff9900;margin:10px 0 4px;font-size:10px;border-bottom:1px solid #444;padding-bottom:2px;font-weight:bold}",
        "#cp-settings label{display:block;margin:3px 0 1px;color:#ccc;font-size:10px}",
        "#cp-settings input[type=number]{width:100%;padding:4px 6px;border:1px solid #555;border-radius:3px;background:#1a2332;color:#fff;box-sizing:border-box;font-size:11px}",
        "#cp-settings .shift-grid{display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr;gap:4px;align-items:center;font-size:10px}",
        "#cp-settings .shift-grid input{width:45px;text-align:center;padding:3px}",
        "#cp-settings .shift-grid span{color:#ccc}",
        "#cp-settings .func-row{display:flex;align-items:center;gap:6px;margin:4px 0;padding:5px 8px;background:#1a2332;border-radius:3px;border:1px solid #555}",
        "#cp-settings .func-row label{margin:0;flex:1;font-size:10px;color:#ccc;font-weight:normal}",
        "#cp-settings .func-row input[type=checkbox]{accent-color:#ff9900}",
        "#cp-settings .func-targets{display:flex;gap:4px}",
        "#cp-settings .func-targets input{width:45px;text-align:center;padding:3px}",
        "#cp-settings .lc-row{display:flex;flex-wrap:wrap;gap:5px;padding:5px;background:#1a2332;border-radius:3px;border:1px solid #555;margin-top:3px}",
        "#cp-settings .lc-row label{display:inline-flex;align-items:center;gap:3px;margin:0;font-size:10px;cursor:pointer;color:#ccc;font-weight:normal}",
        "#cp-settings .lc-row input{accent-color:#ff9900}",
        "#cp-settings .lc-btns{display:flex;gap:3px;margin-top:4px}",
        "#cp-settings .lc-btns button{flex:1}",
        "#cp-settings .col-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;padding:5px;background:#1a2332;border-radius:3px;border:1px solid #555;margin-top:3px}",
        "#cp-settings .col-grid label{display:inline-flex;align-items:center;gap:3px;margin:0;font-size:10px;cursor:pointer;color:#ccc;font-weight:normal}",
        "#cp-settings .col-grid input{accent-color:#ff9900}",
        "#cp-settings .btn{width:100%;padding:8px;margin-top:8px;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:11px}",
        "#cp-settings .btn-save{background:#ff9900;color:#000}",
        "#cp-settings .btn-close{background:#555;color:#fff;margin-top:4px}",
        "#cp-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100001}",
        "tr.empl-all.coach-below td{background:rgba(255,80,80,0.12)!important;border-bottom:1px solid rgba(255,80,80,0.3)!important}",
        "tr.empl-all.coach-meets td{background:rgba(80,255,120,0.08)!important}",
        ".coach-cell-bad{color:#cc0000!important;font-weight:bold!important}",
        ".coach-cell-good{color:#007a33!important;font-weight:bold!important}",
        ".ppr-coach-col{background:#f9f9f9}",
        "#coach-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:6px;z-index:999999;font-size:11px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:#fff;transition:opacity 0.3s}",
        ".perf-above{color:#6bff8e!important;font-weight:bold}",
        ".perf-below{color:#ff6b6b!important;font-weight:bold}",
        "#ppr-intraday-bar{margin:8px 0;padding:6px 10px;background:#232f3e;border-radius:6px;display:inline-flex;gap:4px;align-items:center}",
        "#ppr-intraday-bar button{padding:4px 10px;border:none;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;color:#000;background:#3498db}",
        "#ppr-intraday-bar button:hover{background:#5dade2}",
        "#ppr-intraday-bar .lbl{color:#ff9900;font-size:10px;font-weight:bold;margin-right:4px}"
    ].join("\n"));

    // === UTILITY ===
    function toast(msg, type) {
        var el = document.getElementById("coach-toast");
        if (el) el.remove();
        var bg = type === "ok" ? "#27ae60" : type === "warn" ? "#f39c12" : "#e74c3c";
        var div = document.createElement("div");
        div.id = "coach-toast"; div.style.background = bg; div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(function() { div.style.opacity = "0"; setTimeout(function() { div.remove(); }, 300); }, 3000);
    }
    function setStatus(msg) { var el = document.getElementById("cp-status"); if (el) el.textContent = msg; }
    function loadSettings() { try { return JSON.parse(GM_getValue("pprcoach_settings", "{}")); } catch(e) { return {}; } }
    function normFunc(name) { return (name || "").replace(/[12]$/g, "").replace(/\d+$/, "").trim(); }
    function getPageProcessName() {
        var sel = document.getElementById("processId");
        if (sel && sel.selectedIndex >= 0) return (sel.options[sel.selectedIndex].text || "").split("[")[0].trim();
        return sp.get("processId") || "";
    }
    function shortName(fullName) {
        var parts = (fullName || "").split(/[\s,]+/).filter(function(p) { return p.length > 0; });
        if (parts.length <= 2) return fullName;
        return parts[0] + " " + parts[1];
    }
    function getVisibleCols() {
        var saved = loadSettings();
        var cols = saved.cols || DEFAULTS.cols;
        return cols;
    }
    function applyPanelStyle() {
        var saved = loadSettings();
        var size = parseInt(saved.fontSize) || DEFAULTS.fontSize;
        var width = saved.panelWidth || DEFAULTS.panelWidth;
        var cp = document.getElementById("cp");
        if (cp) { cp.style.fontSize = size + "px"; cp.classList.remove("wide", "compact"); cp.classList.add(width); }
        var results = document.getElementById("cp-results");
        if (results) results.style.fontSize = size + "px";
    }

    // === ADAPT URL ===
    function resolveAdaptUrl(callback) {
        if (resolvedAdaptUrl) { callback(resolvedAdaptUrl); return; }
        try {
            var cached = JSON.parse(localStorage.getItem("pprcoach_adapt_url") || "{}");
            if (cached.url && cached.building === building && cached.timestamp && (Date.now() - cached.timestamp) < 604800000) {
                resolvedAdaptUrl = cached.url; callback(resolvedAdaptUrl); return;
            }
        } catch(e) {}
        GM_xmlhttpRequest({ method: "GET", url: "https://adapt.amazon.com/",
            onload: function(response) {
                var finalUrl = response.finalUrl || response.responseURL || "";
                if (finalUrl && finalUrl.indexOf("adapt") !== -1) {
                    var match = finalUrl.match(/(https:\/\/adapt[^\/]+)/);
                    resolvedAdaptUrl = match ? match[1] : finalUrl.split("/").slice(0, 3).join("/");
                } else { resolvedAdaptUrl = adaptBase; }
                try { localStorage.setItem("pprcoach_adapt_url", JSON.stringify({url: resolvedAdaptUrl, building: building, timestamp: Date.now()})); } catch(e) {}
                callback(resolvedAdaptUrl);
            },
            onerror: function() { resolvedAdaptUrl = adaptBase; callback(resolvedAdaptUrl); }
        });
    }

    // === PROFILE & LC ===
    function resolveProfile(id, login) {
        if (id && profileCache[id]) return profileCache[id];
        if (login && profileCache[login]) return profileCache[login];
        return null;
    }
    function resolveLC(id, login, funcName) {
        var proc = getPageProcessName(); var nf = normFunc(funcName);
        if (lcCache[id + "|" + proc + "|" + nf]) return lcCache[id + "|" + proc + "|" + nf];
        if (login && lcCache[login + "|" + proc + "|" + nf]) return lcCache[login + "|" + proc + "|" + nf];
        if (lcCache[id + "|*"]) return lcCache[id + "|*"];
        if (login && lcCache[login + "|*"]) return lcCache[login + "|*"];
        return null;
    }
    function storeProfile(id, login, data) {
        var rec = {id: id, login: login, shiftCode: data.shiftCode || "", badgeBarcode: data.badgeBarcode || "", timestamp: Date.now()};
        if (id) profileCache[id] = rec; if (login) profileCache[login] = rec;
    }
    function storeLC(id, login, processName, funcName, lcLevel) {
        var nf = normFunc(funcName);
        var rec = {lc: lcLevel, id: id, login: login, process: processName, func: funcName};
        var pageProc = getPageProcessName();
        if (id && processName !== "*") lcCache[id + "|" + processName + "|" + nf] = rec;
        if (login && processName !== "*") lcCache[login + "|" + processName + "|" + nf] = rec;
        if (processName === pageProc || processName === "*") {
            if (id) { var ex1 = lcCache[id + "|*"]; if (!ex1 || parseInt(lcLevel) > parseInt(ex1.lc || "0")) lcCache[id + "|*"] = rec; }
            if (login) { var ex2 = lcCache[login + "|*"]; if (!ex2 || parseInt(lcLevel) > parseInt(ex2.lc || "0")) lcCache[login + "|*"] = rec; }
        }
    }

    // === FETCH PROFILES ===
    function fetchProfiles(ids, callback) {
        var now = Date.now();
        var toFetch = ids.filter(function(id) { var c = profileCache[id]; return !c || !c.timestamp || (now - c.timestamp) > 604800000; });
        if (!toFetch.length) { if (callback) callback(); return; }
        setStatus("Fetching profiles (" + toFetch.length + ")...");
        resolveAdaptUrl(function(baseUrl) {
            var batches = []; for (var i = 0; i < toFetch.length; i += 100) batches.push(toFetch.slice(i, i + 100));
            var done = 0;
            batches.forEach(function(batch) {
                GM_xmlhttpRequest({ method: "GET", url: baseUrl + "/api/employee-profile-svc/GetEmployeeProfiles?employeeLogins=" + JSON.stringify(batch),
                    onload: function(r) {
                        try { var d = JSON.parse(r.responseText); var keys = Object.keys(d);
                            for (var k = 0; k < keys.length; k++) storeProfile(keys[k], d[keys[k]].login || "", {shiftCode: d[keys[k]].shiftCode || "", badgeBarcode: d[keys[k]].badgeBarcodeId || ""});
                            GM_setValue("pprcoach_profiles", JSON.stringify(profileCache));
                        } catch(e) {}
                        done++; if (done >= batches.length) { setStatus("Profiles loaded"); if (callback) callback(); }
                    },
                    onerror: function() { done++; if (done >= batches.length) { if (callback) callback(); } }
                });
            });
        });
    }

    // === FETCH LC ===
    function getEmployeeIdsFromLinks() {
        var ids = []; var links = document.querySelectorAll('a[href*="timeDetails"]');
        for (var i = 0; i < links.length; i++) { var href = links[i].href || ""; var match = href.match(/[?&]employeeId=([^&"]+)/); if (match && ids.indexOf(match[1]) === -1) ids.push(match[1]); }
        return ids;
    }
    function fetchLCData(callback) {
        setStatus("Fetching LC...");
        if (!building) { setStatus("LC: no warehouseId"); if (callback) callback(); return; }
        var empIds = getEmployeeIdsFromLinks();
        if (empIds.length === 0) { var tbls = getTables(); for (var t = 0; t < tbls.length; t++) { var rows = tbls[t].querySelectorAll("tr.empl-all"); for (var r = 0; r < rows.length; r++) { if (rows[r].children[0] && rows[r].children[0].colSpan > 1) continue; var id = rows[r].children[1] ? rows[r].children[1].innerText.trim() : ""; if (id && empIds.indexOf(id) === -1) empIds.push(id); } } }
        if (empIds.length === 0) { setStatus("LC: no IDs"); if (callback) callback(); return; }
        resolveAdaptUrl(function(baseUrl) {
            GM_xmlhttpRequest({ method: "GET", url: baseUrl + "/api/femida-svc/GetSpprTimeInterval?spprType=WEDNESDAY_PEAK_SPPR_MEETING&warehouseId=" + encodeURIComponent(building),
                onload: function(spprResp) {
                    var spprData; try { spprData = JSON.parse(spprResp.responseText); } catch(e) { setStatus("LC: SPPR error"); if (callback) callback(); return; }
                    if (!spprData || !spprData.currentSppr) { setStatus("LC: no SPPR"); if (callback) callback(); return; }
                    var startTime = (spprData.spprTrend && spprData.spprTrend.length > 0) ? spprData.spprTrend[0].startDateTime : spprData.currentSppr.startDateTime;
                    var endTime = spprData.currentSppr.endDateTime;
                    var batches = []; for (var i = 0; i < empIds.length; i += 100) batches.push(empIds.slice(i, i + 100));
                    var totalB = batches.length; var dailyDone = 0; var fallbackDone = 0; var allMetrics = {}; var fallbackLc = {};
                    batches.forEach(function(batch) {
                        GM_xmlhttpRequest({ method: "GET", url: baseUrl + "/api/femida-svc/GetBatchEmployeePerformanceMetricsByGroupAndCategory?employeeIds=" + encodeURIComponent(JSON.stringify(batch)) + "&startTime=" + encodeURIComponent(startTime) + "&endTime=" + encodeURIComponent(endTime) + "&metricTypeCategory=AGGREGATE_DAILY&metricTypeGroup=PRODUCTIVITY&warehouseId=" + encodeURIComponent(building),
                            onload: function(r) { try { var d = JSON.parse(r.responseText); var m = d.batchPerformanceMetrics || {}; var ks = Object.keys(m); for (var k = 0; k < ks.length; k++) { if (!allMetrics[ks[k]]) allMetrics[ks[k]] = []; allMetrics[ks[k]] = allMetrics[ks[k]].concat(m[ks[k]]); } } catch(e) {} dailyDone++; if (dailyDone >= totalB && fallbackDone >= totalB) processLCResults(empIds, allMetrics, fallbackLc, callback); },
                            onerror: function() { dailyDone++; if (dailyDone >= totalB && fallbackDone >= totalB) processLCResults(empIds, allMetrics, fallbackLc, callback); }
                        });
                    });
                    batches.forEach(function(batch) {
                        GM_xmlhttpRequest({ method: "GET", url: baseUrl + "/api/femida-svc/GetBatchEmployeePerformanceMetricsByGroupAndCategory?employeeIds=" + encodeURIComponent(JSON.stringify(batch)) + "&startTime=" + encodeURIComponent(startTime) + "&endTime=" + encodeURIComponent(endTime) + "&metricTypeCategory=CURRENT_PERFORMANCE_PERIOD&metricTypeGroup=PRODUCTIVITY&warehouseId=" + encodeURIComponent(building),
                            onload: function(r) { try { var d = JSON.parse(r.responseText); var m = d.batchPerformanceMetrics || {}; var ks = Object.keys(m); for (var k = 0; k < ks.length; k++) { if (m[ks[k]] && m[ks[k]].length > 0) { var a = m[ks[k]][0].performanceMetricAttributes || {}; fallbackLc[ks[k]] = a.learningCurveLevel || a.learningCurveId || ""; } } } catch(e) {} fallbackDone++; if (dailyDone >= totalB && fallbackDone >= totalB) processLCResults(empIds, allMetrics, fallbackLc, callback); },
                            onerror: function() { fallbackDone++; if (dailyDone >= totalB && fallbackDone >= totalB) processLCResults(empIds, allMetrics, fallbackLc, callback); }
                        });
                    });
                },
                onerror: function() { setStatus("LC: network error"); if (callback) callback(); }
            });
        });
    }
    function processLCResults(empIds, allMetrics, fallbackLc, callback) {
        var recordCount = 0; var empIdsWithData = {}; var metricKeys = Object.keys(allMetrics);
        for (var k = 0; k < metricKeys.length; k++) {
            var empId = metricKeys[k]; var metrics = allMetrics[empId];
            if (!metrics || metrics.length === 0) continue;
            empIdsWithData[empId] = true;
            var login = ""; var p = resolveProfile(empId, ""); if (p) login = p.login || "";
            var pathMap = {};
            for (var m = 0; m < metrics.length; m++) {
                var attrs = metrics[m].performanceMetricAttributes || {};
                var procName = attrs.processName || ""; var funcName = "";
                try { var pa = JSON.parse(attrs.processAttributes || "{}"); funcName = pa.FUNCTION_NAME || ""; } catch(e) {}
                var lcId = attrs.learningCurveId || attrs.learningCurveLevel || "";
                var key = procName + "|" + funcName;
                if (!pathMap[key]) pathMap[key] = {processName: procName, functionName: funcName, lcLevel: lcId};
                if (lcId && parseInt(lcId) > parseInt(pathMap[key].lcLevel || "0")) pathMap[key].lcLevel = lcId;
            }
            var pathKeys = Object.keys(pathMap);
            for (var pk = 0; pk < pathKeys.length; pk++) { var pD = pathMap[pathKeys[pk]]; storeLC(empId, login, pD.processName, pD.functionName, pD.lcLevel); recordCount++; }
        }
        for (var i = 0; i < empIds.length; i++) { var eid = empIds[i]; if (!empIdsWithData[eid] && fallbackLc[eid]) { var l2 = ""; var p2 = resolveProfile(eid, ""); if (p2) l2 = p2.login || ""; storeLC(eid, l2, "*", "*", fallbackLc[eid]); recordCount++; } }
        setStatus("LC loaded (" + recordCount + ")"); if (callback) callback();
    }

    // === DATE RANGE ===
    function applyDateRange(type) {
        var saved = loadSettings(); var today = new Date(); var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        var dsH0 = parseInt(saved.dsStartH) || DEFAULTS.dsStart.h; var dsM0 = parseInt(saved.dsStartM) || DEFAULTS.dsStart.m;
        var dsH1 = parseInt(saved.dsEndH) || DEFAULTS.dsEnd.h; var dsM1 = parseInt(saved.dsEndM) || DEFAULTS.dsEnd.m;
        var nsH0 = parseInt(saved.nsStartH) || DEFAULTS.nsStart.h; var nsM0 = parseInt(saved.nsStartM) || DEFAULTS.nsStart.m;
        var nsH1 = parseInt(saved.nsEndH) || DEFAULTS.nsEnd.h; var nsM1 = parseInt(saved.nsEndM) || DEFAULTS.nsEnd.m;
        var sd, ed, sH, sM, eH, eM;
        switch(type) {
            case "ds-today": sd = today; ed = today; sH = dsH0; sM = dsM0; eH = dsH1; eM = dsM1; break;
            case "ns-today": sd = today; ed = new Date(today.getTime() + 86400000); sH = nsH0; sM = nsM0; eH = nsH1; eM = nsM1; break;
            case "ds-yest": sd = yesterday; ed = yesterday; sH = dsH0; sM = dsM0; eH = dsH1; eM = dsM1; break;
            case "ns-yest": sd = yesterday; ed = today; sH = nsH0; sM = nsM0; eH = nsH1; eM = nsM1; break;
        }
        var spans = document.getElementsByName("spanType");
        for (var i = 0; i < spans.length; i++) { if (spans[i].value === "intraday" || i === spans.length - 1) { spans[i].checked = true; spans[i].click(); break; } }
        setTimeout(function() { setFormVal("startDateIntraday", fmtD(sd)); setFormVal("endDateIntraday", fmtD(ed)); setSelVal("startHourIntraday", sH); setSelVal("startMinuteIntraday", sM); setSelVal("endHourIntraday", eH); setSelVal("endMinuteIntraday", eM); toast("Date: " + type.replace(/-/g, " ").toUpperCase(), "ok"); }, 300);
    }
    function fmtD(d) { var mm = String(d.getMonth() + 1); var dd = String(d.getDate()); return d.getFullYear() + "/" + (mm.length < 2 ? "0" + mm : mm) + "/" + (dd.length < 2 ? "0" + dd : dd); }
    function setFormVal(id, v) { var e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("change", {bubbles: true})); } }
    function setSelVal(id, v) { var e = document.getElementById(id); if (!e) return; for (var i = 0; i < e.options.length; i++) { if (parseInt(e.options[i].value) === parseInt(v)) { e.selectedIndex = i; e.dispatchEvent(new Event("change", {bubbles: true})); return; } } }

    // === TABLE HELPERS ===
    function getTables() { var t = document.getElementsByClassName("sortable result-table align-left"); if (t.length === 0) t = document.getElementsByClassName("sortable result-table"); return t; }
    function buildColumnMap(tbl) {
        var thead = tbl.querySelector("thead"); if (!thead) return {map: {}, totalCols: 0};
        var headerRows = thead.querySelectorAll("tr"); var numRows = headerRows.length; if (numRows === 0) return {map: {}, totalCols: 0};
        var dataRow = tbl.querySelector("tr.empl-all"); var totalCols = dataRow ? dataRow.children.length : 0;
        var grid = []; for (var r = 0; r < numRows; r++) grid[r] = new Array(totalCols).fill(null);
        for (r = 0; r < numRows; r++) { var cells = headerRows[r].querySelectorAll("th"); var colPtr = 0;
            for (var c = 0; c < cells.length; c++) { while (colPtr < totalCols && grid[r][colPtr] !== null) colPtr++; if (colPtr >= totalCols) break;
                var cell = cells[c]; var text = (cell.innerText || "").trim(); var colspan = parseInt(cell.getAttribute("colspan")) || 1; var rowspan = parseInt(cell.getAttribute("rowspan")) || 1;
                for (var rs = 0; rs < rowspan && (r + rs) < numRows; rs++) { for (var cs = 0; cs < colspan && (colPtr + cs) < totalCols; cs++) grid[r + rs][colPtr + cs] = text; } colPtr += colspan; } }
        var map = {};
        for (var col = 0; col < totalCols; col++) { var texts = []; for (r = 0; r < numRows; r++) texts.push(grid[r][col] || "");
            var name = texts[0], group = "", subgroup = "";
            if (numRows >= 3) { if (texts[0] === texts[1] && texts[1] === texts[2]) name = texts[0]; else if (texts[0] === texts[1]) { name = texts[0]; subgroup = texts[numRows - 1]; } else { group = texts[0]; subgroup = texts[1]; name = texts[numRows - 1]; } }
            else if (numRows === 2) { if (texts[0] === texts[1]) name = texts[0]; else { group = texts[0]; name = texts[1]; } }
            map[col] = {name: name, group: group, subgroup: subgroup, allTexts: texts}; }
        return {map: map, totalCols: totalCols, grid: grid};
    }
    function findColByName(colMap, name) { var n = name.toLowerCase(); var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { if (colMap.map[parseInt(keys[i])].name.toLowerCase() === n) return parseInt(keys[i]); } return -1; }
    function findUPHBySize(colMap, size) { var s = size.toLowerCase(); var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { var col = parseInt(keys[i]); var e = colMap.map[col]; if (e.name.toLowerCase() !== "uph") continue; var at = e.allTexts.join(" ").toLowerCase(); if (at.indexOf("problem") !== -1 || at.indexOf(" ps") !== -1) continue; if (at.indexOf("each-" + s) !== -1 || at.indexOf(s) !== -1) return col; } return -1; }
    function findUnitsBySize(colMap, size) { var s = size.toLowerCase(); var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { var col = parseInt(keys[i]); var e = colMap.map[col]; if (e.name.toLowerCase() !== "unit") continue; var at = e.allTexts.join(" ").toLowerCase(); if (at.indexOf("problem") !== -1 || at.indexOf(" ps") !== -1) continue; if (at.indexOf("each-" + s) !== -1 || at.indexOf(s) !== -1) return col; } return -1; }
    function findPSUnits(colMap) { var psCols = []; var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { var col = parseInt(keys[i]); var e = colMap.map[col]; if (e.name.toLowerCase() !== "unit") continue; var at = e.allTexts.join(" ").toLowerCase(); if (at.indexOf("problem") !== -1 || at.indexOf(" ps") !== -1) psCols.push(col); } return psCols; }
    function findTotalPaidHours(colMap) { var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { var col = parseInt(keys[i]); var e = colMap.map[col]; if (e.name.toLowerCase() === "paid hours" && (!e.group || e.group.toLowerCase() === "total" || e.allTexts[0].toLowerCase() === "paid hours")) return col; } for (var j = 0; j < keys.length; j++) { if (colMap.map[parseInt(keys[j])].name.toLowerCase() === "paid hours") return parseInt(keys[j]); } return -1; }
    function findSizePaidHours(colMap, size) { var s = size.toLowerCase(); var keys = Object.keys(colMap.map); for (var i = 0; i < keys.length; i++) { var col = parseInt(keys[i]); var e = colMap.map[col]; if (e.name.toLowerCase() !== "paid hours") continue; var at = e.allTexts.join(" ").toLowerCase(); if (at.indexOf("problem") !== -1 || at.indexOf(" ps") !== -1) continue; if (at.indexOf("each-" + s) !== -1 || at.indexOf(s) !== -1) return col; } return -1; }
    function getFuncName(tbl) { var caption = tbl.querySelector("caption"); if (caption) { var t = (caption.innerText || "").trim(); if (t.indexOf("[") > 0) t = t.substring(0, t.indexOf("[")).trim(); return t; } var el = tbl.previousElementSibling; var tries = 0; while (el && tries < 5) { var txt = (el.innerText || "").trim(); if (txt.indexOf("C-Return") !== -1) return "C-Return Bypass"; if (txt.indexOf("Customer Returns") !== -1) return "Customer Returns"; if (txt.indexOf("Primary Grading") !== -1) return "Primary Grading"; if (txt.length > 2 && txt.length < 80) return txt.split("\n")[0].trim(); el = el.previousElementSibling; tries++; } return "Unknown"; }
    function cellText(row, idx) { if (idx < 0 || idx >= row.children.length) return ""; return (row.children[idx].innerText || "").trim(); }
    function cellNum(row, idx) { var v = parseFloat(cellText(row, idx)); return (!isNaN(v) && v > 0) ? v : null; }
    function parseLCNum(text) { var t = (text || "").trim(); if (!t || t === "-" || t === "N/A") return "0"; var m = t.match(/(\d+)/); return m ? m[1] : "0"; }
    
    // === PART 2 OF 3 - paste after Part 1 ===

    // === PERFORMANCE ===
    function calcPerformance(aa, targets) {
        var sizes = [];
        if (targets.s && aa.sUPH !== null) sizes.push({uph: aa.sUPH, target: targets.s, hours: aa.hoursS || 0});
        if (targets.m && aa.mUPH !== null) sizes.push({uph: aa.mUPH, target: targets.m, hours: aa.hoursM || 0});
        if (targets.l && aa.lUPH !== null) sizes.push({uph: aa.lUPH, target: targets.l, hours: aa.hoursL || 0});
        if (sizes.length === 0) return null;
        var totalH = sizes.reduce(function(s, x) { return s + x.hours; }, 0);
        if (totalH > 0) return (sizes.reduce(function(s, x) { return s + (x.hours * (x.uph / x.target)); }, 0) / totalH) * 100;
        return (sizes.reduce(function(s, x) { return s + (x.uph / x.target); }, 0) / sizes.length) * 100;
    }

    // === DILUTION ===
    function calcDilution(allData, funcs) {
        var dil = {totHoursLost: 0, totVolLost: 0, totLC14Hours: 0, totLC14Units: 0, byFunc: {}};
        funcs.forEach(function(func) {
            var fd = allData.filter(function(aa) { return matchFunc(aa.func, func.name); });
            var lc14 = fd.filter(function(aa) { var n = parseInt(aa.lcNum); return n >= 1 && n <= 4; });
            var funcDil = {hoursLost: 0, volLost: 0, hours: 0, units: 0, target: func, byLevel: {}};
            lc14.forEach(function(aa) {
                var lcN = aa.lcNum;
                if (!funcDil.byLevel[lcN]) funcDil.byLevel[lcN] = {hours: 0, units: 0, hoursLost: 0, volLost: 0};
                var sizes = [];
                if (func.s && aa.sUPH !== null && aa.hoursS > 0) sizes.push({hours: aa.hoursS, units: aa.hoursS * aa.sUPH, target: func.s});
                if (func.m && aa.mUPH !== null && aa.hoursM > 0) sizes.push({hours: aa.hoursM, units: aa.hoursM * aa.mUPH, target: func.m});
                if (func.l && aa.lUPH !== null && aa.hoursL > 0) sizes.push({hours: aa.hoursL, units: aa.hoursL * aa.lUPH, target: func.l});
                if (sizes.length === 0 && aa.totalHours > 0 && aa.totalUnits > 0) sizes.push({hours: aa.totalHours, units: aa.totalUnits, target: (func.s + func.m + func.l) / 3});
                sizes.forEach(function(s) {
                    var exp = s.units / s.target; var hL = Math.max(0, s.hours - exp); var vL = hL * s.target;
                    funcDil.hours += s.hours; funcDil.units += s.units; funcDil.hoursLost += hL; funcDil.volLost += vL;
                    funcDil.byLevel[lcN].hours += s.hours; funcDil.byLevel[lcN].units += s.units; funcDil.byLevel[lcN].hoursLost += hL; funcDil.byLevel[lcN].volLost += vL;
                });
            });
            dil.totHoursLost += funcDil.hoursLost; dil.totVolLost += funcDil.volLost;
            dil.totLC14Hours += funcDil.hours; dil.totLC14Units += funcDil.units;
            dil.byFunc[func.name] = funcDil;
        });
        return dil;
    }

    // === PARSE TABLES ===
    function parseAllTables() {
        var tbls = getTables(); var allData = [];
        for (var t = 0; t < tbls.length; t++) {
            var tbl = tbls[t]; var funcName = getFuncName(tbl); var colMap = buildColumnMap(tbl);
            if (colMap.totalCols === 0) continue;
            var idCol = findColByName(colMap, "ID"); var nameCol = findColByName(colMap, "Name");
            var managerCol = findColByName(colMap, "Manager"); var loginCol = findColByName(colMap, "Login");
            var shiftCol = findColByName(colMap, "Shift Code"); var lcCol = findColByName(colMap, "LC");
            var totalHoursCol = findTotalPaidHours(colMap);
            var smallUPH = findUPHBySize(colMap, "small"); var mediumUPH = findUPHBySize(colMap, "medium"); var largeUPH = findUPHBySize(colMap, "large");
            var smallUnitsCol = findUnitsBySize(colMap, "small"); var mediumUnitsCol = findUnitsBySize(colMap, "medium"); var largeUnitsCol = findUnitsBySize(colMap, "large");
            var psUnitsCols = findPSUnits(colMap);
            var smallHoursCol = findSizePaidHours(colMap, "small"); var mediumHoursCol = findSizePaidHours(colMap, "medium"); var largeHoursCol = findSizePaidHours(colMap, "large");
            var rows = tbl.querySelectorAll("tr.empl-all");
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                if (row.children[0] && row.children[0].colSpan > 1) continue;
                var firstText = cellText(row, 0);
                if (firstText === "Total" || firstText === "Grand Total") continue;
                var empId = cellText(row, idCol); var empName = cellText(row, nameCol);
                var manager = cellText(row, managerCol); var login = cellText(row, loginCol);
                var shift = cellText(row, shiftCol); var pageLc = cellText(row, lcCol);
                if (!login || login === "-") { var p1 = resolveProfile(empId, ""); if (p1) { login = p1.login || ""; if (!shift || shift === "-") shift = p1.shiftCode || ""; } }
                if (!shift || shift === "-") { var p2 = resolveProfile(empId, login); if (p2) shift = p2.shiftCode || ""; }
                var lc = pageLc;
                if (!lc || lc === "-" || lc === "") { var lcR = resolveLC(empId, login, funcName); if (lcR) { lc = lcR.lc || "-"; if (!login || login === "-") login = lcR.login || ""; } }
                if (!lc) lc = "-";
                var totalHours = 0; if (totalHoursCol >= 0) { var vh = parseFloat(cellText(row, totalHoursCol)); if (!isNaN(vh)) totalHours = vh; }
                var sUPH = cellNum(row, smallUPH); var mUPH = cellNum(row, mediumUPH); var lUPH = cellNum(row, largeUPH);
                var hoursS = cellNum(row, smallHoursCol) || 0; var hoursM = cellNum(row, mediumHoursCol) || 0; var hoursL = cellNum(row, largeHoursCol) || 0;
                var unitsS = cellNum(row, smallUnitsCol) || 0; var unitsM = cellNum(row, mediumUnitsCol) || 0; var unitsL = cellNum(row, largeUnitsCol) || 0;
                var totalUnits = unitsS + unitsM + unitsL;
                var psUnits = 0; psUnitsCols.forEach(function(col) { psUnits += (cellNum(row, col) || 0); });
                if (!empId && !login) continue;
                allData.push({ tableIdx: t, rowElement: row, empId: empId || "", empName: empName || "", manager: manager || "", login: login || "", shift: shift || "", lc: lc, lcNum: parseLCNum(lc), func: funcName, totalHours: totalHours, sUPH: sUPH, mUPH: mUPH, lUPH: lUPH, hoursS: hoursS, hoursM: hoursM, hoursL: hoursL, totalUnits: totalUnits, psUnits: psUnits, _sCol: smallUPH, _mCol: mediumUPH, _lCol: largeUPH });
            }
        }
        return allData;
    }

    // === INSERT PAGE COLUMNS ===
    function insertPageColumns() {
        var tbls = getTables(); var insertPos = 4;
        for (var i = 0; i < tbls.length; i++) {
            var tbl = tbls[i]; if (tbl.querySelectorAll(".ppr-coach-hdr").length > 0) continue;
            var thead = tbl.querySelector("thead"); if (!thead || !thead.children[0]) continue;
            var firstHeaderRow = thead.children[0]; var rowspanVal = parseInt(firstHeaderRow.children[0].getAttribute("rowspan")) || 1;
            var colNames = ["Shift Code", "Login", "LC"];
            for (var cn = 0; cn < colNames.length; cn++) {
                var hd = document.createElement("th"); hd.innerText = colNames[cn]; hd.classList.add("ppr-coach-hdr");
                if (rowspanVal > 1) hd.setAttribute("rowspan", rowspanVal);
                if (firstHeaderRow.children[insertPos]) firstHeaderRow.insertBefore(hd, firstHeaderRow.children[insertPos]);
                else firstHeaderRow.appendChild(hd);
            }
            var rows = tbl.querySelectorAll("tr.empl-all"); var funcName = getFuncName(tbl);
            for (var j = 0; j < rows.length; j++) {
                var row = rows[j];
                if (row.children[0] && row.children[0].colSpan > 1) { row.children[0].colSpan += 3; continue; }
                var empId = (row.children[1] && row.children[1].innerText) ? row.children[1].innerText.trim() : "";
                var profile = resolveProfile(empId, ""); var login = profile ? (profile.login || "-") : "-"; var shiftCode = profile ? (profile.shiftCode || "-") : "-";
                var lcRec = resolveLC(empId, login, funcName); var lcLevel = lcRec ? (lcRec.lc || "-") : "-";
                var td1 = document.createElement("td"); td1.innerText = shiftCode; td1.className = "ppr-coach-col";
                var td2 = document.createElement("td"); td2.innerText = login; td2.className = "ppr-coach-col"; td2.style.cursor = "pointer"; td2.title = "Click to copy badge";
                td2.addEventListener("click", function() { var eid = this.parentElement.children[1] ? this.parentElement.children[1].innerText.trim() : ""; var pr = resolveProfile(eid, ""); if (pr && pr.badgeBarcode) navigator.clipboard.writeText(pr.badgeBarcode).then(function() { toast("Badge copied", "ok"); }); });
                var td3 = document.createElement("td"); td3.innerText = lcLevel; td3.className = "ppr-coach-col"; td3.title = lcRec ? ("Process: " + (lcRec.process || "?") + " | Func: " + (lcRec.func || "?")) : "No LC data";
                if (row.children[insertPos]) { row.insertBefore(td1, row.children[insertPos]); row.insertBefore(td2, row.children[insertPos]); row.insertBefore(td3, row.children[insertPos]); }
                else { row.appendChild(td1); row.appendChild(td2); row.appendChild(td3); }
            }
        }
    }

    // === SETTINGS PANEL ===
    function saveAllSettings() {
        var s = { dsStartH: $("#s-ds-sh").val(), dsStartM: $("#s-ds-sm").val(), dsEndH: $("#s-ds-eh").val(), dsEndM: $("#s-ds-em").val(),
            nsStartH: $("#s-ns-sh").val(), nsStartM: $("#s-ns-sm").val(), nsEndH: $("#s-ns-eh").val(), nsEndM: $("#s-ns-em").val(),
            minMins: $("#s-min-mins").val(), fontSize: $("#s-font-size").val(),
            panelWidth: $("input[name='s-width']:checked").val() || "compact",
            showPct: $("#s-show-pct").is(":checked"),
            fnCrb: $("#s-fn-crb").is(":checked"), tCrbS: $("#s-t-crb-s").val(), tCrbM: $("#s-t-crb-m").val(), tCrbL: $("#s-t-crb-l").val(),
            fnCr: $("#s-fn-cr").is(":checked"), tCrS: $("#s-t-cr-s").val(), tCrM: $("#s-t-cr-m").val(), tCrL: $("#s-t-cr-l").val(),
            fnPg: $("#s-fn-pg").is(":checked"), tPgS: $("#s-t-pg-s").val(), tPgM: $("#s-t-pg-m").val(), tPgL: $("#s-t-pg-l").val(),
            lcChecks: [], cols: {} };
        $("#s-lc-checks input").each(function() { if ($(this).is(":checked")) s.lcChecks.push($(this).val()); });
        $("#s-col-checks input").each(function() { s.cols[$(this).val()] = $(this).is(":checked"); });
        GM_setValue("pprcoach_settings", JSON.stringify(s));
        applyPanelStyle(); toast("Settings saved", "ok"); closeSettings();
    }

    function buildSettingsPanel() {
        if (document.getElementById("cp-settings")) return;
        var saved = loadSettings(); var lcChecks = saved.lcChecks || ["1","2","3","4","5","0"];
        var cols = saved.cols || DEFAULTS.cols;
        var overlay = document.createElement("div"); overlay.id = "cp-overlay"; overlay.addEventListener("click", closeSettings); document.body.appendChild(overlay);
        var panel = document.createElement("div"); panel.id = "cp-settings";
        var html = '<h3>\u2699 PPR Coach Settings</h3>';
        html += '<div class="sec">SHIFT TIMES (Start H:M \u2192 End H:M)</div>';
        html += '<div class="shift-grid"><span>\u2600 DS:</span>';
        html += '<input type="number" id="s-ds-sh" value="' + (saved.dsStartH || DEFAULTS.dsStart.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ds-sm" value="' + (saved.dsStartM || DEFAULTS.dsStart.m) + '" min="0" max="59">';
        html += '<input type="number" id="s-ds-eh" value="' + (saved.dsEndH || DEFAULTS.dsEnd.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ds-em" value="' + (saved.dsEndM || DEFAULTS.dsEnd.m) + '" min="0" max="59">';
        html += '<span>\u263D NS:</span>';
        html += '<input type="number" id="s-ns-sh" value="' + (saved.nsStartH || DEFAULTS.nsStart.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ns-sm" value="' + (saved.nsStartM || DEFAULTS.nsStart.m) + '" min="0" max="59">';
        html += '<input type="number" id="s-ns-eh" value="' + (saved.nsEndH || DEFAULTS.nsEnd.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ns-em" value="' + (saved.nsEndM || DEFAULTS.nsEnd.m) + '" min="0" max="59">';
        html += '</div>';
        html += '<div class="sec">DISPLAY</div>';
        html += '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px"><input type="checkbox" id="s-show-pct" ' + (saved.showPct ? "checked" : "") + ' style="accent-color:#ff9900"> Show S/M/L as % of target</label>';
        html += '<label>Panel Width</label><div style="display:flex;gap:8px;margin:3px 0">';
        html += '<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="radio" name="s-width" value="compact" ' + ((saved.panelWidth || "compact") === "compact" ? "checked" : "") + ' style="accent-color:#ff9900"> Compact</label>';
        html += '<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="radio" name="s-width" value="wide" ' + (saved.panelWidth === "wide" ? "checked" : "") + ' style="accent-color:#ff9900"> Wide</label></div>';
        html += '<label>Font Size</label><div style="display:flex;align-items:center;gap:8px"><input type="range" id="s-font-size" min="8" max="16" value="' + (saved.fontSize || DEFAULTS.fontSize) + '" style="flex:1;accent-color:#ff9900"><span id="s-font-val" style="color:#ff9900;font-weight:bold">' + (saved.fontSize || DEFAULTS.fontSize) + 'px</span></div>';
        html += '<div class="sec">DASHBOARD COLUMNS</div>';
        html += '<div class="col-grid" id="s-col-checks">';
        var colDefs = [{k:"name",l:"Name"},{k:"login",l:"Login"},{k:"id",l:"ID"},{k:"shift",l:"Shift"},{k:"lc",l:"LC"},{k:"small",l:"Small"},{k:"medium",l:"Medium"},{k:"large",l:"Large"},{k:"perf",l:"Perf%"},{k:"units",l:"Units"},{k:"ps",l:"PS Units"},{k:"hours",l:"Hours"},{k:"manager",l:"Manager"},{k:"gap",l:"Gap"}];
        for (var cd = 0; cd < colDefs.length; cd++) {
            html += '<label><input type="checkbox" value="' + colDefs[cd].k + '" ' + (cols[colDefs[cd].k] !== false ? "checked" : "") + '> ' + colDefs[cd].l + '</label>';
        }
        html += '</div>';
        html += '<div class="sec">FUNCTIONS & TARGETS (S | M | L)</div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-crb" ' + (saved.fnCrb !== false ? "checked" : "") + '><label for="s-fn-crb">C-Return Bypass</label><div class="func-targets"><input type="number" id="s-t-crb-s" value="' + (saved.tCrbS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-crb-m" value="' + (saved.tCrbM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-crb-l" value="' + (saved.tCrbL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-cr" ' + (saved.fnCr !== false ? "checked" : "") + '><label for="s-fn-cr">Customer Returns</label><div class="func-targets"><input type="number" id="s-t-cr-s" value="' + (saved.tCrS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-cr-m" value="' + (saved.tCrM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-cr-l" value="' + (saved.tCrL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-pg" ' + (saved.fnPg !== false ? "checked" : "") + '><label for="s-fn-pg">Primary Grading</label><div class="func-targets"><input type="number" id="s-t-pg-s" value="' + (saved.tPgS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-pg-m" value="' + (saved.tPgM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-pg-l" value="' + (saved.tPgL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="sec">LC FILTER</div>';
        html += '<div class="lc-row" id="s-lc-checks">';
        html += '<label><input type="checkbox" value="1" ' + (lcChecks.indexOf("1") !== -1 ? "checked" : "") + '> 1</label>';
        html += '<label><input type="checkbox" value="2" ' + (lcChecks.indexOf("2") !== -1 ? "checked" : "") + '> 2</label>';
        html += '<label><input type="checkbox" value="3" ' + (lcChecks.indexOf("3") !== -1 ? "checked" : "") + '> 3</label>';
        html += '<label><input type="checkbox" value="4" ' + (lcChecks.indexOf("4") !== -1 ? "checked" : "") + '> 4</label>';
        html += '<label><input type="checkbox" value="5" ' + (lcChecks.indexOf("5") !== -1 ? "checked" : "") + '> 5</label>';
        html += '<label><input type="checkbox" value="0" ' + (lcChecks.indexOf("0") !== -1 ? "checked" : "") + '> N/A</label>';
        html += '</div>';
        html += '<div class="lc-btns"><button type="button" class="btn btn-sm btn-info" id="s-lc-all">All</button><button type="button" class="btn btn-sm btn-info" id="s-lc-none">None</button><button type="button" class="btn btn-sm btn-info" id="s-lc-13">1-3</button><button type="button" class="btn btn-sm btn-info" id="s-lc-45">4-5</button><button type="button" class="btn btn-sm btn-info" id="s-lc-5">5 Only</button></div>';
        html += '<div class="sec">MIN HOURS</div>';
        html += '<label>Minutes (ignore AAs below)</label><input type="number" id="s-min-mins" value="' + (saved.minMins || DEFAULTS.minMinutes) + '" min="0" step="5">';
        html += '<button type="button" class="btn btn-save" id="s-save">Save Settings</button>';
        html += '<button type="button" class="btn btn-close" id="s-close">Cancel</button>';
        panel.innerHTML = html;
        document.body.appendChild(panel);
        $("#s-save").click(saveAllSettings);
        $("#s-close").click(closeSettings);
        $("#s-font-size").on("input", function() { $("#s-font-val").text($(this).val() + "px"); });
        $("#s-lc-all").click(function() { $("#s-lc-checks input").prop("checked", true); });
        $("#s-lc-none").click(function() { $("#s-lc-checks input").prop("checked", false); });
        $("#s-lc-13").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", ["1","2","3"].indexOf($(this).val()) !== -1); }); });
        $("#s-lc-45").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", ["4","5"].indexOf($(this).val()) !== -1); }); });
        $("#s-lc-5").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", $(this).val() === "5"); }); });
    }

    function openSettings() { buildSettingsPanel(); $("#cp-settings").show(); $("#cp-overlay").show(); }
    function closeSettings() { $("#cp-settings").hide(); $("#cp-overlay").hide(); }

    function getEnabledFuncs() {
        var saved = loadSettings(); var f = [];
        if (saved.fnCrb !== false) f.push({name: "C-Return Bypass", s: parseFloat(saved.tCrbS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrbM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrbL) || DEFAULTS.targetLarge});
        if (saved.fnCr !== false) f.push({name: "Customer Returns", s: parseFloat(saved.tCrS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrL) || DEFAULTS.targetLarge});
        if (saved.fnPg !== false) f.push({name: "Primary Grading", s: parseFloat(saved.tPgS) || DEFAULTS.targetSmall, m: parseFloat(saved.tPgM) || DEFAULTS.targetMedium, l: parseFloat(saved.tPgL) || DEFAULTS.targetLarge});
        return f;
    }
    function getSelectedLCs() { var saved = loadSettings(); return saved.lcChecks || ["1","2","3","4","5","0"]; }
    function getMinHours() { var saved = loadSettings(); return (parseFloat(saved.minMins) || DEFAULTS.minMinutes) / 60; }
    function matchFunc(aaFunc, target) {
        var a = (aaFunc || "").toLowerCase(); var t = target.toLowerCase();
        if (a === t) return true; if (a.indexOf(t) !== -1 || t.indexOf(a) !== -1) return true;
        if (t === "c-return bypass" && a.indexOf("c-return") !== -1) return true;
        if (t === "customer returns" && a.indexOf("customer") !== -1) return true;
        if (t === "primary grading" && a.indexOf("primary") !== -1) return true;
        return false;
    }
    

    // === PART 3 OF 3 - paste after Part 2 ===

    // === MAIN PANEL ===
    function buildMainPanel() {
        var tag = document.createElement("div"); tag.id = "ppr-coach-tag";
        tag.innerHTML = "<b>PPR Coach</b> v" + VERSION + " | " + AUTHOR;
        document.body.appendChild(tag);
        var panel = document.createElement("div"); panel.id = "cp";
        var html = '<button type="button" class="toggle" id="cp-tog">\u2212</button>';
        html += '<h3>PPR Coach <button type="button" class="btn btn-sm btn-info" id="btn-settings" style="margin-left:auto;">\u2699 Settings</button></h3>';
        html += '<div id="cp-body">';
        html += '<div class="date-btns"><button type="button" class="btn btn-sm btn-info" id="dr-ds-today">\u2600 DS Today</button><button type="button" class="btn btn-sm btn-info" id="dr-ns-today">\u263D NS Today</button><button type="button" class="btn btn-sm btn-info" id="dr-ds-yest">\u2600 DS Yest</button><button type="button" class="btn btn-sm btn-info" id="dr-ns-yest">\u263D NS Yest</button></div>';
        html += '<div class="tab-bar"><button type="button" class="active" id="tab-coach">Coaching</button><button type="button" id="tab-dilution">Rate Dilution</button></div>';
        html += '<button type="button" class="btn btn-primary" id="btn-run">Run Report</button>';
        html += '<button type="button" class="btn btn-danger" id="btn-hl" style="margin-top:4px;">Highlight on Page</button>';
        html += '<button type="button" class="btn btn-success" id="btn-csv" style="margin-top:4px;display:none;">Export CSV</button>';
        html += '<div class="status" id="cp-status">Ready</div>';
        html += '<div id="cp-results"></div></div>';
        panel.innerHTML = html;
        document.body.appendChild(panel);
        $("#cp-tog").click(function() { var b = $("#cp-body"); b.toggle(); $("#cp-tog").text(b.is(":visible") ? "\u2212" : "+"); });
        $("#btn-settings").click(function() { openSettings(); });
        $("#dr-ds-today").click(function() { applyDateRange("ds-today"); });
        $("#dr-ns-today").click(function() { applyDateRange("ns-today"); });
        $("#dr-ds-yest").click(function() { applyDateRange("ds-yest"); });
        $("#dr-ns-yest").click(function() { applyDateRange("ns-yest"); });
        $("#tab-coach").click(function() { $("#tab-coach").addClass("active"); $("#tab-dilution").removeClass("active"); window._coachTab = "coach"; runReport(); });
        $("#tab-dilution").click(function() { $("#tab-dilution").addClass("active"); $("#tab-coach").removeClass("active"); window._coachTab = "dilution"; runReport(); });
        $("#btn-run").click(runReport);
        $("#btn-hl").click(highlightPage);
        $("#btn-csv").click(exportCSV);
        window._coachTab = "coach";
    }

    // === PPR INTRADAY BAR ===
    function buildPPRIntradayBar() {
        var tag = document.createElement("div"); tag.id = "ppr-coach-tag";
        tag.innerHTML = "<b>PPR Coach</b> v" + VERSION + " | " + AUTHOR;
        document.body.appendChild(tag);
        var formTable = document.querySelector("table.formLayout") || document.querySelector("form table") || document.querySelector("form");
        if (formTable && formTable.tagName === "TABLE") formTable.style.width = "800px";
        var bar = document.createElement("div"); bar.id = "ppr-intraday-bar";
        bar.innerHTML = '<span class="lbl">Intraday:</span><button type="button" id="ppr-ds-today">\u2600 DS Today</button><button type="button" id="ppr-ns-today">\u263D NS Today</button><button type="button" id="ppr-ds-yest">\u2600 DS Yest</button><button type="button" id="ppr-ns-yest">\u263D NS Yest</button><button type="button" id="ppr-settings" style="background:#ff9900;margin-left:8px;">\u2699</button>';
        if (formTable && formTable.parentNode) formTable.parentNode.insertBefore(bar, formTable.nextSibling);
        else { var content = document.querySelector("#content") || document.body; content.insertBefore(bar, content.firstChild); }
        var now = new Date(); var hour = now.getHours(); var saved = loadSettings();
        var dsH = parseInt(saved.dsStartH) || DEFAULTS.dsStart.h;
        var nsH = parseInt(saved.nsStartH) || DEFAULTS.nsStart.h;
        if (hour >= dsH && hour < nsH) document.getElementById("ppr-ds-today").style.background = "#ff9900";
        else document.getElementById("ppr-ns-today").style.background = "#ff9900";
        document.getElementById("ppr-ds-today").addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); applyDateRange("ds-today"); });
        document.getElementById("ppr-ns-today").addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); applyDateRange("ns-today"); });
        document.getElementById("ppr-ds-yest").addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); applyDateRange("ds-yest"); });
        document.getElementById("ppr-ns-yest").addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); applyDateRange("ns-yest"); });
        document.getElementById("ppr-settings").addEventListener("click", function(e) { e.preventDefault(); e.stopPropagation(); openSettings(); });
        buildSettingsPanel();
    }

    // === RUN REPORT ===
    function runReport() {
        var funcs = getEnabledFuncs(); var lcs = getSelectedLCs(); var minH = getMinHours();
        if (!funcs.length) { toast("Enable functions in Settings", "warn"); return; }
        setStatus("Parsing...");
        var allData = parseAllTables();
        if (!allData.length) { $("#cp-results").html('<p style="color:#ff9900;font-size:10px;">No AA data found.</p>'); setStatus("No data"); return; }
        if (window._coachTab === "dilution") {
            var dilution = calcDilution(allData, funcs);
            displayDilution(dilution); window._coachDilution = dilution; setStatus("Dilution calculated");
        } else {
            var results = {}; var gT = 0; var gB = 0;
            funcs.forEach(function(func) {
                var fd = allData.filter(function(aa) { return matchFunc(aa.func, func.name); });
                var filtered = fd.filter(function(aa) { return lcs.indexOf(aa.lcNum) !== -1 && aa.totalHours >= minH; });
                var coaching = [];
                filtered.forEach(function(aa) {
                    var below = false;
                    if (func.s && aa.sUPH !== null && aa.sUPH < func.s) below = true;
                    if (func.m && aa.mUPH !== null && aa.mUPH < func.m) below = true;
                    if (func.l && aa.lUPH !== null && aa.lUPH < func.l) below = true;
                    var perf = calcPerformance(aa, func); aa.perfPct = perf;
                    if (below) { var rec = {}; for (var key in aa) rec[key] = aa[key]; rec.perfPct = perf; coaching.push(rec); }
                });
                filtered.forEach(function(aa) { if (aa.perfPct === undefined) aa.perfPct = calcPerformance(aa, func); });
                coaching.sort(function(a, b) { return (a.perfPct || 0) - (b.perfPct || 0); });
                results[func.name] = {filtered: filtered, coaching: coaching, targets: func};
                gT += filtered.length; gB += coaching.length;
            });
            displayCoaching(results, gT, gB); window._coachResults = results; setStatus(gB + " below / " + gT + " total");
        }
        $("#btn-csv").show();
    }

    // === DISPLAY COACHING ===
    function displayCoaching(results, gT, gB) {
        var saved = loadSettings(); var showPct = saved.showPct || false;
        var cols = saved.cols || DEFAULTS.cols;
        var pct = gT > 0 ? ((gB / gT) * 100).toFixed(1) : "0";
        var html = '<div class="summary"><div class="s"><span>Total AAs:</span><span class="v">' + gT + '</span></div>';
        html += '<div class="s"><span>Below Target:</span><span class="v" style="color:#ff6b6b">' + gB + ' (' + pct + '%)</span></div>';
        html += '<div class="s"><span>On Target:</span><span class="v" style="color:#6bff8e">' + (gT - gB) + '</span></div></div>';
        var funcNames = Object.keys(results);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f]; var data = results[fname]; var targets = data.targets;
            html += '<div class="func-section"><div class="func-header">' + fname + ' (S:' + targets.s + ' M:' + targets.m + ' L:' + targets.l + ')</div>';
            if (data.coaching.length === 0) { html += '<p style="color:#6bff8e;font-size:9px;">All AAs on target \u2713</p>'; }
            else {
                html += '<table id="tbl-' + f + '"><thead><tr>';
                if (cols.name !== false) html += '<th>Name</th>';
                if (cols.login !== false) html += '<th>Login</th>';
                if (cols.id) html += '<th>ID</th>';
                if (cols.shift !== false) html += '<th>Shift</th>';
                if (cols.lc !== false) html += '<th>LC</th>';
                if (cols.small !== false) html += '<th>S</th>';
                if (cols.medium !== false) html += '<th>M</th>';
                if (cols.large !== false) html += '<th>L</th>';
                if (cols.perf !== false) html += '<th>Perf%</th>';
                if (cols.units !== false) html += '<th>Units</th>';
                if (cols.ps !== false) html += '<th>PS</th>';
                if (cols.hours !== false) html += '<th>Hrs</th>';
                if (cols.manager) html += '<th>Mgr</th>';
                if (cols.gap) html += '<th>Gap</th>';
                html += '</tr></thead><tbody>';
                for (var i = 0; i < data.coaching.length; i++) {
                    var aa = data.coaching[i];
                    var perfClass = (aa.perfPct !== null && aa.perfPct < 100) ? "perf-below" : "perf-above";
                    var perfStr = aa.perfPct !== null ? aa.perfPct.toFixed(0) + "%" : "-";
                    var sVal, mVal, lVal;
                    if (showPct) {
                        sVal = (aa.sUPH !== null && targets.s) ? ((aa.sUPH / targets.s) * 100).toFixed(0) + "%" : "-";
                        mVal = (aa.mUPH !== null && targets.m) ? ((aa.mUPH / targets.m) * 100).toFixed(0) + "%" : "-";
                        lVal = (aa.lUPH !== null && targets.l) ? ((aa.lUPH / targets.l) * 100).toFixed(0) + "%" : "-";
                    } else {
                        sVal = aa.sUPH !== null ? aa.sUPH.toFixed(0) : "-";
                        mVal = aa.mUPH !== null ? aa.mUPH.toFixed(0) : "-";
                        lVal = aa.lUPH !== null ? aa.lUPH.toFixed(0) : "-";
                    }
                    var sBad = (targets.s && aa.sUPH !== null && aa.sUPH < targets.s) ? "perf-below" : "";
                    var mBad = (targets.m && aa.mUPH !== null && aa.mUPH < targets.m) ? "perf-below" : "";
                    var lBad = (targets.l && aa.lUPH !== null && aa.lUPH < targets.l) ? "perf-below" : "";
                    var gapParts = [];
                    if (targets.s && aa.sUPH !== null && aa.sUPH < targets.s) gapParts.push("S");
                    if (targets.m && aa.mUPH !== null && aa.mUPH < targets.m) gapParts.push("M");
                    if (targets.l && aa.lUPH !== null && aa.lUPH < targets.l) gapParts.push("L");
                    html += '<tr>';
                    if (cols.name !== false) html += '<td title="' + aa.empName + '">' + shortName(aa.empName) + '</td>';
                    if (cols.login !== false) html += '<td>' + aa.login + '</td>';
                    if (cols.id) html += '<td>' + aa.empId + '</td>';
                    if (cols.shift !== false) html += '<td>' + aa.shift + '</td>';
                    if (cols.lc !== false) html += '<td>' + aa.lc + '</td>';
                    if (cols.small !== false) html += '<td class="' + sBad + '">' + sVal + '</td>';
                    if (cols.medium !== false) html += '<td class="' + mBad + '">' + mVal + '</td>';
                    if (cols.large !== false) html += '<td class="' + lBad + '">' + lVal + '</td>';
                    if (cols.perf !== false) html += '<td class="' + perfClass + '">' + perfStr + '</td>';
                    if (cols.units !== false) html += '<td>' + Math.round(aa.totalUnits) + '</td>';
                    if (cols.ps !== false) html += '<td>' + Math.round(aa.psUnits) + '</td>';
                    if (cols.hours !== false) html += '<td>' + aa.totalHours.toFixed(1) + '</td>';
                    if (cols.manager) html += '<td>' + shortName(aa.manager) + '</td>';
                    if (cols.gap) html += '<td style="color:#ff6b6b;font-weight:bold">' + (gapParts.length > 0 ? gapParts.join(",") : "-") + '</td>';
                    html += '</tr>';
                }
                html += '</tbody></table>';
            }
            html += '</div>';
        }
        $("#cp-results").html(html);
        $("#cp-results th").click(function() {
            var th = $(this); var tbl = th.closest("table"); var tbody = tbl.find("tbody");
            var rowsArr = tbody.find("tr").get(); var asc = !th.hasClass("sort-asc");
            tbl.find("th").removeClass("sort-asc sort-desc"); th.addClass(asc ? "sort-asc" : "sort-desc");
            var idx = th.index();
            rowsArr.sort(function(a, b) { var aV = $(a).children().eq(idx).text(); var bV = $(b).children().eq(idx).text(); var aN = parseFloat(aV); var bN = parseFloat(bV); if (!isNaN(aN) && !isNaN(bN)) return asc ? aN - bN : bN - aN; return asc ? aV.localeCompare(bV) : bV.localeCompare(aV); });
            $.each(rowsArr, function(i, row) { tbody.append(row); });
        });
    }

    // === DISPLAY DILUTION ===
    function displayDilution(dil) {
        var html = '<div class="dil-kpi">';
        html += '<div class="kpi"><div class="val">' + dil.totHoursLost.toFixed(1) + '</div><div class="lbl">HOURS LOST</div></div>';
        html += '<div class="kpi"><div class="val">' + Math.round(dil.totVolLost) + '</div><div class="lbl">VOLUME LOST</div></div>';
        html += '<div class="kpi good"><div class="val">' + dil.totLC14Hours.toFixed(1) + '</div><div class="lbl">LC1-4 HOURS</div></div>';
        html += '<div class="kpi good"><div class="val">' + Math.round(dil.totLC14Units) + '</div><div class="lbl">LC1-4 UNITS</div></div>';
        html += '</div>';
        var funcNames = Object.keys(dil.byFunc);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f]; var fd = dil.byFunc[fname]; var target = fd.target;
            var avgTarget = Math.round((target.s + target.m + target.l) / 3);
            html += '<div class="dil-card"><div class="dil-title">' + fname + ' (UPH: ' + avgTarget + ')</div>';
            html += '<div style="font-size:9px;color:#ccc;margin-bottom:3px"><span class="loss">' + fd.hoursLost.toFixed(1) + ' hrs lost</span> | <span class="loss">' + Math.round(fd.volLost) + ' units lost</span></div>';
            var levels = Object.keys(fd.byLevel).sort();
            if (levels.length > 0) {
                html += '<table class="dil-tbl"><thead><tr><th>LC</th><th>Hours</th><th>Units</th><th>Hrs Lost</th><th>Vol Lost</th></tr></thead><tbody>';
                for (var l = 0; l < levels.length; l++) { var lv = fd.byLevel[levels[l]]; html += '<tr><td>LC' + levels[l] + '</td><td>' + lv.hours.toFixed(1) + '</td><td>' + Math.round(lv.units) + '</td><td class="loss">' + lv.hoursLost.toFixed(1) + '</td><td class="loss">' + Math.round(lv.volLost) + '</td></tr>'; }
                html += '</tbody></table>';
            } else { html += '<p style="color:#888;font-size:9px;">No LC1-4 AAs</p>'; }
            html += '</div>';
        }
        html += '<p style="color:#666;font-size:8px;margin-top:6px;">Baseline = LC5 UPH. Hours Lost = time above LC5 need. Volume Lost = units producible at LC5 rate.</p>';
        $("#cp-results").html(html);
    }

    // === HIGHLIGHT ===
    function highlightPage() {
        var funcs = getEnabledFuncs(); var lcs = getSelectedLCs(); var minH = getMinHours();
        var allData = parseAllTables(); var count = 0;
        $("tr.empl-all").removeClass("coach-below coach-meets");
        $(".coach-cell-bad, .coach-cell-good").removeClass("coach-cell-bad coach-cell-good");
        allData.forEach(function(aa) {
            if (lcs.indexOf(aa.lcNum) === -1 || aa.totalHours < minH) return;
            var func = null;
            for (var i = 0; i < funcs.length; i++) { if (matchFunc(aa.func, funcs[i].name)) { func = funcs[i]; break; } }
            if (!func) return;
            var below = false; var row = aa.rowElement;
            if (func.s && aa.sUPH !== null && aa.sUPH < func.s) { below = true; if (aa._sCol >= 0 && row.children[aa._sCol]) $(row.children[aa._sCol]).addClass("coach-cell-bad"); }
            else if (func.s && aa.sUPH !== null && aa._sCol >= 0 && row.children[aa._sCol]) $(row.children[aa._sCol]).addClass("coach-cell-good");
            if (func.m && aa.mUPH !== null && aa.mUPH < func.m) { below = true; if (aa._mCol >= 0 && row.children[aa._mCol]) $(row.children[aa._mCol]).addClass("coach-cell-bad"); }
            else if (func.m && aa.mUPH !== null && aa._mCol >= 0 && row.children[aa._mCol]) $(row.children[aa._mCol]).addClass("coach-cell-good");
            if (func.l && aa.lUPH !== null && aa.lUPH < func.l) { below = true; if (aa._lCol >= 0 && row.children[aa._lCol]) $(row.children[aa._lCol]).addClass("coach-cell-bad"); }
            else if (func.l && aa.lUPH !== null && aa._lCol >= 0 && row.children[aa._lCol]) $(row.children[aa._lCol]).addClass("coach-cell-good");
            if (below) { $(row).addClass("coach-below"); count++; } else { $(row).addClass("coach-meets"); }
        });
        toast(count + " AAs highlighted", count > 0 ? "warn" : "ok");
    }

    // === EXPORT CSV ===
    function exportCSV() {
        var results = window._coachResults;
        if (!results) { toast("Run report first", "warn"); return; }
        var lines = ["Function,Name,Login,ID,Shift,LC,Small UPH,Medium UPH,Large UPH,Perf%,Total Units,PS Units,Hours,Manager,Gap"];
        var funcNames = Object.keys(results);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f]; var data = results[fname];
            for (var i = 0; i < data.coaching.length; i++) {
                var aa = data.coaching[i];
                var gapParts = [];
                if (data.targets.s && aa.sUPH !== null && aa.sUPH < data.targets.s) gapParts.push("S");
                if (data.targets.m && aa.mUPH !== null && aa.mUPH < data.targets.m) gapParts.push("M");
                if (data.targets.l && aa.lUPH !== null && aa.lUPH < data.targets.l) gapParts.push("L");
                lines.push([fname, '"' + aa.empName + '"', aa.login, aa.empId, aa.shift, aa.lc,
                    aa.sUPH !== null ? aa.sUPH.toFixed(0) : "", aa.mUPH !== null ? aa.mUPH.toFixed(0) : "",
                    aa.lUPH !== null ? aa.lUPH.toFixed(0) : "", aa.perfPct !== null ? aa.perfPct.toFixed(1) : "",
                    Math.round(aa.totalUnits), Math.round(aa.psUnits), aa.totalHours.toFixed(2),
                    '"' + aa.manager + '"', gapParts.join("+")].join(","));
            }
        }
        var blob = new Blob([lines.join("\n")], {type: "text/csv"});
        var url = URL.createObjectURL(blob); var a = document.createElement("a");
        a.href = url; a.download = "PPR_Coach_" + building + "_" + new Date().toISOString().slice(0, 10) + ".csv";
        a.click(); URL.revokeObjectURL(url); toast("CSV exported", "ok");
    }

    // === INIT ===
    function init() {
        if (isPPRPage) { buildPPRIntradayBar(); return; }
        buildMainPanel();
        buildSettingsPanel();
        applyPanelStyle();
        var tbls = getTables(); var ids = [];
        for (var t = 0; t < tbls.length; t++) {
            var rows = tbls[t].querySelectorAll("tr.empl-all");
            for (var r = 0; r < rows.length; r++) {
                if (rows[r].children[0] && rows[r].children[0].colSpan > 1) continue;
                var id = rows[r].children[1] ? rows[r].children[1].innerText.trim() : "";
                if (id && ids.indexOf(id) === -1) ids.push(id);
            }
        }
        var linkIds = getEmployeeIdsFromLinks();
        for (var li = 0; li < linkIds.length; li++) { if (ids.indexOf(linkIds[li]) === -1) ids.push(linkIds[li]); }
        if (ids.length > 0) {
            fetchProfiles(ids, function() {
                fetchLCData(function() { insertPageColumns(); setStatus("Ready (" + ids.length + " AAs)"); });
            });
        } else { setStatus("Ready - load report first"); }
    }

    if (document.readyState === "complete") setTimeout(init, 1500);
    else window.addEventListener("load", function() { setTimeout(init, 1500); });

})();



