import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const mf=new Miniflare({modules:true,scriptPath:new URL('../worker/index.mjs',import.meta.url).pathname,compatibilityDate:config.compatibility_date,d1Databases:{DB:'leadflow-test'},bindings:{CRM_PASSWORD:'test-only-long-password-36'},assets:{directory:new URL('../dist',import.meta.url).pathname,binding:'ASSETS',routerConfig:{has_user_worker:true,static_routing:{user_worker:config.assets.run_worker_first}}},host:'127.0.0.1'});
const origin='http://localhost';
try{
 const db=await mf.getD1Database('DB');
 await db.batch(readdirSync(new URL('../migrations',import.meta.url)).filter(name=>name.endsWith('.sql')).sort().map(name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')).join('\n').split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 const page=await mf.dispatchFetch(origin+'/');assert.equal(page.status,200);
 const login=await mf.dispatchFetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'test-only-long-password-36'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const status=await mf.dispatchFetch(origin+'/api/yandex/status',{headers:{Cookie:cookie}});assert.equal(status.status,200);assert.equal((await status.json()).configured,false);
 const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
 const lead={name:'Тестовая компания',niche:'Ремонт',city:'Москва',phone:'',site:'',telegram:'',whatsapp:'',source:'Telegram',comment:'',reminder:'',service:'VK Реклама',status:'Новый',budget:5000,ready:true};
 const saved=await mf.dispatchFetch(origin+'/api/leads',{method:'POST',headers,body:JSON.stringify(lead)});assert.equal(saved.status,200);const card=await saved.json();
 const imported=await mf.dispatchFetch(origin+'/api/leads',{method:'POST',headers,body:JSON.stringify({...lead,yandexId:'runtime-test-id'})});assert.equal(imported.status,200);const importedCard=await imported.json();const duplicate=await mf.dispatchFetch(origin+'/api/leads',{method:'POST',headers,body:JSON.stringify({...lead,yandexId:'runtime-test-id'})});assert.equal(duplicate.status,409);await mf.dispatchFetch(origin+'/api/leads',{method:'DELETE',headers,body:JSON.stringify({id:importedCard.id})});
 const loaded=await mf.dispatchFetch(origin+'/api/leads',{headers});assert.equal(loaded.status,200);assert.equal((await loaded.json())[0].name,lead.name);
 const removed=await mf.dispatchFetch(origin+'/api/leads',{method:'DELETE',headers,body:JSON.stringify({id:card.id})});assert.equal(removed.status,200);
 console.log('Cloudflare runtime: page, login, D1 save/reload/delete passed.');
}finally{await mf.dispose()}
