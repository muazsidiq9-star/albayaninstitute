/* ============================================================
   country-picker.js
   Turns any <select data-country-picker> into a button that opens
   a searchable country modal (all countries worldwide).

   - The original <select> stays in the form (hidden), so form
     validation, FormData and "change" listeners keep working.
   - The saved value is always the English country name.
   - Labels show in Arabic automatically when localStorage "lang" = "ar".
   Load this script AFTER the <select> in the page.
============================================================ */
(function () {
  "use strict";

  // CODE:English name  (names match the pricing logic in register.js)
  var DATA =
    "DZ:Algeria|AO:Angola|BJ:Benin|BW:Botswana|BF:Burkina Faso|BI:Burundi|CV:Cabo Verde|CM:Cameroon|" +
    "CF:Central African Republic|TD:Chad|KM:Comoros|CD:Democratic Republic of the Congo|" +
    "CG:Republic of the Congo|DJ:Djibouti|EG:Egypt|GQ:Equatorial Guinea|ER:Eritrea|SZ:Eswatini|" +
    "ET:Ethiopia|GA:Gabon|GM:Gambia|GH:Ghana|GN:Guinea|GW:Guinea-Bissau|CI:Ivory Coast|KE:Kenya|" +
    "LS:Lesotho|LR:Liberia|LY:Libya|MG:Madagascar|MW:Malawi|ML:Mali|MR:Mauritania|MU:Mauritius|" +
    "MA:Morocco|MZ:Mozambique|NA:Namibia|NE:Niger|NG:Nigeria|RW:Rwanda|ST:Sao Tome and Principe|" +
    "SN:Senegal|SC:Seychelles|SL:Sierra Leone|SO:Somalia|ZA:South Africa|SS:South Sudan|SD:Sudan|" +
    "TZ:Tanzania|TG:Togo|TN:Tunisia|UG:Uganda|ZM:Zambia|ZW:Zimbabwe|" +
    "AF:Afghanistan|AL:Albania|AD:Andorra|AG:Antigua and Barbuda|AR:Argentina|AM:Armenia|AU:Australia|" +
    "AT:Austria|AZ:Azerbaijan|BS:Bahamas|BH:Bahrain|BD:Bangladesh|BB:Barbados|BY:Belarus|BE:Belgium|" +
    "BZ:Belize|BT:Bhutan|BO:Bolivia|BA:Bosnia and Herzegovina|BR:Brazil|BN:Brunei|BG:Bulgaria|" +
    "KH:Cambodia|CA:Canada|CL:Chile|CN:China|CO:Colombia|CR:Costa Rica|HR:Croatia|CU:Cuba|CY:Cyprus|" +
    "CZ:Czech Republic|DK:Denmark|DM:Dominica|DO:Dominican Republic|EC:Ecuador|SV:El Salvador|" +
    "EE:Estonia|FJ:Fiji|FI:Finland|FR:France|GE:Georgia|DE:Germany|GR:Greece|GD:Grenada|GT:Guatemala|" +
    "GY:Guyana|HT:Haiti|HN:Honduras|HK:Hong Kong|HU:Hungary|IS:Iceland|IN:India|ID:Indonesia|IR:Iran|" +
    "IQ:Iraq|IE:Ireland|IL:Israel|IT:Italy|JM:Jamaica|JP:Japan|JO:Jordan|KZ:Kazakhstan|KI:Kiribati|" +
    "XK:Kosovo|KW:Kuwait|KG:Kyrgyzstan|LA:Laos|LV:Latvia|LB:Lebanon|LI:Liechtenstein|LT:Lithuania|" +
    "LU:Luxembourg|MY:Malaysia|MV:Maldives|MT:Malta|MH:Marshall Islands|MX:Mexico|FM:Micronesia|" +
    "MD:Moldova|MC:Monaco|MN:Mongolia|ME:Montenegro|MM:Myanmar|NR:Nauru|NP:Nepal|NL:Netherlands|" +
    "NZ:New Zealand|NI:Nicaragua|KP:North Korea|MK:North Macedonia|NO:Norway|OM:Oman|PK:Pakistan|" +
    "PW:Palau|PS:Palestine|PA:Panama|PG:Papua New Guinea|PY:Paraguay|PE:Peru|PH:Philippines|PL:Poland|" +
    "PT:Portugal|QA:Qatar|RO:Romania|RU:Russia|KN:Saint Kitts and Nevis|LC:Saint Lucia|" +
    "VC:Saint Vincent and the Grenadines|WS:Samoa|SM:San Marino|SA:Saudi Arabia|RS:Serbia|" +
    "SG:Singapore|SK:Slovakia|SI:Slovenia|SB:Solomon Islands|KR:South Korea|ES:Spain|LK:Sri Lanka|" +
    "SR:Suriname|SE:Sweden|CH:Switzerland|SY:Syria|TW:Taiwan|TJ:Tajikistan|TH:Thailand|TL:Timor-Leste|" +
    "TO:Tonga|TT:Trinidad and Tobago|TR:Turkey|TM:Turkmenistan|TV:Tuvalu|UA:Ukraine|" +
    "AE:United Arab Emirates|GB:United Kingdom|US:United States|UY:Uruguay|UZ:Uzbekistan|VU:Vanuatu|" +
    "VA:Vatican City|VE:Venezuela|VN:Vietnam|YE:Yemen";

  var POPULAR = ["NG", "GH", "SL"];

  // Extra search words (other common names / abbreviations)
  var ALIASES = {
    CI: "cote d'ivoire", SZ: "swaziland", CV: "cape verde", MM: "burma", CZ: "czechia",
    TR: "turkiye", GB: "uk britain england great britain", US: "usa america",
    AE: "uae emirates", CD: "drc dr congo kinshasa", CG: "congo brazzaville", ST: "sao tome",
    MK: "macedonia", KR: "korea", KP: "korea", PS: "gaza", TL: "east timor", VA: "holy see",
    NL: "holland", RU: "russian federation", LA: "lao", IR: "persia", BN: "brunei darussalam",
    GM: "the gambia", BS: "the bahamas"
  };

  var UI = {
    en: { title: "Select Country", search: "Search country...", none: "No country found",
          popular: "Popular", all: "All countries", select: "Select", close: "Close" },
    ar: { title: "اختر الدولة", search: "ابحث عن دولتك...", none: "لم يتم العثور على دولة",
          popular: "الأكثر شيوعًا", all: "جميع الدول", select: "اختر", close: "إغلاق" }
  };

  var COUNTRIES = DATA.split("|").map(function (p) {
    var i = p.indexOf(":");
    return { code: p.slice(0, i), name: p.slice(i + 1) };
  });
  var BY_NAME = {};
  COUNTRIES.forEach(function (c) { BY_NAME[c.name] = c; });

  function lang() {
    try { return localStorage.getItem("lang") === "ar" ? "ar" : "en"; } catch (e) { return "en"; }
  }
  function ui(key) { return UI[lang()][key]; }

  var arNames = null;
  function localName(c) {
    if (lang() !== "ar") return c.name;
    try {
      if (!arNames) arNames = new Intl.DisplayNames(["ar"], { type: "region" });
      var n = arNames.of(c.code);
      return n && n !== c.code ? n : c.name;
    } catch (e) { return c.name; }
  }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  // ───────── Modal (built once, shared by every picker on the page) ─────────
  var overlay, titleEl, closeBtn, searchEl, listEl, emptyEl, active = null;

  function buildModal() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "cp-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cp-modal" role="dialog" aria-modal="true">' +
        '<div class="cp-head">' +
          '<h3 class="cp-title"></h3>' +
          '<button type="button" class="cp-close"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="cp-search-wrap">' +
          '<input type="search" class="cp-search" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '</div>' +
        '<ul class="cp-list" role="listbox"></ul>' +
        '<div class="cp-empty" hidden></div>' +
      '</div>';
    document.body.appendChild(overlay);

    titleEl  = overlay.querySelector(".cp-title");
    closeBtn = overlay.querySelector(".cp-close");
    searchEl = overlay.querySelector(".cp-search");
    listEl   = overlay.querySelector(".cp-list");
    emptyEl  = overlay.querySelector(".cp-empty");

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && active) close();
    });
    searchEl.addEventListener("input", function () { renderList(searchEl.value); });
    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".cp-item");
      if (btn) pick(btn.getAttribute("data-name"));
    });
  }

  function renderList(query) {
    var q = norm(query);
    var l = lang();
    var items = COUNTRIES.map(function (c) { return { c: c, label: localName(c) }; });
    items.sort(function (a, b) { return a.label.localeCompare(b.label, l); });

    var matches = items.filter(function (it) {
      return !q || norm(it.label).indexOf(q) > -1 || norm(it.c.name).indexOf(q) > -1 ||
        norm(ALIASES[it.c.code]).indexOf(q) > -1;
    });

    listEl.innerHTML = "";
    emptyEl.hidden = matches.length > 0;
    emptyEl.textContent = ui("none");
    if (!matches.length) return;

    var current = active ? active.select.value : "";

    function heading(text) {
      var li = document.createElement("li");
      li.className = "cp-heading";
      li.textContent = text;
      listEl.appendChild(li);
    }
    function addItem(it) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cp-item" + (it.c.name === current ? " selected" : "");
      b.setAttribute("data-name", it.c.name);
      var span = document.createElement("span");
      span.textContent = it.label;
      b.appendChild(span);
      if (it.c.name === current) {
        li.setAttribute("aria-selected", "true");
        b.insertAdjacentHTML("beforeend", '<i class="fa-solid fa-check"></i>');
      }
      li.appendChild(b);
      listEl.appendChild(li);
    }

    if (!q) {
      var popular = POPULAR.map(function (code) {
        return matches.filter(function (m) { return m.c.code === code; })[0];
      }).filter(Boolean);
      var rest = matches.filter(function (m) { return POPULAR.indexOf(m.c.code) < 0; });
      heading(ui("popular"));
      popular.forEach(addItem);
      heading(ui("all"));
      rest.forEach(addItem);
    } else {
      matches.forEach(addItem);
    }
  }

  function open(select, btn) {
    buildModal();
    active = { select: select, btn: btn };
    titleEl.textContent = ui("title");
    closeBtn.setAttribute("aria-label", ui("close"));
    searchEl.placeholder = ui("search");
    searchEl.value = "";
    renderList("");
    overlay.hidden = false;
    document.body.classList.add("cp-open");

    var sel = listEl.querySelector(".cp-item.selected");
    if (sel) sel.scrollIntoView({ block: "center" });
    setTimeout(function () { try { searchEl.focus({ preventScroll: true }); } catch (e) { searchEl.focus(); } }, 40);
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("cp-open");
    var btn = active && active.btn;
    active = null;
    if (btn) btn.focus();
  }

  function pick(name) {
    if (!active) return;
    var select = active.select;
    select.value = name;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  // ───────── Enhance one <select> ─────────
  var syncers = [];

  function enhance(select) {
    if (select.getAttribute("data-cp-ready")) return;
    select.setAttribute("data-cp-ready", "1");

    // Rebuild the options from the worldwide list (value = English name)
    var previous = select.value;
    select.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = ui("select");
    select.appendChild(blank);
    COUNTRIES.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "en"); })
      .forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.name;
        o.textContent = c.name;
        select.appendChild(o);
      });
    if (previous && BY_NAME[previous]) select.value = previous;

    // Wrapper + visible button
    var wrap = document.createElement("div");
    wrap.className = "cp-wrap";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("cp-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cp-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.innerHTML = '<span class="cp-label"></span><i class="fa-solid fa-chevron-down"></i>';
    wrap.insertBefore(btn, select);
    var labelEl = btn.querySelector(".cp-label");

    function sync() {
      var v = select.value;
      if (!v) {
        labelEl.textContent = ui("select");
        btn.classList.add("placeholder");
      } else {
        labelEl.textContent = BY_NAME[v] ? localName(BY_NAME[v]) : v;
        btn.classList.remove("placeholder");
      }
    }
    syncers.push(sync);

    btn.addEventListener("click", function () { open(select, btn); });
    // <label for="country"> click or validation focus -> land on the visible button
    select.addEventListener("focus", function () { btn.focus(); });
    select.addEventListener("change", sync);
    if (select.form) select.form.addEventListener("reset", function () { setTimeout(sync, 0); });
    sync();
  }

  // Refresh labels when the page language switches
  try {
    new MutationObserver(function () { syncers.forEach(function (fn) { fn(); }); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["lang", "dir"] });
  } catch (e) { /* older browser: labels refresh on next selection */ }

  Array.prototype.forEach.call(document.querySelectorAll("select[data-country-picker]"), enhance);
})();