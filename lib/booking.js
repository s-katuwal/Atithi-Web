'use strict';
const { get } = require('../db');
const { bad, today, isDate, addDays, diffDays } = require('./util');

// Statuses that hold a room / table.
const ACTIVE_BOOKING = ['pending', 'confirmed', 'checked_in'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
const RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
const MAX_NIGHTS = 30;

function validateStay(checkIn, checkOut) {
  if (!isDate(checkIn)) throw bad('Please choose a valid check-in date');
  if (!isDate(checkOut)) throw bad('Please choose a valid check-out date');
  if (checkIn < today()) throw bad('Check-in date cannot be in the past');
  if (checkIn > addDays(today(), 365)) throw bad('Bookings can be made up to one year in advance');
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1) throw bad('Check-out must be after check-in');
  if (nights > MAX_NIGHTS) throw bad(`Online bookings are limited to ${MAX_NIGHTS} nights. Please call us for longer stays.`);
  return nights;
}

/** Online bookings and staff-marked (offline) rooms for one night. */
async function nightUsage(roomTypeId, date, excludeBookingId = 0) {
  const r = await get(`SELECT
      (SELECT COALESCE(SUM(rooms), 0) FROM bookings WHERE room_type_id = ? AND status IN ('pending','confirmed','checked_in')
        AND check_in <= ? AND check_out > ? AND id <> ?) AS booked,
      (SELECT COALESCE(SUM(rooms), 0) FROM room_blocks WHERE room_type_id = ? AND date = ?) AS blocked`,
  roomTypeId, date, date, excludeBookingId, roomTypeId, date);
  return { booked: Number(r.booked), blocked: Number(r.blocked) };
}

/** Rooms of this type free on every night of [checkIn, checkOut). */
async function roomsAvailable(roomType, checkIn, checkOut, excludeBookingId = 0) {
  // One query for the whole stay: busiest night = most rooms used.
  const r = await get(`SELECT COALESCE(MAX(
        (SELECT COALESCE(SUM(b.rooms), 0) FROM bookings b WHERE b.room_type_id = ? AND b.status IN ('pending','confirmed','checked_in')
          AND b.check_in <= d.night AND b.check_out > d.night AND b.id <> ?)
      + (SELECT COALESCE(SUM(k.rooms), 0) FROM room_blocks k WHERE k.room_type_id = ? AND k.date = d.night)), 0) AS used
    FROM (SELECT to_char(g, 'YYYY-MM-DD') AS night
          FROM generate_series(?::date, ?::date - 1, interval '1 day') g) d`,
  roomType.id, excludeBookingId, roomType.id, checkIn, checkOut);
  return Math.max(0, roomType.total_rooms - Number(r.used));
}

/** Stops two people booking the last room at the same moment (call inside tx()). */
async function lockRoomType(roomTypeId) {
  await get('SELECT pg_advisory_xact_lock(?::int, ?::int)', 1, roomTypeId);
}

async function getBranch(id) {
  const b = await get('SELECT * FROM branches WHERE id = ?', String(id || ''));
  if (!b) throw bad('Please choose a valid branch');
  return b;
}

/** Half-hour slots between opening and 30 minutes before closing. */
function timeSlots(branch) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const slots = [];
  for (let m = toMin(branch.open_time); m <= toMin(branch.close_time) - 30; m += 30) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return slots;
}

module.exports = {
  ACTIVE_BOOKING, BOOKING_STATUSES, RESERVATION_STATUSES,
  validateStay, nightUsage, roomsAvailable, lockRoomType, getBranch, timeSlots,
};
