
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
        showPct: false
    };

    var sp = new URLSearchParams(window.location.search);
    var building = sp.get("warehouseId") || "";
    var adaptBase = "https://adapt-iad.amazon.com";
    var profileCache = {};
    var lcCache = {};
    var resolvedAdaptUrl = "";
    var isPPRPage = window.location.pathname.indexOf("processPathRollup") !== -1;
    var isFRPage = window.location.pathname.indexOf("functionRollup") !== -1;

    try {
        profileCache = JSON.parse(GM_getValue("pprcoach_profiles", "{}"));
    } catch(e) {
        profileCache = {};
    }

    // ============================================
    // STYLES
    // ============================================
    GM_addStyle([
        "#ppr-coach-tag{position:fixed;top:0;right:0;z-index:100001;font-family:Arial,sans-serif;font-size:10px;color:#aaa;background:#232f3e;padding:4px 12px;border-radius:0 0 0 8px}",
        "#ppr-coach-tag b{color:#ff9900}",
        "#cp{position:fixed;top:22px;right:8px;background:#232f3e;color:#fff;border-radius:8px;padding:12px;z-index:100000;font-family:Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto}",
        "#cp.compact{width:380px}",
        "#cp.compact #cp-results{max-height:55vh;overflow-y:auto}",
        "#cp.wide{width:580px}",
        "#cp.wide #cp-results table{font-size:10px}",
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
        "#cp-results th{background:#ff9900;color:#000;padding:3px 2px;text-align:left;cursor:pointer;user-select:none;position:sticky;top:0}",
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
        "#cp-settings{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:420px;max-height:80vh;overflow-y:auto;background:#232f3e;color:#fff;border-radius:10px;padding:16px;z-index:100002;box-shadow:0 8px 32px rgba(0,0,0,0.7);font-family:Arial,sans-serif;font-size:11px}",
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

    // ============================================
    // UTILITY
    // ============================================
    function toast(msg, type) {
        var el = document.getElementById("coach-toast");
        if (el) el.remove();
        var bg = type === "ok" ? "#27ae60" : type === "warn" ? "#f39c12" : "#e74c3c";
        var div = document.createElement("div");
        div.id = "coach-toast";
        div.style.background = bg;
        div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(function() { div.style.opacity = "0"; setTimeout(function() { div.remove(); }, 300); }, 3000);
    }

    function setStatus(msg) {
        var el = document.getElementById("cp-status");
        if (el) el.textContent = msg;
    }

    function loadSettings() {
        try { return JSON.parse(GM_getValue("pprcoach_settings", "{}")); }
        catch(e) { return {}; }
    }

    function normFunc(name) {
        return (name || "").replace(/[12]$/g, "").replace(/\d+$/, "").trim();
    }

    function getPageProcessName() {
        var sel = document.getElementById("processId");
        if (sel && sel.selectedIndex >= 0) {
            var text = sel.options[sel.selectedIndex].text || "";
            return text.split("[")[0].trim();
        }
        return sp.get("processId") || "";
    }

    function applyPanelStyle() {
        var saved = loadSettings();
        var size = parseInt(saved.fontSize) || DEFAULTS.fontSize;
        var width = saved.panelWidth || DEFAULTS.panelWidth;
        var cp = document.getElementById("cp");
        if (cp) {
            cp.style.fontSize = size + "px";
            cp.classList.remove("wide", "compact");
            cp.classList.add(width);
        }
        var results = document.getElementById("cp-results");
        if (results) results.style.fontSize = size + "px";
    }

    // ============================================
    // ADAPT URL RESOLVER
    // ============================================
    function resolveAdaptUrl(callback) {
        if (resolvedAdaptUrl) { callback(resolvedAdaptUrl); return; }
        try {
            var cached = JSON.parse(localStorage.getItem("pprcoach_adapt_url") || "{}");
            if (cached.url && cached.building === building && cached.timestamp && (Date.now() - cached.timestamp) < 7 * 24 * 60 * 60 * 1000) {
                resolvedAdaptUrl = cached.url;
                callback(resolvedAdaptUrl);
                return;
            }
        } catch(e) {}
        GM_xmlhttpRequest({
            method: "GET",
            url: "https://adapt.amazon.com/",
            onload: function(response) {
                var finalUrl = response.finalUrl || response.responseURL || "";
                if (finalUrl && finalUrl.indexOf("adapt") !== -1) {
                    var match = finalUrl.match(/(https:\/\/adapt[^\/]+)/);
                    resolvedAdaptUrl = match ? match[1] : finalUrl.split("/").slice(0, 3).join("/");
                } else {
                    resolvedAdaptUrl = adaptBase;
                }
                try { localStorage.setItem("pprcoach_adapt_url", JSON.stringify({url: resolvedAdaptUrl, building: building, timestamp: Date.now()})); } catch(e) {}
                callback(resolvedAdaptUrl);
            },
            onerror: function() { resolvedAdaptUrl = adaptBase; callback(resolvedAdaptUrl); }
        });
    }

    // ============================================
    // PROFILE & LC CACHE
    // ============================================
    function resolveProfile(id, login) {
        if (id && profileCache[id]) return profileCache[id];
        if (login && profileCache[login]) return profileCache[login];
        return null;
    }

    function resolveLC(id, login, funcName) {
        var proc = getPageProcessName();
        var nf = normFunc(funcName);
        var key1 = id + "|" + proc + "|" + nf;
        if (lcCache[key1]) return lcCache[key1];
        if (login) {
            var key2 = login + "|" + proc + "|" + nf;
            if (lcCache[key2]) return lcCache[key2];
        }
        var key3 = id + "|*";
        if (lcCache[key3]) return lcCache[key3];
        if (login) {
            var key4 = login + "|*";
            if (lcCache[key4]) return lcCache[key4];
        }
        return null;
    }

    function storeProfile(id, login, data) {
        var rec = {id: id, login: login, shiftCode: data.shiftCode || "", badgeBarcode: data.badgeBarcode || "", timestamp: Date.now()};
        if (id) profileCache[id] = rec;
        if (login) profileCache[login] = rec;
    }

    function storeLC(id, login, processName, funcName, lcLevel) {
        var nf = normFunc(funcName);
        var rec = {lc: lcLevel, id: id, login: login, process: processName, func: funcName};
        var pageProc = getPageProcessName();
        if (id && processName !== "*") {
            lcCache[id + "|" + processName + "|" + nf] = rec;
        }
        if (login && processName !== "*") {
            lcCache[login + "|" + processName + "|" + nf] = rec;
        }
        if (processName === pageProc || processName === "*") {
            if (id) {
                var ex1 = lcCache[id + "|*"];
                if (!ex1 || parseInt(lcLevel) > parseInt(ex1.lc || "0")) {
                    lcCache[id + "|*"] = rec;
                }
            }
            if (login) {
                var ex2 = lcCache[login + "|*"];
                if (!ex2 || parseInt(lcLevel) > parseInt(ex2.lc || "0")) {
                    lcCache[login + "|*"] = rec;
                }
            }
        }
    }

    // ============================================
    // FETCH PROFILES
    // ============================================
    function fetchProfiles(ids, callback) {
        var now = Date.now();
        var toFetch = ids.filter(function(id) {
            var c = profileCache[id];
            return !c || !c.timestamp || (now - c.timestamp) > 7 * 24 * 60 * 60 * 1000;
        });
        if (!toFetch.length) { if (callback) callback(); return; }
        setStatus("Fetching profiles (" + toFetch.length + ")...");
        resolveAdaptUrl(function(baseUrl) {
            var batches = [];
            for (var i = 0; i < toFetch.length; i += 100) batches.push(toFetch.slice(i, i + 100));
            var done = 0;
            batches.forEach(function(batch) {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: baseUrl + "/api/employee-profile-svc/GetEmployeeProfiles?employeeLogins=" + JSON.stringify(batch),
                    onload: function(r) {
                        try {
                            var d = JSON.parse(r.responseText);
                            var keys = Object.keys(d);
                            for (var k = 0; k < keys.length; k++) {
                                storeProfile(keys[k], d[keys[k]].login || "", {shiftCode: d[keys[k]].shiftCode || "", badgeBarcode: d[keys[k]].badgeBarcodeId || ""});
                            }
                            GM_setValue("pprcoach_profiles", JSON.stringify(profileCache));
                        } catch(e) {}
                        done++;
                        if (done >= batches.length) { setStatus("Profiles loaded"); if (callback) callback(); }
                    },
                    onerror: function() { done++; if (done >= batches.length) { if (callback) callback(); } }
                });
            });
        });
    }

    // ============================================
    // FETCH LC DATA
    // ============================================
    function getEmployeeIdsFromLinks() {
        var ids = [];
        var links = document.querySelectorAll('a[href*="timeDetails"]');
        for (var i = 0; i < links.length; i++) {
            var href = links[i].href || links[i].getAttribute("href") || "";
            var match = href.match(/[?&]employeeId=([^&"]+)/);
            if (match && ids.indexOf(match[1]) === -1) ids.push(match[1]);
        }
        return ids;
    }

    function fetchLCData(callback) {
        setStatus("Fetching LC...");
        if (!building) { setStatus("LC: no warehouseId"); if (callback) callback(); return; }
        var empIds = getEmployeeIdsFromLinks();
        if (empIds.length === 0) {
            var tbls = getTables();
            for (var t = 0; t < tbls.length; t++) {
                var rows = tbls[t].querySelectorAll("tr.empl-all");
                for (var r = 0; r < rows.length; r++) {
                    if (rows[r].children[0] && rows[r].children[0].colSpan > 1) continue;
                    var id = rows[r].children[1] ? rows[r].children[1].innerText.trim() : "";
                    if (id && empIds.indexOf(id) === -1) empIds.push(id);
                }
            }
        }
        if (empIds.length === 0) { setStatus("LC: no IDs found"); if (callback) callback(); return; }
        resolveAdaptUrl(function(baseUrl) {
            var spprUrl = baseUrl + "/api/femida-svc/GetSpprTimeInterval?spprType=WEDNESDAY_PEAK_SPPR_MEETING&warehouseId=" + encodeURIComponent(building);
            GM_xmlhttpRequest({
                method: "GET",
                url: spprUrl,
                onload: function(spprResp) {
                    var spprData;
                    try { spprData = JSON.parse(spprResp.responseText); } catch(e) {
                        setStatus("LC: SPPR error");
                        if (callback) callback();
                        return;
                    }
                    if (!spprData || !spprData.currentSppr) {
                        setStatus("LC: no SPPR interval");
                        if (callback) callback();
                        return;
                    }
                    var startTime = (spprData.spprTrend && spprData.spprTrend.length > 0) ? spprData.spprTrend[0].startDateTime : spprData.currentSppr.startDateTime;
                    var endTime = spprData.currentSppr.endDateTime;
                    var batches = [];
                    for (var i = 0; i < empIds.length; i += 100) batches.push(empIds.slice(i, i + 100));
                    var totalBatches = batches.length;
                    var dailyDone = 0;
                    var fallbackDone = 0;
                    var allMetrics = {};
                    var fallbackLc = {};
                    batches.forEach(function(batch) {
                        var url = baseUrl + "/api/femida-svc/GetBatchEmployeePerformanceMetricsByGroupAndCategory?employeeIds=" + encodeURIComponent(JSON.stringify(batch)) + "&startTime=" + encodeURIComponent(startTime) + "&endTime=" + encodeURIComponent(endTime) + "&metricTypeCategory=AGGREGATE_DAILY&metricTypeGroup=PRODUCTIVITY&warehouseId=" + encodeURIComponent(building);
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            onload: function(r) {
                                try {
                                    var d = JSON.parse(r.responseText);
                                    var metrics = d.batchPerformanceMetrics || {};
                                    var keys = Object.keys(metrics);
                                    for (var k = 0; k < keys.length; k++) {
                                        if (!allMetrics[keys[k]]) allMetrics[keys[k]] = [];
                                        allMetrics[keys[k]] = allMetrics[keys[k]].concat(metrics[keys[k]]);
                                    }
                                } catch(e) {}
                                dailyDone++;
                                if (dailyDone >= totalBatches && fallbackDone >= totalBatches) processLCResults(empIds, allMetrics, fallbackLc, callback);
                            },
                            onerror: function() { dailyDone++; if (dailyDone >= totalBatches && fallbackDone >= totalBatches) processLCResults(empIds, allMetrics, fallbackLc, callback); }
                        });
                    });
                    batches.forEach(function(batch) {
                        var url = baseUrl + "/api/femida-svc/GetBatchEmployeePerformanceMetricsByGroupAndCategory?employeeIds=" + encodeURIComponent(JSON.stringify(batch)) + "&startTime=" + encodeURIComponent(startTime) + "&endTime=" + encodeURIComponent(endTime) + "&metricTypeCategory=CURRENT_PERFORMANCE_PERIOD&metricTypeGroup=PRODUCTIVITY&warehouseId=" + encodeURIComponent(building);
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            onload: function(r) {
                                try {
                                    var d = JSON.parse(r.responseText);
                                    var metrics = d.batchPerformanceMetrics || {};
                                    var keys = Object.keys(metrics);
                                    for (var k = 0; k < keys.length; k++) {
                                        if (metrics[keys[k]] && metrics[keys[k]].length > 0) {
                                            var attrs = metrics[keys[k]][0].performanceMetricAttributes || {};
                                            fallbackLc[keys[k]] = attrs.learningCurveLevel || attrs.learningCurveId || "";
                                        }
                                    }
                                } catch(e) {}
                                fallbackDone++;
                                if (dailyDone >= totalBatches && fallbackDone >= totalBatches) processLCResults(empIds, allMetrics, fallbackLc, callback);
                            },
                            onerror: function() { fallbackDone++; if (dailyDone >= totalBatches && fallbackDone >= totalBatches) processLCResults(empIds, allMetrics, fallbackLc, callback); }
                        });
                    });
                },
                onerror: function() { setStatus("LC: network error"); if (callback) callback(); }
            });
        });
    }

    function processLCResults(empIds, allMetrics, fallbackLc, callback) {
        var recordCount = 0;
        var empIdsWithData = {};
        var metricKeys = Object.keys(allMetrics);
        for (var k = 0; k < metricKeys.length; k++) {
            var empId = metricKeys[k];
            var metrics = allMetrics[empId];
            if (!metrics || metrics.length === 0) continue;
            empIdsWithData[empId] = true;
            var login = "";
            var p = resolveProfile(empId, "");
            if (p) login = p.login || "";
            var pathMap = {};
            for (var m = 0; m < metrics.length; m++) {
                var attrs = metrics[m].performanceMetricAttributes || {};
                var procName = attrs.processName || "";
                var funcName = "";
                try {
                    var pa = JSON.parse(attrs.processAttributes || "{}");
                    funcName = pa.FUNCTION_NAME || "";
                } catch(e) {}
                var lcId = attrs.learningCurveId || attrs.learningCurveLevel || "";
                var key = procName + "|" + funcName;
                if (!pathMap[key]) {
                    pathMap[key] = {processName: procName, functionName: funcName, lcLevel: lcId, timeWorked: 0};
                }
                pathMap[key].timeWorked += parseInt(attrs.timeWorked) || 0;
                if (lcId && parseInt(lcId) > parseInt(pathMap[key].lcLevel || "0")) {
                    pathMap[key].lcLevel = lcId;
                }
            }
            var pathKeys = Object.keys(pathMap);
            for (var pk = 0; pk < pathKeys.length; pk++) {
                var pData = pathMap[pathKeys[pk]];
                storeLC(empId, login, pData.processName, pData.functionName, pData.lcLevel);
                recordCount++;
            }
        }
        for (var i = 0; i < empIds.length; i++) {
            var eid = empIds[i];
            if (!empIdsWithData[eid] && fallbackLc[eid]) {
                var login2 = "";
                var p2 = resolveProfile(eid, "");
                if (p2) login2 = p2.login || "";
                storeLC(eid, login2, "*", "*", fallbackLc[eid]);
                recordCount++;
            }
        }
        setStatus("LC loaded (" + recordCount + ")");
        if (callback) callback();
    }

    // ============================================
    // DATE RANGE
    // ============================================
    function applyDateRange(type) {
        var saved = loadSettings();
        var today = new Date();
        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        var dsH0 = parseInt(saved.dsStartH) || DEFAULTS.dsStart.h;
        var dsM0 = parseInt(saved.dsStartM) || DEFAULTS.dsStart.m;
        var dsH1 = parseInt(saved.dsEndH) || DEFAULTS.dsEnd.h;
        var dsM1 = parseInt(saved.dsEndM) || DEFAULTS.dsEnd.m;
        var nsH0 = parseInt(saved.nsStartH) || DEFAULTS.nsStart.h;
        var nsM0 = parseInt(saved.nsStartM) || DEFAULTS.nsStart.m;
        var nsH1 = parseInt(saved.nsEndH) || DEFAULTS.nsEnd.h;
        var nsM1 = parseInt(saved.nsEndM) || DEFAULTS.nsEnd.m;
        var sd, ed, sH, sM, eH, eM;
        switch(type) {
            case "ds-today": sd = today; ed = today; sH = dsH0; sM = dsM0; eH = dsH1; eM = dsM1; break;
            case "ns-today": sd = today; ed = new Date(today.getTime() + 86400000); sH = nsH0; sM = nsM0; eH = nsH1; eM = nsM1; break;
            case "ds-yest": sd = yesterday; ed = yesterday; sH = dsH0; sM = dsM0; eH = dsH1; eM = dsM1; break;
            case "ns-yest": sd = yesterday; ed = today; sH = nsH0; sM = nsM0; eH = nsH1; eM = nsM1; break;
        }
        var spans = document.getElementsByName("spanType");
        for (var i = 0; i < spans.length; i++) {
            if (spans[i].value === "intraday" || i === spans.length - 1) {
                spans[i].checked = true;
                spans[i].dispatchEvent(new Event("change", {bubbles: true}));
                spans[i].click();
                break;
            }
        }
        setTimeout(function() {
            setFormVal("startDateIntraday", fmtD(sd));
            setFormVal("endDateIntraday", fmtD(ed));
            setSelVal("startHourIntraday", sH);
            setSelVal("startMinuteIntraday", sM);
            setSelVal("endHourIntraday", eH);
            setSelVal("endMinuteIntraday", eM);
            toast("Date: " + type.replace(/-/g, " ").toUpperCase(), "ok");
        }, 300);
    }

    function fmtD(d) {
        var mm = String(d.getMonth() + 1);
        var dd = String(d.getDate());
        if (mm.length < 2) mm = "0" + mm;
        if (dd.length < 2) dd = "0" + dd;
        return d.getFullYear() + "/" + mm + "/" + dd;
    }

    function setFormVal(id, v) {
        var e = document.getElementById(id);
        if (e) { e.value = v; e.dispatchEvent(new Event("change", {bubbles: true})); }
    }

    function setSelVal(id, v) {
        var e = document.getElementById(id);
        if (!e) return;
        for (var i = 0; i < e.options.length; i++) {
            if (parseInt(e.options[i].value) === parseInt(v)) {
                e.selectedIndex = i;
                e.dispatchEvent(new Event("change", {bubbles: true}));
                return;
            }
        }
    }

    // ============================================
    // TABLE HELPERS
    // ============================================
    function getTables() {
        var tbls = document.getElementsByClassName("sortable result-table align-left");
        if (tbls.length === 0) tbls = document.getElementsByClassName("sortable result-table");
        return tbls;
    }

    function buildColumnMap(tbl) {
        var thead = tbl.querySelector("thead");
        if (!thead) return {map: {}, totalCols: 0};
        var headerRows = thead.querySelectorAll("tr");
        var numRows = headerRows.length;
        if (numRows === 0) return {map: {}, totalCols: 0};
        var dataRow = tbl.querySelector("tr.empl-all");
        var totalCols = dataRow ? dataRow.children.length : 0;
        var grid = [];
        var r, c, colPtr, cell, text, colspan, rowspan, rs, cs;
        for (r = 0; r < numRows; r++) grid[r] = new Array(totalCols).fill(null);
        for (r = 0; r < numRows; r++) {
            var cells = headerRows[r].querySelectorAll("th");
            colPtr = 0;
            for (c = 0; c < cells.length; c++) {
                while (colPtr < totalCols && grid[r][colPtr] !== null) colPtr++;
                if (colPtr >= totalCols) break;
                cell = cells[c];
                text = (cell.innerText || cell.textContent || "").trim();
                colspan = parseInt(cell.getAttribute("colspan")) || 1;
                rowspan = parseInt(cell.getAttribute("rowspan")) || 1;
                for (rs = 0; rs < rowspan && (r + rs) < numRows; rs++) {
                    for (cs = 0; cs < colspan && (colPtr + cs) < totalCols; cs++) {
                        grid[r + rs][colPtr + cs] = text;
                    }
                }
                colPtr += colspan;
            }
        }
        var map = {};
        for (var col = 0; col < totalCols; col++) {
            var texts = [];
            for (r = 0; r < numRows; r++) texts.push(grid[r][col] || "");
            var name = texts[0], group = "", subgroup = "";
            if (numRows >= 3) {
                if (texts[0] === texts[1] && texts[1] === texts[2]) { name = texts[0]; }
                else if (texts[0] === texts[1]) { name = texts[0]; subgroup = texts[numRows - 1]; }
                else { group = texts[0]; subgroup = texts[1]; name = texts[numRows - 1]; }
            } else if (numRows === 2) {
                if (texts[0] === texts[1]) { name = texts[0]; }
                else { group = texts[0]; name = texts[1]; }
            }
            map[col] = {name: name, group: group, subgroup: subgroup, allTexts: texts};
        }
        return {map: map, totalCols: totalCols, grid: grid};
    }

    function findColByName(colMap, name) {
        var n = name.toLowerCase();
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            if (colMap.map[parseInt(keys[i])].name.toLowerCase() === n) return parseInt(keys[i]);
        }
        return -1;
    }

    function findUPHBySize(colMap, size) {
        var sizeLower = size.toLowerCase();
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            var col = parseInt(keys[i]);
            var entry = colMap.map[col];
            if (entry.name.toLowerCase() !== "uph") continue;
            var allText = entry.allTexts.join(" ").toLowerCase();
            if (allText.indexOf("problem") !== -1 || allText.indexOf(" ps") !== -1) continue;
            if (allText.indexOf("each-" + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function findUnitsBySize(colMap, size) {
        var sizeLower = size.toLowerCase();
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            var col = parseInt(keys[i]);
            var entry = colMap.map[col];
            if (entry.name.toLowerCase() !== "unit") continue;
            var allText = entry.allTexts.join(" ").toLowerCase();
            if (allText.indexOf("problem") !== -1 || allText.indexOf(" ps") !== -1) continue;
            if (allText.indexOf("each-" + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function findPSUnits(colMap) {
        var psCols = [];
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            var col = parseInt(keys[i]);
            var entry = colMap.map[col];
            if (entry.name.toLowerCase() !== "unit") continue;
            var allText = entry.allTexts.join(" ").toLowerCase();
            if (allText.indexOf("problem") !== -1 || allText.indexOf(" ps") !== -1) psCols.push(col);
        }
        return psCols;
    }

    function findTotalPaidHours(colMap) {
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            var col = parseInt(keys[i]);
            var e = colMap.map[col];
            if (e.name.toLowerCase() === "paid hours" && (!e.group || e.group.toLowerCase() === "total" || e.allTexts[0].toLowerCase() === "paid hours")) return col;
        }
        for (var j = 0; j < keys.length; j++) {
            if (colMap.map[parseInt(keys[j])].name.toLowerCase() === "paid hours") return parseInt(keys[j]);
        }
        return -1;
    }

    function findSizePaidHours(colMap, size) {
        var sizeLower = size.toLowerCase();
        var keys = Object.keys(colMap.map);
        for (var i = 0; i < keys.length; i++) {
            var col = parseInt(keys[i]);
            var entry = colMap.map[col];
            if (entry.name.toLowerCase() !== "paid hours") continue;
            var allText = entry.allTexts.join(" ").toLowerCase();
            if (allText.indexOf("problem") !== -1 || allText.indexOf(" ps") !== -1) continue;
            if (allText.indexOf("each-" + sizeLower) !== -1 || allText.indexOf(sizeLower) !== -1) return col;
        }
        return -1;
    }

    function getFuncName(tbl) {
        var caption = tbl.querySelector("caption");
        if (caption) {
            var t = (caption.innerText || caption.textContent || "").trim();
            if (t.indexOf("[") > 0) t = t.substring(0, t.indexOf("[")).trim();
            return t;
        }
        var el = tbl.previousElementSibling;
        var tries = 0;
        while (el && tries < 5) {
            var txt = (el.innerText || el.textContent || "").trim();
            if (txt.indexOf("C-Return") !== -1) return "C-Return Bypass";
            if (txt.indexOf("Customer Returns") !== -1) return "Customer Returns";
            if (txt.indexOf("Primary Grading") !== -1) return "Primary Grading";
            if (txt.length > 2 && txt.length < 80) return txt.split("\n")[0].trim();
            el = el.previousElementSibling;
            tries++;
        }
        return "Unknown";
    }

    function cellText(row, idx) {
        if (idx < 0 || idx >= row.children.length) return "";
        return (row.children[idx].innerText || row.children[idx].textContent || "").trim();
    }

    function cellNum(row, idx) {
        var t = cellText(row, idx);
        var v = parseFloat(t);
        return (!isNaN(v) && v > 0) ? v : null;
    }

    function parseLCNum(text) {
        var t = (text || "").trim();
        if (!t || t === "-" || t === "N/A" || t === "null") return "0";
        var m2 = t.match(/(\d+)/);
        return m2 ? m2[1] : "0";
    }

    // ============================================
    // PERFORMANCE CALCULATION
    // ============================================
    function calcPerformance(aa, targets) {
        var sizes = [];
        if (targets.s && aa.sUPH !== null) sizes.push({uph: aa.sUPH, target: targets.s, hours: aa.hoursS || 0});
        if (targets.m && aa.mUPH !== null) sizes.push({uph: aa.mUPH, target: targets.m, hours: aa.hoursM || 0});
        if (targets.l && aa.lUPH !== null) sizes.push({uph: aa.lUPH, target: targets.l, hours: aa.hoursL || 0});
        if (sizes.length === 0) return null;
        var totalHours = sizes.reduce(function(sum, s) { return sum + s.hours; }, 0);
        if (totalHours > 0) {
            var weightedSum = sizes.reduce(function(sum, s) { return sum + (s.hours * (s.uph / s.target)); }, 0);
            return (weightedSum / totalHours) * 100;
        }
        var avg = sizes.reduce(function(sum, s) { return sum + (s.uph / s.target); }, 0) / sizes.length;
        return avg * 100;
    }

    // ============================================
    // RATE DILUTION
    // ============================================
    function calcDilution(allData, funcs) {
        var dilution = {totHoursLost: 0, totVolLost: 0, totLC14Hours: 0, totLC14Units: 0, byFunc: {}};
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
                if (sizes.length === 0 && aa.totalHours > 0 && aa.totalUnits > 0) {
                    var avgTarget = (func.s + func.m + func.l) / 3;
                    sizes.push({hours: aa.totalHours, units: aa.totalUnits, target: avgTarget});
                }
                sizes.forEach(function(s) {
                    var expectedHours = s.units / s.target;
                    var hLost = Math.max(0, s.hours - expectedHours);
                    var vLost = hLost * s.target;
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

    // ============================================
    // PARSE ALL TABLES
    // ============================================
    function parseAllTables() {
        var tbls = getTables();
        var allData = [];
        for (var t = 0; t < tbls.length; t++) {
            var tbl = tbls[t];
            var funcName = getFuncName(tbl);
            var colMap = buildColumnMap(tbl);
            if (colMap.totalCols === 0) continue;
            var idCol = findColByName(colMap, "ID");
            var nameCol = findColByName(colMap, "Name");
            var managerCol = findColByName(colMap, "Manager");
            var loginCol = findColByName(colMap, "Login");
            var shiftCol = findColByName(colMap, "Shift Code");
            var lcCol = findColByName(colMap, "LC");
            var totalHoursCol = findTotalPaidHours(colMap);
            var smallUPH = findUPHBySize(colMap, "small");
            var mediumUPH = findUPHBySize(colMap, "medium");
            var largeUPH = findUPHBySize(colMap, "large");
            var smallUnitsCol = findUnitsBySize(colMap, "small");
            var mediumUnitsCol = findUnitsBySize(colMap, "medium");
            var largeUnitsCol = findUnitsBySize(colMap, "large");
            var psUnitsCols = findPSUnits(colMap);
            var smallHoursCol = findSizePaidHours(colMap, "small");
            var mediumHoursCol = findSizePaidHours(colMap, "medium");
            var largeHoursCol = findSizePaidHours(colMap, "large");
            var rows = tbl.querySelectorAll("tr.empl-all");
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                if (row.children[0] && row.children[0].colSpan > 1) continue;
                var firstText = cellText(row, 0);
                if (firstText === "Total" || firstText === "Grand Total") continue;
                var empId = cellText(row, idCol);
                var empName = cellText(row, nameCol);
                var manager = cellText(row, managerCol);
                var login = cellText(row, loginCol);
                var shift = cellText(row, shiftCol);
                var pageLc = cellText(row, lcCol);
                if (!login || login === "-") {
                    var p1 = resolveProfile(empId, login);
                    if (p1) { login = p1.login || ""; if (!shift || shift === "-") shift = p1.shiftCode || ""; }
                }
                if (!shift || shift === "-") {
                    var p2 = resolveProfile(empId, login);
                    if (p2) shift = p2.shiftCode || "";
                }
                var lc = pageLc;
                if (!lc || lc === "-" || lc === "") {
                    var lcR = resolveLC(empId, login, funcName);
                    if (lcR) { lc = lcR.lc || "-"; if (!login || login === "-") login = lcR.login || ""; }
                }
                if (!lc) lc = "-";
                var totalHours = 0;
                if (totalHoursCol >= 0) { var vh = parseFloat(cellText(row, totalHoursCol)); if (!isNaN(vh)) totalHours = vh; }
                var sUPH = cellNum(row, smallUPH);
                var mUPH = cellNum(row, mediumUPH);
                var lUPH = cellNum(row, largeUPH);
                var hoursS = cellNum(row, smallHoursCol) || 0;
                var hoursM = cellNum(row, mediumHoursCol) || 0;
                var hoursL = cellNum(row, largeHoursCol) || 0;
                var unitsS = cellNum(row, smallUnitsCol) || 0;
                var unitsM = cellNum(row, mediumUnitsCol) || 0;
                var unitsL = cellNum(row, largeUnitsCol) || 0;
                var totalUnits = unitsS + unitsM + unitsL;
                var psUnits = 0;
                psUnitsCols.forEach(function(col) { psUnits += (cellNum(row, col) || 0); });
                if (!empId && !login) continue;
                allData.push({
                    tableIdx: t, rowElement: row, empId: empId || "", empName: empName || "",
                    manager: manager || "", login: login || "", shift: shift || "",
                    lc: lc, lcNum: parseLCNum(lc), func: funcName, totalHours: totalHours,
                    sUPH: sUPH, mUPH: mUPH, lUPH: lUPH,
                    hoursS: hoursS, hoursM: hoursM, hoursL: hoursL,
                    totalUnits: totalUnits, psUnits: psUnits,
                    _sCol: smallUPH, _mCol: mediumUPH, _lCol: largeUPH
                });
            }
        }
        return allData;
    }

    // ============================================
    // INSERT PAGE COLUMNS
    // ============================================
    function insertPageColumns() {
        var tbls = getTables();
        var insertPos = 4;
        for (var i = 0; i < tbls.length; i++) {
            var tbl = tbls[i];
            if (tbl.querySelectorAll(".ppr-coach-hdr").length > 0) continue;
            var thead = tbl.querySelector("thead");
            if (!thead || !thead.children[0]) continue;
            var firstHeaderRow = thead.children[0];
            var rowspanVal = parseInt(firstHeaderRow.children[0].getAttribute("rowspan")) || 1;
            var colNames = ["Shift Code", "Login", "LC"];
            for (var cn = 0; cn < colNames.length; cn++) {
                var hd = document.createElement("th");
                hd.innerText = colNames[cn];
                hd.classList.add("ppr-coach-hdr");
                if (rowspanVal > 1) hd.setAttribute("rowspan", rowspanVal);
                if (firstHeaderRow.children[insertPos]) firstHeaderRow.insertBefore(hd, firstHeaderRow.children[insertPos]);
                else firstHeaderRow.appendChild(hd);
            }
            var rows = tbl.querySelectorAll("tr.empl-all");
            var funcName = getFuncName(tbl);
            for (var j = 0; j < rows.length; j++) {
                var row = rows[j];
                if (row.children[0] && row.children[0].colSpan > 1) { row.children[0].colSpan += 3; continue; }
                var empId = (row.children[1] && row.children[1].innerText) ? row.children[1].innerText.trim() : "";
                var profile = resolveProfile(empId, "");
                var login = profile ? (profile.login || "-") : "-";
                var shiftCode = profile ? (profile.shiftCode || "-") : "-";
                var lcRec = resolveLC(empId, login, funcName);
                var lcLevel = lcRec ? (lcRec.lc || "-") : "-";
                var lcTitle = lcRec ? ("Process: " + (lcRec.process || "?") + " | Func: " + (lcRec.func || "?")) : "No LC data";
                var td1 = document.createElement("td");
                td1.innerText = shiftCode;
                td1.className = "ppr-coach-col";
                if (row.children[insertPos]) row.insertBefore(td1, row.children[insertPos]);
                else row.appendChild(td1);
                var td2 = document.createElement("td");
                td2.innerText = login;
                td2.className = "ppr-coach-col";
                td2.style.cursor = "pointer";
                td2.title = "Click to copy badge";
                td2.addEventListener("click", function() {
                    var idCell = this.parentElement.children[1];
                    var eid = idCell ? idCell.innerText.trim() : "";
                    var pr = resolveProfile(eid, "");
                    if (pr && pr.badgeBarcode) {
                        navigator.clipboard.writeText(pr.badgeBarcode).then(function() { toast("Badge copied", "ok"); });
                    }
                });
                if (row.children[insertPos]) row.insertBefore(td2, row.children[insertPos]);
                else row.appendChild(td2);
                var td3 = document.createElement("td");
                td3.innerText = lcLevel;
                td3.className = "ppr-coach-col";
                td3.title = lcTitle;
                if (row.children[insertPos]) row.insertBefore(td3, row.children[insertPos]);
                else row.appendChild(td3);
            }
        }
    }

    // ============================================
    // SETTINGS PANEL
    // ============================================
    function saveAllSettings() {
        var s = {
            dsStartH: $("#s-ds-sh").val(), dsStartM: $("#s-ds-sm").val(),
            dsEndH: $("#s-ds-eh").val(), dsEndM: $("#s-ds-em").val(),
            nsStartH: $("#s-ns-sh").val(), nsStartM: $("#s-ns-sm").val(),
            nsEndH: $("#s-ns-eh").val(), nsEndM: $("#s-ns-em").val(),
            minMins: $("#s-min-mins").val(),
            fontSize: $("#s-font-size").val(),
            panelWidth: $("input[name='s-width']:checked").val() || "compact",
            showPct: $("#s-show-pct").is(":checked"),
            fnCrb: $("#s-fn-crb").is(":checked"), tCrbS: $("#s-t-crb-s").val(), tCrbM: $("#s-t-crb-m").val(), tCrbL: $("#s-t-crb-l").val(),
            fnCr: $("#s-fn-cr").is(":checked"), tCrS: $("#s-t-cr-s").val(), tCrM: $("#s-t-cr-m").val(), tCrL: $("#s-t-cr-l").val(),
            fnPg: $("#s-fn-pg").is(":checked"), tPgS: $("#s-t-pg-s").val(), tPgM: $("#s-t-pg-m").val(), tPgL: $("#s-t-pg-l").val(),
            lcChecks: []
        };
        $("#s-lc-checks input").each(function() { if ($(this).is(":checked")) s.lcChecks.push($(this).val()); });
        GM_setValue("pprcoach_settings", JSON.stringify(s));
        applyPanelStyle();
        toast("Settings saved", "ok");
        closeSettings();
    }

    function buildSettingsPanel() {
        if (document.getElementById("cp-settings")) return;
        var saved = loadSettings();
        var lcChecks = saved.lcChecks || ["1","2","3","4","5","0"];
        var overlay = document.createElement("div");
        overlay.id = "cp-overlay";
        overlay.addEventListener("click", closeSettings);
        document.body.appendChild(overlay);
        var panel = document.createElement("div");
        panel.id = "cp-settings";
        var html = '<h3>\u2699 PPR Coach Settings</h3>';
        html += '<div class="sec">SHIFT TIMES (Start H:M \u2192 End H:M)</div>';
        html += '<div class="shift-grid">';
        html += '<span>\u2600 DS:</span>';
        html += '<input type="number" id="s-ds-sh" value="' + (saved.dsStartH || DEFAULTS.dsStart.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ds-sm" value="' + (saved.dsStartM || DEFAULTS.dsStart.m) + '" min="0" max="59"
