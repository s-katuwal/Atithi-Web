(function () {
  'use strict';
  const A = window.Atithi;
  const { $, $$, esc, rs, icon, fmtDate, fmtTime, todayStr, toast, setBusy, telHref } = A;

  // ---------------- Session ----------------
  const store = {
    get: () => { try { return sessionStorage.getItem('atithi_admin') || ''; } catch { return ''; } },
    set: (t) => { try { t ? sessionStorage.setItem('atithi_admin', t) : sessionStorage.removeItem('atithi_admin'); } catch { /* ignore */ } },
  };
  let token = store.get();
  let branches = [];

  async function api(path, opts = {}) {
    try {
      return await A.api('/admin' + path, { ...opts, token });
    } catch (e) {
      if (e.status === 401 && path !== '/login') { logout(true); }
      throw e;
    }
  }

  function logout(expired) {
    if (token && !expired) A.api('/admin/logout', { method: 'POST', token }).catch(() => {});
    token = '';
    store.set('');
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    if (expired) toast('Session expired. Please log in again.', 'err');
  }

  // ---------------- Shared bits ----------------
  const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
  const RES_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
  const label = (s) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const statusPill = (s) => `<span class="status ${esc(s)}">${esc(label(s))}</span>`;
  const statusSelect = (cur, list, attrs = '') =>
    `<select class="input" ${attrs}>${list.map((s) => `<option value="${s}" ${s === cur ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>`;
  const branchOptions = (sel = '', filter = () => true, any = '') =>
    (any ? `<option value="">${any}</option>` : '') +
    branches.filter(filter).map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.location)}${b.has_lodging ? '' : ' (Food Garden)'}</option>`).join('');
  const field = (lbl, html, cls = '') => `<div class="field ${cls}"><label>${lbl}</label>${html}</div>`;
  const inp = (name, val = '', attrs = '') => `<input class="input" name="${name}" value="${esc(val)}" ${attrs}>`;

  // ---------------- Photo uploads ----------------
  /** Phone photos are often 5–10 MB; shrink to max 1800px JPEG before uploading. */
  async function shrink(file) {
    if (file.type === 'image/gif') return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5e6) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))) || file;
    } catch { return file; }
  }
  async function uploadImage(file) {
    const blob = await shrink(file);
    const res = await fetch('/api/admin/upload', {
      method: 'POST', body: blob,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'application/octet-stream' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) logout(true);
    if (!res.ok) throw new Error(data.error || 'Upload failed. Please try another photo.');
    return data.url;
  }
  /** Photo field; value is stored as a JSON array in a hidden input. First photo = cover. */
  const photoPicker = (name, urls, multiple = false) => `<div class="photo-picker" data-multiple="${multiple ? 1 : ''}">
      <input type="hidden" name="${name}" value="${esc(JSON.stringify(urls.filter(Boolean)))}">
      <div class="pp-list"></div>
      <label class="btn btn-ghost btn-sm pp-add">${icon('image', 16)} <span>${multiple ? 'Add photos' : 'Upload photo'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${multiple ? 'multiple' : ''} hidden></label>
      <span class="hint">JPG, PNG or WEBP. Big photos are resized automatically.</span>
    </div>`;
  function initPhotoPickers(root) {
    $$('.photo-picker', root).forEach((pp) => {
      const hidden = $('input[type=hidden]', pp), listEl = $('.pp-list', pp), multiple = !!pp.dataset.multiple;
      let urls = JSON.parse(hidden.value || '[]');
      const draw = () => {
        hidden.value = JSON.stringify(urls);
        listEl.innerHTML = urls.map((u, i) => `<div class="pp-item"><img src="${esc(u)}" alt="">
          ${multiple && i === 0 && urls.length > 1 ? '<span class="pp-cover">Cover</span>' : ''}
          <div class="pp-tools">${multiple && i > 0 ? `<button type="button" data-cover="${i}" title="Use as cover photo">★</button>` : ''}
          <button type="button" data-remove="${i}" title="Remove photo">✕</button></div></div>`).join('');
      };
      pp.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-remove]'), cv = e.target.closest('[data-cover]');
        if (rm) { urls.splice(Number(rm.dataset.remove), 1); draw(); }
        if (cv) { urls.unshift(...urls.splice(Number(cv.dataset.cover), 1)); draw(); }
      });
      $('input[type=file]', pp).addEventListener('change', async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        const lbl = $('.pp-add span', pp), txt = lbl.textContent;
        for (const [i, f] of files.entries()) {
          lbl.textContent = `Uploading ${i + 1} of ${files.length}…`;
          try { const u = await uploadImage(f); urls = multiple ? [...urls, u] : [u]; draw(); } catch (x) { toast(x.message, 'err'); }
        }
        lbl.textContent = txt;
      });
      draw();
    });
  }
  const parsePhotos = (v) => { try { return JSON.parse(v || '[]'); } catch { return []; } };

  // ---------------- Modal ----------------
  let modalSubmit = null;
  function openModal({ title, body, submitLabel = 'Save', danger, onSubmit, extraFoot = '' }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = `${extraFoot}<button type="button" class="btn btn-ghost" data-close>Close</button>
      ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modalSubmit">${submitLabel}</button>` : ''}`;
    modalSubmit = onSubmit;
    initPhotoPickers($('#modalBody'));
    $('#modal').showModal();
  }
  const closeModal = () => $('#modal').close();

  // ---------------- Views ----------------
  const views = {};
  let counts = {};

  views.dashboard = {
    title: 'Dashboard',
    async render(el) {
      const s = await api('/stats');
      counts = { bookings: s.pending_bookings, reservations: s.pending_reservations, messages: s.unread_messages };
      drawNav();
      el.innerHTML = `
        <div class="stats">
          <div class="card stat"><div class="label">Pending room bookings</div><div class="value">${s.pending_bookings}</div><a href="#bookings?status=pending">Review →</a></div>
          <div class="card stat"><div class="label">Pending table reservations</div><div class="value">${s.pending_reservations}</div><a href="#reservations?status=pending">Review →</a></div>
          <div class="card stat"><div class="label">Arrivals today</div><div class="value">${s.arrivals_today}</div><span class="muted" style="font-size:.82rem">${s.departures_today} departure(s) due</span></div>
          <div class="card stat"><div class="label">Tables today</div><div class="value">${s.reservations_today}</div><a href="#reservations?from=${s.today}&to=${s.today}">See list →</a></div>
        </div>
        <div class="dash-grid">
          <div class="card card-pad">
            <h3 style="color:var(--blue-900);font-size:1.1rem">Tonight's occupancy</h3>
            ${s.occupancy.map((o) => {
              const pct = o.total ? Math.round((o.booked / o.total) * 100) : 0;
              return `<div class="occ"><div style="display:flex;justify-content:space-between"><strong>${esc(o.location)}</strong><span>${o.booked} / ${o.total} rooms · ${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
            }).join('')}
            <p class="muted mb-0" style="font-size:.82rem">Counts confirmed and checked-in bookings plus rooms marked booked by staff. <a href="#availability">Manage availability →</a></p>
          </div>
          <div class="card card-pad">
            <h3 style="color:var(--blue-900);font-size:1.1rem">This month</h3>
            <div class="stat" style="padding:0;border:0"><div class="label">Room revenue (confirmed stays)</div><div class="value">${rs(s.month_revenue)}</div></div>
            <p class="mt-2 mb-0"><a href="#messages">${s.unread_messages} unread message(s) →</a></p>
          </div>
          <div class="card card-pad">
            <h3 style="color:var(--blue-900);font-size:1.1rem">Upcoming room bookings</h3>
            ${miniTable(s.upcoming_bookings, (b) => `<td class="ref">${esc(b.ref)}</td><td>${esc(b.guest_name)}<small>${esc(b.branch_location)} · ${esc(b.room_name)}</small></td><td>${fmtDate(b.check_in, { day: 'numeric', month: 'short' })}</td><td>${statusPill(b.status)}</td>`)}
          </div>
          <div class="card card-pad">
            <h3 style="color:var(--blue-900);font-size:1.1rem">Upcoming table reservations</h3>
            ${miniTable(s.upcoming_reservations, (r) => `<td class="ref">${esc(r.ref)}</td><td>${esc(r.name)}<small>${esc(r.branch_location)} · ${r.guests} guests</small></td><td>${fmtDate(r.date, { day: 'numeric', month: 'short' })}<small>${fmtTime(r.time)}</small></td><td>${statusPill(r.status)}</td>`)}
          </div>
        </div>`;
    },
  };
  const miniTable = (rows, cells) => rows.length
    ? `<div class="table-wrap"><table class="data"><tbody>${rows.map((r) => `<tr>${cells(r)}</tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Nothing upcoming.</p>';

  // ----- Bookings & reservations share a list view -----
  function listView({ kind, title, endpoint, statuses, dateLabel, row, details }) {
    return {
      title,
      actions: `<button class="btn btn-ghost btn-sm" id="exportBtn">${icon('print', 16)} Export CSV</button>`,
      async render(el, params) {
        el.innerHTML = `
          <form class="filters" id="filters">
            ${field('Branch', `<select class="input" name="branch">${branchOptions(params.get('branch') || '', kind === 'bookings' ? (b) => b.has_lodging : () => true, 'All branches')}</select>`)}
            ${field('Status', `<select class="input" name="status"><option value="">All statuses</option>${statuses.map((s) => `<option value="${s}" ${params.get('status') === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>`)}
            ${field(`${dateLabel} from`, `<input class="input" type="date" name="from" value="${esc(params.get('from') || '')}">`)}
            ${field('to', `<input class="input" type="date" name="to" value="${esc(params.get('to') || '')}">`)}
            ${field('Search', `<input class="input" name="q" placeholder="Name, phone or reference" value="${esc(params.get('q') || '')}">`, 'grow')}
            <button class="btn btn-primary btn-sm" type="submit">Filter</button>
          </form>
          <div id="listBody"><div class="skeleton" style="height:200px"></div></div>`;
        let rows = [];
        const load = async () => {
          const q = new URLSearchParams([...new FormData($('#filters'))].filter(([, v]) => v));
          history.replaceState(null, '', `#${kind}${q.toString() ? '?' + q : ''}`);
          rows = await api(`${endpoint}?${q}`);
          $('#listBody').innerHTML = rows.length
            ? `<p class="muted" style="font-size:.85rem">${rows.length} result(s)</p><div class="table-wrap"><table class="data"><thead>${row.head}</thead><tbody>
                ${rows.map((r) => `<tr data-id="${r.id}">${row.cells(r)}<td>${statusSelect(r.status, statuses, 'data-status')}</td>
                <td><button class="btn btn-ghost btn-sm" data-view>Details</button></td></tr>`).join('')}</tbody></table></div>`
            : '<div class="card empty">No records match these filters.</div>';
        };
        $('#filters').addEventListener('submit', (e) => { e.preventDefault(); load().catch((x) => toast(x.message, 'err')); });
        $('#filters').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') load().catch((x) => toast(x.message, 'err')); });
        const update = async (id, body) => {
          const { email_result: mailed, ...updated } = await api(`${endpoint}/${id}`, { method: 'PATCH', body });
          const i = rows.findIndex((r) => r.id === updated.id);
          rows[i] = { ...rows[i], ...updated };
          if (!mailed) toast('Saved', 'ok');
          else if (mailed.ok) toast(`Saved · ${label(updated.status).toLowerCase()} email sent to ${updated.email}`, 'ok');
          else toast(`Saved, but no email was sent: ${mailed.error}`, 'err');
          refreshCounts();
          return rows[i];
        };
        $('#listBody').addEventListener('change', async (e) => {
          if (!e.target.matches('[data-status]')) return;
          const tr = e.target.closest('tr'), id = Number(tr.dataset.id);
          const prev = rows.find((r) => r.id === id).status;
          try { await update(id, { status: e.target.value }); } catch (x) { e.target.value = prev; toast(x.message, 'err'); }
        });
        $('#listBody').addEventListener('click', (e) => {
          if (!e.target.closest('[data-view]')) return;
          const r = rows.find((x) => x.id === Number(e.target.closest('tr').dataset.id));
          openModal({
            title: `${r.ref}`,
            body: `<div class="summary"><dl>${details(r)}</dl></div>
              <div class="grid-2">
                ${field('Status', statusSelect(r.status, statuses, 'name="status"'))}
                ${field('Phone', `<a class="btn btn-ghost btn-sm" href="${telHref(r.phone)}">${icon('phone', 16)} Call ${esc(r.phone)}</a>`)}
                ${field('Staff note (private)', `<textarea class="input" name="admin_note" maxlength="1000">${esc(r.admin_note)}</textarea>`, 'span-2')}
              </div>
              <div class="email-box mt-2"><strong>Emails to guest</strong>
                ${r.email ? `<div id="emailLog" class="muted">Loading…</div>
                  <div class="card-actions mt-1">${['received', 'confirmed', 'cancelled'].map((k) => `<button type="button" class="btn btn-ghost btn-sm" data-send="${k}">Send “${label(k)}” email</button>`).join('')}</div>`
                  : '<p class="muted mb-0">No email address was given, so the guest cannot be emailed. Please call them instead.</p>'}
              </div>`,
            onSubmit: async (fd) => { await update(r.id, { status: fd.status, admin_note: fd.admin_note }); await load(); },
          });
          if (!r.email) return;
          const drawLog = async () => {
            const log = await api(`/emails?ref=${encodeURIComponent(r.ref)}`).catch(() => []);
            const kinds = { received: 'Booking received', confirmed: 'Confirmation', cancelled: 'Cancellation', staff_alert: 'Staff alert' };
            $('#emailLog').innerHTML = log.length ? `<ul class="email-log">${log.map((m) => `<li class="${m.ok ? 'ok' : 'fail'}">
                ${m.ok ? '✓' : '✕'} ${esc(kinds[m.kind] || m.kind)} → ${esc(m.recipient)} <small>${esc(m.created_at)} UTC${m.ok ? '' : ' · ' + esc(m.error)}</small></li>`).join('')}</ul>`
              : 'No emails sent yet.';
          };
          drawLog();
          $('.email-box').onclick = async (ev) => {
            const btn = ev.target.closest('[data-send]');
            if (!btn) return;
            setBusy(btn, true, 'Sending…');
            try { await api(`${endpoint}/${r.id}/email`, { method: 'POST', body: { kind: btn.dataset.send } }); toast('Email sent', 'ok'); } catch (x) { toast(x.message, 'err'); }
            setBusy(btn, false);
            drawLog();
          };
        });
        $('#exportBtn').onclick = async () => {
          const q = new URLSearchParams([...new FormData($('#filters'))].filter(([, v]) => v));
          const res = await fetch(`/api/admin${endpoint}.csv?${q}`, { headers: { Authorization: 'Bearer ' + token } });
          if (!res.ok) return toast('Export failed', 'err');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(await res.blob());
          a.download = `atithi-${kind}-${todayStr()}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        await load();
      },
    };
  }

  views.bookings = listView({
    kind: 'bookings', title: 'Room bookings', endpoint: '/bookings', statuses: BOOKING_STATUSES, dateLabel: 'Check-in',
    row: {
      head: '<tr><th>Reference</th><th>Guest</th><th>Branch / room</th><th>Stay</th><th>Total</th><th>Status</th><th></th></tr>',
      cells: (b) => `<td class="ref">${esc(b.ref)}<small>${esc(b.created_at.slice(0, 16))}</small></td>
        <td>${esc(b.guest_name)}<small><a href="${telHref(b.phone)}">${esc(b.phone)}</a></small></td>
        <td>${esc(b.branch_location)}<small>${b.rooms} × ${esc(b.room_name)}</small></td>
        <td>${fmtDate(b.check_in, { day: 'numeric', month: 'short' })} → ${fmtDate(b.check_out, { day: 'numeric', month: 'short', year: 'numeric' })}<small>${b.nights} night(s) · ${b.adults + b.children} guest(s)</small></td>
        <td><strong>${rs(b.total)}</strong></td>`,
    },
    details: (b) => `
      <dt>Guest</dt><dd>${esc(b.guest_name)}</dd><dt>Phone</dt><dd>${esc(b.phone)}</dd>
      ${b.email ? `<dt>Email</dt><dd>${esc(b.email)}</dd>` : ''}
      <dt>Branch</dt><dd>${esc(b.branch_location)}</dd><dt>Room</dt><dd>${b.rooms} × ${esc(b.room_name)}</dd>
      <dt>Check-in</dt><dd>${fmtDate(b.check_in)}</dd><dt>Check-out</dt><dd>${fmtDate(b.check_out)}</dd>
      <dt>Guests</dt><dd>${b.adults} adult(s), ${b.children} child(ren)</dd>
      <dt>Rate</dt><dd>${rs(b.price_per_night)} × ${b.nights} night(s) × ${b.rooms}</dd><dt>Total</dt><dd>${rs(b.total)}</dd>
      ${b.special_requests ? `<dt>Requests</dt><dd style="white-space:pre-wrap;text-align:left">${esc(b.special_requests)}</dd>` : ''}
      <dt>Booked on</dt><dd>${esc(b.created_at)} UTC</dd>`,
  });

  views.reservations = listView({
    kind: 'reservations', title: 'Table reservations', endpoint: '/reservations', statuses: RES_STATUSES, dateLabel: 'Date',
    row: {
      head: '<tr><th>Reference</th><th>Guest</th><th>Branch</th><th>Date & time</th><th>Guests</th><th>Status</th><th></th></tr>',
      cells: (r) => `<td class="ref">${esc(r.ref)}<small>${esc(r.created_at.slice(0, 16))}</small></td>
        <td>${esc(r.name)}<small><a href="${telHref(r.phone)}">${esc(r.phone)}</a></small></td>
        <td>${esc(r.branch_location)}<small>${esc(r.seating || '—')}</small></td>
        <td>${fmtDate(r.date)}<small>${fmtTime(r.time)}</small></td>
        <td><strong>${r.guests}</strong>${r.occasion ? `<small>${esc(r.occasion)}</small>` : ''}</td>`,
    },
    details: (r) => `
      <dt>Guest</dt><dd>${esc(r.name)}</dd><dt>Phone</dt><dd>${esc(r.phone)}</dd>
      ${r.email ? `<dt>Email</dt><dd>${esc(r.email)}</dd>` : ''}
      <dt>Branch</dt><dd>${esc(r.branch_location)}</dd><dt>Date</dt><dd>${fmtDate(r.date)} · ${fmtTime(r.time)}</dd>
      <dt>Guests</dt><dd>${r.guests}</dd>${r.seating ? `<dt>Seating</dt><dd>${esc(r.seating)}</dd>` : ''}
      ${r.occasion ? `<dt>Occasion</dt><dd>${esc(r.occasion)}</dd>` : ''}
      ${r.notes ? `<dt>Notes</dt><dd style="white-space:pre-wrap;text-align:left">${esc(r.notes)}</dd>` : ''}
      <dt>Booked on</dt><dd>${esc(r.created_at)} UTC</dd>`,
  });

  views.messages = {
    title: 'Messages',
    async render(el) {
      const rows = await api('/messages');
      el.innerHTML = rows.length ? rows.map((m) => `<div class="card msg-card ${m.is_read ? '' : 'unread'}" data-id="${m.id}">
          <div class="meta"><strong style="color:var(--ink)">${esc(m.name)}</strong>
            ${m.phone ? `<a href="${telHref(m.phone)}">${esc(m.phone)}</a>` : ''}
            ${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}
            <span>${esc(m.branch_location || 'General')}</span><span>${esc(m.created_at)} UTC</span></div>
          <p>${esc(m.message)}</p>
          <div class="card-actions"><button class="btn btn-ghost btn-sm" data-read="${m.is_read ? 0 : 1}">Mark as ${m.is_read ? 'unread' : 'read'}</button>
          <button class="btn btn-ghost btn-sm" data-del>Delete</button></div></div>`).join('')
        : '<div class="card empty">No messages yet.</div>';
      el.onclick = async (e) => {
        const card = e.target.closest('.msg-card');
        if (!card) return;
        const id = card.dataset.id;
        try {
          if (e.target.matches('[data-read]')) await api(`/messages/${id}`, { method: 'PATCH', body: { is_read: e.target.dataset.read === '1' } });
          else if (e.target.matches('[data-del]')) { if (!confirm('Delete this message?')) return; await api(`/messages/${id}`, { method: 'DELETE' }); }
          else return;
          views.messages.render(el);
          refreshCounts();
        } catch (x) { toast(x.message, 'err'); }
      };
    },
  };

  views.rooms = {
    title: 'Rooms & prices',
    actions: '<button class="btn btn-accent btn-sm" id="addRoom">+ Add room type</button>',
    async render(el) {
      const rows = await api('/rooms');
      el.innerHTML = `<p class="muted" style="font-size:.9rem">Set prices, photos and how many rooms of each type you have. To mark rooms booked or available on certain dates, use <a href="#availability">Availability</a>.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Branch</th><th>Room type</th><th>Guests</th><th>Price / night</th><th>Rooms</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.active ? '' : 'inactive'}" data-id="${r.id}"><td>${esc(r.branch_location)}</td>
          <td><div class="room-cell">${r.image_url ? `<img src="${esc(r.image_url)}" alt="">` : `<span class="no-photo">${icon('image', 18)}</span>`}
            <div><strong>${esc(r.name)}</strong><small>${esc(r.beds)}${r.image_url ? ` · ${1 + parsePhotos(r.photos).length} photo(s)` : ' · no photo yet'}</small></div></div></td>
          <td>${r.capacity}</td><td><strong>${rs(r.price)}</strong></td><td>${r.total_rooms}</td><td>${r.active ? 'Active' : 'Hidden'}</td>
          <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit>Edit</button> <button class="btn btn-ghost btn-sm" data-del>Delete</button></td></tr>`).join('')}
        </tbody></table></div>`;
      const form = (r = {}) => openModal({
        title: r.id ? `Edit ${r.name}` : 'Add room type',
        body: `<div class="grid-2">
          ${field('Branch', `<select class="input" name="branch_id">${branchOptions(r.branch_id, (b) => b.has_lodging)}</select>`)}
          ${field('Room name *', inp('name', r.name, 'required maxlength="80"'))}
          ${field('Price per night (Rs.) *', inp('price', r.price, 'type="number" min="0" required'))}
          ${field('Number of rooms *', inp('total_rooms', r.total_rooms ?? 1, 'type="number" min="0" required'))}
          ${field('Max guests per room *', inp('capacity', r.capacity ?? 2, 'type="number" min="1" required'))}
          ${field('Beds', inp('beds', r.beds, 'maxlength="100" placeholder="1 double bed"'))}
          ${field('Description', `<textarea class="input" name="description" maxlength="600">${esc(r.description || '')}</textarea>`, 'span-2')}
          ${field('Amenities (comma separated)', inp('amenities', r.amenities, 'maxlength="400" placeholder="Wi-Fi,Hot water,TV"'), 'span-2')}
          ${field('Room photos (first one is the cover)', photoPicker('photos', [r.image_url, ...parsePhotos(r.photos)], true), 'span-2')}
          ${field('Display order', inp('sort_order', r.sort_order ?? 0, 'type="number" min="0"'))}
          ${field('Visibility', `<select class="input" name="active"><option value="1">Active — bookable</option><option value="0" ${r.active === 0 ? 'selected' : ''}>Hidden</option></select>`)}
        </div>`,
        onSubmit: async (fd) => {
          const body = { ...fd, photos: parsePhotos(fd.photos), active: fd.active === '1', price: Number(fd.price), total_rooms: Number(fd.total_rooms), capacity: Number(fd.capacity), sort_order: Number(fd.sort_order) };
          await api(r.id ? `/rooms/${r.id}` : '/rooms', { method: r.id ? 'PUT' : 'POST', body });
          toast('Room saved', 'ok');
          views.rooms.render(el);
        },
      });
      $('#addRoom').onclick = () => form();
      el.onclick = async (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const r = rows.find((x) => x.id === Number(tr.dataset.id));
        if (e.target.matches('[data-edit]')) form(r);
        if (e.target.matches('[data-del]') && confirm(`Delete "${r.name}" at ${r.branch_location}? Room types with bookings are hidden instead.`)) {
          try { const res = await api(`/rooms/${r.id}`, { method: 'DELETE' }); toast(res.deactivated ? 'Room type has bookings — hidden instead' : 'Deleted', 'ok'); views.rooms.render(el); } catch (x) { toast(x.message, 'err'); }
        }
      };
    },
  };

  views.menu = {
    title: 'Menu',
    actions: '<button class="btn btn-accent btn-sm" id="addMenu">+ Add menu item</button>',
    async render(el, params) {
      const all = await api('/menu');
      const cur = params.get('branch') || branches[0]?.id;
      const rows = all.filter((m) => m.branch_id === cur);
      el.innerHTML = `<div class="filters">${field('Branch', `<select class="input" id="menuBranch">${branchOptions(cur)}</select>`)}</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Category</th><th>Item</th><th>Price</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((m) => `<tr class="${m.active ? '' : 'inactive'}" data-id="${m.id}"><td>${esc(m.category)}</td><td><strong>${esc(m.name)}</strong> ${m.popular ? '<span class="badge-pop">Popular</span>' : ''}<small>${esc(m.description)}</small></td>
          <td><strong>${rs(m.price)}</strong></td><td>${m.veg ? '<span style="color:var(--ok)">Veg</span>' : '<span style="color:var(--err)">Non-veg</span>'}</td><td>${m.active ? 'Shown' : 'Hidden'}</td>
          <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit>Edit</button> <button class="btn btn-ghost btn-sm" data-del>Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No items yet.</td></tr>'}
        </tbody></table></div>`;
      $('#menuBranch').onchange = (e) => { location.hash = `menu?branch=${e.target.value}`; };
      const cats = [...new Set(all.map((m) => m.category))];
      const form = (m = { branch_id: cur, active: 1 }) => openModal({
        title: m.id ? `Edit ${m.name}` : 'Add menu item',
        body: `<datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist><div class="grid-2">
          ${field('Branch', `<select class="input" name="branch_id">${branchOptions(m.branch_id)}</select>`)}
          ${field('Category *', inp('category', m.category, 'list="cats" required maxlength="60"'))}
          ${field('Item name *', inp('name', m.name, 'required maxlength="100"'))}
          ${field('Price (Rs.) *', inp('price', m.price, 'type="number" min="0" required'))}
          ${field('Description', inp('description', m.description, 'maxlength="300"'), 'span-2')}
          <label class="check"><input type="checkbox" name="veg" ${m.veg ? 'checked' : ''}> Vegetarian</label>
          <label class="check"><input type="checkbox" name="popular" ${m.popular ? 'checked' : ''}> Show as popular (home page)</label>
          <label class="check"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> Show on website</label>
        </div>`,
        onSubmit: async (fd) => {
          const body = { ...fd, price: Number(fd.price), veg: !!fd.veg, popular: !!fd.popular, active: !!fd.active };
          await api(m.id ? `/menu/${m.id}` : '/menu', { method: m.id ? 'PUT' : 'POST', body });
          toast('Menu item saved', 'ok');
          views.menu.render(el, new URLSearchParams({ branch: body.branch_id }));
        },
      });
      $('#addMenu').onclick = () => form();
      el.onclick = async (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const m = rows.find((x) => x.id === Number(tr.dataset.id));
        if (e.target.matches('[data-edit]')) form(m);
        if (e.target.matches('[data-del]') && confirm(`Delete "${m.name}"?`)) {
          try { await api(`/menu/${m.id}`, { method: 'DELETE' }); toast('Deleted', 'ok'); views.menu.render(el, params); } catch (x) { toast(x.message, 'err'); }
        }
      };
    },
  };

  views.branches = {
    title: 'Branch details',
    async render(el) {
      branches = await A.api('/branches');
      el.innerHTML = `<p class="muted" style="font-size:.9rem">These details appear on the website (header, branch pages, footer and booking confirmations).</p>` +
        branches.map((b) => `<form class="card card-pad mt-3" data-id="${b.id}">
          <h3 style="color:var(--blue-900);font-size:1.15rem">${esc(b.name)} — ${esc(b.location)}</h3>
          <div class="grid-3">
            ${field('Name', inp('name', b.name, 'required maxlength="100"'))}
            ${field('Location / branch label', inp('location', b.location, 'required maxlength="60"'))}
            ${field('Tagline', inp('tagline', b.tagline, 'maxlength="150"'))}
            ${field('Full address', inp('address', b.address, 'maxlength="200"'), 'span-2')}
            ${field('Google Maps search text', inp('map_query', b.map_query, 'maxlength="200"'))}
            ${field('Phone', inp('phone', b.phone, 'maxlength="40" placeholder="+977-98XXXXXXXX"'))}
            ${field('WhatsApp number', inp('whatsapp', b.whatsapp, 'maxlength="20" placeholder="97798XXXXXXXX"'))}
            ${field('Email', inp('email', b.email, 'type="email" maxlength="120"'))}
            ${field('Restaurant opens', inp('open_time', b.open_time, 'type="time" required'))}
            ${field('Restaurant closes', inp('close_time', b.close_time, 'type="time" required'))}
            ${field('Seating areas (comma separated)', inp('seating', b.seating, 'required maxlength="300"'))}
            ${b.has_lodging ? field('Check-in from', inp('checkin_time', b.checkin_time, 'type="time" required')) + field('Check-out by', inp('checkout_time', b.checkout_time, 'type="time" required'))
              : `<input type="hidden" name="checkin_time" value="${esc(b.checkin_time)}"><input type="hidden" name="checkout_time" value="${esc(b.checkout_time)}">`}
            ${field('Facilities (comma separated)', inp('facilities', b.facilities, 'maxlength="600"'), b.has_lodging ? '' : 'span-2')}
            ${field('Description', `<textarea class="input" name="description" maxlength="1500">${esc(b.description)}</textarea>`, 'span-all')}
          </div>
          <button class="btn btn-primary mt-2" type="submit">Save ${esc(b.location)}</button>
        </form>`).join('');
      el.onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target, btn = f.querySelector('button[type=submit]');
        setBusy(btn, true, 'Saving…');
        try {
          await api(`/branches/${f.dataset.id}`, { method: 'PUT', body: Object.fromEntries(new FormData(f)) });
          branches = await A.api('/branches');
          toast('Branch details saved', 'ok');
        } catch (x) { toast(x.message, 'err'); } finally { setBusy(btn, false); }
      };
    },
  };

  views.availability = {
    title: 'Room availability',
    actions: '<button class="btn btn-accent btn-sm" id="avMark">Mark rooms booked / available</button>',
    async render(el, params) {
      const lodges = branches.filter((b) => b.has_lodging);
      const cur = params.get('branch') || lodges[0]?.id;
      const from = params.get('from') || todayStr();
      const go = (q) => { location.hash = `availability?${new URLSearchParams({ branch: cur, from, ...q })}`; };
      const data = await api(`/availability?branch=${encodeURIComponent(cur)}&from=${from}&days=14`);
      el.innerHTML = `<p class="muted" style="font-size:.9rem">Each box shows how many rooms are <strong>still free</strong> that night. Online bookings are counted automatically.
          Click a box to mark rooms booked by phone or walk-in, or closed for cleaning or repairs. The website stops offering those rooms.</p>
        <div class="filters">
          ${field('Branch', `<select class="input" id="avBranch">${branchOptions(cur, (b) => b.has_lodging)}</select>`)}
          ${field('Starting from', `<input class="input" type="date" id="avFrom" value="${from}">`)}
          <div class="card-actions"><button class="btn btn-ghost btn-sm" data-shift="-14">← Previous 2 weeks</button>
            <button class="btn btn-ghost btn-sm" data-shift="0">Today</button><button class="btn btn-ghost btn-sm" data-shift="14">Next 2 weeks →</button></div>
        </div>
        <div class="av-legend"><span class="av-key ok"></span> Rooms free <span class="av-key low"></span> 1–2 left <span class="av-key full"></span> Fully booked <span class="av-dot"></span> Marked by staff</div>
        ${data.rooms.length ? `<div class="table-wrap"><table class="data av-table"><thead><tr><th>Room type</th>${data.dates.map((d) => `<th class="${d === todayStr() ? 'today' : ''}">${fmtDate(d, { weekday: 'short' })}<small>${fmtDate(d, { day: 'numeric', month: 'short' })}</small></th>`).join('')}</tr></thead><tbody>
          ${data.rooms.map((r) => `<tr class="${r.active ? '' : 'inactive'}"><td><strong>${esc(r.name)}</strong><small>${r.total_rooms} room(s)${r.active ? '' : ' · hidden'}</small></td>
            ${r.days.map((d) => `<td><button type="button" class="av-cell ${d.free === 0 ? 'full' : d.free <= 2 ? 'low' : 'ok'}" data-rt="${r.id}" data-date="${d.date}"
              title="${d.booked} booked online · ${d.blocked} marked by staff${d.note ? ' · ' + esc(d.note) : ''}">
              <b>${d.free}</b><small>of ${r.total_rooms}</small>${d.blocked ? `<span class="av-dot" aria-label="${d.blocked} marked by staff"></span>` : ''}</button></td>`).join('')}</tr>`).join('')}
          </tbody></table></div>` : '<div class="card empty">This branch has no room types yet. Add them in Rooms &amp; prices.</div>'}`;
      $('#avBranch').onchange = (e) => { location.hash = `availability?branch=${e.target.value}&from=${from}`; };
      $('#avFrom').onchange = (e) => e.target.value && go({ from: e.target.value });
      el.onclick = (e) => {
        const sh = e.target.closest('[data-shift]');
        if (sh) return go({ from: sh.dataset.shift === '0' ? todayStr() : A.addDays(from, Number(sh.dataset.shift)) });
        const cell = e.target.closest('.av-cell');
        if (cell) markRooms(data, Number(cell.dataset.rt), cell.dataset.date, () => views.availability.render(el, params));
      };
      $('#avMark').onclick = () => markRooms(data, null, null, () => views.availability.render(el, params));
    },
  };
  function markRooms(data, rtId, date, reload) {
    const rt = data.rooms.find((r) => r.id === rtId);
    const day = rt && rt.days.find((d) => d.date === date);
    openModal({
      title: rt ? `${rt.name} — ${fmtDate(date)}` : 'Mark rooms booked or available',
      body: `${day ? `<div class="summary"><dl><dt>Total rooms</dt><dd>${rt.total_rooms}</dd><dt>Booked online</dt><dd>${day.booked}</dd>
          <dt>Marked booked by staff</dt><dd>${day.blocked}</dd><dt>Free now</dt><dd><strong>${day.free}</strong></dd></dl></div>` : ''}
        <div class="grid-2">
          ${rt ? `<input type="hidden" name="room_type_id" value="${rt.id}">`
            : field('Room type', `<select class="input" name="room_type_id">${data.rooms.filter((r) => r.active).map((r) => `<option value="${r.id}">${esc(r.name)} (${r.total_rooms} rooms)</option>`).join('')}</select>`, 'span-2')}
          ${field('From night of', `<input class="input" type="date" name="from" required value="${date || todayStr()}">`)}
          ${field('Until night of (inclusive)', `<input class="input" type="date" name="to" required value="${date || todayStr()}">`)}
          ${field('What do you want to do?', `<select class="input" name="mode">
            <option value="sold_out">Mark as fully booked (no rooms online)</option>
            <option value="set" ${day && day.blocked && day.free ? 'selected' : ''}>Mark a number of rooms as booked</option>
            <option value="available">Mark as available (remove staff marks)</option></select>`, 'span-2')}
          ${field('How many rooms are booked offline?', `<input class="input" type="number" name="rooms" min="0" max="${rt ? rt.total_rooms : 500}" value="${day ? day.blocked || 1 : 1}">`, 'av-count')}
          ${field('Note (optional, staff only)', inp('note', day ? day.note : '', 'maxlength="200" placeholder="e.g. Phone booking – Mr. Sharma"'))}
        </div>
        <p class="muted mb-0 mt-2" style="font-size:.82rem">Online bookings are never removed. If a night has fewer free rooms than you enter, only the free rooms are marked.</p>`,
      onSubmit: async (fd) => {
        if (fd.to < fd.from) throw new Error('“Until” must be on or after “From”');
        const res = await api('/availability', { method: 'PUT', body: { ...fd, room_type_id: Number(fd.room_type_id), rooms: Number(fd.rooms) } });
        toast(res.skipped.length ? `Saved. ${res.skipped.length} night(s) had fewer free rooms, so only the free rooms were marked.` : 'Availability updated', 'ok');
        reload();
      },
    });
    const mode = $('#modalBody [name=mode]'), count = $('#modalBody .av-count');
    const sync = () => { count.hidden = mode.value !== 'set'; };
    mode.onchange = sync;
    sync();
  }

  views.offers = {
    title: 'Offers & promotions',
    actions: '<button class="btn btn-accent btn-sm" id="addOffer">+ Add offer</button>',
    async render(el) {
      const rows = await api('/offers');
      const t = todayStr();
      el.innerHTML = `<p class="muted" style="font-size:.9rem">Active offers appear on the home page, and on the branch page when they are for one branch. Expired offers are hidden automatically.</p>
        ${rows.length ? `<div class="offer-admin-grid">${rows.map((o) => {
          const expired = o.valid_until && o.valid_until < t;
          return `<div class="card offer-admin ${o.active && !expired ? '' : 'inactive'}" data-id="${o.id}">
            <div class="oa-img">${o.image_url ? `<img src="${esc(o.image_url)}" alt="">` : icon('image', 32)}${o.badge ? `<span class="oa-badge">${esc(o.badge)}</span>` : ''}</div>
            <div class="oa-body"><strong>${esc(o.title)}</strong>
              <small>${esc(o.branch_location || 'All branches')} · ${o.valid_until ? `${expired ? 'Expired' : 'Until'} ${fmtDate(o.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No end date'} · ${o.active ? (expired ? 'Hidden (expired)' : 'Shown') : 'Hidden'}</small>
              <div class="card-actions mt-1"><button class="btn btn-ghost btn-sm" data-edit>Edit</button><button class="btn btn-ghost btn-sm" data-del>Delete</button></div></div></div>`;
        }).join('')}</div>` : '<div class="card empty">No offers yet. Click “Add offer” to create your first promotion.</div>'}`;
      const form = (o = { active: 1 }) => openModal({
        title: o.id ? `Edit offer` : 'Add offer',
        body: `<div class="grid-2">
          ${field('Offer photo / poster', photoPicker('image', [o.image_url]), 'span-2')}
          ${field('Title *', inp('title', o.title, 'required maxlength="120" placeholder="Dashain special: 20% off all rooms"'), 'span-2')}
          ${field('Badge (short)', inp('badge', o.badge, 'maxlength="30" placeholder="20% OFF"'))}
          ${field('Branch', `<select class="input" name="branch_id">${branchOptions(o.branch_id || '', () => true, 'All branches')}</select>`)}
          ${field('Details', `<textarea class="input" name="description" maxlength="800" placeholder="What is included, how to claim it…">${esc(o.description || '')}</textarea>`, 'span-2')}
          ${field('Valid until (optional)', `<input class="input" type="date" name="valid_until" value="${esc(o.valid_until || '')}">`)}
          ${field('Display order', inp('sort_order', o.sort_order ?? 0, 'type="number" min="0"'))}
          <label class="check"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Show on website</label>
        </div>`,
        onSubmit: async (fd) => {
          const body = { ...fd, image_url: parsePhotos(fd.image)[0] || '', active: !!fd.active, sort_order: Number(fd.sort_order) };
          await api(o.id ? `/offers/${o.id}` : '/offers', { method: o.id ? 'PUT' : 'POST', body });
          toast('Offer saved', 'ok');
          views.offers.render(el);
        },
      });
      $('#addOffer').onclick = () => form();
      el.onclick = async (e) => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        const o = rows.find((x) => x.id === Number(card.dataset.id));
        if (e.target.matches('[data-edit]')) form(o);
        if (e.target.matches('[data-del]') && confirm(`Delete the offer "${o.title}"?`)) {
          try { await api(`/offers/${o.id}`, { method: 'DELETE' }); toast('Offer deleted', 'ok'); views.offers.render(el); } catch (x) { toast(x.message, 'err'); }
        }
      };
    },
  };

  views.website = {
    title: 'Website content',
    async render(el) {
      const s = await api('/settings');
      el.innerHTML = `<p class="muted" style="font-size:.9rem">Change the text and pictures on the home page. Leave a box empty to use the default text (shown in grey).
          Branch details, rooms, menu and offers have their own pages in this panel.</p>
        <form class="card card-pad" id="siteForm" style="max-width:820px">
          <div class="grid-2">
            ${field('Announcement bar (top of every page, optional)', inp('announcement', s.announcement, 'maxlength="200" placeholder="e.g. Dashain & Tihar bookings now open!"'), 'span-2')}
            ${field('Home page heading', inp('hero_title', s.hero_title, 'maxlength="120" placeholder="Stay, dine & celebrate —"'))}
            ${field('Heading highlight (coloured part)', inp('hero_highlight', s.hero_highlight, 'maxlength="120" placeholder="where every guest is God."'))}
            ${field('Home page intro text', `<textarea class="input" name="hero_text" maxlength="400" placeholder="Clean, comfortable rooms and authentic Nepali food at our three branches…">${esc(s.hero_text)}</textarea>`, 'span-2')}
            ${field('Home page main picture (replaces the round logo)', photoPicker('hero_image', [s.hero_image]), 'span-2')}
            ${field('“About us” text (blue band on home page)', `<textarea class="input" name="about_text" maxlength="1000" placeholder="This ancient Nepali value is the heart of Atithi…">${esc(s.about_text)}</textarea>`, 'span-2')}
          </div>
          <button class="btn btn-primary mt-3" type="submit">Save website content</button>
          <a class="btn btn-ghost mt-3" href="/" target="_blank" rel="noopener">View website ↗</a>
        </form>`;
      initPhotoPickers(el);
      $('#siteForm').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const btn = e.target.querySelector('button[type=submit]');
        setBusy(btn, true, 'Saving…');
        try { await api('/settings', { method: 'PUT', body: { ...fd, hero_image: parsePhotos(fd.hero_image)[0] || '' } }); toast('Website content saved', 'ok'); } catch (x) { toast(x.message, 'err'); } finally { setBusy(btn, false); }
      };
    },
  };

  views.settings = {
    title: 'Settings',
    async render(el) {
      const s = await api('/settings');
      el.innerHTML = `<form class="card card-pad" id="pwForm" style="max-width:480px">
        <h3 style="color:var(--blue-900);font-size:1.1rem">Change password</h3>
        ${field('Current password', '<input class="input" type="password" name="current" required autocomplete="current-password">')}
        <div class="mt-2">${field('New password (min. 8 characters)', '<input class="input" type="password" name="next" required minlength="8" autocomplete="new-password">')}</div>
        <div class="mt-2">${field('Confirm new password', '<input class="input" type="password" name="confirm" required autocomplete="new-password">')}</div>
        <button class="btn btn-primary mt-3" type="submit">Update password</button>
      </form>
      <form class="card card-pad mt-3" id="mailForm" style="max-width:820px">
        <h3 style="color:var(--blue-900);font-size:1.1rem">Booking emails <span class="status ${s.email_ready ? 'confirmed' : 'pending'}" style="font-size:.75rem;vertical-align:middle">${s.email_ready ? 'Set up' : 'Not set up'}</span></h3>
        <p class="muted" style="font-size:.88rem">Guests get an email when they book, when you confirm, and if it is cancelled. Staff get an alert for each new booking.
          <br><strong>Using Gmail?</strong> Server <code>smtp.gmail.com</code>, port <code>587</code>, username = your Gmail address, password = a Gmail <em>App password</em>
          (Google Account → Security → 2-Step Verification → App passwords). Your normal Gmail password will not work.</p>
        <div class="grid-2">
          ${field('Mail server (SMTP host)', inp('smtp_host', s.smtp_host, 'maxlength="120" placeholder="smtp.gmail.com"'))}
          ${field('Port', inp('smtp_port', s.smtp_port, 'maxlength="5" inputmode="numeric" placeholder="587"'))}
          ${field('Username', inp('smtp_user', s.smtp_user, 'maxlength="120" autocomplete="off" placeholder="yourname@gmail.com"'))}
          ${field('Password / app password', `<input class="input" type="password" name="smtp_pass" maxlength="200" autocomplete="new-password" placeholder="${s.smtp_pass_set ? '•••••••• saved. Leave blank to keep it.' : ''}">`)}
          ${field('Send emails from (address)', inp('mail_from', s.mail_from, 'type="email" maxlength="120" placeholder="Same as username"'))}
          ${field('Sender name', inp('mail_from_name', s.mail_from_name, 'maxlength="80" placeholder="Atithi Restro & Lodge"'))}
          ${field('Send new-booking alerts to (staff emails, comma separated)', inp('notify_email', s.notify_email, 'maxlength="300" placeholder="owner@example.com"'), 'span-2')}
          ${field('Website address (for the “manage my booking” link in emails)', inp('site_url', s.site_url, 'maxlength="200" placeholder="https://atithi.com.np"'), 'span-2')}
        </div>
        <p class="muted" style="font-size:.82rem">Branch emails set in Branches also get new-booking alerts for their branch.</p>
        <button class="btn btn-primary mt-2" type="submit">Save email settings</button>
        <div class="filters mt-3" style="margin-bottom:0">
          ${field('Send a test email to', '<input class="input" type="email" id="testTo" placeholder="you@example.com">', 'grow')}
          <button class="btn btn-ghost btn-sm" type="button" id="testBtn">Send test email</button>
        </div>
      </form>`;
      $('#mailForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        setBusy(btn, true, 'Saving…');
        try { await api('/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Email settings saved', 'ok'); views.settings.render(el); } catch (x) { toast(x.message, 'err'); } finally { setBusy(btn, false); }
      };
      $('#testBtn').onclick = async (e) => {
        setBusy(e.target, true, 'Sending…');
        try { await api('/settings/test-email', { method: 'POST', body: { to: $('#testTo').value } }); toast('Test email sent. Check the inbox (and spam folder).', 'ok'); } catch (x) { toast(x.message, 'err'); } finally { setBusy(e.target, false); }
      };
      $('#pwForm').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        if (fd.next !== fd.confirm) return toast('New passwords do not match', 'err');
        try { await api('/password', { method: 'POST', body: fd }); e.target.reset(); toast('Password updated', 'ok'); } catch (x) { toast(x.message, 'err'); }
      };
    },
  };

  // ---------------- Navigation ----------------
  const NAV = [
    ['dashboard', 'Dashboard', 'spark'], ['bookings', 'Room bookings', 'bed'], ['reservations', 'Table reservations', 'dish'],
    ['availability', 'Availability', 'calendar'], ['messages', 'Messages', 'mail'], ['rooms', 'Rooms & photos', 'image'],
    ['offers', 'Offers', 'tag'], ['menu', 'Menu', 'star'], ['website', 'Website content', 'globe'],
    ['branches', 'Branches', 'pin'], ['settings', 'Settings & email', 'shield'],
  ];
  function drawNav() {
    const cur = (location.hash.slice(1).split('?')[0]) || 'dashboard';
    $('#sbNav').innerHTML = NAV.map(([id, txt, ic]) => `<a href="#${id}" class="${id === cur ? 'active' : ''}">${icon(ic, 18)} ${txt}${counts[id] ? `<span class="count">${counts[id]}</span>` : ''}</a>`).join('');
  }
  async function refreshCounts() {
    try {
      const s = await api('/stats');
      counts = { bookings: s.pending_bookings, reservations: s.pending_reservations, messages: s.unread_messages };
      drawNav();
    } catch { /* ignore */ }
  }

  async function route() {
    if (!token) return;
    const [name, query] = location.hash.slice(1).split('?');
    const v = views[name] || views.dashboard;
    $('#viewTitle').textContent = v.title;
    $('#viewActions').innerHTML = v.actions || '';
    $('#sidebar').classList.remove('open');
    drawNav();
    const el = $('#view');
    el.onclick = null; el.onsubmit = null;
    el.innerHTML = '<div class="skeleton" style="height:240px"></div>';
    try { await v.render(el, new URLSearchParams(query || '')); } catch (e) { if (e.status !== 401) el.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  }

  async function startApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    try {
      const me = await api('/me');
      $('#whoami').textContent = 'Logged in as ' + me.username;
      branches = await A.api('/branches');
    } catch { return; }
    refreshCounts();
    route();
  }

  // ---------------- Init ----------------
  document.addEventListener('DOMContentLoaded', () => {
    $('#sbOpen').innerHTML = icon('menu', 26);
    $('#sbOpen').onclick = () => $('#sidebar').classList.add('open');
    document.addEventListener('click', (e) => {
      const sb = $('#sidebar');
      if (sb.classList.contains('open') && !sb.contains(e.target) && !$('#sbOpen').contains(e.target)) sb.classList.remove('open');
    });
    $('#logoutBtn').onclick = () => logout(false);
    window.addEventListener('hashchange', route);

    $('#modalClose').onclick = closeModal;
    $('#modal').addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closeModal(); });
    $('#modalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!modalSubmit) return closeModal();
      const form = e.target;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const fd = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        fd[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      }
      const btn = $('#modalSubmit');
      setBusy(btn, true, 'Saving…');
      try { await modalSubmit(fd); closeModal(); } catch (x) { toast(x.message, 'err'); } finally { setBusy(btn, false); }
    });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#lg-err'), btn = $('#lg-btn');
      err.hidden = true;
      setBusy(btn, true, 'Logging in…');
      try {
        const res = await A.api('/admin/login', { method: 'POST', body: { username: $('#lg-user').value, password: $('#lg-pass').value } });
        token = res.token;
        store.set(token);
        $('#lg-pass').value = '';
        startApp();
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
      } finally { setBusy(btn, false); }
    });

    if (token) startApp(); else $('#loginView').hidden = false;
  });
})();
