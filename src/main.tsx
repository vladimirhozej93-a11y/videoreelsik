import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';

function Root(){
 const [state,setState]=useState<'loading'|'login'|'ready'|'error'>('loading');
 const [error,setError]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 async function check(){
   setState('loading');
   try{const r=await fetch('/api/session');if(r.status===401){setState('login');return}if(!r.ok){const d=await r.json();throw Error(d.error||'Не удалось подключиться')}setState('ready')}
   catch(e){setError((e as Error).message);setState('error')}
 }
 useEffect(()=>{void check();const expired=()=>{setPassword('');setState('login');setError('Войдите снова, чтобы продолжить работу')};window.addEventListener('leadflow-session-expired',expired);return()=>window.removeEventListener('leadflow-session-expired',expired)},[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось войти');setPassword('');setState('ready')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function logout(){try{const r=await fetch('/api/logout',{method:'POST'});if(!r.ok)throw Error();setState('login');setError('')}catch{window.alert('Не удалось выйти. Повторите попытку.')}}
 if(state==='ready')return <><App/><button className="logout-button" onClick={logout}>Выйти</button></>;
 return <main className="login-page"><section className="login-card"><a className="brand" href="/" aria-label="Лидофлоу"><span className="brandmark"><span/><span/><span/></span>лидофлоу<span className="brand-dot">.</span></a><span className="eyebrow">ЛИЧНАЯ CRM ВЛАДИМИРА</span><h1>{state==='loading'?'Открываем рабочий стол…':'Все контакты. Один порядок.'}</h1><p>Клиенты, диалоги и следующие шаги — рядом, когда нужны.</p>{state==='login'&&<form onSubmit={login}><label>Пароль<input type="password" autoComplete="current-password" required autoFocus value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль от CRM" maxLength={256}/></label><button className="primary" disabled={busy}>{busy?'Входим…':'Войти в CRM'}</button></form>}{error&&<p className="login-error" role="alert">{error}</p>}{state==='error'&&<button className="secondary" onClick={()=>void check()}>Повторить подключение</button>}<small>Рабочее пространство доступно только владельцу</small></section></main>
}
createRoot(document.getElementById('root')!).render(<Root/>);
