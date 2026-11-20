import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, PawPrint, LogOut, LayoutDashboard, ClipboardList, Building2, HeartHandshake, MessageSquare, Plus, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, clearAdminToken, getAdminToken, setAdminToken } from '../lib/api';
import './admin.css';

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'needs', label: 'Current needs', icon: ClipboardList },
  { id: 'ngos', label: 'NGO directory', icon: Building2 },
  { id: 'reports', label: 'Rescue reports', icon: AlertCircle },
  { id: 'enquiries', label: 'Contact & volunteer', icon: MessageSquare },
  { id: 'donations', label: 'Donation intents', icon: HeartHandshake },
];
const emptyNeed = { ngo: '', title: '', category: 'Food', amount: '₹0', raised: 0, urgency: 'In progress', location: '', image: '', description: '', status: 'draft' };
const emptyNgo = { name: '', city: '', state: '', focus: '', cases: 0, verified: false, description: '', image: '', status: 'draft' };
const labels = { new: 'New', reviewing: 'Reviewing', assigned: 'Assigned', resolved: 'Resolved', closed: 'Closed', replied: 'Replied', published: 'Published', draft: 'Draft', archived: 'Archived', not_started: 'Payment not started', demo_paid: 'Demo payment successful' };

export default function AdminPage() {
  const [token, setToken] = useState(getAdminToken());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [section, setSection] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      if (section === 'overview') {
        const result = await api('/api/admin/overview', { admin: true });
        setOverview(result.counts); setRows([]);
      } else {
        const result = await api(`/api/admin/${section}`, { admin: true });
        setRows(result.data || []);
      }
    } catch (err) {
      setError(err.message);
      if (/session|sign in|invalid/i.test(err.message)) { clearAdminToken(); setToken(null); }
    } finally { setLoading(false); }
  }, [token, section]);
  useEffect(() => { load(); }, [load]);

  const login = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setAdminToken(result.access_token); setToken(result.access_token); setPassword('');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const logout = () => { clearAdminToken(); setToken(null); setOverview(null); setRows([]); };
  const saveRecord = async (event) => {
    event.preventDefault(); if (!modal) return;
    setSaving(true); setError('');
    try {
      const resource = modal.resource;
      const isEdit = Boolean(modal.record?.id);
      const url = `/api/admin/${resource}${isEdit ? `/${modal.record.id}` : ''}`;
      await api(url, { method: isEdit ? 'PATCH' : 'POST', admin: true, body: JSON.stringify(modal.record) });
      setModal(null); setNotice(`${resource === 'needs' ? 'Need' : 'Organisation'} saved.`); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const updateStatus = async (resource, id, status) => {
    try { await api(`/api/admin/${resource}/${id}/status`, { method: 'PATCH', admin: true, body: JSON.stringify({ status }) }); await load(); }
    catch (err) { setError(err.message); }
  };
  const remove = async (resource, id) => {
    if (!window.confirm('Delete this record permanently?')) return;
    try { await api(`/api/admin/${resource}/${id}`, { method: 'DELETE', admin: true }); await load(); }
    catch (err) { setError(err.message); }
  };

  if (!token) return <div className="admin-login-page"><Link to="/" className="admin-back"><ArrowLeft size={16}/> Back to Animara</Link><form className="admin-login-card" onSubmit={login}><div className="admin-brand"><span><PawPrint/></span> animara<span>.</span></div><span className="eyebrow">SECURE ADMIN AREA</span><h1>Welcome<br/>back.</h1><p>Sign in with an account that has been granted Animara administrator access.</p>{error && <div className="admin-alert"><AlertCircle size={16}/>{error}</div>}<label>Email address<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="button button-dark button-wide" disabled={saving}>{saving?'Signing in…':'Sign in to dashboard'}</button><small>Admin access is managed by the Supabase project owner.</small></form></div>;

  const countCards = overview ? [
    ['Current needs', overview.needs, ClipboardList], ['NGO listings', overview.ngos, Building2], ['Rescue reports', overview.rescue_reports, AlertCircle], ['Enquiries', overview.contact_enquiries, MessageSquare], ['Donation intents', overview.donation_intents, HeartHandshake],
  ] : [];
  return <div className="admin-app">
    <aside className="admin-sidebar"><Link to="/" className="admin-brand"><span><PawPrint/></span> animara<span>.</span></Link><span className="admin-side-caption">WORKSPACE</span>{sections.map(item=>{const Icon=item.icon;return <button key={item.id} className={section===item.id?'active':''} onClick={()=>{setSection(item.id);setError('');}}><Icon size={17}/>{item.label}</button>})}<div className="admin-sidebar-bottom"><Link to="/" className="admin-view-site"><ArrowLeft size={15}/> View website</Link><button onClick={logout}><LogOut size={16}/> Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><span className="eyebrow">ANIMARA / ADMINISTRATION</span><h1>{sections.find(x=>x.id===section)?.label}</h1></div><button className="admin-refresh" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></header>
      {error && <div className="admin-alert"><AlertCircle size={16}/>{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
      {notice && <div className="admin-success"><CheckCircle2 size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {loading ? <div className="admin-loading">Loading workspace…</div> : section==='overview' ? <><div className="admin-stats">{countCards.map(([label,value,Icon])=><div className="admin-stat" key={label}><span><Icon size={18}/></span><strong>{value}</strong><small>{label}</small></div>)}</div><div className="admin-welcome"><span className="eyebrow">GOOD TO SEE YOU</span><h2>Care works better<br/>when it’s <em>connected.</em></h2><p>Use the workspace to review incoming rescue reports and enquiries, maintain the NGO directory, and publish current needs. New content stays in draft until you publish it.</p></div></> : <section className="admin-table-wrap"><div className="admin-table-heading"><div><span className="eyebrow">MANAGE RECORDS</span><p>{rows.length} records</p></div>{(section==='needs'||section==='ngos')&&<button className="button button-dark" onClick={()=>setModal({resource:section,record:{...(section==='needs'?emptyNeed:emptyNgo)}})}><Plus size={16}/> Add {section==='needs'?'need':'organisation'}</button>}</div>
        {section==='donations'&&<div className="demo-notice"><AlertCircle size={16}/> Demo payment records are simulated confirmations only. They do not represent real transactions or funds received.</div>}
        {rows.length===0?<div className="admin-empty">No records yet. New submissions will appear here.</div>:<div className="admin-record-list">{rows.map(row=><article className="admin-record" key={row.id}><div className="admin-record-main"><strong>{row.title||row.name||row.reporter_name||row.email||`Donation ${String(row.id).slice(0,8)}`}</strong><p>{row.description||row.message||[row.animal,row.condition,row.location].filter(Boolean).join(' · ')||`₹${row.amount_inr||''} · Need #${row.need_id||''}`}</p>{row.photo_urls?.length>0&&<div className="admin-report-photos">{row.photo_urls.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Rescue report attachment ${index+1}`}/></a>)}</div>}<small>{new Date(row.created_at).toLocaleString('en-IN')}</small>{section==='donations'&&row.payment_status==='demo_paid'&&<small className="demo-payment-note">Demo only — no real money was collected or transferred.</small>}</div><div className="admin-record-actions">{section==='needs'||section==='ngos'?<><span className={`admin-status ${row.status}`}>{labels[row.status]||row.status}</span><button onClick={()=>setModal({resource:section,record:{...row}})}>Edit</button><button className="danger" onClick={()=>remove(section,row.id)}>Delete</button></>:section==='reports'||section==='enquiries'?<select aria-label="Update status" value={row.status} onChange={e=>updateStatus(section,row.id,e.target.value)}>{(section==='reports'?['new','reviewing','assigned','resolved','closed']:['new','reviewing','replied','closed']).map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>:<span className="admin-status">{labels[row.payment_status]||row.payment_status}</span>}</div></article>)}</div>}
      </section>}
    </main>
    {modal&&<div className="admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><form className="admin-modal" onSubmit={saveRecord}><div className="admin-modal-head"><div><span className="eyebrow">{modal.record.id?'EDIT':'CREATE'} / {modal.resource.toUpperCase()}</span><h2>{modal.record.id?'Update':'Add'} {modal.resource==='needs'?'need':'organisation'}</h2></div><button type="button" onClick={()=>setModal(null)}><X/></button></div>{(modal.resource==='needs'?[['ngo','NGO name'],['title','Need title'],['category','Category'],['amount','Target amount (e.g. ₹4,800)'],['urgency','Priority'],['location','Location'],['image','Image URL'],['description','Description']]:[['name','Organisation name'],['city','City'],['state','State'],['focus','Areas of work'],['cases','Active cases'],['image','Image URL'],['description','Description']]).map(([key,label])=><label key={key}>{label}{key==='description'?<textarea required={['ngo','title'].includes(key)} rows="3" value={modal.record[key]??''} onChange={e=>setModal(m=>({...m,record:{...m.record,[key]:e.target.value}}))}/>:<input type={key==='cases'?'number':'text'} value={modal.record[key]??''} onChange={e=>setModal(m=>({...m,record:{...m.record,[key]:key==='cases'?Number(e.target.value):e.target.value}}))}/>}</label>)}{modal.resource==='needs'&&<label>Raised percentage<input type="number" min="0" max="100" value={modal.record.raised??0} onChange={e=>setModal(m=>({...m,record:{...m.record,raised:Number(e.target.value)}}))}/></label>}{modal.resource==='ngos'&&<label className="admin-check"><input type="checkbox" checked={Boolean(modal.record.verified)} onChange={e=>setModal(m=>({...m,record:{...m.record,verified:e.target.checked}}))}/> Verification confirmed</label>}<label>Publication status<select value={modal.record.status||'draft'} onChange={e=>setModal(m=>({...m,record:{...m.record,status:e.target.value}}))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><div className="admin-modal-actions"><button type="button" className="button button-outline" onClick={()=>setModal(null)}>Cancel</button><button className="button button-dark" disabled={saving}>{saving?'Saving…':'Save record'}</button></div></form></div>}
  </div>;
}
