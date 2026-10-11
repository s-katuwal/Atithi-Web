(function () {
  'use strict';
  const { $, esc, icon, api, getSite, applyContent, fmtDate, toast, setBusy } = window.Atithi;

  // Read a file as base64 (without the "data:...;base64," prefix).
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
  const paras = (t) => esc(t).split(/\n+/).filter(Boolean).map((l) => `<p>${l}</p>`).join('');

  document.addEventListener('DOMContentLoaded', async () => {
    const site = await getSite();
    applyContent(site);
    let jobs = [];
    try { jobs = await api('/jobs'); } catch { /* treated as no openings */ }

    $('#jobs').innerHTML = jobs.length ? jobs.map((j) => `<article class="card job-card">
        <div class="job-head">
          <div><h3>${esc(j.title)}</h3>
            <div class="job-meta">${icon('pin', 14)} ${j.branch_id ? `${esc(j.branch_name)} — ${esc(j.branch_location)}` : 'Any branch'}
              · ${icon('briefcase', 14)} ${esc(j.job_type)}${j.salary ? ` · ${esc(j.salary)}` : ''}
              ${j.deadline ? ` · Apply by ${fmtDate(j.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</div></div>
          <button type="button" class="btn btn-accent btn-sm" data-apply="${j.id}">Apply</button>
        </div>
        ${j.description ? `<div class="job-text">${paras(j.description)}</div>` : ''}
        ${j.requirements ? `<details class="job-req"><summary>Requirements</summary>${paras(j.requirements)}</details>` : ''}
      </article>`).join('')
      : `<div class="card card-pad muted">${esc(site.careers_empty)}</div>`;

    const sel = $('#a-job');
    sel.innerHTML = jobs.map((j) => `<option value="${j.id}">${esc(j.title)}${j.branch_location ? ` — ${esc(j.branch_location)}` : ''}</option>`).join('')
      + '<option value="">General application (any job)</option>';
    const syncPosition = () => { $('#a-position-wrap').hidden = sel.value !== ''; };
    sel.onchange = syncPosition;
    syncPosition();
    $('#jobs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-apply]');
      if (!b) return;
      sel.value = b.dataset.apply;
      syncPosition();
      $('#apply').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => $('#a-name').focus({ preventScroll: true }), 500);
    });

    $('#applyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#a-err'), ok = $('#a-ok'), btn = $('#a-submit');
      err.hidden = true; ok.hidden = true;
      const fd = Object.fromEntries(new FormData(e.target));
      if (!fd.name.trim() || !fd.phone.trim()) { err.textContent = 'Please enter your name and mobile number.'; err.hidden = false; return; }
      if (!fd.email.trim() || !$('#a-email').checkValidity()) { err.textContent = 'Please enter a valid email address.'; err.hidden = false; return; }
      const file = $('#a-cv').files[0];
      if (file && file.size > 3 * 1024 * 1024) { err.textContent = 'Your CV is larger than 3 MB. Please upload a smaller file.'; err.hidden = false; return; }
      setBusy(btn, true, 'Sending…');
      try {
        const res = await api('/careers/apply', { method: 'POST', body: { ...fd, job_id: fd.job_id || null, cv: file ? await toBase64(file) : '' } });
        e.target.reset();
        syncPosition();
        ok.textContent = `Thank you! Your application for “${res.position}” has been sent. We have emailed you a confirmation.`;
        ok.hidden = false;
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
        toast(x.message, 'err');
      } finally { setBusy(btn, false); }
    });
  });
})();
