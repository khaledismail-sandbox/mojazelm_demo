/* ============================================================
   Mojaz demo app — shared JS
   Amplitude init (Analytics + Session Replay + Experiment loader
   + Guides & Surveys), persona state, tracking helpers.

   HARD RULES implemented here:
   - autocapture OFF; every event fired explicitly by exact name
   - every event carries platform iOS/Android (never Web) +
     KSA country/city/region via enrichment plugin
   - /preview-checkout/ is event-silent: zero SDK calls
   ============================================================ */

(function () {
  'use strict';

  var AMP_KEY = 'ee599b7fa09aa4b2ec6c88a9013de64e';
  var PAGE = document.body.getAttribute('data-page') || 'home';
  var ROOT = document.body.getAttribute('data-root') || './';
  var SILENT = document.body.getAttribute('data-silent') === 'true';

  /* ---------- localStorage helpers ---------- */
  var LS = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v === null ? (fallback === undefined ? null : fallback) : v;
      } catch (e) { return fallback === undefined ? null : fallback; }
    },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    getJSON: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    setJSON: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- deterministic User ID (per build spec) ---------- */
  function generateUserId(name, demoNumber) {
    var clean = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
    var today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return clean + '_' + demoNumber + '_' + today; // e.g. "joe_1_20260806"
  }

  /* ---------- report catalog ---------- */
  var REPORTS = {
    ITEM_001: { sku: 'ITEM_001', type: 'Standard Report',            price: 64.00  },
    ITEM_002: { sku: 'ITEM_002', type: 'Comprehensive Report',       price: 149.00 },
    ITEM_003: { sku: 'ITEM_003', type: 'Report + Inspection Bundle', price: 279.00 },
    ITEM_042: { sku: 'ITEM_042', type: '5-Report Package',           price: 288.00 },
    ITEM_043: { sku: 'ITEM_043', type: '10-Report Package',          price: 512.00 }
  };
  var VAT_RATE = 0.15;
  function round2(n) { return Math.round(n * 100) / 100; }

  function buildOrder(sku, promo) {
    var item = REPORTS[sku];
    var promoApplied = !!(promo && promo.applied);
    var saving = promoApplied ? round2(item.price * promo.discount_pct) : 0;
    var subtotal = round2(item.price - saving);
    var vat = round2(subtotal * VAT_RATE);
    return {
      sku: item.sku,
      type: item.type,
      price: item.price,               // report_price (list price)
      order_value: subtotal,           // sum of item prices in session
      service_fee: 0.0,
      vat_amount: vat,
      total_payable: round2(subtotal + 0.0 + vat),
      fee_waived: true,
      promo_attempted: !!(promo && promo.attempted),
      promo_applied: promoApplied,
      discount_pct: promoApplied ? promo.discount_pct : 0,
      saving_amount: saving
    };
  }

  /* ---------- deterministic vehicle + VIN from search query ---------- */
  var VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; // no I, O, Q
  var VEHICLES = [
    { make: 'Toyota',    model: 'Camry GLE',   year: 2021, color: 'Pearl White',   wmi: 'JTN', emoji: '🚗', est: 'SAR 84,000 – 92,500' },
    { make: 'Hyundai',   model: 'Sonata Smart', year: 2020, color: 'Titan Gray',   wmi: 'KMH', emoji: '🚘', est: 'SAR 61,000 – 68,000' },
    { make: 'Toyota',    model: 'Hilux GLX',   year: 2019, color: 'Super White',   wmi: 'MR0', emoji: '🛻', est: 'SAR 88,000 – 97,000' },
    { make: 'Nissan',    model: 'Patrol LE',   year: 2022, color: 'Hermosa Blue',  wmi: 'JN8', emoji: '🚙', est: 'SAR 238,000 – 259,000' },
    { make: 'Kia',       model: 'Pegas EX',    year: 2023, color: 'Clear White',   wmi: 'KNA', emoji: '🚗', est: 'SAR 43,500 – 47,900' },
    { make: 'Lexus',     model: 'ES 350',      year: 2021, color: 'Sonic Quartz',  wmi: 'JTH', emoji: '🚘', est: 'SAR 158,000 – 172,000' },
    { make: 'GMC',       model: 'Yukon SLT',   year: 2020, color: 'Onyx Black',    wmi: '1GK', emoji: '🚙', est: 'SAR 189,000 – 205,000' },
    { make: 'Chevrolet', model: 'Tahoe LT',    year: 2021, color: 'Summit White',  wmi: '1GN', emoji: '🚙', est: 'SAR 196,000 – 214,000' }
  ];

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function sanitizeVin(q) {
    var v = q.toUpperCase().replace(/[^A-Z0-9]/g, '')
      .replace(/I/g, '1').replace(/O/g, '0').replace(/Q/g, '9');
    return v.length === 17 ? v : null;
  }

  function vinFor(query) {
    var typed = sanitizeVin(query);
    if (typed) return typed;
    var veh = vehicleFor(query);
    var h = hashStr(query.trim().toUpperCase());
    var vin = veh.wmi;
    for (var i = 0; i < 14; i++) {
      vin += VIN_CHARS[h % VIN_CHARS.length];
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    }
    return vin;
  }

  function vehicleFor(query) {
    return VEHICLES[hashStr(query.trim().toUpperCase()) % VEHICLES.length];
  }

  /* ---------- KSA geo (never Israel, never "(none)") ---------- */
  var KSA_CITIES = {
    'Riyadh':   'Riyadh Province',
    'Jeddah':   'Makkah Province',
    'Dammam':   'Eastern Province',
    'Makkah':   'Makkah Province',
    'Madinah':  'Madinah Province',
    'Khobar':   'Eastern Province',
    'Buraidah': 'Qassim Province',
    'Tabuk':    'Tabuk Province',
    'Abha':     'Asir Province',
    'Hail':     'Hail Province'
  };

  /* ---------- money format ---------- */
  function money(n) { return 'SAR ' + Number(n).toFixed(2); }

  /* ---------- tiny UI helpers (no analytics) ---------- */
  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      (document.querySelector('.phone-inner') || document.body).appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function openSheet(id) {
    var b = document.getElementById(id + '-backdrop');
    var s = document.getElementById(id);
    if (b) b.classList.add('open');
    if (s) s.classList.add('open');
  }
  function closeSheet(id) {
    var b = document.getElementById(id + '-backdrop');
    var s = document.getElementById(id);
    if (b) b.classList.remove('open');
    if (s) s.classList.remove('open');
  }

  /* ---------- persona / state ---------- */
  function persona() { return LS.get('mojaz_persona'); } // 'A' | 'B' | null
  function isPersonaA() { return persona() === 'A'; }
  function userId() { return LS.get('mojaz_user_id'); }

  function nextOrderId() {
    var seq = parseInt(LS.get('mojaz_order_seq', '0'), 10) + 1;
    LS.set('mojaz_order_seq', String(seq));
    var today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return 'ORD_' + today + '_' + String(seq).padStart(3, '0');
  }

  /* ---------- public API scaffold ---------- */
  var Mojaz = {
    LS: LS,
    ROOT: ROOT,
    PAGE: PAGE,
    REPORTS: REPORTS,
    KSA_CITIES: KSA_CITIES,
    generateUserId: generateUserId,
    buildOrder: buildOrder,
    vinFor: vinFor,
    vehicleFor: vehicleFor,
    money: money,
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    persona: persona,
    isPersonaA: isPersonaA,
    userId: userId,
    nextOrderId: nextOrderId,
    go: function (url) { window.location.href = url; }
  };
  window.Mojaz = Mojaz;

  /* ============================================================
     Persona flows — defined BEFORE any SDK early-return so auth,
     ordering and logout keep working even if the Amplitude CDN
     script is blocked (Mojaz.track / flushGo resolve at call time).
     ============================================================ */
  Mojaz.completeAuth = function (mode, name, demoNumber, phone) {
    var isA = mode === 'login'; // login → Persona A (Returning), signup → Persona B (First-Time)
    var uid = generateUserId(name, demoNumber);

    // Switching identity or persona: hard-separate the two demo users —
    // new Amplitude device/session, and no order/garage state leaking across.
    var prevUid = LS.get('mojaz_user_id');
    var prevPersona = LS.get('mojaz_persona');
    if ((prevUid && prevUid !== uid) || (prevPersona && prevPersona !== (isA ? 'A' : 'B'))) {
      try { if (window.amplitude && amplitude.reset) amplitude.reset(); } catch (e) {}
      ['mojaz_order', 'mojaz_orders', 'mojaz_garage', 'mojaz_vin',
       'mojaz_vehicle', 'mojaz_search_query'].forEach(LS.del);
    }

    LS.set('mojaz_persona', isA ? 'A' : 'B');
    LS.set('mojaz_user_id', uid);
    LS.set('mojaz_user_name', name.trim());
    LS.set('mojaz_demo_number', String(demoNumber));
    LS.set('mojaz_phone', phone || '');

    if (window.amplitude && amplitude.setUserId) {
      amplitude.setUserId(uid);
      var id = new amplitude.Identify()
        .set('has_purchased_before', isA)
        .set('buyer_tier', isA ? 'frequent_buyer' : 'first_time_buyer')
        .set('account_age_days', isA ? 180 : 0)
        .set('device_type', 'mobile')
        .set('utm_medium', isA ? 'direct' : 'social')
        .set('utm_source', isA ? 'direct' : 'snapchat')
        .set('utm_campaign', isA ? 'always_on_brand' : 'eid_trade_in_2026')
        .set('attribution_source', 'AppsFlyer');
      amplitude.identify(id);
    }

    Mojaz.track(isA ? 'Logged In' : 'Account Created', {
      auth_method: 'phone_otp',
      has_purchased_before: isA
    });

    var dest = LS.get('mojaz_return_to') || ROOT + 'index.html';
    LS.del('mojaz_return_to');
    Mojaz.flushGo(dest);
  };

  Mojaz.logout = function () {
    try { if (window.amplitude && amplitude.reset) amplitude.reset(); } catch (e) {}
    ['mojaz_persona', 'mojaz_user_id', 'mojaz_user_name', 'mojaz_demo_number',
     'mojaz_phone', 'mojaz_vin', 'mojaz_vehicle', 'mojaz_search_query',
     'mojaz_order', 'mojaz_orders', 'mojaz_garage', 'mojaz_return_to',
     'mojaz_prefill_query', 'mojaz_event_log'].forEach(LS.del);
    Mojaz.go(ROOT + 'auth/index.html');
  };

  /* ---------- order flow ---------- */
  // Fires "Report Order Started" and routes by persona:
  //   Persona A (Returning) → /payment/  — never sees the disclaimer
  //   Persona B (First-Time) → /order/   — ALWAYS gets the pay-blind interstitial
  Mojaz.startReportOrder = function (sku) {
    if (!persona()) {
      LS.set('mojaz_return_to', window.location.pathname.indexOf('/vehicle/') !== -1
        ? '../vehicle/index.html' : ROOT + 'index.html');
      Mojaz.go(ROOT + 'auth/index.html');
      return;
    }
    var vin = LS.get('mojaz_vin');
    if (!vin) {
      toast('Search for your vehicle first');
      setTimeout(function () { Mojaz.go(ROOT + 'search/index.html'); }, 900);
      return;
    }
    var order = buildOrder(sku, null);
    LS.setJSON('mojaz_order', order);
    Mojaz.track('Report Order Started', {
      report_sku: order.sku,
      report_type: order.type,
      report_price: order.price,
      order_value: order.order_value,
      vehicle_vin: vin
    });
    Mojaz.flushGo(isPersonaA() ? ROOT + 'payment/index.html' : ROOT + 'order/index.html');
  };

  /* ============================================================
     EVENT-SILENT EXHIBIT PAGE — /preview-checkout/
     Zero amplitude.track / identify / SDK calls of any kind.
     ============================================================ */
  if (SILENT) {
    Mojaz.track = function () {
      console.info('[mojaz-demo] track suppressed on event-silent page:', arguments[0]);
    };
    Mojaz.trackGo = function () {};
    Mojaz.flushGo = Mojaz.go;
    console.info('[mojaz-demo] ' + PAGE + ' is an event-silent exhibit — no Amplitude SDK calls fire here.');
    return;
  }

  /* ============================================================
     Amplitude wiring (all real app pages)
     ============================================================ */
  var srAdded = false;
  var engagementAdded = false;

  if (!window.amplitude) {
    console.warn('[mojaz-demo] Amplitude loader script not found — tracking disabled this page load.');
    Mojaz.track = function () {};
    Mojaz.trackGo = function (n, p, url) { Mojaz.go(url); };
    Mojaz.flushGo = Mojaz.go;
    Mojaz.sdkStatus = function () {
      return { analytics: false, sessionReplay: false, experiment: false, engagement: false, experimentWhere: null };
    };
    return;
  }

  // Plugins BEFORE init
  if (window.sessionReplay) {
    amplitude.add(window.sessionReplay.plugin({ sampleRate: 1 }));
    srAdded = true;
  }
  if (window.engagement) {
    amplitude.add(window.engagement.plugin());
    engagementAdded = true;
  }

  // Platform override — this phone-frame app simulates the MOBILE app.
  // Every event must carry platform "iOS" or "Android", NEVER "Web".
  amplitude.add({
    name: 'mojaz-context',
    type: 'enrichment',
    execute: async function (event) {
      event.platform = LS.get('mojaz_platform') || 'iOS';
      event.country = 'Saudi Arabia';
      event.city = LS.get('mojaz_city') || 'Riyadh';
      event.region = LS.get('mojaz_region') || 'Riyadh Province';
      return event;
    }
  });

  // Autocapture OFF — every event is sent explicitly by name. Nothing implicit.
  amplitude.init(AMP_KEY, {
    fetchRemoteConfig: true,
    autocapture: false,
    defaultTracking: false
  });

  // Deterministic identity across pages: re-apply the stored User ID.
  var storedUid = userId();
  if (storedUid && amplitude.getUserId && amplitude.getUserId() !== storedUid) {
    amplitude.setUserId(storedUid);
  }

  /* ---------- Experiment SDK presence check (mandatory) ---------- */
  function experimentProbe() {
    var candidates = [
      ['window.experiment', window.experiment],
      ['window.Experiment', window.Experiment],
      ['window.amplitudeExperiment', window.amplitudeExperiment],
      ['amplitude.experiment', window.amplitude && window.amplitude.experiment]
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i][1]) return { ok: true, where: candidates[i][0] };
    }
    return { ok: false, where: null };
  }

  var expStatus = experimentProbe();
  if (expStatus.ok) {
    console.info('[mojaz-demo] Experiment SDK: OK (' + expStatus.where + ')');
  } else {
    // remote-config-driven modules can arrive async — re-probe before declaring missing
    setTimeout(function () {
      expStatus = experimentProbe();
      if (expStatus.ok) {
        console.info('[mojaz-demo] Experiment SDK: OK (' + expStatus.where + ')');
      } else {
        console.warn('[mojaz-demo] Experiment SDK: MISSING — unified loader did not expose an Experiment global.');
      }
    }, 3000);
  }

  Mojaz.sdkStatus = function () {
    var probe = experimentProbe();
    return {
      analytics: !!(window.amplitude && window.amplitude.track),
      sessionReplay: srAdded || !!window.sessionReplay,
      experiment: probe.ok,
      experimentWhere: probe.where,
      engagement: engagementAdded || !!window.engagement
    };
  };

  /* ---------- tracking helpers ---------- */
  function logEvent(name) {
    var log = LS.getJSON('mojaz_event_log', []);
    log.push({ name: name, at: new Date().toISOString() });
    if (log.length > 120) log = log.slice(log.length - 120);
    LS.setJSON('mojaz_event_log', log);
  }

  Mojaz.track = function (name, props, options) {
    try {
      var res = options
        ? amplitude.track(name, props || {}, options)
        : amplitude.track(name, props || {});
      console.info('[mojaz-demo] track: ' + name, props || {}, options || '');
      logEvent(name);
      return res;
    } catch (e) {
      console.warn('[mojaz-demo] track failed: ' + name, e);
      return null;
    }
  };

  // flush queued events, then navigate (multi-page site: don't lose events on unload)
  Mojaz.flushGo = function (url) {
    var done = false;
    var nav = function () { if (!done) { done = true; window.location.href = url; } };
    try {
      var f = amplitude.flush();
      if (f && f.promise && f.promise.then) f.promise.then(nav, nav);
    } catch (e) {}
    setTimeout(nav, 900);
  };

  Mojaz.trackGo = function (name, props, url, options) {
    Mojaz.track(name, props, options);
    Mojaz.flushGo(url);
  };

  /* ---------- statusbar clock (visual only) ---------- */
  var sbTime = document.querySelector('.statusbar .sb-time');
  if (sbTime) sbTime.textContent = '9:41';
})();
