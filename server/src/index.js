import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin, supabaseAuth, requireSupabase } from './supabase.js';
import { requireAdmin } from './middleware.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 3 }, fileFilter: (_req, file, cb) => ['image/jpeg','image/png','image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG and WEBP images are allowed.')) });
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use('/api/submissions', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const fail = (res, error, status = 400) => res.status(status).json({ error: error?.message || 'Request could not be completed.' });
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'animara-api', databaseConfigured: Boolean(supabaseAdmin) }));

// Public content. Only published needs and active/verified NGOs are exposed.
app.get('/api/needs', requireSupabase, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('needs').select('*').eq('status', 'published').order('created_at', { ascending: false });
  if (error) return fail(res, error, 500);
  res.json({ data: data || [] });
});
app.get('/api/ngos', requireSupabase, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('ngos').select('*').eq('status', 'published').order('name');
  if (error) return fail(res, error, 500);
  res.json({ data: data || [] });
});

// Public submissions.
app.post('/api/submissions/contact', requireSupabase, async (req, res) => {
  const name = clean(req.body.name, 120), email = clean(req.body.email, 254), role = clean(req.body.role, 80), message = clean(req.body.message, 4000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message) return res.status(422).json({ error: 'Name, valid email and message are required.' });
  const { data, error } = await supabaseAdmin.from('contact_enquiries').insert({ name, email, role, message, status: 'new' }).select('id, created_at').single();
  if (error) return fail(res, error, 500);
  res.status(201).json({ message: 'Your message has been received.', reference: data.id });
});
app.post('/api/submissions/rescue-report', requireSupabase, upload.array('photos', 3), async (req, res) => {
  const b = req.body;
  const required = ['animal','condition','location','details','name','phone'];
  if (required.some(key => !clean(b[key], 300)) || b.consent !== 'true') return res.status(422).json({ error: 'Complete all required fields and provide consent.' });
  const photos = [];
  for (const file of req.files || []) {
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `reports/${Date.now()}-${randomUUID()}.${ext}`;
    const { error: storageError } = await supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'rescue-photos').upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (storageError) return fail(res, storageError, 500);
    photos.push(path);
  }
  const { data, error } = await supabaseAdmin.from('rescue_reports').insert({ animal: clean(b.animal, 60), condition: clean(b.condition, 80), location: clean(b.location, 300), landmark: clean(b.landmark, 300), details: clean(b.details, 4000), reporter_name: clean(b.name, 120), reporter_phone: clean(b.phone, 30), consent: true, photo_paths: photos, status: 'new' }).select('id, created_at').single();
  if (error) return fail(res, error, 500);
  res.status(201).json({ message: 'Your rescue report has been received.', reference: data.id });
});
app.post('/api/submissions/donation-intent', requireSupabase, async (req, res) => {
  const needId = Number(req.body.need_id), amount = Number(req.body.amount);
  if (!Number.isInteger(needId) || !Number.isInteger(amount) || amount < 1 || amount > 1000000) return res.status(422).json({ error: 'Choose a valid need and a whole-number amount.' });
  const { data: need, error: needError } = await supabaseAdmin.from('needs').select('id').eq('id', needId).eq('status', 'published').maybeSingle();
  if (needError || !need) return res.status(404).json({ error: 'This need is no longer available.' });
  const { data, error } = await supabaseAdmin.from('donation_intents').insert({ need_id: needId, amount_inr: amount, payment_status: 'not_started' }).select('id, created_at').single();
  if (error) return fail(res, error, 500);
  res.status(201).json({ reference: data.id, payment_status: 'not_started', message: 'Donation intent saved. No payment has been collected.' });
});

// Authentication. Admin allow-list is enforced by admin_users on every protected request.
app.post('/api/auth/login', requireSupabase, async (req, res) => {
  if (!supabaseAuth) return res.status(503).json({ error: 'Supabase Auth is not configured.' });
  const email = clean(req.body.email, 254), password = String(req.body.password || '');
  if (!email || !password) return res.status(422).json({ error: 'Email and password are required.' });
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.user) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const { data: admin, error: adminError } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (adminError || !admin) { await supabaseAuth.auth.signOut(); return res.status(403).json({ error: 'This account is not an Animara administrator.' }); }
  res.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at, user: { id: data.user.id, email: data.user.email } });
});

// Protected admin API.
app.use('/api/admin', requireSupabase, requireAdmin);
app.get('/api/admin/overview', async (_req, res) => {
  const tables = ['needs','ngos','rescue_reports','contact_enquiries','donation_intents'];
  const counts = {};
  for (const table of tables) {
    const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    if (error) return fail(res, error, 500);
    counts[table] = count || 0;
  }
  res.json({ counts });
});
app.get('/api/admin/:resource', async (req, res) => {
  const map = { needs: 'needs', ngos: 'ngos', reports: 'rescue_reports', enquiries: 'contact_enquiries', donations: 'donation_intents' };
  const table = map[req.params.resource];
  if (!table) return res.status(404).json({ error: 'Unknown admin resource.' });
  const { data, error } = await supabaseAdmin.from(table).select('*').order('created_at', { ascending: false }).limit(250);
  if (error) return fail(res, error, 500);
  let records = data || [];
  if (table === 'rescue_reports') {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'rescue-photos';
    records = await Promise.all(records.map(async (record) => {
      const photo_urls = await Promise.all((record.photo_paths || []).map(async (path) => {
        const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 10);
        return signed?.signedUrl || null;
      }));
      return { ...record, photo_urls: photo_urls.filter(Boolean) };
    }));
  }
  res.json({ data: records });
});
app.post('/api/admin/needs', async (req, res) => {
  const payload = pick(req.body, ['ngo','title','category','amount','raised','urgency','location','image','description','status']);
  if (!payload.title || !payload.ngo || !payload.description) return res.status(422).json({ error: 'Title, NGO and description are required.' });
  if (payload.status === 'published' && !(await isApprovedNgo(payload.ngo))) return res.status(422).json({ error: 'Publish this need only after its matching NGO has been verified and published.' });
  const { data, error } = await supabaseAdmin.from('needs').insert(payload).select('*').single();
  if (error) return fail(res, error, 400);
  res.status(201).json({ data });
});
app.patch('/api/admin/needs/:id', async (req, res) => {
  if (req.body.status === 'published' || req.body.ngo) {
    const { data: current, error } = await supabaseAdmin.from('needs').select('ngo').eq('id', req.params.id).maybeSingle();
    if (error) return fail(res, error, 500);
    const targetNgo = req.body.ngo || current?.ngo;
    if (req.body.status === 'published' && !(await isApprovedNgo(targetNgo))) return res.status(422).json({ error: 'Publish this need only after its matching NGO has been verified and published.' });
  }
  return updateRow('needs', req, res, ['ngo','title','category','amount','raised','urgency','location','image','description','status']);
});
app.delete('/api/admin/needs/:id', async (req, res) => deleteRow('needs', req, res));
app.post('/api/admin/ngos', async (req, res) => {
  const payload = pick(req.body, ['name','city','state','focus','cases','verified','description','image','status']);
  if (!payload.name || !payload.city || !payload.state) return res.status(422).json({ error: 'Name, city and state are required.' });
  if (payload.status === 'published' && payload.verified !== true) return res.status(422).json({ error: 'Verify this organisation before publishing its public listing.' });
  const { data, error } = await supabaseAdmin.from('ngos').insert(payload).select('*').single();
  if (error) return fail(res, error, 400);
  res.status(201).json({ data });
});
app.patch('/api/admin/ngos/:id', async (req, res) => {
  if (req.body.status === 'published') {
    const { data: existing, error } = await supabaseAdmin.from('ngos').select('verified').eq('id', req.params.id).maybeSingle();
    if (error || !(req.body.verified === true || existing?.verified === true)) return res.status(422).json({ error: 'Verify this organisation before publishing its public listing.' });
  }
  return updateRow('ngos', req, res, ['name','city','state','focus','cases','verified','description','image','status']);
});
app.delete('/api/admin/ngos/:id', async (req, res) => deleteRow('ngos', req, res));
app.patch('/api/admin/:resource/:id/status', async (req, res) => {
  const map = { reports: 'rescue_reports', enquiries: 'contact_enquiries' };
  const table = map[req.params.resource];
  const allowed = req.params.resource === 'reports' ? ['new','reviewing','assigned','resolved','closed'] : ['new','reviewing','replied','closed'];
  const status = clean(req.body.status, 30);
  if (!table || !allowed.includes(status)) return res.status(422).json({ error: 'Invalid resource or status.' });
  const { data, error } = await supabaseAdmin.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
  if (error) return fail(res, error, 400);
  res.json({ data });
});
async function isApprovedNgo(ngoLabel) {
  const organisationName = clean(ngoLabel, 200).split(' · ')[0].trim();
  if (!organisationName) return false;
  const { data, error } = await supabaseAdmin.from('ngos').select('id').eq('name', organisationName).eq('verified', true).eq('status', 'published').maybeSingle();
  return !error && Boolean(data);
}
function pick(source, fields) { return Object.fromEntries(fields.filter(k => source[k] !== undefined).map(k => [k, source[k]])); }
async function updateRow(table, req, res, fields) {
  const payload = pick(req.body, fields); payload.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from(table).update(payload).eq('id', req.params.id).select('*').single();
  if (error) return fail(res, error, 400);
  res.json({ data });
}
async function deleteRow(table, req, res) {
  const { error } = await supabaseAdmin.from(table).delete().eq('id', req.params.id);
  if (error) return fail(res, error, 400);
  res.json({ message: 'Record deleted.' });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Unexpected server error.' });
});
export default app;
// Keep the standalone listener for the existing Render backup deployment.
if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Animara API listening on http://localhost:${port}`));
}
