'use strict';
const crypto = require('crypto');
const express = require('express');
const { all, get, run, tx, hashPassword, verifyPassword } = require('../db');
const U = require('../lib/util');
const B = require('../lib/booking');

const router = express.Router();
const SESSION_MS = 12 * 60 * 60 * 1000;

// ---------------- Auth ----------------
router.post('/login', U.rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), (req, res) => {
  const username = U.str(req.body?.username, { field: 'Username', max: 50, required: true });
  const password = U.str(req.body?.password, { field: 'Password', max: 200, required: true });
  const admin = get('SELECT * FROM admins WHERE username = ?', username);
  if (!admin || !verifyPassword(password, admin.salt, admin.password_hash)) {
    throw new U.HttpError(401, 'Incorrect username or password');
  }
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?,?,?)', token, admin.id, Date.now() + SESSION_MS);
  res.json({ token, username: admin.username });
});

router.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const s = token && get(`SELECT s.*, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
    WHERE s.token = ? AND s.expires_at > ?`, token, Date.now());
  if (!s) return res.status(401).json({ error: 'Please log in again' });
  req.admin = { id: s.admin_id, username: s.username, token };
  next();
});

router.post('/logout', (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', req.admin.token);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ username: req.admin.username }));

router.post('/password', (req, res) => {
  const current = U.str(req.body?.current, { field: 'Current password', max: 200, required: true });
  const next = U.str(req.body?.next, { field: 'New password', max: 200, required: true });
  if (next.length < 8) throw U.bad('New password must be at least 8 characters');
  const admin = get('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!verifyPassword(current, admin.salt, admin.password_hash)) throw U.bad('Current password is incorrect');
  const { salt, hash } = hashPassword(next);
  tx(() => {
    run('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, admin.id);
    run('DELETE FROM sessions WHERE admin_id = ? AND token <> ?', admin.id, req.admin.token);
  });
  res.json({ ok: true });
});

// ---------------- Dashboard ----------------
router.get('/stats', (req, res) => {
  const t = U.today();
  const n = (sql, ...p) => Number(get(sql, ...p).n);
  const occupancy = all('SELECT id, name, location FROM branches WHERE has_lodging = 1 ORDER BY sort_order').map((b) => {
    const total = n('SELECT COALESCE(SUM(total_rooms),0) AS n FROM room_types WHERE branch_id = ? AND active = 1', b.id);
    const booked = n(`SELECT COALESCE(SUM(rooms),0) AS n FROM bookings WHERE branch_id = ?
      AND status IN ('confirmed','checked_in') AND check_in <= ? AND check_out > ?`, b.id, t, t);
    return { ...b, total, booked };
  });
  res.json({
    today: t,
    pending_bookings: n("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'"),
    pending_reservations: n("SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending'"),
    arrivals_today: n("SELECT COUNT(*) AS n FROM bookings WHERE check_in = ? AND status IN ('pending','confirmed')", t),
    departures_today: n("SELECT COUNT(*) AS n FROM bookings WHERE check_out = ? AND status = 'checked_in'", t),
    reservations_today: n("SELECT COUNT(*) AS n FROM reservations WHERE date = ? AND status IN ('pending','confirmed','seated')", t),
    unread_messages: n('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0'),
    month_revenue: n(`SELECT COALESCE(SUM(total),0) AS n FROM bookings
      WHERE status IN ('confirmed','checked_in','checked_out') AND substr(check_in,1,7) = ?`, t.slice(0, 7)),
    occupancy,
    upcoming_bookings: all(`SELECT x.*, b.location AS branch_location FROM bookings x JOIN branches b ON b.id = x.branch_id
      WHERE x.check_in >= ? AND x.status IN ('pending','confirmed') ORDER BY x.check_in, x.id LIMIT 8`, t),
    upcoming_reservations: all(`SELECT x.*, b.location AS branch_location FROM reservations x JOIN branches b ON b.id = x.branch_id
      WHERE x.date >= ? AND x.status IN ('pending','confirmed') ORDER BY x.date, x.time LIMIT 8`, t),
  });
});

// ---------------- Bookings & reservations ----------------
function listQuery(table, dateCol, q) {
  const where = [], params = [];
  if (q.branch) { where.push('x.branch_id = ?'); params.push(String(q.branch)); }
  if (q.status) { where.push('x.status = ?'); params.push(String(q.status)); }
  if (q.from && U.isDate(q.from)) { where.push(`x.${dateCol} >= ?`); params.push(q.from); }
  if (q.to && U.isDate(q.to)) { where.push(`x.${dateCol} <= ?`); params.push(q.to); }
  if (q.q) {
    const nameCol = table === 'bookings' ? 'guest_name' : 'name';
    where.push(`(x.ref LIKE ? OR x.${nameCol} LIKE ? OR x.phone LIKE ?)`);
    const like = `%${String(q.q).trim()}%`;
    params.push(like, like, like);
  }
  return all(`SELECT x.*, b.location AS branch_location FROM ${table} x JOIN branches b ON b.id = x.branch_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY x.created_at DESC, x.id DESC LIMIT 1000`, ...params);
}

router.get('/bookings', (req, res) => res.json(listQuery('bookings', 'check_in', req.query)));
router.get('/reservations', (req, res) => res.json(listQuery('reservations', 'date', req.query)));

router.patch('/bookings/:id', (req, res) => {
  const bk = get('SELECT * FROM bookings WHERE id = ?', Number(req.params.id));
  if (!bk) throw new U.HttpError(404, 'Booking not found');
  const status = req.body.status != null ? U.oneOf(req.body.status, B.BOOKING_STATUSES, 'status') : bk.status;
  const note = req.body.admin_note != null ? U.str(req.body.admin_note, { field: 'Note', max: 1000 }) : bk.admin_note;
  tx(() => {
    // Re-activating a cancelled/finished booking must not overbook.
    if (!B.ACTIVE_BOOKING.includes(bk.status) && B.ACTIVE_BOOKING.includes(status)) {
      const rt = get('SELECT * FROM room_types WHERE id = ?', bk.room_type_id);
      if (B.roomsAvailable(rt, bk.check_in, bk.check_out, bk.id) < bk.rooms) {
        throw U.bad('Not enough rooms are free for these dates to restore this booking');
      }
    }
    run("UPDATE bookings SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?", status, note, bk.id);
  });
  res.json(get('SELECT * FROM bookings WHERE id = ?', bk.id));
});

router.patch('/reservations/:id', (req, res) => {
  const r = get('SELECT * FROM reservations WHERE id = ?', Number(req.params.id));
  if (!r) throw new U.HttpError(404, 'Reservation not found');
  const status = req.body.status != null ? U.oneOf(req.body.status, B.RESERVATION_STATUSES, 'status') : r.status;
  const note = req.body.admin_note != null ? U.str(req.body.admin_note, { field: 'Note', max: 1000 }) : r.admin_note;
  run("UPDATE reservations SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?", status, note, r.id);
  res.json(get('SELECT * FROM reservations WHERE id = ?', r.id));
});

function toCsv(rows, cols) {
  const esc = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
router.get('/bookings.csv', (req, res) => {
  res.type('text/csv').attachment('atithi-room-bookings.csv').send(toCsv(listQuery('bookings', 'check_in', req.query),
    ['ref', 'branch_location', 'room_name', 'guest_name', 'phone', 'email', 'check_in', 'check_out', 'nights', 'rooms',
      'adults', 'children', 'price_per_night', 'total', 'status', 'special_requests', 'admin_note', 'created_at']));
});
router.get('/reservations.csv', (req, res) => {
  res.type('text/csv').attachment('atithi-table-reservations.csv').send(toCsv(listQuery('reservations', 'date', req.query),
    ['ref', 'branch_location', 'name', 'phone', 'email', 'date', 'time', 'guests', 'seating', 'occasion', 'status',
      'notes', 'admin_note', 'created_at']));
});

// ---------------- Messages ----------------
router.get('/messages', (req, res) => {
  res.json(all(`SELECT m.*, b.location AS branch_location FROM messages m LEFT JOIN branches b ON b.id = m.branch_id
    ORDER BY m.created_at DESC, m.id DESC LIMIT 500`));
});
router.patch('/messages/:id', (req, res) => {
  run('UPDATE messages SET is_read = ? WHERE id = ?', req.body.is_read ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/messages/:id', (req, res) => {
  run('DELETE FROM messages WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Rooms ----------------
function roomInput(body) {
  const b = B.getBranch(body.branch_id);
  if (!b.has_lodging) throw U.bad('This branch does not offer rooms');
  return [
    b.id,
    U.str(body.name, { field: 'Room name', max: 80, required: true }),
    U.str(body.description, { field: 'Description', max: 600 }),
    U.int(body.capacity, { field: 'Guests per room', min: 1, max: 20 }),
    U.str(body.beds, { field: 'Beds', max: 100 }),
    U.int(body.price, { field: 'Price per night', min: 0, max: 1000000 }),
    U.int(body.total_rooms, { field: 'Number of rooms', min: 0, max: 500 }),
    U.str(body.amenities, { field: 'Amenities', max: 400 }),
    U.str(body.image_url, { field: 'Image URL', max: 500 }),
    body.active === false || body.active === 0 ? 0 : 1,
    U.int(body.sort_order ?? 0, { field: 'Order', min: 0, max: 999 }),
  ];
}
router.get('/rooms', (req, res) => {
  res.json(all(`SELECT r.*, b.location AS branch_location FROM room_types r JOIN branches b ON b.id = r.branch_id
    ORDER BY b.sort_order, r.sort_order, r.price`));
});
router.post('/rooms', (req, res) => {
  const r = run(`INSERT INTO room_types (branch_id, name, description, capacity, beds, price, total_rooms, amenities, image_url, active, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ...roomInput(req.body || {}));
  res.status(201).json(get('SELECT * FROM room_types WHERE id = ?', Number(r.lastInsertRowid)));
});
router.put('/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM room_types WHERE id = ?', id)) throw new U.HttpError(404, 'Room type not found');
  run(`UPDATE room_types SET branch_id=?, name=?, description=?, capacity=?, beds=?, price=?, total_rooms=?, amenities=?,
    image_url=?, active=?, sort_order=? WHERE id = ?`, ...roomInput(req.body || {}), id);
  res.json(get('SELECT * FROM room_types WHERE id = ?', id));
});
router.delete('/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  // Keep room types that have bookings (for history); just hide them.
  if (get('SELECT COUNT(*) AS n FROM bookings WHERE room_type_id = ?', id).n > 0) {
    run('UPDATE room_types SET active = 0 WHERE id = ?', id);
    return res.json({ ok: true, deactivated: true });
  }
  run('DELETE FROM room_types WHERE id = ?', id);
  res.json({ ok: true });
});

// ---------------- Menu ----------------
function menuInput(body) {
  const b = B.getBranch(body.branch_id);
  return [
    b.id,
    U.str(body.category, { field: 'Category', max: 60, required: true }),
    U.str(body.name, { field: 'Item name', max: 100, required: true }),
    U.str(body.description, { field: 'Description', max: 300 }),
    U.int(body.price, { field: 'Price', min: 0, max: 1000000 }),
    body.veg ? 1 : 0,
    body.popular ? 1 : 0,
    body.active === false || body.active === 0 ? 0 : 1,
  ];
}
router.get('/menu', (req, res) => {
  res.json(all(`SELECT m.*, b.location AS branch_location FROM menu_items m JOIN branches b ON b.id = m.branch_id
    ORDER BY b.sort_order, m.category, m.name`));
});
router.post('/menu', (req, res) => {
  const r = run('INSERT INTO menu_items (branch_id, category, name, description, price, veg, popular, active) VALUES (?,?,?,?,?,?,?,?)',
    ...menuInput(req.body || {}));
  res.status(201).json(get('SELECT * FROM menu_items WHERE id = ?', Number(r.lastInsertRowid)));
});
router.put('/menu/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM menu_items WHERE id = ?', id)) throw new U.HttpError(404, 'Menu item not found');
  run('UPDATE menu_items SET branch_id=?, category=?, name=?, description=?, price=?, veg=?, popular=?, active=? WHERE id = ?',
    ...menuInput(req.body || {}), id);
  res.json(get('SELECT * FROM menu_items WHERE id = ?', id));
});
router.delete('/menu/:id', (req, res) => {
  run('DELETE FROM menu_items WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Branch details ----------------
router.put('/branches/:id', (req, res) => {
  const b = B.getBranch(req.params.id);
  const x = req.body || {};
  const open_time = U.time(x.open_time, 'Opening time');
  const close_time = U.time(x.close_time, 'Closing time');
  if (close_time <= open_time) throw U.bad('Closing time must be after opening time');
  run(`UPDATE branches SET name=?, location=?, tagline=?, description=?, address=?, phone=?, whatsapp=?, email=?, map_query=?,
    open_time=?, close_time=?, checkin_time=?, checkout_time=?, seating=?, facilities=? WHERE id = ?`,
  U.str(x.name, { field: 'Name', max: 100, required: true }),
  U.str(x.location, { field: 'Location', max: 60, required: true }),
  U.str(x.tagline, { field: 'Tagline', max: 150 }),
  U.str(x.description, { field: 'Description', max: 1500 }),
  U.str(x.address, { field: 'Address', max: 200 }),
  U.str(x.phone, { field: 'Phone', max: 40 }),
  U.str(x.whatsapp, { field: 'WhatsApp', max: 20 }).replace(/\D/g, ''),
  U.email(x.email),
  U.str(x.map_query, { field: 'Map search', max: 200 }),
  open_time, close_time,
  U.time(x.checkin_time, 'Check-in time'),
  U.time(x.checkout_time, 'Check-out time'),
  U.str(x.seating, { field: 'Seating', max: 300, required: true }),
  U.str(x.facilities, { field: 'Facilities', max: 600 }),
  b.id);
  res.json(get('SELECT * FROM branches WHERE id = ?', b.id));
});

module.exports = router;
