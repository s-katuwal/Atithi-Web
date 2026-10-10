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

  // ---------------- Modal ----------------
  let modalSubmit = null;
  function openModal({ title, body, submitLabel = 'Save', danger, onSubmit, extraFoot = '' }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalFoot').innerHTML = `${extraFoot}<button type="button" class="btn btn-ghost" data-close>Close</button>
      ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modalSubmit">${submitLabel}</button>` : ''}`;
    modalSubmit = onSubmit;
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
            <p class="muted mb-0" style="font-size:.82rem">Counts confirmed and checked-in bookings.</p>
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
          const updated = await api(`${endpoint}/${id}`, { method: 'PATCH', body });
          const i = rows.findIndex((r) => r.id === updated.id);
          rows[i] = { ...rows[i], ...updated };
          toast('Saved', 'ok');
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
              </div>`,
            onSubmit: async (fd) => { await update(r.id, { status: fd.status, admin_note: fd.admin_note }); await load(); },
          });
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
      el.innerHTML = `<p class="muted" style="font-size:.9rem">Set prices and how many rooms of each type you have. Online availability is calculated from “Number of rooms”.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Branch</th><th>Room type</th><th>Guests</th><th>Price / night</th><th>Rooms</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.active ? '' : 'inactive'}" data-id="${r.id}"><td>${esc(r.branch_location)}</td><td><strong>${esc(r.name)}</strong><small>${esc(r.beds)}</small></td>
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
          ${field('Photo URL (optional)', inp('image_url', r.image_url, 'maxlength="500" placeholder="/images/rooms/deluxe.jpg"'), 'span-2')}
          ${field('Display order', inp('sort_order', r.sort_order ?? 0, 'type="number" min="0"'))}
          ${field('Visibility', `<select class="input" name="active"><option value="1">Active — bookable</option><option value="0" ${r.active === 0 ? 'selected' : ''}>Hidden</option></select>`)}
        </div>`,
        onSubmit: async (fd) => {
          const body = { ...fd, active: fd.active === '1', price: Number(fd.price), total_rooms: Number(fd.total_rooms), capacity: Number(fd.capacity), sort_order: Number(fd.sort_order) };
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

  views.settings = {
    title: 'Settings',
    async render(el) {
      el.innerHTML = `<form class="card card-pad" id="pwForm" style="max-width:480px">
        <h3 style="color:var(--blue-900);font-size:1.1rem">Change password</h3>
        ${field('Current password', '<input class="input" type="password" name="current" required autocomplete="current-password">')}
        <div class="mt-2">${field('New password (min. 8 characters)', '<input class="input" type="password" name="next" required minlength="8" autocomplete="new-password">')}</div>
        <div class="mt-2">${field('Confirm new password', '<input class="input" type="password" name="confirm" required autocomplete="new-password">')}</div>
        <button class="btn btn-primary mt-3" type="submit">Update password</button>
      </form>`;
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
    ['messages', 'Messages', 'mail'], ['rooms', 'Rooms & prices', 'calendar'], ['menu', 'Menu', 'star'],
    ['branches', 'Branches', 'pin'], ['settings', 'Settings', 'shield'],
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
