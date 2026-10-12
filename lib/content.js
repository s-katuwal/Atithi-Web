'use strict';
// Everything on the website that staff can change in Admin → Website content, without touching code.
// The admin form is built from this list, and the website reads the values from /api/site.
// To make something new editable: add a field here, then show it on the page (data-c="key" or in JS).
//
// Types: text, textarea, image, color, toggle ('1' shown / '0' hidden), url, and list.
// A list is one item per line, with parts separated by " | " (the parts are described in `hint`).

const ICONS = 'bed, dish, wifi, car, clock, users, party, shield, leaf, star, water, pin, phone, mail, check, calendar, spark, image, tag';

const GROUPS = [
  {
    id: 'brand', title: 'Logo, name & colours',
    fields: [
      { key: 'site_logo', label: 'Logo (top-left of every page, footer and emails)', type: 'image', default: '/images/logo-atithi.jpg' },
      { key: 'site_name', label: 'Business name next to the logo', type: 'text', default: 'Atithi' },
      { key: 'site_tagline', label: 'Small text under the name', type: 'text', default: 'Restro · Lodge · Food Garden' },
      { key: 'color_primary', label: 'Main colour (buttons, headings)', type: 'color', default: '#1774BC' },
      { key: 'color_accent', label: 'Accent colour (highlights, “Book now”)', type: 'color', default: '#F5A11C' },
    ],
  },
  {
    id: 'topbar', title: 'Top bar & announcement',
    fields: [
      { key: 'announcement', label: 'Announcement bar (leave empty to hide)', type: 'text', default: '' },
      { key: 'topbar_motto', label: 'Motto (Nepali)', type: 'text', default: 'अतिथि देवो भवः' },
      { key: 'topbar_motto_en', label: 'Motto (English)', type: 'text', default: '— A guest is like God' },
      { key: 'topbar_middle', label: 'Middle text', type: 'text', default: 'Laxmipur · Birtamode · Food Garden' },
    ],
  },
  {
    id: 'pages', title: 'Menu links & pages',
    fields: [
      { key: 'show_gallery', label: 'Show “Gallery” page in the menu', type: 'toggle', default: '1' },
      { key: 'show_careers', label: 'Show “Careers” page in the menu', type: 'toggle', default: '1' },
      { key: 'show_locations', label: 'Show “Locations” page in the menu', type: 'toggle', default: '1' },
      { key: 'book_btn', label: 'Header button text', type: 'text', default: 'Book Now' },
    ],
  },
  {
    id: 'hero', title: 'Home — top section',
    fields: [
      { key: 'hero_motto', label: 'Small line above the heading', type: 'text', default: 'अतिथि देवो भवः' },
      { key: 'hero_title', label: 'Heading', type: 'text', default: 'Stay, dine & celebrate —' },
      { key: 'hero_highlight', label: 'Heading highlight (coloured part)', type: 'text', default: 'where every guest is God.' },
      { key: 'hero_text', label: 'Intro text', type: 'textarea', default: 'Clean, comfortable rooms and authentic Nepali food at our three branches — Atithi Restro & Lodge in Laxmipur and Birtamode, and the open-air Atithi Food Garden.' },
      { key: 'hero_btn_room', label: 'First button text', type: 'text', default: 'Book a Room' },
      { key: 'hero_btn_table', label: 'Second button text', type: 'text', default: 'Reserve a Table' },
      { key: 'hero_badges', label: 'Numbers under the buttons', type: 'list', hint: 'Number | label', default: '3 | Branches\n2 | Lodges with rooms\n2078 | Serving since (B.S.)' },
      { key: 'hero_image', label: 'Big picture (empty = round logo)', type: 'image', default: '' },
      { key: 'show_hero_image', label: 'Show the big picture / logo (computers)', type: 'toggle', default: '1' },
      { key: 'show_hero_image_mobile', label: 'Show the big picture / logo on phones', type: 'toggle', default: '0' },
      { key: 'show_quick_book', label: 'Show the “Check availability” bar', type: 'toggle', default: '1' },
    ],
  },
  {
    id: 'home_sections', title: 'Home — sections',
    fields: [
      { key: 'show_offers', label: 'Show “Special offers” (when there are offers)', type: 'toggle', default: '1' },
      { key: 'offers_eyebrow', label: 'Offers — small title', type: 'text', default: 'Special offers' },
      { key: 'offers_title', label: 'Offers — heading', type: 'text', default: "Deals you won't want to miss" },
      { key: 'show_branches', label: 'Show “Our branches”', type: 'toggle', default: '1' },
      { key: 'branches_eyebrow', label: 'Branches — small title', type: 'text', default: 'Our Branches' },
      { key: 'branches_title', label: 'Branches — heading', type: 'text', default: 'One family, three welcoming places' },
      { key: 'branches_text', label: 'Branches — text', type: 'textarea', default: 'Choose the branch that suits you — stay overnight at our lodges or gather with loved ones at the Food Garden.' },
      { key: 'show_motto', label: 'Show the blue “about us” band', type: 'toggle', default: '1' },
      { key: 'motto_big', label: 'About band — big text', type: 'text', default: 'अतिथि देवो भवः' },
      { key: 'motto_quote', label: 'About band — quote', type: 'text', default: '“The guest is equal to God.”' },
      { key: 'about_text', label: 'About band — paragraph', type: 'textarea', default: 'This ancient Nepali value is the heart of Atithi. Whether you check in for one night at Laxmipur or Birtamode, or celebrate a birthday under the lights of the Food Garden, our family treats yours with care, cleanliness and honest home-style cooking.' },
      { key: 'motto_btn', label: 'About band — button text', type: 'text', default: 'Plan your visit' },
      { key: 'show_features', label: 'Show “Why Atithi”', type: 'toggle', default: '1' },
      { key: 'features_eyebrow', label: 'Why Atithi — small title', type: 'text', default: 'Why Atithi' },
      { key: 'features_title', label: 'Why Atithi — heading', type: 'text', default: "Everything you need, nothing you don't" },
      { key: 'features', label: 'Why Atithi — boxes', type: 'list', hint: `icon | title | text. Icons: ${ICONS}`, default: [
        'bed | Clean, cosy rooms | Fresh linen, attached bathrooms and hot water in every room.',
        'dish | Home-style kitchen | Nepali khana, momo, sekuwa and snacks cooked fresh every day.',
        'wifi | Free Wi-Fi | Stay connected for work or calls home throughout your stay.',
        'car | Safe parking | Space for cars and bikes, with CCTV for peace of mind.',
        'clock | 24-hour reception | Arrive late or leave early — someone is always here to help.',
        'users | Family friendly | Family rooms, kids-friendly menu and space to relax together.',
        'party | Parties & events | Birthdays, reunions and office gatherings at the Food Garden.',
        'shield | Trusted & local | A family-run business serving guests since 2078 B.S.',
      ].join('\n') },
      { key: 'show_home_gallery', label: 'Show gallery preview (latest photos)', type: 'toggle', default: '1' },
      { key: 'home_gallery_eyebrow', label: 'Gallery preview — small title', type: 'text', default: 'Gallery' },
      { key: 'home_gallery_title', label: 'Gallery preview — heading', type: 'text', default: 'A look inside Atithi' },
      { key: 'show_dishes', label: 'Show “Guest favourites” dishes', type: 'toggle', default: '1' },
      { key: 'dishes_eyebrow', label: 'Dishes — small title', type: 'text', default: 'From our kitchens' },
      { key: 'dishes_title', label: 'Dishes — heading', type: 'text', default: 'Guest favourites' },
      { key: 'dishes_text', label: 'Dishes — text', type: 'textarea', default: 'Fresh momo, full Nepali khana sets and smoky sekuwa — see each branch page for the full menu.' },
      { key: 'show_steps', label: 'Show “How booking works”', type: 'toggle', default: '1' },
      { key: 'steps_eyebrow', label: 'Booking steps — small title', type: 'text', default: 'Book online' },
      { key: 'steps_title', label: 'Booking steps — heading', type: 'text', default: 'Booking takes less than a minute' },
      { key: 'steps', label: 'Booking steps', type: 'list', hint: 'title | text', default: [
        'Choose branch & dates | Pick Laxmipur or Birtamode for a room, or any branch for a table. Live availability is shown instantly.',
        'Enter your details | Just your name, phone number and email. No advance payment needed — pay at the branch by cash, eSewa, Khalti or Fonepay.',
        "Get your reference | You get a booking reference straight away and by email. We email you again as soon as it's confirmed, and you can check or cancel any time online.",
      ].join('\n') },
      { key: 'show_contact', label: 'Show “Contact” section', type: 'toggle', default: '1' },
      { key: 'contact_eyebrow', label: 'Contact — small title', type: 'text', default: 'Contact' },
      { key: 'contact_title', label: 'Contact — heading', type: 'text', default: "We're happy to help" },
      { key: 'contact_text', label: 'Contact — text', type: 'textarea', default: 'Questions about rooms, group stays, parties or catering? Send us a message and the right branch will get back to you.' },
    ],
  },
  {
    id: 'other_pages', title: 'Gallery, careers, locations & booking pages',
    fields: [
      { key: 'gallery_title', label: 'Gallery page — heading', type: 'text', default: 'Gallery' },
      { key: 'gallery_text', label: 'Gallery page — text', type: 'textarea', default: 'Rooms, food, celebrations and moments from all three Atithi branches.' },
      { key: 'careers_title', label: 'Careers page — heading', type: 'text', default: 'Work with us' },
      { key: 'careers_text', label: 'Careers page — text', type: 'textarea', default: 'Join the Atithi family. We are always looking for friendly, hard-working people for our kitchens, restaurants and lodges.' },
      { key: 'careers_empty', label: 'Careers page — text when there are no openings', type: 'textarea', default: 'There are no open positions right now, but we would still love to hear from you. Send a general application below.' },
      { key: 'locations_title', label: 'Locations page — heading', type: 'text', default: 'Find us' },
      { key: 'locations_text', label: 'Locations page — text', type: 'textarea', default: 'All three Atithi branches on the map. Tap “Get directions” to navigate straight to us.' },
      { key: 'pay_note', label: 'Payment note (booking & branch pages)', type: 'textarea', default: 'No advance payment needed. Pay at the branch by cash, eSewa, Khalti or Fonepay.' },
      { key: 'party_items', label: 'Food Garden page — party boxes', type: 'list', hint: `icon | title | text. Icons: ${ICONS}`, default: [
        'party | Birthdays | Decorated garden tables, cake cutting and set menus for every age.',
        'users | Family & reunions | Large tables for big families, with veg and non-veg options.',
        'star | Office & groups | Team lunches and evening gatherings with sekuwa and drinks.',
      ].join('\n') },
    ],
  },
  {
    id: 'footer', title: 'Footer & social media',
    fields: [
      { key: 'footer_about', label: 'Footer text under the logo', type: 'textarea', default: 'A guest is like God. Since 2078 B.S. we have welcomed every guest with warm rooms, honest food and heartfelt Nepali hospitality.' },
      { key: 'footer_copyright', label: 'Copyright name', type: 'text', default: 'Atithi Restro & Lodge · Atithi Food Garden' },
      { key: 'social_facebook', label: 'Facebook page link', type: 'url', default: '' },
      { key: 'social_instagram', label: 'Instagram link', type: 'url', default: '' },
      { key: 'social_tiktok', label: 'TikTok link', type: 'url', default: '' },
      { key: 'social_youtube', label: 'YouTube link', type: 'url', default: '' },
    ],
  },
];

const FIELDS = GROUPS.flatMap((g) => g.fields);
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const MAX = { text: 200, url: 300, image: 500, color: 7, toggle: 1, textarea: 1500, list: 3000 };

/** Saved values merged over the defaults (what the website shows). */
function siteContent(saved) {
  return Object.fromEntries(FIELDS.map((f) => [f.key, saved[f.key] !== undefined && saved[f.key] !== '' ? saved[f.key] : f.default]));
}

module.exports = { GROUPS, FIELDS, BY_KEY, MAX, siteContent };
