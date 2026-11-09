import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.mjs';
const origin='https://crm.example';
const password='test-only-long-password-36';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let values=[];return {bind(...args){values=args;return this},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){return sql.prepare(query).run(...values)}}}};
 const env={DB,CRM_PASSWORD:password};
 async function call(path,method='GET',body,cookie,headers={}){return worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env)}
 async function login(){const r=await call('/api/login','POST',{password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
 return {sql,env,call,login};
}
const lead={name:'Ремонт Москва',niche:'Ремонт',city:'Москва',phone:'+79000000000',site:'example.com',telegram:'@example',whatsapp:'',source:'Telegram',comment:'Первый контакт',reminder:'',service:'Яндекс Директ',status:'Новый',budget:5000,ready:true,history:[]};
test('unauthorized requests and spoofed ChatGPT headers cannot access data',async()=>{
 const {call}=fixture();assert.equal((await call('/api/yandex/status')).status,401);assert.equal((await call('/api/yandex/search','POST',{niche:'Ремонт',city:'Москва'})).status,401);for(const method of ['GET','POST','DELETE'])assert.equal((await call('/api/leads',method,method==='GET'?undefined:lead)).status,401);
 assert.equal((await call('/api/leads','GET',undefined,undefined,{'oai-authenticated-user-id':'vladimir','oai-authenticated-user-email':'test@example.com'})).status,401);
});
test('login sets a protected session; malformed and forged cookies fail',async()=>{
 const {call}=fixture();assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);
 const r=await call('/api/login','POST',{password});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
 const token=cookie.split(';')[0];assert.equal((await call('/api/session','GET',undefined,token)).status,200);
 assert.equal((await call('/api/session','GET',undefined,token+'x')).status,401);
 assert.equal((await call('/api/session','GET',undefined,'__Host-leadflow=v1.9999999999.test.bad')).status,401);
 assert.equal((await call('/api/leads','GET',undefined,token)).headers.get('cache-control'),'no-store');
});
test('create, reload, update and delete persist in SQL',async()=>{
 const {call,login}=fixture(),cookie=await login();const saved=await (await call('/api/leads','POST',lead,cookie)).json();assert.ok(saved.id);
 const rows=await (await call('/api/leads','GET',undefined,cookie)).json();assert.equal(rows.length,1);assert.equal(rows[0].name,lead.name);
 assert.equal((await call('/api/leads','POST',{...saved,status:'Клиент'},cookie)).status,200);assert.equal((await (await call('/api/leads','GET',undefined,cookie)).json())[0].status,'Клиент');
 assert.equal((await call('/api/leads','DELETE',{id:saved.id},cookie)).status,200);assert.deepEqual(await (await call('/api/leads','GET',undefined,cookie)).json(),[]);
});
test('foreign owners are neither listed, overwritten nor deleted',async()=>{
 const {sql,call,login}=fixture(),cookie=await login();sql.prepare('INSERT INTO leads VALUES (?,?,?,?)').run('foreign','other',JSON.stringify({...lead,id:'foreign'}),'2026-01-01');
 assert.deepEqual(await (await call('/api/leads','GET',undefined,cookie)).json(),[]);
 assert.equal((await call('/api/leads','POST',{...lead,id:'foreign'},cookie)).status,403);
 await call('/api/leads','DELETE',{id:'foreign'},cookie);assert.equal(sql.prepare('SELECT COUNT(*) n FROM leads').get().n,1);
});
test('CSRF is blocked for login, logout and writes',async()=>{
 const {call,login}=fixture(),cookie=await login();for(const path of ['/api/login','/api/logout','/api/leads'])assert.equal((await call(path,'POST',lead,cookie,{Origin:'https://evil.example'})).status,403);
});
test('validation rejects malformed budgets, invalid fields and oversized payloads',async()=>{
 const {call,login}=fixture(),cookie=await login();for(const input of [{...lead,budget:4999},{...lead,status:'Unknown'},{...lead,name:''},{...lead,history:['x'.repeat(1001)]},{...lead,ready:'true'},null])assert.equal((await call('/api/leads','POST',input,cookie)).status,400);
 assert.equal((await call('/api/leads','POST',{...lead,comment:'x'.repeat(40000)},cookie)).status,413);
});
test('password attempts are throttled for fifteen minutes',async()=>{
 const {call}=fixture();for(let n=0;n<10;n++)assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);
 const response=await call('/api/login','POST',{password});assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);
});
test('missing secrets fail closed and password rotation invalidates old sessions',async()=>{
 const {call,login,env}=fixture(),cookie=await login();env.CRM_PASSWORD='another-test-only-long-password';assert.equal((await call('/api/leads','GET',undefined,cookie)).status,401);
 delete env.CRM_PASSWORD;assert.equal((await call('/api/leads','GET',undefined,cookie)).status,503);
});
test('logout clears the browser cookie',async()=>{const {call,login}=fixture();const response=await call('/api/logout','POST',undefined,await login());assert.equal(response.status,200);assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'))});
