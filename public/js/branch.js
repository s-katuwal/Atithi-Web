(function () {
  'use strict';
  const { $, $$, esc, rs, icon, list, api, logoFor, roomArt, facilityIcon, fmtTime, telHref, waHref, offerCards } = window.Atithi;

  const id = location.pathname.split('/branches/')[1]?.replace(/\/$/, '') || new URLSearchParams(location.search).get('id') || '';

  document.addEventListener('DOMContentLoaded', async () => {
    let b;
    try {
      b = await api('/branches/' + encodeURIComponent(id));
    } catch {
      $('#branchHero').innerHTML = '<div><h1>Branch not found</h1><p><a href="/#branches">See all branches</a></p></div>';
      $('#branchSide').hidden = true;
      return;
    }
    const garden = !b.has_lodging;
    if (garden) document.body.classList.add('theme-garden');
    document.title = `${b.name} — ${b.location} | Atithi`;

    $('#branchHero').innerHTML = `
      <img class="logo" src="${logoFor(b)}" alt="${esc(b.name)} logo">
      <div style="flex:1">
        <div class="eyebrow left">${esc(b.location)}</div>
        <h1>${esc(b.name)}</h1>
        <p>${esc(b.tagline)}</p>
        <div class="chips mt-2 mb-0">
          ${b.has_lodging ? `<span class="chip">${icon('bed', 14)} Lodging</span>` : ''}
          ${b.has_dining ? `<span class="chip accent">${icon('dish', 14)} Dining</span>` : ''}
          ${garden ? `<span class="chip green">${icon('party', 14)} Parties &amp; events</span>` : ''}
        </div>
      </div>
      <div class="card-actions no-print">
        ${b.has_lodging ? `<a class="btn btn-accent" href="/book?type=room&branch=${b.id}">Book a room</a>` : ''}
        <a class="btn ${b.has_lodging ? 'btn-outline' : 'btn-accent'}" href="/book?type=table&branch=${b.id}">Reserve a table</a>
      </div>`;

    // ---- Main column
    const facilities = list(b.facilities);
    const categories = [...new Set(b.menu.map((m) => m.category))];
    $('#branchMain').innerHTML = `
      <section class="branch-section">
        <h2 class="block-title">About this branch</h2>
        <p>${esc(b.description)}</p>
        ${facilities.length ? `<div class="facility-list mt-2">${facilities.map((f) => `<div>${icon(facilityIcon(f), 20)} ${esc(f)}</div>`).join('')}</div>` : ''}
      </section>

      ${b.offers.length ? `<section class="branch-section" id="offers">
        <h2 class="block-title">Special offers</h2>
        <div class="offer-grid">${offerCards(b.offers)}</div>
      </section>` : ''}

      ${b.has_lodging ? `<section class="branch-section" id="rooms">
        <h2 class="block-title">Rooms &amp; rates</h2>
        <div class="room-grid">${b.rooms.map((r, i) => `<article class="card room-card">
          <div class="room-art" data-room="${r.id}">${roomArt(r, i)}<span class="price-tag">${rs(r.price)} <small>/ night</small></span></div>
          ${r.photos.length > 1 ? `<div class="room-thumbs" data-room="${r.id}">${r.photos.map((p, k) => `<button type="button" class="${k ? '' : 'active'}" data-src="${esc(p)}" aria-label="Photo ${k + 1}"><img src="${esc(p)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
          <div class="room-body">
            <h4>${esc(r.name)}</h4>
            <div class="room-meta"><span>${icon('users', 15)} Up to ${r.capacity}</span>${r.beds ? `<span>${icon('bed', 15)} ${esc(r.beds)}</span>` : ''}</div>
            <p>${esc(r.description)}</p>
            <div class="amenities">${list(r.amenities).map((a) => `<span>${esc(a)}</span>`).join('')}</div>
            <a class="btn btn-primary btn-sm btn-block" href="/book?type=room&branch=${b.id}&room=${r.id}">Check availability</a>
          </div></article>`).join('') || '<p class="muted">Room details coming soon.</p>'}
        </div>
      </section>` : ''}

      ${garden ? `<section class="branch-section">
        <h2 class="block-title">Parties &amp; celebrations</h2>
        <div class="grid-3">
          ${[['party', 'Birthdays', 'Decorated garden tables, cake cutting and set menus for every age.'],
             ['users', 'Family & reunions', 'Large tables for big families, with veg and non-veg options.'],
             ['star', 'Office & groups', 'Team lunches and evening gatherings with sekuwa and drinks.']]
            .map(([i, t, d]) => `<div class="card card-pad"><div style="color:var(--gold)">${icon(i, 28)}</div><h4 class="mt-2" style="color:var(--green)">${t}</h4><p class="muted mb-0" style="font-size:.9rem">${d}</p></div>`).join('')}
        </div>
        <p class="mt-2"><a class="btn btn-accent" href="/book?type=table&branch=${b.id}&occasion=Birthday">Book a party or event</a></p>
      </section>` : ''}

      ${b.menu.length ? `<section class="branch-section" id="menu">
        <h2 class="block-title">Menu</h2>
        <div class="menu-tabs" id="menuTabs">
          <button type="button" class="active" data-cat="">All</button>
          ${categories.map((c) => `<button type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <div class="menu-grid" id="menuGrid"></div>
        <p class="muted mt-2" style="font-size:.82rem">
          <span class="menu-item" style="display:inline-flex;padding:0;border:0;gap:6px"><span class="vg veg"></span> Veg</span> &nbsp;
          <span class="menu-item" style="display:inline-flex;padding:0;border:0;gap:6px"><span class="vg"></span> Non-veg</span> &nbsp;·&nbsp;
          Prices in Nepali Rupees and may change without notice.</p>
      </section>` : ''}

      <section class="branch-section">
        <h2 class="block-title">Location</h2>
        <iframe class="map-frame" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${esc(b.name)} ${esc(b.location)}"
          src="https://www.google.com/maps?q=${encodeURIComponent(b.map_query || b.address)}&output=embed"></iframe>
      </section>`;

    // Room photo thumbnails swap the main picture
    $('#branchMain').addEventListener('click', (e) => {
      const t = e.target.closest('.room-thumbs button');
      if (!t) return;
      const box = t.parentElement;
      $(`.room-art[data-room="${box.dataset.room}"] img`).src = t.dataset.src;
      $$('button', box).forEach((x) => x.classList.toggle('active', x === t));
    });

    const drawMenu = (cat) => {
      $('#menuGrid').innerHTML = b.menu.filter((m) => !cat || m.category === cat).map((m) => `
        <div class="menu-item"><span class="vg ${m.veg ? 'veg' : ''}" title="${m.veg ? 'Veg' : 'Non-veg'}"></span>
          <div class="mi-main"><h5><span>${esc(m.name)} ${m.popular ? '<span class="badge-pop">Popular</span>' : ''}</span><span class="dots"></span><span class="price">${rs(m.price)}</span></h5>
          ${m.description ? `<p>${esc(m.description)}</p>` : ''}</div></div>`).join('');
      $$('#menuTabs button').forEach((x) => x.classList.toggle('active', x.dataset.cat === cat));
    };
    if (b.menu.length) {
      drawMenu('');
      $('#menuTabs').addEventListener('click', (e) => { const t = e.target.closest('button'); if (t) drawMenu(t.dataset.cat); });
    }

    // ---- Sidebar
    $('#branchSide').innerHTML = `
      <h3 style="color:var(--blue-900)">Visit us</h3>
      <ul class="info-list">
        <li>${icon('pin')}<div><strong>Address</strong>${esc(b.address)}</div></li>
        ${b.phone ? `<li>${icon('phone')}<div><strong>Phone</strong><a href="${telHref(b.phone)}">${esc(b.phone)}</a></div></li>` : ''}
        ${b.email ? `<li>${icon('mail')}<div><strong>Email</strong><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></div></li>` : ''}
        ${b.has_dining ? `<li>${icon('clock')}<div><strong>Restaurant hours</strong>${fmtTime(b.open_time)} – ${fmtTime(b.close_time)}</div></li>` : ''}
        ${b.has_lodging ? `<li>${icon('calendar')}<div><strong>Check-in / Check-out</strong>From ${fmtTime(b.checkin_time)} · Until ${fmtTime(b.checkout_time)}</div></li>` : ''}      </ul>
      <div style="display:grid;gap:10px">
        ${b.has_lodging ? `<a class="btn btn-accent btn-block" href="/book?type=room&branch=${b.id}">${icon('bed', 18)} Book a room</a>` : ''}
        <a class="btn btn-primary btn-block" href="/book?type=table&branch=${b.id}">${icon('dish', 18)} Reserve a table</a>
        ${b.whatsapp ? `<a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${waHref(b.whatsapp, `Namaste! I have a question about ${b.name}, ${b.location}.`)}">${icon('whatsapp', 18)} WhatsApp us</a>` : ''}
      </div>
      <p class="pay-note">No advance payment needed. Pay at the branch by cash, eSewa, Khalti or Fonepay.</p>`;
  });
})();
