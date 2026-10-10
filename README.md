# Atithi — Website & Online Booking

One website for all three branches:

| Branch | Lodging | Dining |
|---|---|---|
| Atithi Restro & Lodge — Laxmipur | ✅ | ✅ |
| Atithi Restro & Lodge — Birtamode | ✅ | ✅ |
| Atithi Food Garden | — | ✅ (tables, parties & events) |

## Run it

Requires **Node.js 22.13 or newer** (it uses Node's built-in SQLite, so you don't need to install a database).

```bash
npm install
npm start
```

- Website: http://localhost:3000
- Staff admin panel: http://localhost:3000/admin
  - First login → username `admin`, password `atithi@2078`. **Change it right away** in Admin → Settings.
  - To use a different first password, start the server with `ADMIN_PASSWORD=yourpass npm start` before the first run.

Data is saved in `data/atithi.db`. Back up this file regularly.
Environment variables: `PORT` (default 3000), `DATA_DIR` (default `./data`), `ADMIN_PASSWORD` (used on first run only).

## What guests can do
- **Book a room** (Laxmipur / Birtamode). Availability is checked live and overbooking is blocked. The price total is calculated automatically.
- **Reserve a table** or book a party at any branch. Available time slots follow each branch's opening hours.
- Get a **booking reference** (e.g. `BK-LX-7K3P9Q`, `TB-FG-K29QX4`), then **check or cancel** it at `/track` using that reference plus their phone number.
- Send a **contact message**.

There is no online payment step. Guests pay at the branch.

## What staff can do (`/admin`)
- See a dashboard with pending bookings, today's arrivals, tonight's occupancy and this month's revenue.
- Confirm, check in, check out or cancel bookings, and add private notes. Export bookings to CSV.
- Manage table reservations: confirm, seated, completed, no-show.
- Edit room types, prices and room counts per branch, and add photo URLs.
- Edit the menu per branch: prices, veg/non-veg, "popular" items shown on the home page.
- Edit branch details: address, phone, WhatsApp, email, map, opening hours, seating areas, facilities.

## Before going live — update these in Admin
1. **Branches**: phone numbers, WhatsApp numbers, emails, and the **Food Garden address and location label**. A floating WhatsApp button appears automatically once a WhatsApp number is set.
2. **Rooms & prices**: the seeded prices and room counts are examples.
3. **Menu**: the seeded items and prices are examples.
4. **Room photos**: put images in `public/images/rooms/` and set the photo URL, e.g. `/images/rooms/deluxe.jpg`.

## Deploying
Any host that runs Node.js works, for example a VPS, Render or Railway. If the host's disk is temporary, mount a persistent disk and point `DATA_DIR` at it. Put the site behind HTTPS, either with your host's TLS or with nginx and Let's Encrypt.
