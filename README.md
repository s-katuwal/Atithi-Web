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

Data is saved in `data/atithi.db` and uploaded photos in `data/uploads/`. Back up the `data` folder regularly.
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
- **Availability**: a 2-week grid per branch showing free rooms each night. Click a night to mark rooms as booked (phone or walk-in bookings, repairs), mark a room type fully booked for a date range, or mark it available again. The website stops offering marked rooms.
- **Rooms & photos**: edit room types, prices and room counts, and **upload several photos** per room type (the first is the cover).
- **Offers**: add promotions with a photo or poster, a badge (e.g. "20% OFF"), a branch and an end date. They show on the home page and branch page, and are hidden automatically after they expire.
- **Website content**: change the announcement bar, the home page heading and intro text, the main picture and the "about" text.
- Edit the menu per branch: prices, veg/non-veg, "popular" items shown on the home page.
- Edit branch details: address, phone, WhatsApp, email, map, opening hours, seating areas, facilities.

## Booking emails
- When a guest books a room or table, they get a **"booking received"** email. Staff get a new-booking alert at the address(es) in Settings and at the branch email.
- When staff set a booking to **Confirmed**, the guest gets a **confirmation email**. If a booking is **cancelled** (by staff or by the guest at `/track`), the guest gets a cancellation email.
- Email is **required** for room bookings and optional for table reservations.
- Each booking's **Details** screen shows which emails were sent, and has buttons to resend them.
- Set it up in **Admin → Settings & email**, then click **Send test email**. For Gmail use `smtp.gmail.com`, port `587`, your Gmail address, and a Gmail **App password**. Your normal Gmail password won't work. You can also use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `NOTIFY_EMAIL` and `SITE_URL` environment variables instead.

## Before going live — update these in Admin
1. **Branches**: phone numbers, WhatsApp numbers, emails, and the **Food Garden address and location label**. A floating WhatsApp button appears automatically once a WhatsApp number is set.
2. **Rooms & prices**: the seeded prices and room counts are examples.
3. **Menu**: the seeded items and prices are examples.
4. **Room photos**: upload them in Admin → Rooms & photos. Uploaded files are saved in `data/uploads/`, so back up the whole `data` folder, not just the database.
5. **Email**: set up in Admin → Settings & email (see above), including the website address used in email links.

## Deploying
Any host that runs Node.js works, for example a VPS, Render or Railway. If the host's disk is temporary, mount a persistent disk and point `DATA_DIR` at it. Put the site behind HTTPS, either with your host's TLS or with nginx and Let's Encrypt.
