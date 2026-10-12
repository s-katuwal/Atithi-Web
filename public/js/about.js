(function () {
  'use strict';
  const { $, esc, icon, getSite, getBranches, applyContent, lines, logoFor } = window.Atithi;

  document.addEventListener('DOMContentLoaded', async () => {
    const [site, branches] = await Promise.all([getSite(), getBranches()]);
    applyContent(site);
    // Paragraphs are separated by an empty line in Admin → Website content.
    $('#aboutStory').innerHTML = String(site.about_story || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    if (site.about_image) $('#aboutPhoto').innerHTML = `<img src="${esc(site.about_image)}" alt="Atithi">`;
    else $('#aboutPhoto').classList.add('logo');
    $('#aboutStats').innerHTML = lines(site.about_stats, 2).map(([n, l]) => `<div><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join('');
    $('#aboutValues').innerHTML = lines(site.about_values, 3).map(([i, t, d]) =>
      `<div class="card feature"><div class="ico">${icon(i, 26)}</div><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('');
    $('#aboutBranches').innerHTML = branches.map((b) => `<a class="card about-branch ${b.has_lodging ? '' : 'garden'}" href="/branches/${esc(b.id)}">
        <img src="${logoFor(b)}" alt="">
        <div><h3>${esc(b.name)}</h3><div class="branch-loc">${icon('pin', 15)} ${esc(b.location)}</div>
          <p>${esc(b.tagline || '')}</p><span class="about-branch-link">Visit branch →</span></div></a>`).join('');
  });
})();
