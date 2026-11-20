# Animara V4 — Backend setup

This backend is added to the existing V1-based V4 React + Vite project. The public site remains the same design; the new `/admin` route is a separate administration workspace.

## Architecture

- Frontend: existing React + Vite app
- API: Node.js + Express (`server/`)
- Database and authentication: Supabase PostgreSQL + Supabase Auth
- Private report photo storage: Supabase Storage bucket `rescue-photos`
- Payments: no payment gateway is connected. The public Pay button completes a simulated demo checkout, records `payment_status = 'demo_paid'`, shows **Demo payment successful** in Admin, and increases the associated need's raised rupee total and progress percentage.

## 1. Create Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy the Project URL, anon/public key and service_role key.
3. Open **SQL Editor**, paste all of `server/supabase/schema.sql`, and run it.
4. The included sample needs and NGOs are inserted as **draft**. They are not published publicly until an admin verifies and publishes them. The frontend retains the original V1 sample-data fallback if the API is offline, so connect the backend and publish reviewed content before treating the public directory as live.

## 2. Create the first administrator

1. In Supabase, open **Authentication → Users → Add user** and create the administrator login.
2. Copy that user's UUID.
3. Run this in SQL Editor, replacing the UUID:

```sql
insert into public.admin_users (user_id)
values ('PASTE-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Only users in `admin_users` can use the admin API. Do not expose the service-role key to the browser.

## 3. Configure and start the API

```bash
cd server
npm install
```

Copy `server/.env.example` to `server/.env` and fill in the three Supabase values. Keep `SUPABASE_SERVICE_ROLE_KEY` only in this server-side file. Then run:

```bash
npm run dev
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health`.

## 4. Configure and start the frontend

In the project root, copy `.env.example` to `.env` (or create `.env.local`) and set:

```env
VITE_API_URL=http://localhost:5000
```

In a second terminal, from the project root:

```bash
npm install
npm run dev
```

Open the Vite URL and visit `/admin` to sign in.

## 5. Publish sample content

Sign in at `/admin`. First open **NGO directory**, edit an NGO, tick **Verification confirmed**, and publish it. Then open **Current needs**, edit a request and publish it. The API blocks publishing a need unless its matching NGO is verified and published. Only published records are returned by the public API. The seeded entries are illustrative sample content.

## API endpoints

Public:
- `GET /api/health`
- `GET /api/needs`
- `GET /api/ngos`
- `POST /api/submissions/contact`
- `POST /api/submissions/rescue-report` (multipart form; up to 3 JPG/PNG/WEBP files, 5 MB each)
- `POST /api/submissions/donation-intent` (records an intent only; no payment)
- `POST /api/submissions/demo-payment` (atomically records a simulated successful checkout with `demo_paid` and updates the need's raised amount and percentage)

Admin (requires an access token for a user in `admin_users`):
- `POST /api/auth/login`
- `GET /api/admin/overview`
- `GET /api/admin/{needs|ngos|reports|enquiries|donations}`
- `POST/PATCH/DELETE /api/admin/needs`
- `POST/PATCH/DELETE /api/admin/ngos`
- `PATCH /api/admin/{reports|enquiries}/:id/status`

## Production deployment notes

- Deploy `server/` as a separate Node service (Render or another Node host); set the environment variables from `server/.env.example` in the host dashboard.
- Set `CLIENT_ORIGIN` to the exact production frontend origin(s), comma-separated if required.
- Deploy the Vite frontend to Vercel and set `VITE_API_URL` to the deployed API origin.
- Use HTTPS, rotate keys if exposed, and never commit `.env` files.
- Add an operational process for responding to rescue reports. The site clearly states it is not an emergency dispatch service.
- Real payments remain disabled. The demo checkout is not financial proof and must never be reported as funds received. If real payments are introduced later, implement a provider's server-side order creation, signed webhook verification, refund/reconciliation and NGO payout controls.
