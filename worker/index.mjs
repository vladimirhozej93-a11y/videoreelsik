const OWNER = 'vladimir';
const COOKIE = '__Host-leadflow';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const statuses = ['Новый','Написал','Ответил','Диалог','Созвон','Клиент','Отказ','Перезвонить позже'];
const stringFields = {name:200,niche:200,city:200,phone:100,site:2000,telegram:200,whatsapp:100,source:100,comment:8000,reminder:100,service:100};
const securityHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
function json(data,status=200,extra={}){return Response.json(data,{status,headers:{...securityHeaders,...extra}})}
function base64url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function fromBase64(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid base64');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function sign(secret,message){return crypto.subtle.sign('HMAC',await key(secret),encoder.encode(message))}
async function validPassword(expected,provided){return crypto.subtle.verify('HMAC',await key(expected),await sign(provided,'leadflow-login'),encoder.encode('leadflow-login'))}
async function issueSession(secret){const payload=`v1.${Math.floor(Date.now()/1000)+SESSION_SECONDS}.${crypto.randomUUID()}`;return `${payload}.${base64url(await sign(secret,payload))}`}
async function authenticated(request,secret){
 const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||token.length>300)return false;
 const parts=token.split('.');if(parts.length!==4||parts[0]!=='v1')return false;
 const expiry=Number(parts[1]),now=Math.floor(Date.now()/1000);
 if(!Number.isInteger(expiry)||expiry<=now||expiry>now+SESSION_SECONDS)return false;
 try{return await crypto.subtle.verify('HMAC',await key(secret),fromBase64(parts[3]),encoder.encode(parts.slice(0,3).join('.')))}catch{return false}
}
async function readJson(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw {status:415,message:'Ожидается JSON'};
 if(Number(request.headers.get('Content-Length'))>32768)throw {status:413,message:'Слишком большой запрос'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,message:'Пустой запрос'};
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw {status:413,message:'Слишком большой запрос'}}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw {status:400,message:'Некорректный JSON'}}
}
export function validateLead(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw {status:400,message:'Некорректная карточка'};
 const result={};
 for(const [field,max] of Object.entries(stringFields)){if(typeof input[field]!=='string'||input[field].length>max)throw {status:400,message:'Проверьте поля карточки'};result[field]=input[field]}
 result.name=result.name.trim();if(!result.name)throw {status:400,message:'Укажите компанию'};
 if(!statuses.includes(input.status)||typeof input.ready!=='boolean'||!Number.isFinite(input.budget)||input.budget<5000||input.budget>1e12)throw {status:400,message:'Укажите статус и бюджет от 5 000 ₽'};
 if(input.id!==undefined&&(typeof input.id!=='string'||input.id.length>100))throw {status:400,message:'Некорректный ID'};
 if(input.history!==undefined&&(!Array.isArray(input.history)||input.history.length>200||input.history.some(x=>typeof x!=='string'||x.length>1000)))throw {status:400,message:'Некорректная история'};
 return {...result,id:input.id?.trim()||crypto.randomUUID(),status:input.status,ready:input.ready,budget:input.budget,history:input.history||[],updated:new Date().toISOString()};
}
async function api(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(typeof env.CRM_PASSWORD!=='string'||env.CRM_PASSWORD.length<16)return json({error:'Владелец ещё не настроил пароль CRM в Cloudflare'},503);
 if(!env.DB)return json({error:'База CRM ещё не подключена'},503);
 if(!['GET','HEAD'].includes(request.method)){
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Запрос с другого сайта запрещён'},403);
 }
 if(path==='/api/login'&&request.method==='POST'){
  const input=await readJson(request);
  if(typeof input?.password!=='string'||input.password.length>256||input.password.length===0)return json({error:'Укажите пароль'},400);
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const rateKey=base64url(await sign(env.CRM_PASSWORD,`ip:${ip}`)),now=Math.floor(Date.now()/1000);
  // Atomic increment prevents concurrent requests bypassing the attempt limit.
  const rate=await env.DB.prepare('INSERT INTO login_attempts (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING attempts,expires').bind(rateKey,now+900,now,now,now+900).first();
  if(rate.attempts>10)return json({error:'Слишком много попыток. Повторите через 15 минут'},429,{'Retry-After':String(Math.max(1,rate.expires-now))});
  if(!await validPassword(env.CRM_PASSWORD,input.password))return json({error:'Неверный пароль'},401);
  await env.DB.prepare('DELETE FROM login_attempts WHERE key=? OR expires<=?').bind(rateKey,now).run();
  return json({ok:true},200,{'Set-Cookie':`${COOKIE}=${await issueSession(env.CRM_PASSWORD)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`});
 }
 if(path==='/api/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
 if(!await authenticated(request,env.CRM_PASSWORD))return json({error:'Войдите в CRM'},401);
 if(path==='/api/session'&&request.method==='GET')return json({ok:true});
 if(path!=='/api/leads')return json({error:'Не найдено'},404);
 if(request.method==='GET'){
  const {results}=await env.DB.prepare('SELECT data FROM leads WHERE owner=? ORDER BY updated DESC').bind(OWNER).all();
  return json(results.map(row=>JSON.parse(row.data)));
 }
 if(request.method==='POST'){
  const lead=validateLead(await readJson(request));
  // Keep ownership in the conflict clause: existing foreign rows cannot be overwritten.
  const saved=await env.DB.prepare('INSERT INTO leads (id,owner,data,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated WHERE leads.owner=excluded.owner RETURNING id').bind(lead.id,OWNER,JSON.stringify(lead),lead.updated).first();
  return saved?json(lead):json({error:'Нет доступа к этой карточке'},403);
 }
 if(request.method==='DELETE'){
  const input=await readJson(request);if(typeof input?.id!=='string'||!input.id||input.id.length>100)return json({error:'Некорректный ID'},400);
  await env.DB.prepare('DELETE FROM leads WHERE id=? AND owner=?').bind(input.id,OWNER).run();return json({ok:true});
 }
 return json({error:'Метод не поддерживается'},405,{'Allow':'GET, POST, DELETE'});
}
export default {
 async fetch(request,env){
  if(new URL(request.url).pathname.startsWith('/api/')){
   try{return await api(request,env)}catch(error){if(error?.status)return json({error:error.message},error.status);console.error('CRM request failed',error?.name||'Error');return json({error:'Не удалось выполнить запрос. Повторите попытку'},500)}
  }
  return env.ASSETS.fetch(request);
 }
};
