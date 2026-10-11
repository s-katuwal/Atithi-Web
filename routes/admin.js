'use strict';
const crypto = require('crypto');
const express = require('express');
const { all, get, run, tx, hashPassword, verifyPassword, getSettings, saveSettings } = require('../db');
const U = require('../lib/util');
const B = require('../lib/booking');
const mail = require('../lib/mailer');
const storage = require('../lib/storage');
const content = require('../lib/content');

const router = express.Router();
const SESSION_MS = 12 * 60 * 60 * 1000;

// ---------------- Auth ----------------
router.post('/login', U.rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  const username = U.str(req.body?.username, { field: 'Username', max: 50, required: true });
  const password = U.str(req.body?.password, { field: 'Password', max: 200, required: true });
  const admin = await get('SELECT * FROM admins WHERE username = ?', username);
  if (!admin || !verifyPassword(password, admin.salt, admin.password_hash)) {
    throw new U.HttpError(401, 'Incorrect username or password');
  }
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?,?,?)', token, admin.id, Date.now() + SESSION_MS);
  res.json({ token, username: admin.username });
});

router.use(async (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const s = token && await get(`SELECT s.*, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
    WHERE s.token = ? AND s.expires_at > ?`, token, Date.now());
  if (!s) return res.status(401).json({ error: 'Please log in again' });
  req.admin = { id: s.admin_id, username: s.username, token };
  next();
});

router.post('/logout', async (req, res) => {
  await run('DELETE FROM sessions WHERE token = ?', req.admin.token);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ username: req.admin.username }));

router.post('/password', async (req, res) => {
  const current = U.str(req.body?.current, { field: 'Current password', max: 200, required: true });
  const next = U.str(req.body?.next, { field: 'New password', max: 200, required: true });
  if (next.length < 8) throw U.bad('New password must be at least 8 characters');
  const admin = await get('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!verifyPassword(current, admin.salt, admin.password_hash)) throw U.bad('Current password is incorrect');
  const { salt, hash } = hashPassword(next);
  await tx(async () => {
    await run('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, admin.id);
    await run('DELETE FROM sessions WHERE admin_id = ? AND token <> ?', admin.id, req.admin.token);
  });
  res.json({ ok: true });
});

// ---------------- Dashboard ----------------
router.get('/stats', async (req, res) => {
  const newApplications = await get("SELECT COUNT(*) AS n FROM job_applications WHERE status = 'new'");
  const t = U.today();
  const n = async (sql, ...p) => Number((await get(sql, ...p)).n);
  const [occupancy, pending_bookings, pending_reservations, arrivals_today, departures_today, reservations_today,
    unread_messages, month_revenue, upcoming_bookings, upcoming_reservations] = await Promise.all([
    all(`SELECT b.id, b.name, b.location,
        (SELECT COALESCE(SUM(total_rooms),0) FROM room_types WHERE branch_id = b.id AND active = 1) AS total,
        (SELECT COALESCE(SUM(rooms),0) FROM bookings WHERE branch_id = b.id AND status IN ('confirmed','checked_in')
          AND check_in <= ? AND check_out > ?) AS booked,
        (SELECT COALESCE(SUM(k.rooms),0) FROM room_blocks k JOIN room_types r ON r.id = k.room_type_id
          WHERE r.branch_id = b.id AND r.active = 1 AND k.date = ?) AS offline
      FROM branches b WHERE b.has_lodging = 1 ORDER BY b.sort_order`, t, t, t),
    n("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'"),
    n("SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending'"),
    n("SELECT COUNT(*) AS n FROM bookings WHERE check_in = ? AND status IN ('pending','confirmed')", t),
    n("SELECT COUNT(*) AS n FROM bookings WHERE check_out = ? AND status = 'checked_in'", t),
    n("SELECT COUNT(*) AS n FROM reservations WHERE date = ? AND status IN ('pending','confirmed','seated')", t),
    n('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0'),
    n(`SELECT COALESCE(SUM(total),0) AS n FROM bookings
      WHERE status IN ('confirmed','checked_in','checked_out') AND substr(check_in,1,7) = ?`, t.slice(0, 7)),
    all(`SELECT x.*, b.location AS branch_location FROM bookings x JOIN branches b ON b.id = x.branch_id
      WHERE x.check_in >= ? AND x.status IN ('pending','confirmed') ORDER BY x.check_in, x.id LIMIT 8`, t),
    all(`SELECT x.*, b.location AS branch_location FROM reservations x JOIN branches b ON b.id = x.branch_id
      WHERE x.date >= ? AND x.status IN ('pending','confirmed') ORDER BY x.date, x.time LIMIT 8`, t),
  ]);
  res.json({
    today: t, new_applications: newApplications.n, pending_bookings, pending_reservations, arrivals_today, departures_today, reservations_today,
    unread_messages, month_revenue, upcoming_bookings, upcoming_reservations,
    occupancy: occupancy.map(({ offline, ...o }) => ({ ...o, booked: Math.min(o.total, o.booked + offline) })),
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
    where.push(`(x.ref ILIKE ? OR x.${nameCol} ILIKE ? OR x.phone ILIKE ?)`);
    const like = `%${String(q.q).trim()}%`;
    params.push(like, like, like);
  }
  return all(`SELECT x.*, b.location AS branch_location FROM ${table} x JOIN branches b ON b.id = x.branch_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY x.created_at DESC, x.id DESC LIMIT 1000`, ...params);
}

router.get('/bookings', async (req, res) => res.json(await listQuery('bookings', 'check_in', req.query)));
router.get('/reservations', async (req, res) => res.json(await listQuery('reservations', 'date', req.query)));

// Guests get an email when staff confirm or cancel.
async function emailOnStatusChange(prev, row, isRoom) {
  if (prev === row.status || !['confirmed', 'cancelled'].includes(row.status)) return null;
  if (!row.email) return { ok: false, error: 'No guest email on this booking' };
  return mail.notifyGuest(row.status, row, isRoom);
}
router.patch('/bookings/:id', async (req, res) => {
  const bk = await get('SELECT * FROM bookings WHERE id = ?', Number(req.params.id));
  if (!bk) throw new U.HttpError(404, 'Booking not found');
  const body = req.body || {};
  const status = body.status != null ? U.oneOf(body.status, B.BOOKING_STATUSES, 'status') : bk.status;
  const note = body.admin_note != null ? U.str(body.admin_note, { field: 'Note', max: 1000 }) : bk.admin_note;
  const updated = await tx(async () => {
    // Re-activating a cancelled/finished booking must not overbook.
    if (!B.ACTIVE_BOOKING.includes(bk.status) && B.ACTIVE_BOOKING.includes(status)) {
      const rt = await get('SELECT * FROM room_types WHERE id = ?', bk.room_type_id);
      await B.lockRoomType(rt.id);
      if (await B.roomsAvailable(rt, bk.check_in, bk.check_out, bk.id) < bk.rooms) {
        throw U.bad('Not enough rooms are free for these dates to restore this booking');
      }
    }
    return (await run('UPDATE bookings SET status = ?, admin_note = ?, updated_at = now_text() WHERE id = ? RETURNING *', status, note, bk.id)).rows[0];
  });
  res.json({ ...updated, email_result: await emailOnStatusChange(bk.status, updated, true) });
});

router.patch('/reservations/:id', async (req, res) => {
  const r = await get('SELECT * FROM reservations WHERE id = ?', Number(req.params.id));
  if (!r) throw new U.HttpError(404, 'Reservation not found');
  const body = req.body || {};
  const status = body.status != null ? U.oneOf(body.status, B.RESERVATION_STATUSES, 'status') : r.status;
  const note = body.admin_note != null ? U.str(body.admin_note, { field: 'Note', max: 1000 }) : r.admin_note;
  const { rows: [updated] } = await run('UPDATE reservations SET status = ?, admin_note = ?, updated_at = now_text() WHERE id = ? RETURNING *',
    status, note, r.id);
  res.json({ ...updated, email_result: await emailOnStatusChange(r.status, updated, false) });
});

// Email history for one booking / reservation, and manual (re)send.
router.get('/emails', async (req, res) => {
  res.json(await all('SELECT * FROM email_log WHERE ref = ? ORDER BY id DESC LIMIT 50', String(req.query.ref || '')));
});
async function resendEmail(req, res, isRoom) {
  const row = await get(`SELECT * FROM ${isRoom ? 'bookings' : 'reservations'} WHERE id = ?`, Number(req.params.id));
  if (!row) throw new U.HttpError(404, 'Not found');
  const kind = U.oneOf(req.body?.kind, ['received', 'confirmed', 'cancelled'], 'email type');
  if (!row.email) throw U.bad('This guest did not give an email address');
  const r = await mail.notifyGuest(kind, row, isRoom);
  if (!r.ok) throw U.bad('Email could not be sent: ' + r.error);
  res.json({ ok: true });
}
router.post('/bookings/:id/email', (req, res) => resendEmail(req, res, true));
router.post('/reservations/:id/email', (req, res) => resendEmail(req, res, false));

function toCsv(rows, cols) {
  const esc = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
router.get('/bookings.csv', async (req, res) => {
  res.type('text/csv').attachment('atithi-room-bookings.csv').send(toCsv(await listQuery('bookings', 'check_in', req.query),
    ['ref', 'branch_location', 'room_name', 'guest_name', 'phone', 'email', 'check_in', 'check_out', 'nights', 'rooms',
      'adults', 'children', 'price_per_night', 'total', 'status', 'special_requests', 'admin_note', 'created_at']));
});
router.get('/reservations.csv', async (req, res) => {
  res.type('text/csv').attachment('atithi-table-reservations.csv').send(toCsv(await listQuery('reservations', 'date', req.query),
    ['ref', 'branch_location', 'name', 'phone', 'email', 'date', 'time', 'guests', 'seating', 'occasion', 'status',
      'notes', 'admin_note', 'created_at']));
});

// ---------------- Messages ----------------
router.get('/messages', async (req, res) => {
  res.json(await all(`SELECT m.*, b.location AS branch_location FROM messages m LEFT JOIN branches b ON b.id = m.branch_id
    ORDER BY m.created_at DESC, m.id DESC LIMIT 500`));
});
router.patch('/messages/:id', async (req, res) => {
  await run('UPDATE messages SET is_read = ? WHERE id = ?', req.body?.is_read ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});
router.delete('/messages/:id', async (req, res) => {
  await run('DELETE FROM messages WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Rooms ----------------
function photoList(v) {
  const list = (Array.isArray(v) ? v : []).map((x) => U.str(x, { field: 'Photo URL', max: 500 })).filter(Boolean);
  if (list.length > 12) throw U.bad('Up to 12 photos per room type');
  return list;
}
async function roomInput(body) {
  const b = await B.getBranch(body.branch_id);
  if (!b.has_lodging) throw U.bad('This branch does not offer rooms');
  // First photo is the cover (image_url); the rest are stored in photos.
  const photos = body.photos !== undefined ? photoList(body.photos) : [U.str(body.image_url, { field: 'Image URL', max: 500 })].filter(Boolean);
  return [
    b.id,
    U.str(body.name, { field: 'Room name', max: 80, required: true }),
    U.str(body.description, { field: 'Description', max: 600 }),
    U.int(body.capacity, { field: 'Guests per room', min: 1, max: 20 }),
    U.str(body.beds, { field: 'Beds', max: 100 }),
    U.int(body.price, { field: 'Price per night', min: 0, max: 1000000 }),
    U.int(body.total_rooms, { field: 'Number of rooms', min: 0, max: 500 }),
    U.str(body.amenities, { field: 'Amenities', max: 400 }),
    photos[0] || '',
    body.active === false || body.active === 0 ? 0 : 1,
    U.int(body.sort_order ?? 0, { field: 'Order', min: 0, max: 999 }),
    JSON.stringify(photos.slice(1)),
  ];
}
router.get('/rooms', async (req, res) => {
  res.json(await all(`SELECT r.*, b.location AS branch_location FROM room_types r JOIN branches b ON b.id = r.branch_id
    ORDER BY b.sort_order, r.sort_order, r.price`));
});
router.post('/rooms', async (req, res) => {
  const { rows } = await run(`INSERT INTO room_types (branch_id, name, description, capacity, beds, price, total_rooms, amenities, image_url, active, sort_order, photos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`, ...await roomInput(req.body || {}));
  res.status(201).json(rows[0]);
});
router.put('/rooms/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await run(`UPDATE room_types SET branch_id=?, name=?, description=?, capacity=?, beds=?, price=?, total_rooms=?, amenities=?,
    image_url=?, active=?, sort_order=?, photos=? WHERE id = ? RETURNING *`, ...await roomInput(req.body || {}), id);
  if (!rows[0]) throw new U.HttpError(404, 'Room type not found');
  res.json(rows[0]);
});
router.delete('/rooms/:id', async (req, res) => {
  const id = Number(req.params.id);
  // Keep room types that have bookings (for history); just hide them.
  if ((await get('SELECT COUNT(*) AS n FROM bookings WHERE room_type_id = ?', id)).n > 0) {
    await run('UPDATE room_types SET active = 0 WHERE id = ?', id);
    return res.json({ ok: true, deactivated: true });
  }
  await run('DELETE FROM room_types WHERE id = ?', id);
  res.json({ ok: true });
});

// ---------------- Menu ----------------
async function menuInput(body) {
  const b = await B.getBranch(body.branch_id);
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
router.get('/menu', async (req, res) => {
  res.json(await all(`SELECT m.*, b.location AS branch_location FROM menu_items m JOIN branches b ON b.id = m.branch_id
    ORDER BY b.sort_order, m.category, m.name`));
});
router.post('/menu', async (req, res) => {
  const { rows } = await run('INSERT INTO menu_items (branch_id, category, name, description, price, veg, popular, active) VALUES (?,?,?,?,?,?,?,?) RETURNING *',
    ...await menuInput(req.body || {}));
  res.status(201).json(rows[0]);
});
router.put('/menu/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await run('UPDATE menu_items SET branch_id=?, category=?, name=?, description=?, price=?, veg=?, popular=?, active=? WHERE id = ? RETURNING *',
    ...await menuInput(req.body || {}), id);
  if (!rows[0]) throw new U.HttpError(404, 'Menu item not found');
  res.json(rows[0]);
});
router.delete('/menu/:id', async (req, res) => {
  await run('DELETE FROM menu_items WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Branch details ----------------
router.put('/branches/:id', async (req, res) => {
  const b = await B.getBranch(req.params.id);
  const x = req.body || {};
  const open_time = U.time(x.open_time, 'Opening time');
  const close_time = U.time(x.close_time, 'Closing time');
  if (close_time <= open_time) throw U.bad('Closing time must be after opening time');
  const { rows } = await run(`UPDATE branches SET name=?, location=?, tagline=?, description=?, address=?, phone=?, whatsapp=?, email=?, map_query=?,
    open_time=?, close_time=?, checkin_time=?, checkout_time=?, seating=?, facilities=? WHERE id = ? RETURNING *`,
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
  res.json(rows[0]);
});

// ---------------- Room availability (mark rooms booked / available) ----------------
router.get('/availability', async (req, res) => {
  const branch = await B.getBranch(req.query.branch);
  const from = U.isDate(req.query.from) ? req.query.from : U.today();
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 62);
  const dates = Array.from({ length: days }, (_, i) => U.addDays(from, i));
  const [types, nights] = await Promise.all([
    all('SELECT * FROM room_types WHERE branch_id = ? ORDER BY active DESC, sort_order, price', branch.id),
    // Every room type × night in one query: online bookings, staff marks and the staff note.
    all(`SELECT r.id AS room_type_id, d.night,
        (SELECT COALESCE(SUM(b.rooms), 0) FROM bookings b WHERE b.room_type_id = r.id
          AND b.status IN ('pending','confirmed','checked_in') AND b.check_in <= d.night AND b.check_out > d.night) AS booked,
        COALESCE(k.rooms, 0) AS blocked, COALESCE(k.note, '') AS note
      FROM room_types r
      CROSS JOIN (SELECT to_char(g, 'YYYY-MM-DD') AS night FROM generate_series(?::date, ?::date, interval '1 day') g) d
      LEFT JOIN room_blocks k ON k.room_type_id = r.id AND k.date = d.night
      WHERE r.branch_id = ?`, dates[0], dates[days - 1], branch.id),
  ]);
  const at = new Map(nights.map((n) => [`${n.room_type_id}|${n.night}`, n]));
  const rooms = types.map((rt) => ({
    id: rt.id, name: rt.name, total_rooms: rt.total_rooms, active: rt.active,
    days: dates.map((d) => {
      const { booked = 0, blocked = 0, note = '' } = at.get(`${rt.id}|${d}`) || {};
      return { date: d, booked, blocked, free: Math.max(0, rt.total_rooms - booked - blocked), note };
    }),
  }));
  res.json({ branch_id: branch.id, dates, rooms });
});

// Set how many rooms are booked offline / unavailable on each night from `from` to `to` (inclusive).
router.put('/availability', async (req, res) => {
  const x = req.body || {};
  const rt = await get('SELECT * FROM room_types WHERE id = ?', Number(x.room_type_id) || 0);
  if (!rt) throw U.bad('Please choose a room type');
  if (!U.isDate(x.from)) throw U.bad('Please choose a start date');
  const to = U.isDate(x.to) ? x.to : x.from;
  if (to < x.from) throw U.bad('End date must be on or after the start date');
  if (U.diffDays(x.from, to) > 365) throw U.bad('Please choose a range of one year or less');
  const mode = U.oneOf(x.mode || 'set', ['set', 'sold_out', 'available'], 'mode');
  const note = U.str(x.note, { field: 'Note', max: 200 });
  const count = mode === 'set' ? U.int(x.rooms, { field: 'Rooms', min: 0, max: rt.total_rooms }) : 0;
  const skipped = [];
  await tx(async () => {
    await B.lockRoomType(rt.id);
    const nights = await all(`SELECT d.night, (SELECT COALESCE(SUM(b.rooms), 0) FROM bookings b WHERE b.room_type_id = ?
        AND b.status IN ('pending','confirmed','checked_in') AND b.check_in <= d.night AND b.check_out > d.night) AS booked
      FROM (SELECT to_char(g, 'YYYY-MM-DD') AS night FROM generate_series(?::date, ?::date, interval '1 day') g) d`, rt.id, x.from, to);
    const dates = [], counts = [];
    for (const { night, booked } of nights) {
      const free = Math.max(0, rt.total_rooms - booked); // rooms not taken by online bookings
      let n = mode === 'sold_out' ? free : count;
      if (n > free) { skipped.push(night); n = free; }
      if (n > 0) { dates.push(night); counts.push(n); }
    }
    await run('DELETE FROM room_blocks WHERE room_type_id = ? AND date >= ? AND date <= ?', rt.id, x.from, to);
    if (dates.length) {
      await run('INSERT INTO room_blocks (room_type_id, date, rooms, note) SELECT ?, unnest(?::text[]), unnest(?::int[]), ?',
        rt.id, dates, counts, note);
    }
  });
  res.json({ ok: true, skipped });
});

// ---------------- Photo uploads ----------------
function imageExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}
const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
router.post('/upload', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const ext = imageExt(buf);
  if (!ext) throw U.bad('Please upload a JPG, PNG, WEBP or GIF image');
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  try {
    res.status(201).json({ url: await storage.saveImage(name, buf, IMAGE_TYPES[ext]) });
  } catch (e) {
    console.error(e);
    throw U.bad(e.message);
  }
});

// ---------------- Offers ----------------
async function offerInput(body) {
  const valid_until = U.str(body.valid_until, { field: 'Valid until', max: 10 });
  if (valid_until && !U.isDate(valid_until)) throw U.bad('Please choose a valid end date');
  return [
    body.branch_id ? (await B.getBranch(body.branch_id)).id : null,
    U.str(body.title, { field: 'Title', max: 120, required: true }),
    U.str(body.description, { field: 'Description', max: 800 }),
    U.str(body.badge, { field: 'Badge', max: 30 }),
    U.str(body.image_url, { field: 'Image', max: 500 }),
    valid_until,
    body.active === false || body.active === 0 ? 0 : 1,
    U.int(body.sort_order ?? 0, { field: 'Order', min: 0, max: 999 }),
  ];
}
router.get('/offers', async (req, res) => {
  res.json(await all(`SELECT o.*, b.location AS branch_location FROM offers o LEFT JOIN branches b ON b.id = o.branch_id
    ORDER BY o.active DESC, o.sort_order, o.id DESC`));
});
router.post('/offers', async (req, res) => {
  const { rows } = await run(`INSERT INTO offers (branch_id, title, description, badge, image_url, valid_until, active, sort_order)
    VALUES (?,?,?,?,?,?,?,?) RETURNING *`, ...await offerInput(req.body || {}));
  res.status(201).json(rows[0]);
});
router.put('/offers/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await run(`UPDATE offers SET branch_id=?, title=?, description=?, badge=?, image_url=?, valid_until=?, active=?, sort_order=?
    WHERE id = ? RETURNING *`, ...await offerInput(req.body || {}), id);
  if (!rows[0]) throw new U.HttpError(404, 'Offer not found');
  res.json(rows[0]);
});
router.delete('/offers/:id', async (req, res) => {
  await run('DELETE FROM offers WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Website content & email settings ----------------
const SETTING_FIELDS = {
  smtp_host: 120, smtp_port: 5, smtp_user: 120, mail_from: 120, mail_from_name: 80, notify_email: 300, site_url: 200,
};
router.get('/settings', async (req, res) => {
  const s = await getSettings();
  const c = await mail.config();
  const out = Object.fromEntries(Object.keys(SETTING_FIELDS).map((k) => [k, s[k] || '']));
  res.json({
    ...out,
    smtp_pass_set: Boolean(s.smtp_pass || process.env.SMTP_PASS),
    resend_key_set: Boolean(s.resend_api_key || process.env.RESEND_API_KEY),
    email_ready: mail.isConfigured(c), email_provider: mail.provider(c),
  });
});
router.put('/settings', async (req, res) => {
  const x = req.body || {};
  const out = {};
  for (const [k, max] of Object.entries(SETTING_FIELDS)) {
    if (x[k] !== undefined) out[k] = U.str(x[k], { field: k.replace(/_/g, ' '), max });
  }
  if (out.smtp_port && !/^\d{2,5}$/.test(out.smtp_port)) throw U.bad('SMTP port must be a number such as 587 or 465');
  if (out.mail_from) U.email(out.mail_from);
  if (out.notify_email) out.notify_email.split(',').forEach((e) => U.email(e.trim()));
  if (out.site_url && !/^https?:\/\//i.test(out.site_url)) throw U.bad('Website address must start with http:// or https://');
  // Secrets are write-only: blank keeps the saved one; remove_resend_key clears it.
  if (typeof x.smtp_pass === 'string' && x.smtp_pass) out.smtp_pass = x.smtp_pass.slice(0, 200);
  if (typeof x.resend_api_key === 'string' && x.resend_api_key.trim()) {
    out.resend_api_key = x.resend_api_key.trim().slice(0, 200);
    if (!out.resend_api_key.startsWith('re_')) throw U.bad('A Resend API key starts with "re_"');
  }
  if (x.remove_resend_key) out.resend_api_key = '';
  await saveSettings(out);
  res.json({ ok: true });
});
router.post('/settings/test-email', async (req, res) => {
  const to = U.email(req.body?.to);
  if (!to) throw U.bad('Enter an email address to send the test to');
  const { html, text } = await mail.layout({
    heading: 'Test email', intro: 'Email is working. Guests will now receive booking emails from this address.',
    rows: [['Sent at', new Date().toISOString()]], outro: '',
  });
  const r = await mail.send({ to, subject: 'Atithi — test email', html, text, kind: 'test' });
  if (!r.ok) throw U.bad('Could not send: ' + r.error);
  res.json({ ok: true });
});

// ---------------- Website content (lib/content.js) ----------------
router.get('/content', async (req, res) => {
  const saved = await getSettings();
  res.json({ groups: content.GROUPS, values: Object.fromEntries(content.FIELDS.map((f) => [f.key, saved[f.key] ?? ''])) });
});
router.put('/content', async (req, res) => {
  const x = req.body || {};
  const out = {};
  for (const [key, raw] of Object.entries(x)) {
    const f = content.BY_KEY[key];
    if (!f) continue;
    let v = U.str(raw, { field: f.label, max: content.MAX[f.type] || 500 });
    if (f.type === 'toggle') v = v === '0' ? '0' : '1';
    if (f.type === 'color' && v && !/^#[0-9a-f]{6}$/i.test(v)) throw U.bad(`${f.label}: use a colour like #1774BC`);
    if (f.type === 'url' && v && !/^https?:\/\//i.test(v)) throw U.bad(`${f.label}: the link must start with https://`);
    if (f.type === 'image' && v && !/^(https?:\/\/|\/)/i.test(v)) throw U.bad(`${f.label}: please upload a picture`);
    // Saving the default text is the same as leaving it empty, so later default changes still apply.
    out[key] = v === f.default ? '' : v;
  }
  await saveSettings(out);
  res.json({ ok: true });
});

// ---------------- Gallery ----------------
async function galleryInput(body) {
  return [
    U.str(body.image_url, { field: 'Photo', max: 500, required: true }),
    U.str(body.caption, { field: 'Caption', max: 200 }),
    U.str(body.category, { field: 'Category', max: 40 }) || 'General',
    body.branch_id ? (await B.getBranch(body.branch_id)).id : null,
    body.active === false || body.active === 0 ? 0 : 1,
    U.int(body.sort_order ?? 0, { field: 'Order', min: 0, max: 9999 }),
  ];
}
router.get('/gallery', async (req, res) => {
  res.json(await all(`SELECT g.*, b.location AS branch_location FROM gallery g LEFT JOIN branches b ON b.id = g.branch_id
    ORDER BY g.sort_order, g.id DESC`));
});
router.post('/gallery', async (req, res) => {
  const { rows } = await run('INSERT INTO gallery (image_url, caption, category, branch_id, active, sort_order) VALUES (?,?,?,?,?,?) RETURNING *',
    ...await galleryInput(req.body || {}));
  res.status(201).json(rows[0]);
});
router.put('/gallery/:id', async (req, res) => {
  const { rows } = await run('UPDATE gallery SET image_url=?, caption=?, category=?, branch_id=?, active=?, sort_order=? WHERE id = ? RETURNING *',
    ...await galleryInput(req.body || {}), Number(req.params.id));
  if (!rows[0]) throw new U.HttpError(404, 'Photo not found');
  res.json(rows[0]);
});
router.delete('/gallery/:id', async (req, res) => {
  await run('DELETE FROM gallery WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- Careers: jobs & applications ----------------
async function jobInput(body) {
  const deadline = U.str(body.deadline, { field: 'Deadline', max: 10 });
  if (deadline && !U.isDate(deadline)) throw U.bad('Please choose a valid deadline');
  return [
    U.str(body.title, { field: 'Job title', max: 100, required: true }),
    body.branch_id ? (await B.getBranch(body.branch_id)).id : null,
    U.str(body.job_type, { field: 'Job type', max: 40 }) || 'Full-time',
    U.str(body.salary, { field: 'Salary', max: 80 }),
    U.str(body.description, { field: 'Description', max: 3000 }),
    U.str(body.requirements, { field: 'Requirements', max: 3000 }),
    deadline,
    body.active === false || body.active === 0 ? 0 : 1,
    U.int(body.sort_order ?? 0, { field: 'Order', min: 0, max: 999 }),
  ];
}
router.get('/jobs', async (req, res) => {
  res.json(await all(`SELECT j.*, b.location AS branch_location,
      (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applications
    FROM jobs j LEFT JOIN branches b ON b.id = j.branch_id ORDER BY j.active DESC, j.sort_order, j.id DESC`));
});
router.post('/jobs', async (req, res) => {
  const { rows } = await run(`INSERT INTO jobs (title, branch_id, job_type, salary, description, requirements, deadline, active, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`, ...await jobInput(req.body || {}));
  res.status(201).json(rows[0]);
});
router.put('/jobs/:id', async (req, res) => {
  const { rows } = await run(`UPDATE jobs SET title=?, branch_id=?, job_type=?, salary=?, description=?, requirements=?, deadline=?, active=?, sort_order=?
    WHERE id = ? RETURNING *`, ...await jobInput(req.body || {}), Number(req.params.id));
  if (!rows[0]) throw new U.HttpError(404, 'Job not found');
  res.json(rows[0]);
});
router.delete('/jobs/:id', async (req, res) => {
  await run('DELETE FROM jobs WHERE id = ?', Number(req.params.id)); // applications are kept (job_id becomes empty)
  res.json({ ok: true });
});

const APPLICATION_STATUSES = ['new', 'reviewed', 'shortlisted', 'hired', 'rejected'];
router.get('/applications', async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push('status = ?'); params.push(String(req.query.status)); }
  res.json(await all(`SELECT id, job_id, position, name, phone, email, experience, message, cv_type, cv_path <> '' AS has_cv,
      status, admin_note, created_at
    FROM job_applications ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`, ...params));
});
router.patch('/applications/:id', async (req, res) => {
  const body = req.body || {};
  const a = await get('SELECT * FROM job_applications WHERE id = ?', Number(req.params.id));
  if (!a) throw new U.HttpError(404, 'Application not found');
  const status = body.status != null ? U.oneOf(body.status, APPLICATION_STATUSES, 'status') : a.status;
  const note = body.admin_note != null ? U.str(body.admin_note, { field: 'Note', max: 1000 }) : a.admin_note;
  await run('UPDATE job_applications SET status = ?, admin_note = ? WHERE id = ?', status, note, a.id);
  res.json({ ok: true, status, admin_note: note });
});
router.delete('/applications/:id', async (req, res) => {
  await run('DELETE FROM job_applications WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});
// CVs are private: only logged-in staff can download them, through this route.
const CV_MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', png: 'image/png' };
router.get('/applications/:id/cv', async (req, res) => {
  const a = await get('SELECT * FROM job_applications WHERE id = ?', Number(req.params.id));
  if (!a || !a.cv_path) throw new U.HttpError(404, 'No CV for this application');
  let buf;
  try { buf = await storage.readPrivate(a.cv_path); } catch { throw new U.HttpError(404, 'CV file not found'); }
  const safeName = a.name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'applicant';
  res.set('Content-Type', CV_MIME[a.cv_type] || 'application/octet-stream');
  res.attachment(`CV-${safeName}.${a.cv_type || 'bin'}`);
  res.send(buf);
});

module.exports = router;
