/* Namaste welcome on the home page: the waitress greets (CSS animation), then the welcome
   message is written out left to right, word by word. Shown once per visit. */
(function () {
  'use strict';
  const A = window.Atithi;
  const intro = document.getElementById('intro');
  const root = document.documentElement;
  if (!intro) return;
  if (root.classList.contains('no-intro')) { intro.remove(); return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const force = /[?&]intro\b/.test(location.search);
  const started = performance.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  let closed = false, autoClose;

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(autoClose);
    try { sessionStorage.setItem('atithi_intro', '1'); } catch { /* private mode */ }
    intro.classList.add('closing');
    root.classList.remove('intro-open');
    setTimeout(() => intro.remove(), 650);
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
  document.addEventListener('keydown', onKey);
  intro.addEventListener('click', (e) => { if (e.target.closest('[data-intro-close]')) close(); });

  // Falling marigold petals
  if (!reduced) {
    const petals = intro.querySelector('.intro-petals');
    petals.innerHTML = Array.from({ length: 14 }, (_, i) =>
      `<span style="left:${(i * 7.3 + Math.random() * 6) % 100}%;animation-delay:${(Math.random() * 4).toFixed(2)}s;animation-duration:${(5 + Math.random() * 4).toFixed(2)}s;${i % 3 ? '' : 'background:#F5A11C;'}"></span>`).join('');
  }

  /** Each word is revealed with a left-to-right wipe, one after another, so it looks hand-written
      (words are never split, which keeps Nepali conjunct letters intact). Returns the total time in ms. */
  function writeText(el, text, startAt) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    let t = startAt;
    el.innerHTML = words.map((w) => {
      const len = [...w].length;
      const dur = Math.max(200, len * 55);
      const html = `<span class="intro-word" style="animation-duration:${dur}ms;animation-delay:${t}ms">${A.esc(w)}</span>`;
      t += dur + 40;
      return html;
    }).join(' ');
    return t - startAt;
  }

  (async () => {
    // Use the admin's texts; don't hold the animation up for more than a moment if the server is slow.
    const site = await Promise.race([A.getSite(), sleep(1200).then(() => null)]) || {};
    try {
      localStorage.setItem('atithi_intro_cfg', JSON.stringify({ show: site.show_intro || '1' }));
    } catch { /* ignore */ }
    if (site.show_intro === '0' && !force) { close(); return; }
    if (site.intro_greeting) $('introGreeting').textContent = site.intro_greeting;
    if (site.intro_subtext) $('introSub').textContent = site.intro_subtext;
    if (site.intro_button) $('introEnter').textContent = site.intro_button;
    if (site.intro_image) $('introArt').innerHTML = `<img src="${A.esc(site.intro_image)}" alt="Namaste">`;
    const text = site.intro_text || 'हजुरहरूलाई अतिथि रेष्ट्रोको आधिकारिक वेबपेजमा स्वागत छ।';

    if (reduced) {
      $('introText').textContent = text;
      intro.classList.add('done');
      autoClose = setTimeout(close, 4000);
      return;
    }
    // The words are placed now (so nothing moves), and start writing after the namaste, about 1.9 s in.
    const startAt = Math.max(0, 1900 - (performance.now() - started));
    const writing = writeText($('introText'), text, startAt);
    await sleep(startAt + writing + 300);
    if (closed) return;
    intro.classList.add('done'); // shows the English line and the button
    autoClose = setTimeout(close, 2300);
  })();
})();
