import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Edit3, Plus, Search, ShieldCheck, Trash2, UserRound, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/UsersRoles.css";

const API = "http://localhost:8000";
const EMPTY = { username:"", name:"", email:"", role:"Municipal Worker", district_id:"", locality_id:"", password:"", status:"Active" };

function UsersRoles() {
  const [users,setUsers]=useState([]), [summary,setSummary]=useState({total_users:0,administrators:0,municipal_workers:0,locality_users:0});
  const [search,setSearch]=useState(""), [role,setRole]=useState("All Roles"), [loading,setLoading]=useState(true), [error,setError]=useState("");
  const [modal,setModal]=useState(false), [editing,setEditing]=useState(null), [form,setForm]=useState(EMPTY), [saving,setSaving]=useState(false);
  const [districts,setDistricts]=useState([]), [localities,setLocalities]=useState([]);

  const load=async()=>{try{setLoading(true);setError("");const r=await fetch(`${API}/api/users?_=${Date.now()}`,{cache:"no-store"});const j=await r.json();if(!r.ok||j.status!=="OK")throw Error(j.message||"Unable to load users");setUsers(j.data||[]);setSummary(j.summary||{});}catch(e){console.error(e);setError(e.message||"Unable to load users");}finally{setLoading(false)}};
  useEffect(()=>{load();fetch(`${API}/api/districts`).then(r=>r.json()).then(j=>j.status==="OK"&&setDistricts(j.data||[])).catch(()=>{});},[]);
  useEffect(()=>{if(!form.district_id){setLocalities([]);return;}fetch(`${API}/api/localities?district_id=${form.district_id}`).then(r=>r.json()).then(j=>j.status==="OK"&&setLocalities(j.data||[])).catch(()=>{});},[form.district_id]);

  const filtered=useMemo(()=>users.filter(u=>{const q=search.toLowerCase().trim();return (role==="All Roles"||u.role===role)&&(!q||[u.username,u.name,u.email,u.role,u.district,u.locality].some(v=>String(v||"").toLowerCase().includes(q)));}),[users,search,role]);
  const initials=n=>String(n||"?").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?";
  const date=v=>v?new Date(v).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"Never";
  const openAdd=()=>{setEditing(null);setForm(EMPTY);setModal(true)};
  const openEdit=u=>{setEditing(u);setForm({username:u.username||"",name:u.name||"",email:u.email||"",role:u.role||"Municipal Worker",district_id:u.district_id||"",locality_id:u.locality_id||"",password:"",status:u.status||"Active"});setModal(true)};
  const save=async e=>{e.preventDefault();try{setSaving(true);const url=editing?`${API}/api/users/${editing.user_id}`:`${API}/api/users`;const r=await fetch(url,{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const j=await r.json();if(!r.ok||j.status!=="OK")throw Error(j.message||"Unable to save user");setModal(false);await load()}catch(e){alert(e.message)}finally{setSaving(false)}};
  const status=async u=>{const next=u.status==="Active"?"Inactive":"Active";const r=await fetch(`${API}/api/users/${u.user_id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});const j=await r.json();if(j.status!=="OK")alert(j.message||"Unable to update status");else load()};
  const remove=async u=>{if(!confirm(`Delete user "${u.username}"?`))return;const r=await fetch(`${API}/api/users/${u.user_id}`,{method:"DELETE"});const j=await r.json();if(j.status!=="OK")alert(j.message||"Unable to delete user");else load()};
  const change=e=>{const {name,value}=e.target;setForm(f=>({...f,[name]:value,...(name==="district_id"?{locality_id:""}:{})}))};

  return <div className="users-page">
    <header className="users-header"><div className="users-title"><Link to="/dashboard" className="users-back"><ArrowLeft size={18}/></Link><div className="users-icon"><Users size={25}/></div><div><h1>Users & Roles</h1><p>Manage users and system access</p></div></div><button className="users-primary" onClick={openAdd}><Plus size={18}/>Add User</button></header>
    <section className="users-summary">
      <div><Users size={20}/><span>Total Users</span><strong>{summary.total_users||0}</strong></div>
      <div><ShieldCheck size={20}/><span>Administrators</span><strong>{summary.administrators||0}</strong></div>
      <div><UserRound size={20}/><span>Municipal Workers</span><strong>{summary.municipal_workers||0}</strong></div>
      <div><Users size={20}/><span>Locality Users</span><strong>{summary.locality_users||0}</strong></div>
    </section>
    <section className="users-table-card"><div className="users-toolbar"><div className="users-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users..."/></div><select value={role} onChange={e=>setRole(e.target.value)}><option>All Roles</option><option>Administrator</option><option>Municipal Worker</option><option>Locality User</option></select></div>
      {error&&<div className="users-error">{error}</div>}
      <div className="users-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Last Sign In</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {loading?<tr><td colSpan="5" className="users-empty">Loading users...</td></tr>:filtered.length===0?<tr><td colSpan="5" className="users-empty">No users found.</td></tr>:filtered.map(u=><tr key={u.user_id}><td><div className="user-cell"><div className="user-avatar">{initials(u.name)}</div><div><strong>{u.name}</strong><span>{u.email}</span></div></div></td><td><span className={`role-badge role-${u.role.toLowerCase().replaceAll(" ","-")}`}>{u.role}</span></td><td><span className="last-sign-in">{date(u.last_sign_in)}</span></td><td><span className={`user-status ${u.status==="Active"?"active":"inactive"}`}>{u.status}</span></td><td><div className="user-actions"><button className="action-status" title="Activate / deactivate" onClick={()=>status(u)}>{u.status==="Active"?<X size={16}/>:<Check size={16}/>}</button><button className="action-edit" title="Edit" onClick={()=>openEdit(u)}><Edit3 size={16}/></button><button className="action-delete" title="Delete" onClick={()=>remove(u)}><Trash2 size={16}/></button></div></td></tr>)}
      </tbody></table></div></section>
    {modal&&<div className="user-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setModal(false)}><form className="user-modal" onSubmit={save}><div className="user-modal-header"><div><h2>{editing?"Edit User":"Add User"}</h2><p>Enter the user's complete account information.</p></div><button type="button" className="modal-close" onClick={()=>setModal(false)}><X size={18}/></button></div>
      <div className="user-form-grid"><label>Username<input name="username" value={form.username} onChange={change} required/></label><label>Full Name<input name="name" value={form.name} onChange={change} required/></label><label>Email<input type="email" name="email" value={form.email} onChange={change} required/></label><label>Role<select name="role" value={form.role} onChange={change}><option>Administrator</option><option>Municipal Worker</option><option>Locality User</option></select></label><label>District<select name="district_id" value={form.district_id} onChange={change}><option value="">All Districts</option>{districts.map(d=><option key={d.district_id} value={d.district_id}>{d.district_name}</option>)}</select></label><label>Locality<select name="locality_id" value={form.locality_id} onChange={change} disabled={!form.district_id}><option value="">Select locality</option>{localities.map(l=><option key={l.locality_id} value={l.locality_id}>{l.locality_name}</option>)}</select></label><label>Status<select name="status" value={form.status} onChange={change}><option>Active</option><option>Inactive</option></select></label><label>{editing?"New Password (optional)":"Password"}<input type="password" name="password" value={form.password} onChange={change} required={!editing}/></label></div>
      <div className="user-modal-actions"><button type="button" className="modal-cancel" onClick={()=>setModal(false)}>Cancel</button><button className="modal-save" disabled={saving}>{saving?"Saving...":editing?"Save Changes":"Create User"}</button></div></form></div>}
  </div>;
}
export default UsersRoles;
