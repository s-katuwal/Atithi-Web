(function () {
  'use strict';
  const { $, $$, esc, api, getSite, applyContent, lightbox } = window.Atithi;

  document.addEventListener('DOMContentLoaded', async () => {
    getSite().then((s) => applyContent(s));
    let photos = [];
    try { photos = await api('/gallery'); } catch { /* shown as empty below */ }
    const cats = [...new Set(photos.map((p) => p.category).filter(Boolean))];
    let shown = photos;
    const draw = (cat) => {
      shown = photos.filter((p) => !cat || p.category === cat);
      $('#galleryGrid').innerHTML = shown.map((p, i) => `<button type="button" class="gallery-item" data-i="${i}">
          <img src="${esc(p.image_url)}" alt="${esc(p.caption || 'Atithi photo')}" loading="lazy">
          ${p.caption ? `<span class="gallery-cap">${esc(p.caption)}</span>` : ''}</button>`).join('')
        || '<p class="empty">Photos are coming soon.</p>';
      $$('#galleryTabs button').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
    };
    $('#galleryTabs').innerHTML = cats.length > 1
      ? [`<button type="button" data-cat="">All</button>`, ...cats.map((c) => `<button type="button" data-cat="${esc(c)}">${esc(c)}</button>`)].join('')
      : '';
    $('#galleryTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) draw(b.dataset.cat); });
    $('#galleryGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) lightbox(shown, Number(b.dataset.i)); });
    draw('');
  });
})();
