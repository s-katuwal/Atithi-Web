(function () {
  'use strict';
  const { $, $$, esc, rs, icon, api, getBranches, getSite, applyContent, lines, lightbox, logoFor, todayStr, addDays, telHref, toast, setBusy, offerCards } = window.Atithi;

  document.addEventListener('DOMContentLoaded', async () => {
    $$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, 18)));

    // Quick search defaults
    const ci = $('#qb-ci'), co = $('#qb-co');
    ci.min = todayStr(); ci.value = todayStr();
    co.min = todayStr(1); co.value = todayStr(1);
    ci.addEventListener('change', () => {
      co.min = addDays(ci.value, 1);
      if (co.value <= ci.value) co.value = addDays(ci.value, 1);
    });
    $('#qb-guests').innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${i === 1 ? 'selected' : ''}>${i + 1} guest${i ? 's' : ''}</option>`).join('');

    // Text, lists, pictures and section switches from Admin → Website content
    const site = await getSite();
    applyContent(site);
    $('#heroTitle').innerHTML = `${esc(site.hero_title)} ${site.hero_highlight ? `<span>${esc(site.hero_highlight)}</span>` : ''}`;
    $('#heroBadges').innerHTML = lines(site.hero_badges, 2).map(([n, l]) => `<div><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join('');
    if (site.hero_image) { $('#heroLogo').classList.add('photo'); $('#heroLogo').innerHTML = `<img src="${esc(site.hero_image)}" alt="Atithi">`; }
    $('#hero').classList.toggle('no-art', site.show_hero_image === '0');
    $('#hero').classList.toggle('art-mobile', site.show_hero_image_mobile === '1');
    $('#features').innerHTML = lines(site.features, 3).map(([i, t, d]) =>
      `<div class="card feature"><div class="ico">${icon(i, 26)}</div><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('');
    $('#steps').innerHTML = lines(site.steps, 2).map(([t, d]) => `<div class="card step"><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('');

    // Offers
    if (site.show_offers !== '0') {
      api('/offers').then((offers) => {
        if (!offers.length) return;
        $('#offerGrid').innerHTML = offerCards(offers);
        $('#offers').hidden = false;
      }).catch(() => {});
    }

    // Gallery preview
    if (site.show_home_gallery !== '0') {
      api('/gallery?limit=8').then((photos) => {
        if (!photos.length) return;
        $('#homeGalleryGrid').innerHTML = photos.map((p, i) => `<button type="button" class="gallery-item" data-i="${i}">
          <img src="${esc(p.image_url)}" alt="${esc(p.caption || 'Atithi photo')}" loading="lazy"></button>`).join('');
        $('#homeGalleryGrid').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) lightbox(photos, Number(b.dataset.i)); };
        $('#homeGallery').hidden = false;
      }).catch(() => {});
    }

    // Branches
    const branches = await getBranches();
    $('#qb-branch').innerHTML = branches.filter((b) => b.has_lodging)
      .map((b) => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location)}</option>`).join('');
    $('#c-branch').insertAdjacentHTML('beforeend', branches.map((b) => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location)}</option>`).join(''));

    $('#branchGrid').innerHTML = branches.map((b) => {
      const garden = !b.has_lodging;
      return `<article class="card branch-card ${garden ? 'garden' : ''}">
        <div class="branch-cover"><img src="${logoFor(b)}" alt="${esc(b.name)} logo" loading="lazy"></div>
        <div class="branch-body">
          <h3>${esc(b.name)}</h3>
          <div class="branch-loc">${icon('pin', 16)} ${esc(b.location)}</div>
          <div class="chips">
            ${b.has_lodging ? `<span class="chip">${icon('bed', 14)} Lodging</span>` : ''}
            ${b.has_dining ? `<span class="chip accent">${icon('dish', 14)} Dining</span>` : ''}
            ${garden ? `<span class="chip green">${icon('leaf', 14)} Garden &amp; events</span>` : ''}
            ${b.rooms_from ? `<span class="chip">Rooms from ${rs(b.rooms_from)}</span>` : ''}
          </div>
          <p>${esc(b.tagline || b.description)}</p>
          <div class="card-actions">
            <a class="btn btn-primary btn-sm" href="/branches/${b.id}">Explore</a>
            ${b.has_lodging ? `<a class="btn btn-accent btn-sm" href="/book?type=room&branch=${b.id}">Book a room</a>` : ''}
            <a class="btn btn-outline btn-sm" href="/book?type=table&branch=${b.id}">Reserve table</a>
          </div>
        </div>
      </article>`;
    }).join('');

    $('#contactBranches').innerHTML = branches.map((b) => `<div class="card contact-branch">
      <img src="${logoFor(b)}" alt="">
      <div><h5>${esc(b.name)} — ${esc(b.location)}</h5>
        <p>${icon('pin', 14)} ${esc(b.address)}</p>
        ${b.phone ? `<p>${icon('phone', 14)} <a href="${telHref(b.phone)}">${esc(b.phone)}</a></p>` : ''}
        ${b.email ? `<p>${icon('mail', 14)} <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>` : ''}
        ${b.has_dining ? `<p>${icon('clock', 14)} Kitchen ${esc(b.open_time)} – ${esc(b.close_time)}</p>` : ''}
      </div></div>`).join('');

    // Popular dishes
    try {
      const dishes = await api('/menu/popular');
      const tabs = [{ id: '', label: 'All branches' }, ...branches.map((b) => ({ id: b.id, label: b.location }))];
      const draw = (id) => {
        const items = dishes.filter((d) => !id || d.branch_id === id);
        $('#dishGrid').innerHTML = items.map((d) => `<div class="card dish ${d.branch_id === 'food-garden' ? 'garden' : ''}">
          <h5>${esc(d.name)}</h5>
          <div class="where">${esc(d.category)} · ${esc(d.branch_location)}</div>
          <p class="muted" style="font-size:.88rem;margin:0;flex:1">${esc(d.description)}</p>
          <div class="price">${rs(d.price)}</div></div>`).join('') || '<p class="empty">Menu coming soon.</p>';
        $$('#dishTabs button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
      };
      $('#dishTabs').innerHTML = tabs.map((t) => `<button type="button" data-id="${t.id}">${esc(t.label)}</button>`).join('');
      $('#dishTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) draw(b.dataset.id); });
      draw('');
    } catch { /* section stays empty */ }

    // Contact form
    $('#contactForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target, btn = form.querySelector('button[type=submit]'), msg = $('#contactMsg');
      const data = Object.fromEntries(new FormData(form));
      msg.hidden = true;
      setBusy(btn, true, 'Sending…');
      try {
        await api('/messages', { method: 'POST', body: data });
        form.reset();
        msg.className = 'form-ok mt-2';
        msg.textContent = 'Thank you! Your message has been sent. We will contact you soon.';
      } catch (err) {
        msg.className = 'form-error mt-2';
        msg.textContent = err.message;
        toast(err.message, 'err');
      } finally {
        msg.hidden = false;
        setBusy(btn, false);
      }
    });
  });
})();
