
// ==UserScript==
// @name         PPR Coach - kiwufred
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Coaching report + Rate Dilution for FCLM Function Rollup. Inserts Login/LC columns, performance %, dilution summary.
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
// @updateURL    https://raw.githubusercontent.com/kins4fred/ppr-coach/main/ppr-coach-kiwufred.user.js
// @downloadURL  https://raw.githubusercontent.com/kins4fred/ppr-coach/main/ppr-coach-kiwufred.user.js
// ==/UserScript==

(function() {
    "use strict";

    var AUTHOR = "Kiwufred";
    var VERSION = "4.1";
    var DEFAULTS = {
        targetSmall: 42,
        targetMedium: 43,
        targetLarge: 31,
        minMinutes: 30,
        dsStart: {h: 7, m: 0},
        dsEnd: {h: 17, m: 30},
        nsStart: {h: 20, m: 0},
        nsEnd: {h: 6, m: 30}
    };

    var sp = new URLSearchParams(window.location.search);
    var building = sp.get("warehouseId") || "";
    var adaptBase = "https://adapt-iad.amazon.com";
    var profileCache = {};
    var lcCache = {};
    var resolvedAdaptUrl = "";

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
        "#cp{position:fixed;top:22px;right:8px;width:380px;background:#232f3e;color:#fff;border-radius:8px;padding:12px;z-index:100000;font-family:Arial,sans-serif;font-size:11px;box-shadow:0 4px 16px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto}",
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
        "#cp-results table{width:100%;border-collapse:collapse;font-size:9px}",
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
        ".perf-below{color:#ff6b6b!important;font-weight:bold}"
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
        setTimeout(function() {
            div.style.opacity = "0";
            setTimeout(function() { div.remove(); }, 300);
        }, 3000);
    }

    function setStatus(msg) {
        var el = document.getElementById("cp-status");
        if (el) el.textContent = msg;
    }

    function loadSettings() {
        try { return JSON.parse(GM_getValue("pprcoach_settings", "{}")); }
        catch(e) { return {}; }
    }

    function saveAllSettings() {
        var s = {
            dsStartH: $("#s-ds-sh").val(), dsStartM: $("#s-ds-sm").val(),
            dsEndH: $("#s-ds-eh").val(), dsEndM: $("#s-ds-em").val(),
            nsStartH: $("#s-ns-sh").val(), nsStartM: $("#s-ns-sm").val(),
            nsEndH: $("#s-ns-eh").val(), nsEndM: $("#s-ns-em").val(),
            minMins: $("#s-min-mins").val(),
            fnCrb: $("#s-fn-crb").is(":checked"), tCrbS: $("#s-t-crb-s").val(), tCrbM: $("#s-t-crb-m").val(), tCrbL: $("#s-t-crb-l").val(),
            fnCr: $("#s-fn-cr").is(":checked"), tCrS: $("#s-t-cr-s").val(), tCrM: $("#s-t-cr-m").val(), tCrL: $("#s-t-cr-l").val(),
            fnPg: $("#s-fn-pg").is(":checked"), tPgS: $("#s-t-pg-s").val(), tPgM: $("#s-t-pg-m").val(), tPgL: $("#s-t-pg-l").val(),
            lcChecks: []
        };
        $("#s-lc-checks input").each(function() { if ($(this).is(":checked")) s.lcChecks.push($(this).val()); });
        GM_setValue("pprcoach_settings", JSON.stringify(s));
        toast("Settings saved", "ok");
        closeSettings();
    }

    // ============================================
    // ADAPT URL RESOLVER
    // ============================================
    function resolveAdaptUrl(callback) {
        if (resolvedAdaptUrl) {
            callback(resolvedAdaptUrl);
            return;
        }
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
                    if (match) {
                        resolvedAdaptUrl = match[1];
                    } else {
                        resolvedAdaptUrl = finalUrl.split("/").slice(0, 3).join("/");
                    }
                } else {
                    resolvedAdaptUrl = adaptBase;
                }
                try {
                    localStorage.setItem("pprcoach_adapt_url", JSON.stringify({url: resolvedAdaptUrl, building: building, timestamp: Date.now()}));
                } catch(e) {}
                console.log("PPR Coach resolved Adapt URL:", resolvedAdaptUrl);
                callback(resolvedAdaptUrl);
            },
            onerror: function() {
                resolvedAdaptUrl = adaptBase;
                callback(resolvedAdaptUrl);
            }
        });
    }

    // ============================================
    // PROFILE & LC RESOLVER
    // ============================================
    function resolveProfile(id, login) {
        if (id && profileCache[id]) return profileCache[id];
        if (login && profileCache[login]) return profileCache[login];
        return null;
    }

    function resolveLC(id, login, funcName) {
        var clean = (funcName || "").replace(/[12]/g, "").trim();
        var keys = [id + "|" + clean, login + "|" + clean, id, login];
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] && keys[i] !== "|" + clean && lcCache[keys[i]]) return lcCache[keys[i]];
        }
        return null;
    }

    function storeProfile(id, login, data) {
        var rec = {id: id, login: login, shiftCode: data.shiftCode || "", badgeBarcode: data.badgeBarcode || "", timestamp: Date.now()};
        if (id) profileCache[id] = rec;
        if (login) profileCache[login] = rec;
    }

    function storeLC(id, login, funcName, lcLevel) {
        var clean = (funcName || "").replace(/[12]/g, "").trim();
        var rec = {lc: lcLevel, id: id, login: login};
        if (id) {
            lcCache[id + "|" + clean] = rec;
            if (!lcCache[id] || parseInt(lcLevel) > parseInt(lcCache[id].lc || "0")) lcCache[id] = rec;
        }
        if (login) {
            lcCache[login + "|" + clean] = rec;
            if (!lcCache[login] || parseInt(lcLevel) > parseInt(lcCache[login].lc || "0")) lcCache[login] = rec;
        }
    }

    // ============================================
    // DATE HELPERS (matches PPR LC script pattern)
    // ============================================
    function getDayFromURL(st) {
        if (sp.get(st + "Date")) {
            return new Date(sp.get(st + "Date"));
        }
        var d = sp.get(st + "DateWeek") || sp.get(st + "DateIntraday") || sp.get(st + "DateDay");
        if (d) {
            var hour = sp.get(st + "HourIntraday") || "00";
            if (hour.length < 2) hour = "0" + hour;
            var min = sp.get(st + "MinuteIntraday") || "00";
            if (min.length < 2) min = "0" + min;
            var result = new Date(d + " " + hour + ":" + min + ":00");
            var spanType = sp.get("spanType");
            if (spanType !== "Week") {
                return new Date(result.getTime() + 1000 * 60 * 60 * 24);
            }
            return result;
        }
        // fallback: derive end from start
        if (st === "end") {
            var sd = sp.get("startDateWeek") || sp.get("startDateIntraday") || sp.get("startDateDay");
            if (sd) {
                var sh = sp.get("startHourIntraday") || "00";
                if (sh.length < 2) sh = "0" + sh;
                var sm = sp.get("startMinuteIntraday") || "00";
                if (sm.length < 2) sm = "0" + sm;
                var sr = new Date(sd + " " + sh + ":" + sm + ":00");
                var spanT = sp.get("spanType");
                var days = spanT === "Week" ? 7 : 1;
                return new Date(sr.getTime() + days * 1000 * 60 * 60 * 24);
            }
        }
        var now = new Date();
        if (st === "start") { now.setHours(0, 0, 0, 0); }
        else { now.setDate(now.getDate() + 1); now.setHours(0, 0, 0, 0); }
        return now;
    }

    function getTimeFromStart(soe, d) {
        var spanType = sp.get("spanType");
        var offset = (soe === "start" && spanType !== "Week") ? 6 * 24 * 60 * 60 * 1000 : 0;
        var hr = new Date(d.getTime() - offset);
        return hr.toISOString();
    }

    // ============================================
    // ADAPT API: FETCH PROFILES
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
                        } catch(e) {
                            console.log("PPR Coach profile parse error:", e);
                        }
                        done++;
                        if (done >= batches.length) { setStatus("Profiles loaded"); if (callback) callback(); }
                    },
                    onerror: function() {
                        done++;
                        if (done >= batches.length) { if (callback) callback(); }
                    }
                });
            });
        });
    }

    // ============================================
    // ADAPT API: FETCH LC DATA
    // ============================================
    function fetchLCData(callback) {
        setStatus("Fetching LC...");

        var startDay = getDayFromURL("start");
        var endDay = getDayFromURL("end");
        var start = getTimeFromStart("start", startDay);
        var end = getTimeFromStart("end", endDay);

        console.log("PPR Coach LC fetch - start:", start, "end:", end, "building:", building);

        if (!building) {
            setStatus("LC: no warehouseId in URL");
            if (callback) callback();
            return;
        }

        resolveAdaptUrl(function(baseUrl) {
            var url = baseUrl + "/api/femida-svc/GetRatePublishingReportV2?dateRangeType=CUSTOM&managerLogins=[]&reportColumns=[\"EMPLOYEE_ID\",\"EMPLOYEE_LOGIN\",\"LEARNING_CURVE_FAMILY\",\"PROCESS_NAME\",\"FUNCTION_NAME\",\"LEARNING_CURVE_LEVEL\",\"TIME_WORKED\",\"UNITS_PER_HOUR\"]&reportEndTimeUtc=" + encodeURIComponent(end) + "&reportStartTimeUtc=" + encodeURIComponent(start) + "&spprType=WEDNESDAY_SPPR_MEETING&warehouseId=" + building;

            console.log("PPR Coach LC URL:", url);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function(r) {
                    try {
                        var d = JSON.parse(r.responseText);
                        if (d.ratePublishingReportContent && d.ratePublishingReportContent.rows) {
                            var rows = d.ratePublishingReportContent.rows;
                            for (var i = 0; i < rows.length; i++) {
                                var empId = rows[i][0] || "";
                                var login = rows[i][1] || "";
                                var funcName = rows[i][4] || "";
                                var lcLevel = rows[i][5] || "-";
                                storeLC(empId, login, funcName, lcLevel);
                                if (empId && login && !profileCache[empId]) {
                                    storeProfile(empId, login, {shiftCode: "", badgeBarcode: ""});
                                }
                            }
                            setStatus("LC loaded (" + rows.length + " records)");
                        } else {
                            console.log("PPR Coach LC response:", r.responseText.substring(0, 300));
                            setStatus("LC: no records returned");
                        }
                    } catch(e) {
                        console.log("PPR Coach LC parse error:", e, r.responseText.substring(0, 300));
                        setStatus("LC: parse error");
                    }
                    if (callback) callback();
                },
                onerror: function(e) {
                    console.log("PPR Coach LC network error:", e);
                    setStatus("LC: network error");
                    if (callback) callback();
                }
            });
        });
    }

    // ============================================
    // DATE RANGE BUTTONS
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
        return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
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
    // INSERT LOGIN, SHIFT CODE & LC COLUMNS ON PAGE
    // ============================================
    function insertPageColumns() {
        var tbls = getTables();
        var insertPos = 4;

        for (var i = 0; i < tbls.length; i++) {
            var tbl = tbls[i];
            if (tbl.querySelectorAll(".ppr-coach-hdr").length > 0) continue;
            if (tbl.querySelectorAll(".headerCompleter").length > 0) continue;

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
                    var p = resolveProfile(eid, "");
                    if (p && p.badgeBarcode) {
                        navigator.clipboard.writeText(p.badgeBarcode).then(function() { toast("Badge copied", "ok"); });
                    }
                });
                if (row.children[insertPos]) row.insertBefore(td2, row.children[insertPos]);
                else row.appendChild(td2);

                var td3 = document.createElement("td");
                td3.innerText = lcLevel;
                td3.className = "ppr-coach-col";
                if (row.children[insertPos]) row.insertBefore(td3, row.children[insertPos]);
                else row.appendChild(td3);
            }
        }
    }

    // ============================================
    // TABLE PARSER
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
        var m = t.match(/(\d+)/);
        return m ? m[1] : "0";
    }

    // ============================================
    // PERFORMANCE % CALCULATION
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
    // RATE DILUTION CALCULATION
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
    // SETTINGS PANEL
    // ============================================
    function buildSettingsPanel() {
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
        html += '<span>DS:</span>';
        html += '<input type="number" id="s-ds-sh" value="' + (saved.dsStartH || DEFAULTS.dsStart.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ds-sm" value="' + (saved.dsStartM || DEFAULTS.dsStart.m) + '" min="0" max="59">';
        html += '<input type="number" id="s-ds-eh" value="' + (saved.dsEndH || DEFAULTS.dsEnd.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ds-em" value="' + (saved.dsEndM || DEFAULTS.dsEnd.m) + '" min="0" max="59">';
        html += '<span>NS:</span>';
        html += '<input type="number" id="s-ns-sh" value="' + (saved.nsStartH || DEFAULTS.nsStart.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ns-sm" value="' + (saved.nsStartM || DEFAULTS.nsStart.m) + '" min="0" max="59">';
        html += '<input type="number" id="s-ns-eh" value="' + (saved.nsEndH || DEFAULTS.nsEnd.h) + '" min="0" max="23">';
        html += '<input type="number" id="s-ns-em" value="' + (saved.nsEndM || DEFAULTS.nsEnd.m) + '" min="0" max="59">';
        html += '</div>';
        html += '<div class="sec">FUNCTIONS & TARGETS (S | M | L)</div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-crb" ' + (saved.fnCrb !== false ? "checked" : "") + '><label for="s-fn-crb">C-Return Bypass</label><div class="func-targets"><input type="number" id="s-t-crb-s" value="' + (saved.tCrbS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-crb-m" value="' + (saved.tCrbM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-crb-l" value="' + (saved.tCrbL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-cr" ' + (saved.fnCr !== false ? "checked" : "") + '><label for="s-fn-cr">Customer Returns</label><div class="func-targets"><input type="number" id="s-t-cr-s" value="' + (saved.tCrS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-cr-m" value="' + (saved.tCrM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-cr-l" value="' + (saved.tCrL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="func-row"><input type="checkbox" id="s-fn-pg" ' + (saved.fnPg !== false ? "checked" : "") + '><label for="s-fn-pg">Primary Grading</label><div class="func-targets"><input type="number" id="s-t-pg-s" value="' + (saved.tPgS || DEFAULTS.targetSmall) + '"><input type="number" id="s-t-pg-m" value="' + (saved.tPgM || DEFAULTS.targetMedium) + '"><input type="number" id="s-t-pg-l" value="' + (saved.tPgL || DEFAULTS.targetLarge) + '"></div></div>';
        html += '<div class="sec">LC FILTER (for Coaching tab)</div>';
        html += '<div class="lc-row" id="s-lc-checks">';
        html += '<label><input type="checkbox" value="1" ' + (lcChecks.indexOf("1") !== -1 ? "checked" : "") + '> 1</label>';
        html += '<label><input type="checkbox" value="2" ' + (lcChecks.indexOf("2") !== -1 ? "checked" : "") + '> 2</label>';
        html += '<label><input type="checkbox" value="3" ' + (lcChecks.indexOf("3") !== -1 ? "checked" : "") + '> 3</label>';
        html += '<label><input type="checkbox" value="4" ' + (lcChecks.indexOf("4") !== -1 ? "checked" : "") + '> 4</label>';
        html += '<label><input type="checkbox" value="5" ' + (lcChecks.indexOf("5") !== -1 ? "checked" : "") + '> 5</label>';
        html += '<label><input type="checkbox" value="0" ' + (lcChecks.indexOf("0") !== -1 ? "checked" : "") + '> N/A</label>';
        html += '</div>';
        html += '<div class="lc-btns"><button class="btn btn-sm btn-info" id="s-lc-all">All</button><button class="btn btn-sm btn-info" id="s-lc-none">None</button><button class="btn btn-sm btn-info" id="s-lc-13">1-3</button><button class="btn btn-sm btn-info" id="s-lc-45">4-5</button><button class="btn btn-sm btn-info" id="s-lc-5">5</button></div>';
        html += '<div class="sec">MIN HOURS (ignore AAs below)</div>';
        html += '<label>Minutes</label><input type="number" id="s-min-mins" value="' + (saved.minMins || DEFAULTS.minMinutes) + '" min="0" step="5">';
        html += '<button class="btn btn-save" id="s-save">Save Settings</button>';
        html += '<button class="btn btn-close" id="s-close">Cancel</button>';
        panel.innerHTML = html;
        document.body.appendChild(panel);

        $("#s-save").click(saveAllSettings);
        $("#s-close").click(closeSettings);
        $("#s-lc-all").click(function() { $("#s-lc-checks input").prop("checked", true); });
        $("#s-lc-none").click(function() { $("#s-lc-checks input").prop("checked", false); });
        $("#s-lc-13").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", ["1","2","3"].indexOf($(this).val()) !== -1); }); });
        $("#s-lc-45").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", ["4","5"].indexOf($(this).val()) !== -1); }); });
        $("#s-lc-5").click(function() { $("#s-lc-checks input").each(function() { $(this).prop("checked", $(this).val() === "5"); }); });
    }

    function openSettings() { $("#cp-settings").show(); $("#cp-overlay").show(); }
    function closeSettings() { $("#cp-settings").hide(); $("#cp-overlay").hide(); }

     function getEnabledFuncs() {
        var saved = loadSettings();
        var f = [];
        if (saved.fnCrb !== false) f.push({name: "C-Return Bypass", s: parseFloat(saved.tCrbS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrbM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrbL) || DEFAULTS.targetLarge});
        if (saved.fnCr !== false) f.push({name: "Customer Returns", s: parseFloat(saved.tCrS) || DEFAULTS.targetSmall, m: parseFloat(saved.tCrM) || DEFAULTS.targetMedium, l: parseFloat(saved.tCrL) || DEFAULTS.targetLarge});
        if (saved.fnPg !== false) f.push({name: "Primary Grading", s: parseFloat(saved.tPgS) || DEFAULTS.targetSmall, m: parseFloat(saved.tPgM) || DEFAULTS.targetMedium, l: parseFloat(saved.tPgL) || DEFAULTS.targetLarge});
        return f;
    }

    function getSelectedLCs() {
        var saved = loadSettings();
        return saved.lcChecks || ["1","2","3","4","5","0"];
    }

    function getMinHours() {
        var saved = loadSettings();
        return (parseFloat(saved.minMins) || DEFAULTS.minMinutes) / 60;
    }

    function matchFunc(aaFunc, target) {
        var a = (aaFunc || "").toLowerCase();
        var t = target.toLowerCase();
        if (a === t) return true;
        if (a.indexOf(t) !== -1 || t.indexOf(a) !== -1) return true;
        if (t === "c-return bypass" && a.indexOf("c-return") !== -1) return true;
        if (t === "customer returns" && a.indexOf("customer") !== -1) return true;
        if (t === "primary grading" && a.indexOf("primary") !== -1) return true;
        return false;
    }

    // ============================================
    // MAIN PANEL
    // ============================================
    function buildMainPanel() {
        var tag = document.createElement("div");
        tag.id = "ppr-coach-tag";
        tag.innerHTML = "<b>PPR Coach</b> v" + VERSION + " | " + AUTHOR;
        document.body.appendChild(tag);

        var panel = document.createElement("div");
        panel.id = "cp";
        var html = '<button class="toggle" id="cp-tog">\u2212</button>';
        html += '<h3>PPR Coach <button class="btn btn-sm btn-info" id="btn-settings" style="margin-left:auto;">\u2699 Settings</button></h3>';
        html += '<div id="cp-body">';
        html += '<div class="date-btns">';
        html += '<button class="btn btn-sm btn-info" id="dr-ds-today">\u2600 DS Today</button>';
        html += '<button class="btn btn-sm btn-info" id="dr-ns-today">\u263D NS Today</button>';
        html += '<button class="btn btn-sm btn-info" id="dr-ds-yest">\u2600 DS Yest</button>';
        html += '<button class="btn btn-sm btn-info" id="dr-ns-yest">\u263D NS Yest</button>';
        html += '</div>';
        html += '<div class="tab-bar">';
        html += '<button class="active" id="tab-coach">Coaching</button>';
        html += '<button id="tab-dilution">Rate Dilution</button>';
        html += '</div>';
        html += '<button class="btn btn-primary" id="btn-run">Run Report</button>';
        html += '<button class="btn btn-danger" id="btn-hl" style="margin-top:4px;">Highlight on Page</button>';
        html += '<button class="btn btn-success" id="btn-csv" style="margin-top:4px;display:none;">Export CSV</button>';
        html += '<div class="status" id="cp-status">Ready</div>';
        html += '<div id="cp-results"></div>';
        html += '</div>';
        panel.innerHTML = html;
        document.body.appendChild(panel);

        $("#cp-tog").click(function() { var b = $("#cp-body"); b.toggle(); $("#cp-tog").text(b.is(":visible") ? "\u2212" : "+"); });
        $("#btn-settings").click(openSettings);
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

    // ============================================
    // RUN REPORT
    // ============================================
    function runReport() {
        var funcs = getEnabledFuncs();
        var lcs = getSelectedLCs();
        var minH = getMinHours();
        if (!funcs.length) { toast("Enable functions in Settings", "warn"); return; }

        setStatus("Parsing...");
        var allData = parseAllTables();

        if (!allData.length) {
            var tbls2 = getTables();
            var debug = "Tables: " + tbls2.length;
            if (tbls2.length > 0) {
                var colMap2 = buildColumnMap(tbls2[0]);
                var rows2 = tbls2[0].querySelectorAll("tr.empl-all");
                debug += " | Rows: " + rows2.length + " | Cols: " + colMap2.totalCols;
            }
            $("#cp-results").html('<p style="color:#ff9900;font-size:10px;margin-top:6px;">No AA data found.<br><span style="color:#888;font-size:8px;">' + debug + '</span></p>');
            setStatus("No data");
            return;
        }

        if (window._coachTab === "dilution") {
            var dilution = calcDilution(allData, funcs);
            displayDilution(dilution);
            window._coachDilution = dilution;
            setStatus("Dilution calculated");
        } else {
            var results = {};
            var gT = 0;
            var gB = 0;
            funcs.forEach(function(func) {
                var fd = allData.filter(function(aa) { return matchFunc(aa.func, func.name); });
                var filtered = fd.filter(function(aa) { return lcs.indexOf(aa.lcNum) !== -1 && aa.totalHours >= minH; });
                var coaching = [];
                filtered.forEach(function(aa) {
                    var below = false;
                    var gS = 0, gM = 0, gL = 0;
                    if (func.s && aa.sUPH !== null && aa.sUPH < func.s) { below = true; gS = func.s - aa.sUPH; }
                    if (func.m && aa.mUPH !== null && aa.mUPH < func.m) { below = true; gM = func.m - aa.mUPH; }
                    if (func.l && aa.lUPH !== null && aa.lUPH < func.l) { below = true; gL = func.l - aa.lUPH; }
                    var perf = calcPerformance(aa, func);
                    aa.perfPct = perf;
                    if (below) {
                        var rec = {};
                        for (var key in aa) rec[key] = aa[key];
                        rec.gS = gS;
                        rec.gM = gM;
                        rec.gL = gL;
                        rec.totalGap = gS + gM + gL;
                        rec.perfPct = perf;
                        coaching.push(rec);
                    }
                });
                filtered.forEach(function(aa) { if (aa.perfPct === undefined) aa.perfPct = calcPerformance(aa, func); });
                coaching.sort(function(a, b) { return (a.perfPct || 0) - (b.perfPct || 0); });
                results[func.name] = {filtered: filtered, coaching: coaching, targets: func};
                gT += filtered.length;
                gB += coaching.length;
            });
            displayCoaching(results, gT, gB);
            window._coachResults = results;
            setStatus(gB + " below / " + gT + " total");
        }
        $("#btn-csv").show();
    }

    // ============================================
    // DISPLAY: COACHING TAB
    // ============================================
    function displayCoaching(results, gT, gB) {
        var pct = gT > 0 ? ((gB / gT) * 100).toFixed(1) : "0";
        var html = '<div class="summary">';
        html += '<div class="s"><span>Total AAs:</span><span class="v">' + gT + '</span></div>';
        html += '<div class="s"><span>Below Target:</span><span class="v" style="color:#ff6b6b">' + gB + ' (' + pct + '%)</span></div>';
        html += '<div class="s"><span>On Target:</span><span class="v" style="color:#6bff8e">' + (gT - gB) + '</span></div>';
        html += '</div>';

        var funcNames = Object.keys(results);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f];
            var data = results[fname];
            var targets = data.targets;
            html += '<div class="func-section">';
            html += '<div class="func-header">' + fname + ' (S:' + targets.s + ' M:' + targets.m + ' L:' + targets.l + ')</div>';

            if (data.coaching.length === 0) {
                html += '<p style="color:#6bff8e;font-size:9px;">All AAs on target \u2713</p>';
            } else {
                html += '<table id="tbl-' + f + '"><thead><tr>';
                html += '<th data-col="empName">Name</th>';
                html += '<th data-col="lc">LC</th>';
                html += '<th data-col="sUPH">S</th>';
                html += '<th data-col="mUPH">M</th>';
                html += '<th data-col="lUPH">L</th>';
                html += '<th data-col="perfPct">Perf%</th>';
                html += '<th data-col="totalGap">Gap</th>';
                html += '<th data-col="totalHours">Hrs</th>';
                html += '</tr></thead><tbody>';

                for (var i = 0; i < data.coaching.length; i++) {
                    var aa = data.coaching[i];
                    var perfClass = (aa.perfPct !== null && aa.perfPct < 100) ? "perf-below" : "perf-above";
                    var perfStr = aa.perfPct !== null ? aa.perfPct.toFixed(0) + "%" : "-";
                    html += '<tr>';
                    html += '<td title="ID: ' + aa.empId + ' | Login: ' + aa.login + '">' + aa.empName + '</td>';
                    html += '<td>' + aa.lc + '</td>';
                    html += '<td class="' + (aa.gS > 0 ? "perf-below" : "") + '">' + (aa.sUPH !== null ? aa.sUPH.toFixed(0) : "-") + '</td>';
                    html += '<td class="' + (aa.gM > 0 ? "perf-below" : "") + '">' + (aa.mUPH !== null ? aa.mUPH.toFixed(0) : "-") + '</td>';
                    html += '<td class="' + (aa.gL > 0 ? "perf-below" : "") + '">' + (aa.lUPH !== null ? aa.lUPH.toFixed(0) : "-") + '</td>';
                    html += '<td class="' + perfClass + '">' + perfStr + '</td>';
                    html += '<td>' + aa.totalGap.toFixed(0) + '</td>';
                    html += '<td>' + aa.totalHours.toFixed(1) + '</td>';
                    html += '</tr>';
                }
                html += '</tbody></table>';
            }
            html += '</div>';
        }

        $("#cp-results").html(html);

        // Sortable headers
        $("#cp-results th").click(function() {
            var th = $(this);
            var tbl = th.closest("table");
            var tbody = tbl.find("tbody");
            var rowsArr = tbody.find("tr").get();
            var asc = !th.hasClass("sort-asc");
            tbl.find("th").removeClass("sort-asc sort-desc");
            th.addClass(asc ? "sort-asc" : "sort-desc");
            var idx = th.index();
            rowsArr.sort(function(a, b) {
                var aVal = $(a).children().eq(idx).text();
                var bVal = $(b).children().eq(idx).text();
                var aNum = parseFloat(aVal);
                var bNum = parseFloat(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
                return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
            $.each(rowsArr, function(idx2, row) { tbody.append(row); });
        });
    }

    // ============================================
    // DISPLAY: RATE DILUTION TAB
    // ============================================
    function displayDilution(dilution) {
        var html = '<div class="dil-kpi">';
        html += '<div class="kpi"><div class="val">' + dilution.totHoursLost.toFixed(1) + '</div><div class="lbl">HOURS LOST</div></div>';
        html += '<div class="kpi"><div class="val">' + Math.round(dilution.totVolLost) + '</div><div class="lbl">VOLUME LOST</div></div>';
        html += '<div class="kpi good"><div class="val">' + dilution.totLC14Hours.toFixed(1) + '</div><div class="lbl">LC1-4 HOURS</div></div>';
        html += '<div class="kpi good"><div class="val">' + Math.round(dilution.totLC14Units) + '</div><div class="lbl">LC1-4 UNITS</div></div>';
        html += '</div>';

        var funcNames = Object.keys(dilution.byFunc);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f];
            var fd = dilution.byFunc[fname];
            var target = fd.target;
            var avgTarget = Math.round((target.s + target.m + target.l) / 3);

            html += '<div class="dil-card">';
            html += '<div class="dil-title">' + fname + ' (UPH Target: ' + avgTarget + ')</div>';
            html += '<div style="font-size:9px;color:#ccc;margin-bottom:3px;">';
            html += '<span class="loss">' + fd.hoursLost.toFixed(1) + ' hrs lost</span> | ';
            html += '<span class="loss">' + Math.round(fd.volLost) + ' units lost</span>';
            html += '</div>';

            var levels = Object.keys(fd.byLevel).sort();
            if (levels.length > 0) {
                html += '<table class="dil-tbl"><thead><tr><th>LC</th><th>Hours</th><th>Units</th><th>Hrs Lost</th><th>Vol Lost</th></tr></thead><tbody>';
                for (var l = 0; l < levels.length; l++) {
                    var lv = fd.byLevel[levels[l]];
                    html += '<tr>';
                    html += '<td>LC' + levels[l] + '</td>';
                    html += '<td>' + lv.hours.toFixed(1) + '</td>';
                    html += '<td>' + Math.round(lv.units) + '</td>';
                    html += '<td class="loss">' + lv.hoursLost.toFixed(1) + '</td>';
                    html += '<td class="loss">' + Math.round(lv.volLost) + '</td>';
                    html += '</tr>';
                }
                html += '</tbody></table>';
            } else {
                html += '<p style="color:#888;font-size:9px;">No LC1-4 AAs in this function</p>';
            }
            html += '</div>';
        }

        html += '<p style="color:#666;font-size:8px;margin-top:6px;">Baseline = LC5 (target UPH). Hours Lost = hours above what LC5 would need. Volume Lost = units that could have been produced at LC5 rate.</p>';
        $("#cp-results").html(html);
    }

    // ============================================
    // HIGHLIGHT ON PAGE
    // ============================================
    function highlightPage() {
        var funcs = getEnabledFuncs();
        var lcs = getSelectedLCs();
        var minH = getMinHours();
        var allData = parseAllTables();
        var count = 0;

        $("tr.empl-all").removeClass("coach-below coach-meets");
        $(".coach-cell-bad, .coach-cell-good").removeClass("coach-cell-bad coach-cell-good");

        allData.forEach(function(aa) {
            if (lcs.indexOf(aa.lcNum) === -1 || aa.totalHours < minH) return;
            var func = null;
            for (var i = 0; i < funcs.length; i++) {
                if (matchFunc(aa.func, funcs[i].name)) { func = funcs[i]; break; }
            }
            if (!func) return;

            var below = false;
            var row = aa.rowElement;
            if (func.s && aa.sUPH !== null && aa.sUPH < func.s) {
                below = true;
                if (aa._sCol >= 0 && row.children[aa._sCol]) $(row.children[aa._sCol]).addClass("coach-cell-bad");
            } else if (func.s && aa.sUPH !== null && aa._sCol >= 0 && row.children[aa._sCol]) {
                $(row.children[aa._sCol]).addClass("coach-cell-good");
            }
            if (func.m && aa.mUPH !== null && aa.mUPH < func.m) {
                below = true;
                if (aa._mCol >= 0 && row.children[aa._mCol]) $(row.children[aa._mCol]).addClass("coach-cell-bad");
            } else if (func.m && aa.mUPH !== null && aa._mCol >= 0 && row.children[aa._mCol]) {
                $(row.children[aa._mCol]).addClass("coach-cell-good");
            }
            if (func.l && aa.lUPH !== null && aa.lUPH < func.l) {
                below = true;
                if (aa._lCol >= 0 && row.children[aa._lCol]) $(row.children[aa._lCol]).addClass("coach-cell-bad");
            } else if (func.l && aa.lUPH !== null && aa._lCol >= 0 && row.children[aa._lCol]) {
                $(row.children[aa._lCol]).addClass("coach-cell-good");
            }

            if (below) { $(row).addClass("coach-below"); count++; }
            else { $(row).addClass("coach-meets"); }
        });

        toast(count + " AAs highlighted below target", count > 0 ? "warn" : "ok");
    }

    // ============================================
    // EXPORT CSV
    // ============================================
    function exportCSV() {
        var results = window._coachResults;
        if (!results) { toast("Run report first", "warn"); return; }

        var lines = ["Function,Name,ID,Login,Shift,LC,Small UPH,Medium UPH,Large UPH,Perf%,Gap S,Gap M,Gap L,Total Gap,Hours,PS Units"];
        var funcNames = Object.keys(results);
        for (var f = 0; f < funcNames.length; f++) {
            var fname = funcNames[f];
            var data = results[fname];
            for (var i = 0; i < data.coaching.length; i++) {
                var aa = data.coaching[i];
                var perfStr = aa.perfPct !== null ? aa.perfPct.toFixed(1) : "";
                lines.push([
                    fname, aa.empName, aa.empId, aa.login, aa.shift, aa.lc,
                    aa.sUPH !== null ? aa.sUPH.toFixed(0) : "",
                    aa.mUPH !== null ? aa.mUPH.toFixed(0) : "",
                    aa.lUPH !== null ? aa.lUPH.toFixed(0) : "",
                    perfStr, aa.gS.toFixed(0), aa.gM.toFixed(0), aa.gL.toFixed(0),
                    aa.totalGap.toFixed(0), aa.totalHours.toFixed(2), aa.psUnits
                ].join(","));
            }
        }

        var blob = new Blob([lines.join("\n")], {type: "text/csv"});
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "PPR_Coach_" + building + "_" + new Date().toISOString().slice(0, 10) + ".csv";
        a.click();
        URL.revokeObjectURL(url);
        toast("CSV exported", "ok");
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        buildMainPanel();
        buildSettingsPanel();

        var tbls = getTables();
        var ids = [];
        for (var t = 0; t < tbls.length; t++) {
            var rows = tbls[t].querySelectorAll("tr.empl-all");
            for (var r = 0; r < rows.length; r++) {
                if (rows[r].children[0] && rows[r].children[0].colSpan > 1) continue;
                var id = rows[r].children[1] ? rows[r].children[1].innerText.trim() : "";
                if (id && ids.indexOf(id) === -1) ids.push(id);
            }
        }

        if (ids.length > 0) {
            fetchProfiles(ids, function() {
                fetchLCData(function() {
                    insertPageColumns();
                    setStatus("Ready (" + ids.length + " AAs)");
                });
            });
        } else {
            setStatus("Ready - load report first");
        }
    }

    // Wait for page to fully load
    if (document.readyState === "complete") {
        setTimeout(init, 1500);
    } else {
        window.addEventListener("load", function() { setTimeout(init, 1500); });
    }

})();
