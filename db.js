'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'atithi.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  location      TEXT NOT NULL,
  tagline       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  has_lodging   INTEGER NOT NULL DEFAULT 0,
  has_dining    INTEGER NOT NULL DEFAULT 1,
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  whatsapp      TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  map_query     TEXT NOT NULL DEFAULT '',
  open_time     TEXT NOT NULL DEFAULT '07:00',
  close_time    TEXT NOT NULL DEFAULT '22:00',
  checkin_time  TEXT NOT NULL DEFAULT '12:00',
  checkout_time TEXT NOT NULL DEFAULT '11:00',
  seating       TEXT NOT NULL DEFAULT 'Indoor',
  facilities    TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity    INTEGER NOT NULL DEFAULT 2,
  beds        TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  total_rooms INTEGER NOT NULL DEFAULT 1,
  amenities   TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  veg         INTEGER NOT NULL DEFAULT 0,
  popular     INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref              TEXT NOT NULL UNIQUE,
  branch_id        TEXT NOT NULL REFERENCES branches(id),
  room_type_id     INTEGER NOT NULL REFERENCES room_types(id),
  room_name        TEXT NOT NULL,
  guest_name       TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT NOT NULL DEFAULT '',
  check_in         TEXT NOT NULL,
  check_out        TEXT NOT NULL,
  nights           INTEGER NOT NULL,
  rooms            INTEGER NOT NULL,
  adults           INTEGER NOT NULL,
  children         INTEGER NOT NULL DEFAULT 0,
  price_per_night  INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  special_requests TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending',
  admin_note       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON bookings(room_type_id, check_in, check_out);

CREATE TABLE IF NOT EXISTS reservations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL UNIQUE,
  branch_id  TEXT NOT NULL REFERENCES branches(id),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  guests     INTEGER NOT NULL,
  seating    TEXT NOT NULL DEFAULT '',
  occasion   TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  TEXT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Rooms staff mark as booked/unavailable outside the website (walk-ins, phone bookings, repairs), per night.
CREATE TABLE IF NOT EXISTS room_blocks (
  room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  rooms        INTEGER NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (room_type_id, date)
);

CREATE TABLE IF NOT EXISTS offers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id   TEXT REFERENCES branches(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge       TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_log_ref ON email_log(ref);
`);

// Columns added after the first release.
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
addColumn('room_types', 'photos', "TEXT NOT NULL DEFAULT '[]'"); // JSON array of extra photo URLs

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === h.length && crypto.timingSafeEqual(h, stored);
}

// ---------------- Seed data (first run only) ----------------
function seed() {
  if (get('SELECT COUNT(*) AS n FROM branches').n > 0) return;

  const branches = [
    {
      id: 'laxmipur', code: 'LX', name: 'Atithi Restro & Lodge', location: 'Laxmipur',
      tagline: 'Comfortable rooms and home-style Nepali food',
      description: 'Our Laxmipur branch offers clean, peaceful rooms for travellers and families, together with a restaurant serving fresh Nepali khana, momo and snacks from morning to night.',
      has_lodging: 1, has_dining: 1,
      address: 'Laxmipur, Nepal', phone: '', whatsapp: '', email: '',
      map_query: 'Atithi Restro and Lodge Laxmipur Nepal',
      seating: 'Indoor,Family cabin',
      facilities: 'Free Wi-Fi,Hot water,Parking,24-hour reception,Room service,Restaurant,Family friendly,CCTV security',
      sort_order: 1,
    },
    {
      id: 'birtamode', code: 'BM', name: 'Atithi Restro & Lodge', location: 'Birtamode',
      tagline: 'Your home in the heart of Birtamode',
      description: 'Located in Birtamode, Jhapa, this branch is ideal for business and family travellers. Enjoy a restful stay and authentic Nepali meals served with true Atithi hospitality.',
      has_lodging: 1, has_dining: 1,
      address: 'Birtamode, Jhapa, Nepal', phone: '', whatsapp: '', email: '',
      map_query: 'Atithi Restro and Lodge Birtamode Jhapa Nepal',
      seating: 'Indoor,Family cabin',
      facilities: 'Free Wi-Fi,Hot water,Parking,24-hour reception,Room service,Restaurant,Family friendly,CCTV security',
      sort_order: 2,
    },
    {
      id: 'food-garden', code: 'FG', name: 'Atithi Food Garden', location: 'Food Garden',
      tagline: 'Open-air dining, sekuwa and celebrations',
      description: 'Atithi Food Garden is our open-air restaurant — perfect for family meals, friends\' evenings, birthdays and office parties. Fresh sekuwa, momo, khaja sets and cool drinks in a green garden setting.',
      has_lodging: 0, has_dining: 1,
      address: 'Update this address in Admin → Branches', phone: '', whatsapp: '', email: '',
      map_query: 'Atithi Food Garden Nepal',
      open_time: '10:00', close_time: '22:00',
      seating: 'Garden (outdoor),Indoor,Party / private area',
      facilities: 'Open-air garden,Party & event hosting,Parking,Family friendly,Kids friendly,Free Wi-Fi',
      sort_order: 3,
    },
  ];
  const insB = db.prepare(`INSERT INTO branches (id, code, name, location, tagline, description, has_lodging, has_dining,
    address, phone, whatsapp, email, map_query, open_time, close_time, seating, facilities, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const rooms = [
    ['Standard Single', 'A cosy room for solo travellers with everything you need for a good night\'s sleep.', 1, '1 single bed', 1200, 4, 'Wi-Fi,Hot water,TV,Attached bathroom'],
    ['Standard Double', 'Comfortable room with a double bed, ideal for couples and friends.', 2, '1 double bed', 1800, 6, 'Wi-Fi,Hot water,TV,Attached bathroom,Fan'],
    ['Deluxe Room', 'Spacious room with premium bedding, seating area and extra comfort.', 3, '1 king bed + 1 extra bed on request', 2500, 4, 'Wi-Fi,Hot water,Smart TV,Attached bathroom,AC,Tea/coffee'],
    ['Family Room', 'Large room for families and groups, with space for everyone.', 4, '2 double beds', 3500, 2, 'Wi-Fi,Hot water,TV,Attached bathroom,AC,Wardrobe'],
  ];
  const insR = db.prepare(`INSERT INTO room_types (branch_id, name, description, capacity, beds, price, total_rooms, amenities, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  // [category, name, description, price, veg, popular]
  const restroMenu = [
    ['Breakfast', 'Aloo Paratha with Curd', 'Two stuffed parathas served with curd and pickle', 180, 1, 0],
    ['Breakfast', 'Puri Tarkari', 'Fluffy puris with potato curry', 150, 1, 0],
    ['Breakfast', 'Bread Omelette', 'Toasted bread with masala omelette', 160, 0, 0],
    ['Momo', 'Veg Momo (Steam)', 'Fresh vegetable dumplings with tomato achar', 140, 1, 1],
    ['Momo', 'Chicken Momo (Steam)', 'Juicy chicken dumplings with house achar', 180, 0, 1],
    ['Momo', 'Buff Momo (Steam)', 'Classic buff momo with sesame-tomato achar', 170, 0, 0],
    ['Momo', 'Chicken Jhol Momo', 'Chicken momo in warm, spicy jhol soup', 220, 0, 1],
    ['Momo', 'Chicken C. Momo', 'Fried momo tossed in spicy chilli sauce', 240, 0, 0],
    ['Nepali Khana', 'Veg Khana Set', 'Rice, dal, seasonal tarkari, saag, achar and papad', 350, 1, 1],
    ['Nepali Khana', 'Chicken Khana Set', 'Full khana set with local chicken curry', 450, 0, 1],
    ['Nepali Khana', 'Mutton Khana Set', 'Full khana set with mutton curry', 600, 0, 0],
    ['Nepali Khana', 'Fish Curry Set', 'Khana set with river-fish curry', 500, 0, 0],
    ['Chinese & Snacks', 'Veg Chowmein', 'Stir-fried noodles with fresh vegetables', 140, 1, 0],
    ['Chinese & Snacks', 'Chicken Chowmein', 'Stir-fried noodles with chicken', 180, 0, 0],
    ['Chinese & Snacks', 'Chicken Chilli', 'Crispy chicken tossed with peppers and onions', 350, 0, 1],
    ['Chinese & Snacks', 'Sukuti Sadeko', 'Dry meat mixed with onion, chilli and spices', 300, 0, 0],
    ['Chinese & Snacks', 'Aloo Jeera', 'Potatoes tossed with cumin', 150, 1, 0],
    ['Chinese & Snacks', 'French Fries', 'Crispy salted fries', 150, 1, 0],
    ['Beverages', 'Masala Tea', 'Milk tea brewed with spices', 40, 1, 0],
    ['Beverages', 'Milk Coffee', 'Hot milk coffee', 80, 1, 0],
    ['Beverages', 'Sweet Lassi', 'Chilled yoghurt drink', 120, 1, 0],
    ['Beverages', 'Fresh Lime Soda', 'Sweet or salted', 100, 1, 0],
    ['Beverages', 'Soft Drinks', 'Coke, Fanta, Sprite', 70, 1, 0],
  ];
  const gardenMenu = [
    ['Sekuwa & Grill', 'Chicken Sekuwa', 'Charcoal-grilled marinated chicken with beaten rice', 400, 0, 1],
    ['Sekuwa & Grill', 'Mutton Sekuwa', 'Smoky grilled mutton, Dharan style', 600, 0, 1],
    ['Sekuwa & Grill', 'Pork Sekuwa', 'Tender grilled pork with spices', 450, 0, 0],
    ['Sekuwa & Grill', 'Paneer Tikka', 'Grilled cottage cheese with peppers', 380, 1, 0],
    ['Khaja Set', 'Samay Baji', 'Newari platter: beaten rice, choila, egg, bara and more', 350, 0, 1],
    ['Khaja Set', 'Chicken Choila', 'Spiced grilled chicken with mustard oil', 320, 0, 0],
    ['Momo', 'Veg Momo (Steam)', 'Fresh vegetable dumplings with tomato achar', 140, 1, 0],
    ['Momo', 'Chicken Momo (Steam)', 'Juicy chicken dumplings with house achar', 180, 0, 1],
    ['Momo', 'Chicken Jhol Momo', 'Chicken momo in warm, spicy jhol soup', 220, 0, 0],
    ['Nepali Khana', 'Veg Khana Set', 'Rice, dal, tarkari, saag, achar and papad', 350, 1, 0],
    ['Nepali Khana', 'Chicken Khana Set', 'Full khana set with local chicken curry', 450, 0, 1],
    ['Street Snacks', 'Pani Puri', 'Crispy puris with tangy spiced water', 100, 1, 1],
    ['Street Snacks', 'Chatpate', 'Puffed rice mixed with spices, lemon and chilli', 100, 1, 0],
    ['Street Snacks', 'Chicken Chilli', 'Crispy chicken tossed with peppers and onions', 350, 0, 0],
    ['Desserts', 'Gulab Jamun', 'Two warm milk dumplings in syrup', 80, 1, 0],
    ['Desserts', 'Ice Cream', 'Vanilla, chocolate or strawberry', 120, 1, 0],
    ['Beverages', 'Masala Tea', 'Milk tea brewed with spices', 40, 1, 0],
    ['Beverages', 'Sweet Lassi', 'Chilled yoghurt drink', 120, 1, 0],
    ['Beverages', 'Fresh Juice', 'Seasonal fruit juice', 150, 1, 0],
    ['Beverages', 'Soft Drinks', 'Coke, Fanta, Sprite', 70, 1, 0],
  ];
  const insM = db.prepare(`INSERT INTO menu_items (branch_id, category, name, description, price, veg, popular) VALUES (?,?,?,?,?,?,?)`);

  tx(() => {
    for (const b of branches) {
      insB.run(b.id, b.code, b.name, b.location, b.tagline, b.description, b.has_lodging, b.has_dining,
        b.address, b.phone, b.whatsapp, b.email, b.map_query, b.open_time || '07:00', b.close_time || '22:00',
        b.seating, b.facilities, b.sort_order);
      if (b.has_lodging) rooms.forEach((r, i) => insR.run(b.id, ...r, i));
      for (const m of b.id === 'food-garden' ? gardenMenu : restroMenu) insM.run(b.id, ...m);
    }
  });
}

function ensureAdmin() {
  if (get('SELECT COUNT(*) AS n FROM admins').n > 0) return;
  const password = process.env.ADMIN_PASSWORD || 'atithi@2078';
  const { salt, hash } = hashPassword(password);
  run('INSERT INTO admins (username, password_hash, salt) VALUES (?,?,?)', 'admin', hash, salt);
  console.log(`\n  Admin account created → username: admin  password: ${password}`);
  console.log('  Please change this password from the admin panel (Settings).\n');
}

seed();
ensureAdmin();
run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

// ---------------- Key/value settings ----------------
function getSettings() {
  return Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
}
function saveSettings(obj) {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => { for (const [k, v] of Object.entries(obj)) st.run(k, String(v ?? '')); });
}

module.exports = { db, DATA_DIR, all, get, run, tx, hashPassword, verifyPassword, getSettings, saveSettings };
