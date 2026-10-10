(function () {
  'use strict';
  const { $, esc, rs, icon, api, fmtDate, fmtTime, telHref, toast, setBusy } = window.Atithi;

  const STATUS_TEXT = {
    pending: 'Pending — our team will call you to confirm',
    confirmed: 'Confirmed — we look forward to welcoming you',
    checked_in: 'Checked in — enjoy your stay',
    checked_out: 'Checked out — thank you for staying with us',
    seated: 'Seated — enjoy your meal',
    completed: 'Completed — thank you for dining with us',
    cancelled: 'Cancelled',
    no_show: 'Marked as no-show',
  };
  let creds = null;

  function render(r) {
    const isB = r.type === 'booking';
    $('#result').innerHTML = `<div class="card card-pad summary">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <h3 class="mb-0">${isB ? 'Room booking' : 'Table reservation'} <span class="muted" style="font-weight:500">${esc(r.ref)}</span></h3>
        <span class="status ${esc(r.status)}">${esc(r.status.replace('_', ' '))}</span>
      </div>
      <p class="muted mt-2">${esc(STATUS_TEXT[r.status] || '')}</p>
      <dl>
        <dt>Branch</dt><dd>${esc(r.branch_name)} — ${esc(r.branch_location)}</dd>
        <dt>Name</dt><dd>${esc(isB ? r.guest_name : r.name)}</dd>
        ${isB ? `
          <dt>Room</dt><dd>${r.rooms} × ${esc(r.room_name)}</dd>
          <dt>Check-in</dt><dd>${fmtDate(r.check_in)}</dd>
          <dt>Check-out</dt><dd>${fmtDate(r.check_out)}</dd>
          <dt>Nights</dt><dd>${r.nights}</dd>
          <dt>Guests</dt><dd>${r.adults} adult(s)${r.children ? `, ${r.children} child(ren)` : ''}</dd>
          <dt>Total (pay at hotel)</dt><dd>${rs(r.total)}</dd>` : `
          <dt>Date</dt><dd>${fmtDate(r.date)}</dd>
          <dt>Time</dt><dd>${fmtTime(r.time)}</dd>
          <dt>Guests</dt><dd>${r.guests}</dd>
          ${r.seating ? `<dt>Seating</dt><dd>${esc(r.seating)}</dd>` : ''}
          ${r.occasion ? `<dt>Occasion</dt><dd>${esc(r.occasion)}</dd>` : ''}`}
      </dl>
      <div class="card-actions no-print">
        <button class="btn btn-ghost" type="button" onclick="window.print()">${icon('print', 18)} Print</button>
        ${r.branch_phone ? `<a class="btn btn-primary" href="${telHref(r.branch_phone)}">${icon('phone', 18)} Call branch</a>` : ''}
        ${r.can_cancel ? '<button class="btn btn-danger" type="button" id="cancelBtn">Cancel booking</button>' : ''}
      </div>
    </div>`;
    const c = $('#cancelBtn');
    if (c) c.addEventListener('click', cancel);
  }

  async function cancel() {
    if (!confirm('Are you sure you want to cancel this booking? This cannot be undone.')) return;
    const btn = $('#cancelBtn');
    setBusy(btn, true, 'Cancelling…');
    try {
      render(await api('/lookup/cancel', { method: 'POST', body: creds }));
      toast('Your booking has been cancelled.', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      setBusy(btn, false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const qs = new URLSearchParams(location.search);
    if (qs.get('ref')) $('#l-ref').value = qs.get('ref');
    $('#lookupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#l-err'), btn = $('#l-submit');
      err.hidden = true;
      creds = { ref: $('#l-ref').value.trim().toUpperCase(), phone: $('#l-phone').value.trim() };
      if (!creds.ref || !creds.phone) { err.textContent = 'Please enter both your booking reference and phone number.'; err.hidden = false; return; }
      setBusy(btn, true, 'Searching…');
      try {
        render(await api('/lookup', { method: 'POST', body: creds }));
      } catch (ex) {
        $('#result').innerHTML = '';
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        setBusy(btn, false);
      }
    });
  });
})();
