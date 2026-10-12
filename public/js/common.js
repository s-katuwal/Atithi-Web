/* Shared helpers, header and footer for every public page. */
(function () {
  'use strict';

  const LOGOS = {
    lodge: '/images/logo-atithi.jpg',
    garden: '/images/logo-food-garden.jpg',
  };
  const logoFor = (b) => (b && b.has_lodging ? LOGOS.lodge : LOGOS.garden);

  // Static fallback so the header renders instantly; details are refreshed from the API.
  const BRANCHES = [
    { id: 'laxmipur', name: 'Atithi Restro & Lodge', location: 'Laxmipur', has_lodging: 1, has_dining: 1 },
    { id: 'birtamode', name: 'Atithi Restro & Lodge', location: 'Birtamode', has_lodging: 1, has_dining: 1 },
    { id: 'food-garden', name: 'Atithi Food Garden', location: 'Food Garden', has_lodging: 0, has_dining: 1 },
  ];

  // ---------- Icons (inline SVG, stroke = currentColor) ----------
  const P = {
    pin: '<path d="M12 22s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bed: '<path d="M3 18V6M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-8v1"/><circle cx="7" cy="10" r="2"/>',
    dish: '<path d="M3 15h18M5 15a7 7 0 0 1 14 0M12 6V4M2 19h20"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
    car: '<path d="M5 17h14M3 17v-4l2-5h14l2 5v4M7 17v2M17 17v2"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 14 10"/>',
    namaste: '<path d="M12 3c-1 2-2 6-2 9v6M12 3c1 2 2 6 2 9v6M10 18l-3 3M14 18l3 3M9 9 6 14M15 9l3 5"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    party: '<path d="M4 20 9 6l9 9z"/><path d="M14 4v2M18 6l-1.5 1.5M20 10h-2"/>',
    water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
    tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 3 2.5 5 5.5 5"/>',
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 3.5 6 3.5 9s-1 6-3.5 9c-2.5-3-3.5-6-3.5-9s1-6 3.5-9z"/>',
    whatsapp: '<path d="M3 21l1.6-4.8A9 9 0 1 1 8 19.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.5-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z"/>',
  };
  function icon(name, size = 20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }
  function facilityIcon(text) {
    const t = text.toLowerCase();
    if (t.includes('wi-fi') || t.includes('wifi')) return 'wifi';
    if (t.includes('park')) return 'car';
    if (t.includes('water')) return 'water';
    if (t.includes('cctv') || t.includes('secur')) return 'shield';
    if (t.includes('garden')) return 'leaf';
    if (t.includes('party') || t.includes('event')) return 'party';
    if (t.includes('restaurant') || t.includes('room service')) return 'dish';
    if (t.includes('family') || t.includes('kids')) return 'users';
    if (t.includes('24')) return 'clock';
    return 'check';
  }

  // ---------- Utilities ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

  function todayStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addDays(s, n) {
    const d = new Date(s + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
    if (!s) return '';
    return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', opts);
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  async function api(path, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Cannot reach the server. Please check your internet connection.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let branchPromise, sitePromise;
  const getBranches = () => (branchPromise ||= api('/branches').catch(() => BRANCHES));
  const getSite = () => (sitePromise ||= api('/site').catch(() => ({})));

  // ---------- Content from Admin → Website content ----------
  /** One item per line, parts separated by " | ". */
  const lines = (v, parts) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const p = l.split('|').map((x) => x.trim()); while (p.length < parts) p.push(''); return p; });
  /** Fill in [data-c] text, [data-c-src] images and hide [data-show="key"] sections switched off. */
  function applyContent(site, root = document) {
    $$('[data-c]', root).forEach((el) => { const v = site[el.dataset.c]; if (v != null && v !== '') el.textContent = v; });
    $$('[data-c-src]', root).forEach((el) => { const v = site[el.dataset.cSrc]; if (v) el.src = v; });
    $$('[data-show]', root).forEach((el) => { if (site[el.dataset.show] === '0') el.hidden = true; });
  }
  function applyTheme(site) {
    const r = document.documentElement.style;
    if (site.color_primary && site.color_primary.toLowerCase() !== '#1774bc') { r.setProperty('--blue', site.color_primary); r.setProperty('--blue-700', site.color_primary); }
    if (site.color_accent && site.color_accent.toLowerCase() !== '#f5a11c') { r.setProperty('--saffron', site.color_accent); r.setProperty('--saffron-600', site.color_accent); }
  }
  const SOCIAL = [['social_facebook', 'facebook', 'Facebook'], ['social_instagram', 'instagram', 'Instagram'], ['social_tiktok', 'tiktok', 'TikTok'], ['social_youtube', 'youtube', 'YouTube']];

  function toast(msg, type = '') {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spin"></span> ${label || 'Please wait…'}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const waHref = (n, text = '') => `https://wa.me/${String(n).replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`;

  /** Decorative room illustration used when a room has no photo. */
  function roomArt(room, i = 0) {
    if (room.image_url) return `<img src="${esc(room.image_url)}" alt="${esc(room.name)}" loading="lazy">`;
    const palettes = [['#1774BC', '#0B3A63'], ['#F5A11C', '#C9790A'], ['#0F5A96', '#1774BC'], ['#E08B05', '#0B3A63']];
    const [a, b] = palettes[i % palettes.length];
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(room.name)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="320" height="170" fill="url(#${id})"/>
      <path d="M40 70 160 18 280 70" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="8" stroke-linecap="round"/>
      <rect x="236" y="56" width="40" height="34" rx="3" fill="rgba(255,255,255,.18)"/>
      <path d="M256 56v34M236 73h40" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
      <rect x="70" y="92" width="180" height="40" rx="8" fill="rgba(255,255,255,.92)"/>
      <rect x="70" y="80" width="14" height="66" rx="4" fill="#fff"/>
      <rect x="236" y="100" width="14" height="46" rx="4" fill="#fff"/>
      <rect x="90" y="80" width="46" height="18" rx="9" fill="${a}" opacity=".35"/>
      ${room.capacity > 1 ? `<rect x="142" y="80" width="46" height="18" rx="9" fill="${a}" opacity=".35"/>` : ''}
      <rect x="150" y="100" width="100" height="32" rx="6" fill="${b}" opacity=".25"/>
      <rect x="0" y="146" width="320" height="24" fill="rgba(0,0,0,.12)"/>
    </svg>`;
  }

  // ---------- Maps ----------
  const hasPin = (b) => b && b.lat != null && b.lng != null;
  /** Google Maps embed: exact pin when the branch has coordinates, otherwise a search for its address. */
  const mapSrc = (b) => `https://maps.google.com/maps?q=${hasPin(b) ? `${b.lat},${b.lng}` : encodeURIComponent(b.map_query || b.address || b.name)}&z=${hasPin(b) ? 17 : 14}&output=embed`;
  const directionsHref = (b) => `https://www.google.com/maps/dir/?api=1&destination=${hasPin(b) ? `${b.lat},${b.lng}` : encodeURIComponent(b.map_query || b.address)}`;
  const mapsHref = (b) => `https://www.google.com/maps/search/?api=1&query=${hasPin(b) ? `${b.lat},${b.lng}` : encodeURIComponent(b.map_query || b.address)}`;

  /** Offer cards for the home and branch pages. */
  const offerCards = (offers) => offers.map((o) => `<article class="card offer-card">
      ${o.image_url ? `<div class="offer-img"><img src="${esc(o.image_url)}" alt="${esc(o.title)}" loading="lazy"></div>` : ''}
      <div class="offer-body">
        ${o.badge ? `<span class="offer-badge">${esc(o.badge)}</span>` : ''}
        <h4>${esc(o.title)}</h4>
        ${o.description ? `<p>${esc(o.description)}</p>` : ''}
        <div class="offer-meta">${icon('pin', 14)} ${o.branch_id ? `${esc(o.branch_name)} — ${esc(o.branch_location)}` : 'All branches'}
          ${o.valid_until ? ` · Until ${fmtDate(o.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</div>
        <a class="btn btn-accent btn-sm" href="/book${o.branch_id ? `?branch=${encodeURIComponent(o.branch_id)}` : ''}">Book now</a>
      </div></article>`).join('');

  // ---------- Header ----------
  function renderHeader(active) {
    const el = $('#site-header');
    if (!el) return;
    const item = (b) => `<a href="/branches/${b.id}"><img src="${logoFor(b)}" alt="">
      <span><strong>${esc(b.name)}</strong><small>${esc(b.location)} · ${b.has_lodging ? 'Lodging & Dining' : 'Dining & Events'}</small></span></a>`;
    el.innerHTML = `
      <div class="topbar"><div class="container">
        <span><span class="motto" lang="ne" data-c="topbar_motto">अतिथि देवो भवः</span> <span class="hide-sm" data-c="topbar_motto_en">— A guest is like God</span></span>
        <span class="hide-sm" data-c="topbar_middle">Laxmipur · Birtamode · Food Garden</span>
        <a href="/track">Manage my booking</a>
      </div></div>
      <header class="site-header"><div class="container nav">
        <a class="brand" href="/"><img src="${LOGOS.lodge}" data-c-src="site_logo" alt="Atithi logo">
          <span><strong data-c="site_name">Atithi</strong><small data-c="site_tagline">Restro · Lodge · Food Garden</small></span></a>
        <button class="nav-toggle" aria-label="Open menu" aria-expanded="false">${icon('menu', 28)}</button>
        <nav class="nav-links" aria-label="Main">
          <a href="/" class="${active === 'home' ? 'active' : ''}">Home</a>
          <a href="/about" class="${active === 'about' ? 'active' : ''}" data-show="show_about">About</a>
          <div class="nav-drop">
            <button type="button" aria-haspopup="true" class="${active === 'locations' ? 'active' : ''}">Our Branches ${icon('down', 16)}</button>
            <div class="nav-drop-menu"><div id="nav-branches">${BRANCHES.map(item).join('')}</div>
              <a href="/locations" class="nav-drop-all" data-show="show_locations">${icon('pin', 18)} <span><strong>Locations &amp; maps</strong><small>Directions to every branch</small></span></a></div>
          </div>
          <a href="/book?type=room" class="${active === 'room' ? 'active' : ''}">Book a Stay</a>
          <a href="/book?type=table" class="${active === 'table' ? 'active' : ''}">Reserve a Table</a>
          <a href="/gallery" class="${active === 'gallery' ? 'active' : ''}" data-show="show_gallery">Gallery</a>
          <a href="/careers" class="${active === 'careers' ? 'active' : ''}" data-show="show_careers">Careers</a>
          <a href="/#contact">Contact</a>
          <a href="/book" class="btn btn-accent">${icon('calendar', 18)} <span data-c="book_btn">Book Now</span></a>
        </nav>
      </div></header>`;
    const toggle = $('.nav-toggle', el), links = $('.nav-links', el);
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
      toggle.innerHTML = icon(open ? 'close' : 'menu', 28);
    });
    links.addEventListener('click', (e) => { if (e.target.closest('a')) { links.classList.remove('open'); toggle.innerHTML = icon('menu', 28); } });
    // "Our Branches" menu: opens on hover or click, and waits a moment before closing so it is easy to reach.
    const drop = $('.nav-drop', el), dropBtn = $('.nav-drop > button', el);
    let closeTimer;
    const openDrop = () => { clearTimeout(closeTimer); drop.classList.add('open'); dropBtn.setAttribute('aria-expanded', 'true'); };
    const closeDrop = () => { drop.classList.remove('open'); dropBtn.setAttribute('aria-expanded', 'false'); };
    drop.addEventListener('mouseenter', openDrop);
    drop.addEventListener('mouseleave', () => { closeTimer = setTimeout(closeDrop, 400); });
    dropBtn.addEventListener('click', () => (drop.classList.contains('open') ? closeDrop() : openDrop()));
    document.addEventListener('click', (e) => { if (!drop.contains(e.target)) closeDrop(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrop(); dropBtn.focus(); } });
    drop.addEventListener('focusout', (e) => { if (!drop.contains(e.relatedTarget)) closeTimer = setTimeout(closeDrop, 150); });
    dropBtn.addEventListener('focus', openDrop);
    getBranches().then((bs) => { $('#nav-branches').innerHTML = bs.map(item).join(''); });
    getSite().then((s) => {
      applyTheme(s);
      applyContent(s, el);
      if (s.announcement) el.insertAdjacentHTML('afterbegin', `<div class="announce">${icon('tag', 16)} ${esc(s.announcement)}</div>`);
    });
  }

  // ---------- Footer ----------
  function renderFooter() {
    const el = $('#site-footer');
    if (!el) return;
    const year = new Date().getFullYear();
    const col = (b) => `<div><h5>${esc(b.name)} — ${esc(b.location)}</h5><ul>
        ${b.address ? `<li>${esc(b.address)}</li>` : ''}
        ${b.phone ? `<li><a href="${telHref(b.phone)}">${esc(b.phone)}</a></li>` : ''}
        ${b.email ? `<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : ''}
        <li><a href="${directionsHref(b)}" target="_blank" rel="noopener">Get directions ↗</a></li>
        <li><a href="/branches/${b.id}">View branch →</a></li></ul></div>`;
    const draw = (bs, site = {}) => {
      const social = SOCIAL.filter(([k]) => site[k]).map(([k, ic, label]) =>
        `<a href="${esc(site[k])}" target="_blank" rel="noopener" aria-label="${label}">${icon(ic, 20)}</a>`).join('');
      el.innerHTML = `<footer class="site-footer">
        <div class="container footer-grid">
          <div class="footer-brand">
            <img src="${LOGOS.lodge}" data-c-src="site_logo" alt="Atithi logo">
            <div class="ne" lang="ne" data-c="topbar_motto">अतिथि देवो भवः</div>
            <p data-c="footer_about">A guest is like God. Since 2078 B.S. we have welcomed every guest with warm rooms, honest food and heartfelt Nepali hospitality.</p>
            ${social ? `<div class="social">${social}</div>` : ''}
            <a class="btn btn-accent btn-sm" href="/book">Book online</a>
          </div>
          ${bs.map(col).join('')}
        </div>
        <div class="container footer-bottom">
          <span>© ${year} <span data-c="footer_copyright">Atithi Restro & Lodge · Atithi Food Garden</span>. All rights reserved.</span>
          <span><a href="/about" data-show="show_about">About us</a> · <a href="/track">Manage booking</a> · <a href="/gallery" data-show="show_gallery">Gallery</a> · <a href="/careers" data-show="show_careers">Careers</a> · <a href="/locations" data-show="show_locations">Locations</a> · <a href="/admin">Staff login</a></span>
        </div>
        <div class="footer-stripe"></div>
      </footer>`;
      applyContent(site, el);
    };
    draw(BRANCHES);
    Promise.all([getBranches(), getSite()]).then(([bs, site]) => {
      draw(bs, site);
      const wa = bs.find((b) => b.whatsapp);
      if (wa && !$('.wa-float')) {
        document.body.insertAdjacentHTML('beforeend',
          `<a class="wa-float" href="${waHref(wa.whatsapp, 'Namaste! I would like to ask about Atithi.')}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${icon('whatsapp', 28)}</a>`);
      }
    });
  }

  /** Full-screen photo viewer used by the gallery. */
  function lightbox(items, start) {
    let i = start;
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Photo viewer');
    const draw = () => {
      const it = items[i];
      box.innerHTML = `<button class="lb-close" aria-label="Close">${icon('close', 28)}</button>
        ${items.length > 1 ? `<button class="lb-prev" aria-label="Previous photo">‹</button><button class="lb-next" aria-label="Next photo">›</button>` : ''}
        <figure><img src="${esc(it.image_url)}" alt="${esc(it.caption || 'Photo')}">
        ${it.caption || it.branch_location ? `<figcaption>${esc(it.caption)}${it.branch_location ? ` <small>${esc(it.branch_location)}</small>` : ''}</figcaption>` : ''}</figure>`;
    };
    const close = () => { box.remove(); document.removeEventListener('keydown', key); };
    const go = (d) => { i = (i + d + items.length) % items.length; draw(); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    box.addEventListener('click', (e) => {
      if (e.target.closest('.lb-prev')) return go(-1);
      if (e.target.closest('.lb-next')) return go(1);
      if (e.target.closest('.lb-close') || e.target === box) close();
    });
    document.addEventListener('keydown', key);
    draw();
    document.body.appendChild(box);
  }

  window.Atithi = {
    LOGOS, BRANCHES, logoFor, icon, facilityIcon, esc, rs, $, $$, list, todayStr, addDays, fmtDate, fmtTime,
    api, getBranches, getSite, applyContent, lines, lightbox, offerCards, hasPin, mapSrc, directionsHref, mapsHref, toast, setBusy, telHref, waHref, roomArt, renderHeader, renderFooter,
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader(document.body.dataset.page);
    renderFooter();
    getSite().then((site) => applyContent(site)); // any [data-c] on the page itself
  });
})();
