# Animara — React + Vite

A responsive multi-page frontend concept for Animara, a platform connecting people who want to help stray/neglected animals with animal welfare organisations.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

## Pages

- `/` — Homepage
- `/about` — Mission and project rationale
- `/needs` — Current needs board with category filters and search
- `/ngos` — NGO directory with search and city filter
- `/report` — Structured rescue report form
- `/donate` — Contribution flow linked to a sample need
- `/contact` — NGO / volunteer contact form

## Important implementation notes

- The V5 frontend is integrated with an Express/Supabase backend. Contact and rescue-report submissions are sent to the API; the Pay button records a successful demo payment and updates the matching need's raised amount and progress percentage in Supabase.
- Needs and NGO entries in `src/data.js` are sample content for layout demonstration, not verified live records.
- No payment gateway or real money movement is integrated. The Pay button runs a clearly labelled demo checkout and records `demo_paid`; the Admin dashboard displays **Demo payment successful**. NGO listings require admin verification and publication before appearing as live public records. Other optional geolocation, notification, and rescue-routing integrations are not part of the current API.
- Before launch, verify and replace sample records and placeholder contact details, review Supabase production configuration, and decide whether to add a payment provider and any optional location or notification integrations.
- Photography is loaded from Unsplash URLs and requires an internet connection.
- Design direction is an original Animara interpretation of Atomicdust's editorial approach: oversized typography, strong visual blocks, asymmetric image-led sections, graphic accents, clear conversion paths and restrained motion. It does not copy Atomicdust's source code or proprietary assets.

## Backend and admin dashboard

See [README_BACKEND.md](./README_BACKEND.md) for Supabase setup, API startup, admin account creation, database schema and deployment instructions. The admin workspace is available at `/admin` after backend configuration.

## Vercel Services deployment

The repository-root `vercel.json` deploys two services together on one Vercel project:

- **`app`** — Vite frontend, rooted at `.`, public at `/` and all non-API paths.
- **`server`** — Express API, rooted at `server`, public through `/api/*`.

The `/api/*` rewrite is listed before the frontend catch-all rewrite. No internal service bindings are needed: browser requests use the public same-origin `/api/*` route, while the Express backend connects directly to Supabase.

### Vercel project setup

Import this repository into Vercel and use the repository root as the project root. The service roots are declared in `vercel.json`; do not set the project root to `server` or to a nested frontend directory. Use the Vercel Services configuration in this file as the source of truth.

Configure these environment variables for the **server** service in Vercel (for the environments you intend to deploy):

- `SUPABASE_URL` — Supabase project URL.
- `SUPABASE_ANON_KEY` — Supabase publishable/anon key used for Auth sign-in.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase server secret/service-role key. Keep this server-side only; never add it to the app service or frontend variables.
- `SUPABASE_STORAGE_BUCKET` — `rescue-photos`.

Do not manually define the `VERCEL` environment variable. Vercel supplies its deployment environment context.

### Frontend API URL behavior

In a production Vercel deployment, `src/lib/api.js` uses relative `/api/...` paths so requests are routed to the Express service through the shared Vercel domain. During local Vite development, the default API URL remains `http://localhost:5000`. Set `VITE_API_URL` in a local `.env` file only when you need to override that default. **Do not set `VITE_API_URL` in the Vercel app service environment**; defining it there would bypass the shared Vercel `/api/*` routing and send browser requests to the override host.

### Keeping Render as a backup

The Express entrypoint exports the app for Vercel and retains its standalone `app.listen()` startup when `VERCEL` is not set. The existing Render service can continue to use its current root directory, build command and start command. Do not delete or reconfigure the Render service while validating Vercel.

For local multi-service testing, use a current Vercel CLI and run `vercel dev` from the repository root.
