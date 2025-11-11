# Pressure Wash Booking (Full-Stack)

A clean, modern website where customers can schedule a pressure washing service.
New bookings are saved to a local SQLite database and emailed to you.

## Quick Start
1) Install Node.js 18+ from https://nodejs.org
2) Download this project and open a terminal inside the folder.
3) Run:
   ```bash
   npm install
   cp .env.example .env
   # Edit .env: set TO_EMAIL, SMTP_* and FROM_EMAIL
   npm start
   ```
4) Open http://localhost:3000

## Email Setup
- **Gmail**: create an "App Password" (Google Account → Security → App passwords) and use it for `SMTP_PASS`.
- **Others** (e.g., Outlook, Zoho, custom domain): use your provider's SMTP host, port, user, and password.
- Bookings will be sent to `TO_EMAIL`. Customers receive a confirmation email with an optional calendar invite.

## Deploy (one easy option)
- Render / Railway / Fly.io all work. Make a new Node service and add environment variables from `.env`.
- Persist the SQLite file if the platform supports volumes. If not, email will still work, but database may reset on redeploy.

## Files
- `server.js` — Express server, SQLite storage, email notifications, ICS calendar attachment
- `public/index.html` — marketing page + booking form
- `public/styles.css` — responsive styles
- `public/app.js` — client-side validation + API call
- `data.sqlite` — created automatically on first run

## Security Notes
- Basic input validation and HTTPS-ready (follow your host's TLS docs).
- Includes a simple "honeypot" field to reduce bot spam.
- For production, set strong SMTP credentials and restrict who can access server logs.

## License
MIT — do anything, just keep the copyright notice.
