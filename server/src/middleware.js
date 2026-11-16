import { supabaseAdmin } from './supabase.js';

export async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !supabaseAdmin) return res.status(401).json({ error: 'Administrator sign-in required.' });
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
    const { data: admin, error: adminError } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminError || !admin) return res.status(403).json({ error: 'This account does not have administrator access.' });
    req.adminUser = user;
    next();
  } catch (error) { next(error); }
}
