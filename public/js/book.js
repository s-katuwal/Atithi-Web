(function () {
  'use strict';
  const A = window.Atithi;
  const { $, $$, esc, rs, icon, list, api, getBranches, logoFor, roomArt, todayStr, addDays, fmtDate, fmtTime, telHref, toast, setBusy } = A;

  const qs = new URLSearchParams(location.search);
  let payNote = 'No advance payment. Pay at the hotel by cash, eSewa, Khalti or Fonepay. Cancel free online before your check-in date.';
  const state = {
    mode: qs.get('type') === 'table' ? 'table' : 'room',
    branches: [],
    search: null,   // availability response
    room: null,     // selected room type
    done: false,
  };
  const branchById = (id) => state.branches.find((b) => b.id === id);
  const opts = (from, to, sel, label = (n) => n) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => `<option value="${n}" ${n === sel ? 'selected' : ''}>${label(n)}</option>`).join('');
  const showErr = (el, msg) => { el.textContent = msg; el.hidden = !msg; };

  // ---------------- Mode tabs ----------------
  function setMode(mode) {
    if (state.done) return;
    state.mode = mode;
    $('#roomFlow').hidden = mode !== 'room';
    $('#tableFlow').hidden = mode !== 'table';
    $$('.book-tabs button').forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    const url = new URL(location.href);
    url.searchParams.set('type', mode);
    history.replaceState(null, '', url);
    applyTheme();
    renderSummary();
  }

  function applyTheme() {
    const id = state.mode === 'room' ? $('#r-branch').value : $('#t-branch').value;
    const b = branchById(id);
    const garden = b && !b.has_lodging;
    document.body.classList.toggle('theme-garden', !!garden);
    $('.page-hero img.logo').src = garden ? A.LOGOS.garden : A.LOGOS.lodge;
  }

  // ---------------- Room flow ----------------
  function initRoomForm() {
    const lodges = state.branches.filter((b) => b.has_lodging);
    $('#r-branch').innerHTML = lodges.map((b) => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location)}</option>`).join('');
    if (lodges.some((b) => b.id === qs.get('branch'))) $('#r-branch').value = qs.get('branch');

    const ci = $('#r-ci'), co = $('#r-co');
    ci.min = todayStr();
    ci.value = qs.get('ci') && qs.get('ci') >= todayStr() ? qs.get('ci') : todayStr();
    co.min = addDays(ci.value, 1);
    co.value = qs.get('co') && qs.get('co') > ci.value ? qs.get('co') : addDays(ci.value, 1);
    ci.addEventListener('change', () => {
      co.min = addDays(ci.value, 1);
      if (co.value <= ci.value) co.value = addDays(ci.value, 1);
    });

    $('#r-rooms').innerHTML = opts(1, 10, 1, (n) => `${n} room${n > 1 ? 's' : ''}`);
    $('#r-adults').innerHTML = opts(1, 20, Math.min(20, Number(qs.get('adults')) || 2));
    $('#r-children').innerHTML = opts(0, 10, 0);

    // Changing any search input invalidates current results.
    $$('#roomSearch select, #roomSearch input').forEach((el) => el.addEventListener('change', () => {
      if (state.search) { state.search = null; state.room = null; $('#roomResults').innerHTML = ''; $('#roomGuest').hidden = true; step(1); renderSummary(); }
      applyTheme();
    }));

    $('#roomSearch').addEventListener('submit', (e) => { e.preventDefault(); searchRooms(); });
    $('#roomResults').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (btn) pickRoom(Number(btn.dataset.pick));
    });
    $('#g-back').addEventListener('click', () => {
      state.room = null;
      $('#roomGuest').hidden = true;
      drawResults();
      step(1);
      renderSummary();
      $('#roomResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#roomGuest').addEventListener('submit', submitBooking);

    // Auto-search when arriving from a link with dates or a room.
    if (state.mode === 'room' && (qs.get('ci') || qs.get('room') || qs.get('branch'))) searchRooms(Number(qs.get('room')) || 0);
  }

  const guestsCount = () => Number($('#r-adults').value) + Number($('#r-children').value);

  async function searchRooms(preselect = 0) {
    const btn = $('#r-search'), err = $('#r-searchErr');
    showErr(err, '');
    setBusy(btn, true, 'Searching…');
    try {
      const p = new URLSearchParams({ check_in: $('#r-ci').value, check_out: $('#r-co').value });
      state.search = await api(`/branches/${$('#r-branch').value}/availability?${p}`);
      state.room = null;
      drawResults();
      if (preselect && state.search.rooms.some((r) => r.id === preselect && canPick(r))) pickRoom(preselect);
      else $('#roomResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      showErr(err, e.message);
      state.search = null;
      $('#roomResults').innerHTML = '';
    } finally {
      setBusy(btn, false);
      renderSummary();
    }
  }

  function canPick(r) {
    const rooms = Number($('#r-rooms').value);
    return r.available >= rooms && r.capacity * rooms >= guestsCount();
  }

  function drawResults() {
    const s = state.search;
    if (!s) return;
    const rooms = Number($('#r-rooms').value);
    $('#roomResults').innerHTML = `
      <h3 class="block-title" style="font-size:1.2rem">${s.rooms.length} room type${s.rooms.length === 1 ? '' : 's'} · ${s.nights} night${s.nights > 1 ? 's' : ''}</h3>
      <div class="room-grid">${s.rooms.map((r, i) => {
        const fits = r.capacity * rooms >= guestsCount();
        const enough = r.available >= rooms;
        const availCls = r.available === 0 ? 'none' : r.available <= 2 ? 'low' : 'ok';
        const availTxt = r.available === 0 ? 'Fully booked for these dates' : r.available <= 2 ? `Only ${r.available} left!` : `${r.available} rooms available`;
        const sel = state.room && state.room.id === r.id;
        return `<article class="card room-card ${sel ? 'selected' : ''} ${enough && fits ? '' : 'unavailable'}">
          <div class="room-art">${roomArt(r, i)}<span class="price-tag">${rs(r.price)} <small>/ night</small></span></div>
          <div class="room-body">
            <h4>${esc(r.name)}</h4>
            <div class="room-meta"><span>${icon('users', 15)} Up to ${r.capacity}</span>${r.beds ? `<span>${icon('bed', 15)} ${esc(r.beds)}</span>` : ''}</div>
            <p>${esc(r.description)}</p>
            <div class="amenities">${list(r.amenities).map((a) => `<span>${esc(a)}</span>`).join('')}</div>
            <div class="avail ${availCls}">${availTxt}</div>
            ${!fits && enough ? `<div class="avail low">Fits ${r.capacity * rooms} guest${r.capacity * rooms > 1 ? 's' : ''} in ${rooms} room${rooms > 1 ? 's' : ''} — add rooms for ${guestsCount()} guests</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div><strong style="color:var(--blue-700)">${rs(r.price * s.nights * rooms)}</strong><br><small class="muted">${s.nights} night${s.nights > 1 ? 's' : ''} × ${rooms} room${rooms > 1 ? 's' : ''}</small></div>
              <button class="btn ${sel ? 'btn-accent' : 'btn-primary'} btn-sm" type="button" data-pick="${r.id}" ${enough && fits ? '' : 'disabled'}>${sel ? 'Selected ✓' : 'Select'}</button>
            </div>
          </div></article>`;
      }).join('') || '<p class="empty">No rooms are listed for this branch yet. Please call us.</p>'}</div>`;
  }

  function pickRoom(id) {
    state.room = state.search.rooms.find((r) => r.id === id);
    drawResults();
    $('#roomGuest').hidden = false;
    step(2);
    renderSummary();
    $('#roomGuest').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#g-name').focus({ preventScroll: true }), 400);
  }

  async function submitBooking(e) {
    e.preventDefault();
    const err = $('#g-err'), btn = $('#g-submit');
    showErr(err, '');
    if (!$('#g-name').value.trim() || !$('#g-phone').value.trim()) return showErr(err, 'Please enter your name and mobile number.');
    if (!$('#g-email').value.trim() || !$('#g-email').checkValidity()) return showErr(err, 'Please enter a valid email address so we can send your confirmation.');
    if (!$('#g-agree').checked) return showErr(err, 'Please tick the box to continue.');
    const fd = Object.fromEntries(new FormData(e.target));
    setBusy(btn, true, 'Booking…');
    try {
      const res = await api('/bookings', {
        method: 'POST',
        body: {
          ...fd,
          branch_id: $('#r-branch').value, room_type_id: state.room.id,
          check_in: state.search.check_in, check_out: state.search.check_out,
          rooms: Number($('#r-rooms').value), adults: Number($('#r-adults').value), children: Number($('#r-children').value),
        },
      });
      step(3);
      showSuccess(res);
    } catch (ex) {
      showErr(err, ex.message);
      toast(ex.message, 'err');
      // Availability may have changed — refresh the list.
      if (/booked|available/i.test(ex.message)) { $('#roomGuest').hidden = true; searchRooms(); step(1); }
    } finally {
      setBusy(btn, false);
    }
  }

  function step(n) {
    ['#st1', '#st2', '#st3'].forEach((s, i) => $(s).classList.toggle('on', i < n));
  }

  // ---------------- Table flow ----------------
  function initTableForm() {
    const sel = $('#t-branch');
    sel.innerHTML = state.branches.filter((b) => b.has_dining).map((b) => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location)}</option>`).join('');
    if (state.branches.some((b) => b.id === qs.get('branch') && b.has_dining)) sel.value = qs.get('branch');
    const date = $('#t-date');
    date.min = todayStr();
    date.max = addDays(todayStr(), 180);
    date.value = todayStr();
    if (qs.get('occasion')) $('#t-occasion').value = qs.get('occasion');

    const refresh = () => { fillSlots(); fillSeating(); applyTheme(); renderSummary(); };
    sel.addEventListener('change', refresh);
    date.addEventListener('change', () => { fillSlots(); renderSummary(); });
    $$('#tableForm input, #tableForm select').forEach((el) => el.addEventListener('change', renderSummary));
    $('#tableForm').addEventListener('submit', submitReservation);
    refresh();
  }

  function fillSlots() {
    const b = branchById($('#t-branch').value);
    const prev = $('#t-time').value;
    const isToday = $('#t-date').value === todayStr();
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const slots = (b?.time_slots || []).filter((t) => !isToday || t > nowStr);
    $('#t-time').innerHTML = slots.length
      ? slots.map((t) => `<option value="${t}">${fmtTime(t)}</option>`).join('')
      : '<option value="">No more slots today — choose another date</option>';
    if (slots.includes(prev)) $('#t-time').value = prev;
    else if (slots.includes('19:00')) $('#t-time').value = '19:00';
  }

  function fillSeating() {
    const b = branchById($('#t-branch').value);
    $('#t-seating').innerHTML = '<option value="">No preference</option>' + list(b?.seating).map((s) => `<option>${esc(s)}</option>`).join('');
  }

  async function submitReservation(e) {
    e.preventDefault();
    const err = $('#t-err'), btn = $('#t-submit');
    showErr(err, '');
    const fd = Object.fromEntries(new FormData(e.target));
    if (!fd.time) return showErr(err, 'Please choose a time.');
    if (!fd.name.trim() || !fd.phone.trim()) return showErr(err, 'Please enter your name and mobile number.');
    setBusy(btn, true, 'Reserving…');
    try {
      const res = await api('/reservations', { method: 'POST', body: { ...fd, guests: Number(fd.guests) } });
      showSuccess(res);
    } catch (ex) {
      showErr(err, ex.message);
      toast(ex.message, 'err');
    } finally {
      setBusy(btn, false);
    }
  }

  // ---------------- Summary & success ----------------
  function renderSummary() {
    const el = $('#summary');
    if (state.done) { el.hidden = true; return; }
    if (state.mode === 'room') {
      const b = branchById($('#r-branch').value);
      const s = state.search, r = state.room;
      const rooms = Number($('#r-rooms').value);
      el.innerHTML = `<h3>Your stay</h3>
        <dl>
          <dt>Branch</dt><dd>${b ? esc(b.location) : '—'}</dd>
          <dt>Check-in</dt><dd>${fmtDate($('#r-ci').value)}</dd>
          <dt>Check-out</dt><dd>${fmtDate($('#r-co').value)}</dd>
          ${s ? `<dt>Nights</dt><dd>${s.nights}</dd>` : ''}
          <dt>Guests</dt><dd>${$('#r-adults').value} adult(s)${Number($('#r-children').value) ? `, ${$('#r-children').value} child(ren)` : ''}</dd>
          <dt>Room</dt><dd>${r ? `${rooms} × ${esc(r.name)}` : '<span class="muted">Not selected</span>'}</dd>
          ${r ? `<dt>Rate</dt><dd>${rs(r.price)} / night</dd>` : ''}
        </dl>
        <div class="total"><span>Total</span><strong>${r ? rs(r.price * s.nights * rooms) : '—'}</strong></div>
        ${b ? `<p class="muted mt-2 mb-0" style="font-size:.82rem">Check-in from ${fmtTime(b.checkin_time)} · Check-out by ${fmtTime(b.checkout_time)}</p>` : ''}
        <p class="pay-note">${icon('shield', 16)} ${esc(payNote)}</p>`;
    } else {
      const b = branchById($('#t-branch').value);
      el.innerHTML = `<h3>Your reservation</h3>
        <dl>
          <dt>Branch</dt><dd>${b ? esc(b.name) + '<br><small class="muted">' + esc(b.location) + '</small>' : '—'}</dd>
          <dt>Date</dt><dd>${fmtDate($('#t-date').value)}</dd>
          <dt>Time</dt><dd>${$('#t-time').value ? fmtTime($('#t-time').value) : '—'}</dd>
          <dt>Guests</dt><dd>${esc($('#t-guests').value)}</dd>
          ${$('#t-seating').value ? `<dt>Seating</dt><dd>${esc($('#t-seating').value)}</dd>` : ''}
          ${$('#t-occasion').value ? `<dt>Occasion</dt><dd>${esc($('#t-occasion').value)}</dd>` : ''}
        </dl>
        ${b ? `<p class="muted mb-0" style="font-size:.85rem">${icon('clock', 15)} Open ${fmtTime(b.open_time)} – ${fmtTime(b.close_time)}</p>` : ''}
        <p class="pay-note">${icon('party', 16)} Planning a party for 20+ guests? Add details in the notes and we'll call you to arrange the menu and decoration.</p>`;
    }
  }

  function showSuccess(r) {
    state.done = true;
    $('#roomFlow').hidden = true;
    $('#tableFlow').hidden = true;
    $('.book-tabs').hidden = true;
    renderSummary();
    const isBooking = r.type === 'booking';
    $('#success').innerHTML = `
      <div class="tick">${icon('check', 40)}</div>
      <h2 class="h2">${isBooking ? 'Booking received!' : 'Table reserved!'}</h2>
      <p class="muted">Thank you, ${esc(isBooking ? r.guest_name : r.name)}. Please save your booking reference:</p>
      <div class="ref-code">${esc(r.ref)}</div>
      <div class="summary" style="max-width:420px;margin:0 auto;text-align:left">
        <dl>
          <dt>Branch</dt><dd>${esc(r.branch_name)} — ${esc(r.branch_location)}</dd>
          ${isBooking ? `
            <dt>Room</dt><dd>${r.rooms} × ${esc(r.room_name)}</dd>
            <dt>Check-in</dt><dd>${fmtDate(r.check_in)}</dd>
            <dt>Check-out</dt><dd>${fmtDate(r.check_out)}</dd>
            <dt>Nights</dt><dd>${r.nights}</dd>
            <dt>Total (pay at hotel)</dt><dd>${rs(r.total)}</dd>` : `
            <dt>Date</dt><dd>${fmtDate(r.date)}</dd>
            <dt>Time</dt><dd>${fmtTime(r.time)}</dd>
            <dt>Guests</dt><dd>${r.guests}</dd>
            ${r.seating ? `<dt>Seating</dt><dd>${esc(r.seating)}</dd>` : ''}`}
          <dt>Status</dt><dd><span class="status pending">Pending confirmation</span></dd>
        </dl>
      </div>
      <p class="muted">${r.email ? `We've sent a copy to <strong>${esc(r.email)}</strong> and will email you again once your ${isBooking ? 'booking' : 'reservation'} is confirmed. ` : 'Our team will call you shortly to confirm. '}${r.branch_phone ? ` Questions? Call <a href="${telHref(r.branch_phone)}">${esc(r.branch_phone)}</a>.` : ''}</p>
      <div class="card-actions no-print" style="justify-content:center">
        <button class="btn btn-ghost" type="button" onclick="window.print()">${icon('print', 18)} Print</button>
        <a class="btn btn-primary" href="/track?ref=${encodeURIComponent(r.ref)}">View / manage booking</a>
        <a class="btn btn-accent" href="/book">Make another booking</a>
      </div>`;
    $('#success').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- Init ----------------
  document.addEventListener('DOMContentLoaded', async () => {
    A.getSite().then((s) => { if (s.pay_note) { payNote = s.pay_note; renderSummary(); } });
    $('#tab-room').innerHTML = `${icon('bed', 18)} Room stay`;
    $('#tab-table').innerHTML = `${icon('dish', 18)} Table / event`;
    $$('.book-tabs button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#r-search').insertAdjacentHTML('afterbegin', icon('search', 18));

    state.branches = await getBranches();
    // Food Garden has no rooms — send room links for it to the table form.
    if (state.mode === 'room' && qs.get('branch') && branchById(qs.get('branch')) && !branchById(qs.get('branch')).has_lodging) state.mode = 'table';
    initRoomForm();
    initTableForm();
    setMode(state.mode);
  });
})();
