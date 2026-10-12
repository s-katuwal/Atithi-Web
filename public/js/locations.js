(function () {
  'use strict';
  const { $, esc, icon, getBranches, logoFor, fmtTime, telHref, waHref, hasPin, mapSrc, directionsHref, mapsHref } = window.Atithi;

  document.addEventListener('DOMContentLoaded', async () => {
    const branches = await getBranches();
    $('#locations').innerHTML = branches.map((b) => `<article class="card location-card ${b.has_lodging ? '' : 'garden'}" id="${esc(b.id)}">
        <div class="location-info">
          <div class="location-head"><img src="${logoFor(b)}" alt=""><div><h2>${esc(b.name)}</h2><div class="branch-loc">${icon('pin', 16)} ${esc(b.location)}</div></div></div>
          <ul class="info-list">
            <li>${icon('pin')}<div><strong>Address</strong>${esc(b.address)}</div></li>
            ${b.phone ? `<li>${icon('phone')}<div><strong>Phone</strong><a href="${telHref(b.phone)}">${esc(b.phone)}</a></div></li>` : ''}
            ${b.has_dining ? `<li>${icon('clock')}<div><strong>Restaurant hours</strong>${fmtTime(b.open_time)} – ${fmtTime(b.close_time)}</div></li>` : ''}
            ${b.has_lodging ? `<li>${icon('calendar')}<div><strong>Check-in / Check-out</strong>From ${fmtTime(b.checkin_time)} · Until ${fmtTime(b.checkout_time)}</div></li>` : ''}
          </ul>
          <div class="card-actions">
            <a class="btn btn-primary btn-sm" href="${directionsHref(b)}" target="_blank" rel="noopener">${icon('pin', 16)} Get directions</a>
            <a class="btn btn-ghost btn-sm" href="${mapsHref(b)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
            ${b.whatsapp ? `<a class="btn btn-ghost btn-sm" href="${waHref(b.whatsapp, `Namaste! How do I get to ${b.name}, ${b.location}?`)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a>` : ''}
            <a class="btn btn-ghost btn-sm" href="/branches/${esc(b.id)}">View branch →</a>
          </div>
          ${hasPin(b) ? '' : '<p class="muted" style="font-size:.8rem;margin:10px 0 0">Approximate location — exact pin coming soon.</p>'}
        </div>
        <iframe class="location-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${esc(b.name)}, ${esc(b.location)}" src="${mapSrc(b)}"></iframe>
      </article>`).join('');
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  });
})();
