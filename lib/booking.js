'use strict';
const { db, get } = require('../db');
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

const bookedOnNight = db.prepare(`
  SELECT COALESCE(SUM(rooms), 0) AS n FROM bookings
  WHERE room_type_id = ? AND status IN ('pending','confirmed','checked_in')
    AND check_in <= ? AND check_out > ? AND id <> ?`);
const blockedOnNight = db.prepare('SELECT COALESCE(SUM(rooms), 0) AS n FROM room_blocks WHERE room_type_id = ? AND date = ?');

/** Online bookings and staff-marked (offline) rooms for one night. */
function nightUsage(roomTypeId, date, excludeBookingId = 0) {
  return {
    booked: Number(bookedOnNight.get(roomTypeId, date, date, excludeBookingId).n),
    blocked: Number(blockedOnNight.get(roomTypeId, date).n),
  };
}

/** Rooms of this type free on every night of [checkIn, checkOut). */
function roomsAvailable(roomType, checkIn, checkOut, excludeBookingId = 0) {
  let maxUsed = 0;
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const u = nightUsage(roomType.id, d, excludeBookingId);
    if (u.booked + u.blocked > maxUsed) maxUsed = u.booked + u.blocked;
  }
  return Math.max(0, roomType.total_rooms - maxUsed);
}

function getBranch(id) {
  const b = get('SELECT * FROM branches WHERE id = ?', String(id || ''));
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
  validateStay, nightUsage, roomsAvailable, getBranch, timeSlots,
};
