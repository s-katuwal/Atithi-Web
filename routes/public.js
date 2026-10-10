'use strict';
const express = require('express');
const { all, get, run, tx, getSettings } = require('../db');
const U = require('../lib/util');
const B = require('../lib/booking');
const mail = require('../lib/mailer');

const router = express.Router();
const submitLimit = U.rateLimit({ max: 15, windowMs: 10 * 60 * 1000 });
const lookupLimit = U.rateLimit({ max: 30, windowMs: 10 * 60 * 1000 });

const publicBranch = (b) => ({ ...b, time_slots: b.has_dining ? B.timeSlots(b) : [] });
const withPhotos = (r) => {
  let photos = [];
  try { photos = JSON.parse(r.photos || '[]'); } catch { /* ignore */ }
  return { ...r, photos: [r.image_url, ...photos].filter(Boolean) };
};
const OFFERS_SQL = `SELECT o.*, b.name AS branch_name, b.location AS branch_location FROM offers o
  LEFT JOIN branches b ON b.id = o.branch_id
  WHERE o.active = 1 AND (o.valid_until = '' OR o.valid_until >= ?)`;

// Website text and images that staff can change in Admin → Website. Never exposes SMTP settings.
const SITE_KEYS = ['announcement', 'hero_title', 'hero_highlight', 'hero_text', 'hero_image', 'about_text'];
router.get('/site', (req, res) => {
  const s = getSettings();
  res.json(Object.fromEntries(SITE_KEYS.map((k) => [k, s[k] || ''])));
});

router.get('/offers', (req, res) => {
  res.json(all(`${OFFERS_SQL} ORDER BY o.sort_order, o.id DESC`, U.today()));
});

router.get('/branches', (req, res) => {
  const branches = all('SELECT * FROM branches ORDER BY sort_order');
  const fromPrice = Object.fromEntries(
    all('SELECT branch_id, MIN(price) AS p FROM room_types WHERE active = 1 GROUP BY branch_id').map((r) => [r.branch_id, r.p])
  );
  res.json(branches.map((b) => ({ ...publicBranch(b), rooms_from: fromPrice[b.id] || null })));
});

router.get('/branches/:id', (req, res) => {
  const b = B.getBranch(req.params.id);
  res.json({
    ...publicBranch(b),
    rooms: all('SELECT * FROM room_types WHERE branch_id = ? AND active = 1 ORDER BY sort_order, price', b.id).map(withPhotos),
    offers: all(`${OFFERS_SQL} AND (o.branch_id IS NULL OR o.branch_id = ?) ORDER BY o.sort_order, o.id DESC`, U.today(), b.id),
    menu: all('SELECT * FROM menu_items WHERE branch_id = ? AND active = 1 ORDER BY category, price', b.id),
  });
});

router.get('/menu/popular', (req, res) => {
  res.json(all(`SELECT m.*, b.name AS branch_name, b.location AS branch_location FROM menu_items m
    JOIN branches b ON b.id = m.branch_id WHERE m.active = 1 AND m.popular = 1 ORDER BY b.sort_order, m.category`));
});

router.get('/branches/:id/availability', (req, res) => {
  const b = B.getBranch(req.params.id);
  if (!b.has_lodging) throw U.bad('This branch does not offer rooms');
  const { check_in, check_out } = req.query;
  const nights = B.validateStay(check_in, check_out);
  const rooms = all('SELECT * FROM room_types WHERE branch_id = ? AND active = 1 ORDER BY sort_order, price', b.id)
    .map((rt) => ({ ...withPhotos(rt), available: B.roomsAvailable(rt, check_in, check_out), nights, stay_total: rt.price * nights }));
  res.json({ branch_id: b.id, check_in, check_out, nights, rooms });
});

router.post('/bookings', submitLimit, (req, res) => {
  const body = req.body || {};
  const b = B.getBranch(body.branch_id);
  if (!b.has_lodging) throw U.bad('This branch does not offer rooms');

  const check_in = body.check_in, check_out = body.check_out;
  const nights = B.validateStay(check_in, check_out);
  const rooms = U.int(body.rooms, { field: 'Number of rooms', min: 1, max: 10 });
  const adults = U.int(body.adults, { field: 'Adults', min: 1, max: 40 });
  const children = U.int(body.children ?? 0, { field: 'Children', min: 0, max: 20 });
  const guest_name = U.str(body.guest_name, { field: 'Full name', max: 100, required: true });
  const phone = U.phone(body.phone);
  const email = U.email(body.email);
  if (!email) throw U.bad('Please enter your email address so we can send your booking confirmation');
  const special_requests = U.str(body.special_requests, { field: 'Special requests', max: 1000 });

  const result = tx(() => {
    const rt = get('SELECT * FROM room_types WHERE id = ? AND branch_id = ? AND active = 1', Number(body.room_type_id) || 0, b.id);
    if (!rt) throw U.bad('Please choose a valid room type');
    if (adults + children > rt.capacity * rooms) {
      throw U.bad(`${rt.name} fits up to ${rt.capacity} guest(s) per room. Please add more rooms or choose a bigger room.`);
    }
    const available = B.roomsAvailable(rt, check_in, check_out);
    if (available < rooms) {
      throw U.bad(available === 0
        ? `Sorry, ${rt.name} is fully booked for these dates.`
        : `Only ${available} ${rt.name} room(s) are available for these dates.`);
    }
    const total = rt.price * nights * rooms;
    const ref = U.makeRef('BK', b.code);
    run(`INSERT INTO bookings (ref, branch_id, room_type_id, room_name, guest_name, phone, email, check_in, check_out,
      nights, rooms, adults, children, price_per_night, total, special_requests)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ref, b.id, rt.id, rt.name, guest_name, phone, email, check_in, check_out, nights, rooms, adults, children, rt.price, total, special_requests);
    return { ref, room_name: rt.name, price_per_night: rt.price, total };
  });

  const saved = get('SELECT * FROM bookings WHERE ref = ?', result.ref);
  mail.later(mail.notifyGuest('received', saved, true));
  mail.later(mail.notifyStaff(saved, true));

  res.status(201).json({
    ...result, type: 'booking', status: 'pending', branch_name: b.name, branch_location: b.location,
    branch_phone: b.phone, check_in, check_out, nights, rooms, adults, children, guest_name, email,
  });
});

router.post('/reservations', submitLimit, (req, res) => {
  const body = req.body || {};
  const b = B.getBranch(body.branch_id);
  if (!b.has_dining) throw U.bad('This branch does not take table reservations');

  const date = body.date;
  if (!U.isDate(date)) throw U.bad('Please choose a valid date');
  if (date < U.today()) throw U.bad('Reservation date cannot be in the past');
  if (date > U.addDays(U.today(), 180)) throw U.bad('Reservations can be made up to 6 months in advance');
  const time = U.time(body.time);
  if (!B.timeSlots(b).includes(time)) throw U.bad(`Please choose a time between ${b.open_time} and ${b.close_time}`);
  if (date === U.today() && time <= U.nowTime()) throw U.bad('That time has already passed today. Please choose a later time.');

  const guests = U.int(body.guests, { field: 'Number of guests', min: 1, max: 300 });
  const seatingOptions = b.seating.split(',').map((s) => s.trim()).filter(Boolean);
  const seating = U.str(body.seating, { field: 'Seating', max: 60 });
  if (seating && !seatingOptions.includes(seating)) throw U.bad('Please choose a valid seating area');
  const occasion = U.str(body.occasion, { field: 'Occasion', max: 60 });
  const name = U.str(body.name, { field: 'Full name', max: 100, required: true });
  const phone = U.phone(body.phone);
  const email = U.email(body.email);
  const notes = U.str(body.notes, { field: 'Notes', max: 1000 });

  const ref = U.makeRef('TB', b.code);
  run(`INSERT INTO reservations (ref, branch_id, name, phone, email, date, time, guests, seating, occasion, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ref, b.id, name, phone, email, date, time, guests, seating, occasion, notes);
  const saved = get('SELECT * FROM reservations WHERE ref = ?', ref);
  mail.later(mail.notifyGuest('received', saved, false));
  mail.later(mail.notifyStaff(saved, false));

  res.status(201).json({
    ref, type: 'reservation', status: 'pending', branch_name: b.name, branch_location: b.location,
    branch_phone: b.phone, date, time, guests, seating, occasion, name, email,
  });
});

function findByRef(ref, phone) {
  ref = U.str(ref, { field: 'Booking reference', max: 20, required: true }).toUpperCase();
  const key = U.phoneKey(U.str(phone, { field: 'Phone number', max: 20, required: true }));
  const sql = (t) => `SELECT x.*, b.name AS branch_name, b.location AS branch_location, b.phone AS branch_phone
    FROM ${t} x JOIN branches b ON b.id = x.branch_id WHERE x.ref = ?`;
  let row = get(sql('bookings'), ref), type = 'booking';
  if (!row) { row = get(sql('reservations'), ref); type = 'reservation'; }
  // Same message for "not found" and "wrong phone" so references can't be probed.
  if (!row || U.phoneKey(row.phone) !== key) throw new U.HttpError(404, 'No booking found with that reference and phone number');
  delete row.admin_note;
  return { ...row, type };
}

function canCancel(r) {
  if (!['pending', 'confirmed'].includes(r.status)) return false;
  return r.type === 'booking' ? r.check_in > U.today() : r.date >= U.today();
}

router.post('/lookup', lookupLimit, (req, res) => {
  const r = findByRef(req.body?.ref, req.body?.phone);
  res.json({ ...r, can_cancel: canCancel(r) });
});

router.post('/lookup/cancel', lookupLimit, (req, res) => {
  const r = findByRef(req.body?.ref, req.body?.phone);
  if (!canCancel(r)) throw U.bad('This booking can no longer be cancelled online. Please call the branch.');
  run(`UPDATE ${r.type === 'booking' ? 'bookings' : 'reservations'} SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`, r.id);
  mail.later(mail.notifyGuest('cancelled', r, r.type === 'booking'));
  res.json({ ...r, status: 'cancelled', can_cancel: false });
});

router.post('/messages', submitLimit, (req, res) => {
  const body = req.body || {};
  const branch_id = body.branch_id ? B.getBranch(body.branch_id).id : null;
  const name = U.str(body.name, { field: 'Name', max: 100, required: true });
  const phone = U.str(body.phone, { field: 'Phone', max: 20 });
  const email = U.email(body.email);
  if (!phone && !email) throw U.bad('Please give a phone number or email so we can reply');
  const message = U.str(body.message, { field: 'Message', max: 2000, required: true });
  run('INSERT INTO messages (branch_id, name, phone, email, message) VALUES (?,?,?,?,?)', branch_id, name, phone, email, message);
  res.status(201).json({ ok: true });
});

module.exports = router;
