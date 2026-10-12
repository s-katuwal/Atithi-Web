'use strict';
// Database: Supabase Postgres (any Postgres works). Set DATABASE_URL in .env.local or your host's settings.
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');

// Return COUNT/SUM (bigint/numeric) as JS numbers instead of strings.
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));

const DATABASE_URL = process.env.DATABASE_URL || '';
if (!DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set. Add your Supabase connection string to .env.local (see .env.example).\n');
}
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (e) => console.error('Database connection error:', e.message));

// Queries inside tx() automatically run on the transaction's connection.
const txClient = new AsyncLocalStorage();
// Code uses "?" placeholders; Postgres wants $1, $2, ...
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

async function query(sql, params) {
  await ready();
  return (txClient.getStore() || pool).query(toPg(sql), params);
}
const all = async (sql, ...p) => (await query(sql, p)).rows;
const get = async (sql, ...p) => (await query(sql, p)).rows[0];
const run = async (sql, ...p) => { const r = await query(sql, p); return { changes: r.rowCount, rows: r.rows }; };

async function tx(fn) {
  await ready();
  if (txClient.getStore()) return fn(); // already inside a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await txClient.run(client, fn);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
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

// ---------------- Schema ----------------
const TABLES = ['branches', 'room_types', 'menu_items', 'bookings', 'reservations', 'messages', 'admins', 'sessions',
  'room_blocks', 'offers', 'settings', 'email_log', 'gallery', 'jobs', 'job_applications'];
const SCHEMA = `
CREATE OR REPLACE FUNCTION now_text() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

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
-- Exact map pin for each branch (set in Admin → Branches).
ALTER TABLE branches ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS room_types (
  id          SERIAL PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity    INTEGER NOT NULL DEFAULT 2,
  beds        TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  total_rooms INTEGER NOT NULL DEFAULT 1,
  amenities   TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  photos      TEXT NOT NULL DEFAULT '[]',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          SERIAL PRIMARY KEY,
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
  id               SERIAL PRIMARY KEY,
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
  created_at       TEXT NOT NULL DEFAULT now_text(),
  updated_at       TEXT NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON bookings(room_type_id, check_in, check_out);

CREATE TABLE IF NOT EXISTS reservations (
  id         SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  branch_id  TEXT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
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
  id          SERIAL PRIMARY KEY,
  branch_id   TEXT REFERENCES branches(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge       TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS email_log (
  id         SERIAL PRIMARY KEY,
  ref        TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now_text()
);
CREATE INDEX IF NOT EXISTS idx_email_log_ref ON email_log(ref);

CREATE TABLE IF NOT EXISTS gallery (
  id         SERIAL PRIMARY KEY,
  image_url  TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'General',
  branch_id  TEXT REFERENCES branches(id),
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS jobs (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  branch_id    TEXT REFERENCES branches(id),
  job_type     TEXT NOT NULL DEFAULT 'Full-time',
  salary       TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  deadline     TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id         SERIAL PRIMARY KEY,
  job_id     INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  position   TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  cv_path    TEXT NOT NULL DEFAULT '',
  cv_type    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now_text()
);
`
  // Supabase exposes the public schema through its Data API. Turning on row level security with no
  // policies blocks that API completely; this server connects directly as the owner, so it is unaffected.
  + TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n');

// ---------------- Seed data (first run only) ----------------
async function seed(c) {
  if ((await c.query('SELECT COUNT(*) AS n FROM branches')).rows[0].n > 0) return;

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
  const rooms = [
    ['Standard Single', 'A cosy room for solo travellers with everything you need for a good night\'s sleep.', 1, '1 single bed', 1200, 4, 'Wi-Fi,Hot water,TV,Attached bathroom'],
    ['Standard Double', 'Comfortable room with a double bed, ideal for couples and friends.', 2, '1 double bed', 1800, 6, 'Wi-Fi,Hot water,TV,Attached bathroom,Fan'],
    ['Deluxe Room', 'Spacious room with premium bedding, seating area and extra comfort.', 3, '1 king bed + 1 extra bed on request', 2500, 4, 'Wi-Fi,Hot water,Smart TV,Attached bathroom,AC,Tea/coffee'],
    ['Family Room', 'Large room for families and groups, with space for everyone.', 4, '2 double beds', 3500, 2, 'Wi-Fi,Hot water,TV,Attached bathroom,AC,Wardrobe'],
  ];
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
  for (const b of branches) {
    await c.query(`INSERT INTO branches (id, code, name, location, tagline, description, has_lodging, has_dining,
      address, phone, whatsapp, email, map_query, open_time, close_time, seating, facilities, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [b.id, b.code, b.name, b.location, b.tagline, b.description, b.has_lodging, b.has_dining,
      b.address, b.phone, b.whatsapp, b.email, b.map_query, b.open_time || '07:00', b.close_time || '22:00',
      b.seating, b.facilities, b.sort_order]);
    if (b.has_lodging) {
      for (const [i, r] of rooms.entries()) {
        await c.query(`INSERT INTO room_types (branch_id, name, description, capacity, beds, price, total_rooms, amenities, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [b.id, ...r, i]);
      }
    }
    for (const m of b.id === 'food-garden' ? gardenMenu : restroMenu) {
      await c.query('INSERT INTO menu_items (branch_id, category, name, description, price, veg, popular) VALUES ($1,$2,$3,$4,$5,$6,$7)', [b.id, ...m]);
    }
  }
}

async function ensureAdmin(c) {
  if ((await c.query('SELECT COUNT(*) AS n FROM admins')).rows[0].n > 0) return;
  const password = process.env.ADMIN_PASSWORD || 'atithi@2078';
  const { salt, hash } = hashPassword(password);
  await c.query('INSERT INTO admins (username, password_hash, salt) VALUES ($1,$2,$3)', ['admin', hash, salt]);
  console.log(`\n  Admin account created → username: admin  password: ${password}`);
  console.log('  Please change this password from the admin panel (Settings).\n');
}

// Create tables and seed data once per process (retried on the next request if it fails).
let readyPromise = null;
function ready() {
  readyPromise ||= (async () => {
    if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(727274)'); // one instance initialises at a time
      await c.query(SCHEMA);
      await seed(c);
      await ensureAdmin(c);
      await c.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  })().catch((e) => {
    readyPromise = null;
    console.error('Database setup failed:', e.message);
    throw e;
  });
  return readyPromise;
}

// ---------------- Key/value settings ----------------
async function getSettings() {
  return Object.fromEntries((await all('SELECT key, value FROM settings')).map((r) => [r.key, r.value]));
}
async function saveSettings(obj) {
  await tx(async () => {
    for (const [k, v] of Object.entries(obj)) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v ?? ''));
    }
  });
}

module.exports = { pool, ready, all, get, run, tx, hashPassword, verifyPassword, getSettings, saveSettings };
