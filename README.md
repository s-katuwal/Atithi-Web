# Atithi — Website & Online Booking

One website for all three branches:

| Branch | Lodging | Dining |
|---|---|---|
| Atithi Restro & Lodge — Laxmipur | ✅ | ✅ |
| Atithi Restro & Lodge — Birtamode | ✅ | ✅ |
| Atithi Food Garden | — | ✅ (tables, parties & events) |

## Where the data lives
- **Database:** [Supabase](https://supabase.com) Postgres. Bookings, rooms, menu, offers, settings and admin logins are all stored there. The tables and starter data are created automatically the first time the app connects.
- **Photos:** Supabase Storage, in a public bucket called `uploads` that is created automatically.
- Supabase backs up your database. You can also browse the data in the dashboard under **Table Editor**.

## Set up Supabase (once)
1. Create a project at [supabase.com](https://supabase.com). Choose a region close to Nepal, such as Mumbai (`ap-south-1`), and save the database password.
2. **Database URL:** click **Connect** at the top of the dashboard, then **Transaction pooler**, and copy the URI. Replace `[YOUR-PASSWORD]` with your database password. This is `DATABASE_URL`.
3. **Storage key:** go to **Project Settings → API Keys** and copy the **secret** key (`sb_secret_…`), or the legacy `service_role` key. This is `SUPABASE_SERVICE_ROLE_KEY`. Your project URL (`https://xxxx.supabase.co`) is `SUPABASE_URL`.
4. Put these in `.env.local` locally, and in your host's environment variables when deployed.

The tables have row level security turned on with no policies. Supabase's public Data API therefore can't read them. The website connects directly with `DATABASE_URL`, so it isn't affected.

## Run it locally
Requires **Node.js 22.13 or newer**.

```bash
npm install
cp .env.example .env.local   # then fill in your values
npm start
```

- Website: http://localhost:3000
- Staff admin panel: http://localhost:3000/admin
  - First login: username `admin`, password `atithi@2078`. **Change it right away** in Admin → Settings & email.
  - To use a different first password, set `ADMIN_PASSWORD` in `.env.local` before the first run.

**Environment variables:** `npm start` and `npm run dev` load `.env.local` automatically, and git ignores it. See `.env.example` for every option: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`, `SITE_URL`, `ADMIN_PASSWORD` and `PORT`. If the Supabase Storage variables are left out locally, photos are saved to `data/uploads/` on your computer instead.

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
- **Website content**: change almost everything on the site without touching code. That includes the logo (also used in emails), the business name, colours, top bar and announcement, every home page heading and text, the "Why Atithi" boxes, booking steps and number badges, the footer, social media links, and switches to show or hide each section, the big hero picture (separately for computers and phones), and the Gallery and Careers menu links. All editable items are listed in `lib/content.js`; add a field there to make something new editable.
- **Namaste welcome**: when someone opens the home page, a waitress greets them with namaste, "नमस्ते" appears, and the Nepali welcome message is written out left to right. It shows once per visit and can be skipped. Change the texts, upload your own picture, or switch it off in Admin → Website content → Opening animation. Add `?intro` to the address (e.g. `/?intro`) to watch it again.
- **About us page** (`/about`): the story, a photo, numbers, "What we stand for" boxes, the branches, a quote and booking buttons. All of it is edited in Admin → Website content → About us page, and each section can be shown or hidden.
- **Gallery**: upload photos (several at once), add captions, categories and branch. They appear on the Gallery page, which has filter buttons and a full-screen viewer, and the newest photos also show on the home page.
- **Careers**: post job openings (branch, type, salary, deadline, description, requirements). Candidates apply on the Careers page with an optional CV (PDF, Word, JPG or PNG, up to 3 MB). CVs are stored privately, and only logged-in staff can download them from Admin → Careers. The applicant gets a confirmation email, and staff get an alert.
- Edit the menu per branch: prices, veg/non-veg, "popular" items shown on the home page.
- Edit branch details: address, phone, WhatsApp, email, map, opening hours, seating areas, facilities.
- **Exact map location** for each branch (Admin → Branches): click the map, drag the pin, paste a Google Maps link (short phone share links work), or type coordinates. The pin is used on the **Locations** page (`/locations`, which has a map and "Get directions" for every branch), on each branch page, and in the footer's "Get directions" links.

## Booking emails
- When a guest books a room or table, they get a **"booking received"** email. Staff get a new-booking alert at the address(es) in Settings and at the branch email.
- When staff set a booking to **Confirmed**, the guest gets a **confirmation email**. If a booking is **cancelled** (by staff or by the guest at `/track`), the guest gets a cancellation email.
- Email is **required** for room bookings and optional for table reservations.
- Each booking's **Details** screen shows which emails were sent, and has buttons to resend them.
- Emails are sent with **[Resend](https://resend.com)**. To set it up:
  1. In Resend, go to **Domains**, add your domain (e.g. `atithi.com.np`) and add the DNS records it shows at your domain provider.
  2. Go to **API Keys** and create a key with "Sending access".
  3. In **Admin → Settings & email**, paste the key, set "Send emails from" to an address on your domain (e.g. `bookings@atithi.com.np`), then click **Send test email**.
  - Until your domain is verified, you can only test with `onboarding@resend.dev` as the sender, and it delivers only to your own Resend account email.
  - You can use the `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL` and `SITE_URL` environment variables instead of the admin screen.
- Guest replies go to the branch email set in Admin → Branches.
- An SMTP server (e.g. Gmail) still works as a fallback. It is used only when no Resend key is set.

## Before going live — update these in Admin
1. **Branches**: phone numbers, WhatsApp numbers, emails, and the **Food Garden address and location label**. A floating WhatsApp button appears automatically once a WhatsApp number is set.
2. **Rooms & prices**: the seeded prices and room counts are examples.
3. **Menu**: the seeded items and prices are examples.
4. **Room photos**: upload them in Admin → Rooms & photos. They are stored in Supabase Storage.
5. **Email**: set up in Admin → Settings & email (see above), including the website address used in email links.

## Deploying to Vercel
1. Push the code to GitHub and import the repository in Vercel. Vercel detects the Express app in `server.js` and serves `public/` from its CDN.
2. In **Project → Settings → Environment Variables**, add `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`, and `SITE_URL` (your live address, e.g. `https://atithi.vercel.app`). Then redeploy.
3. Use the **Transaction pooler** connection string (port `6543`) for `DATABASE_URL`, because Vercel opens many short-lived connections.

Other Node.js hosts (Render, Railway, a VPS) also work with the same environment variables. No disk is needed, since all data is in Supabase.
