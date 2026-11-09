const LIMIT=100;
export function moscowDay(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export async function yandexStatus(env){
 const usage=await env.DB.prepare('SELECT requests FROM api_usage WHERE day=?').bind(moscowDay()).first();
 return {configured:typeof env.YANDEX_MAPS_API_KEY==='string'&&env.YANDEX_MAPS_API_KEY.trim().length>0,used:usage?.requests||0,limit:LIMIT};
}
export async function runYandexSearch(input,env,fetchImpl=fetch){
 const apikey=env.YANDEX_MAPS_API_KEY?.trim();
 if(!apikey)throw {status:503,message:'Добавьте секрет YANDEX_MAPS_API_KEY в Cloudflare'};
 if(!input||typeof input.niche!=='string'||typeof input.city!=='string'||!input.niche.trim()||!input.city.trim()||input.niche.length>150||input.city.length>150)throw {status:400,message:'Укажите нишу и город, до 150 символов в каждом поле'};
 const skip=input.skip??0;
 if(!Number.isInteger(skip)||skip<0||skip>1000||skip%50!==0)throw {status:400,message:'Некорректный номер страницы'};
 const usage=await env.DB.prepare('INSERT INTO api_usage (day,requests) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1 WHERE requests<? RETURNING requests').bind(moscowDay(),LIMIT).first();
 if(!usage)throw {status:429,message:'В этой CRM израсходованы 100 запросов за сутки. Лимит обновится в полночь по Москве'};
 const query=`${input.niche.trim()}, ${input.city.trim()}`;
 const url=new URL('https://search-maps.yandex.ru/v1/');
 url.search=new URLSearchParams({apikey,text:query,lang:'ru_RU',type:'biz',results:'50',skip:String(skip)}).toString();
 let response;
 try{response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}})}catch{throw {status:502,message:'Яндекс не ответил вовремя. Запрос учтён в лимите CRM; попробуйте позже'};}
 if(!response.ok){
  if(response.status===401||response.status===403)throw {status:502,message:'Яндекс отклонил ключ или доступ к API. Проверьте активность ключа и тариф; новый ключ может активироваться до 15 минут'};
  if(response.status===429)throw {status:429,message:'Яндекс сообщил о превышении лимита. Подождите до обновления лимита в кабинете'};
  throw {status:502,message:'Яндекс вернул ошибку. Повторите поиск позже'};
 }
 let data;try{data=await response.json()}catch{throw {status:502,message:'Не удалось прочитать ответ Яндекса'}};
 if(!Array.isArray(data.features))throw {status:502,message:'Яндекс вернул неожиданный формат результатов'};
 // No provider records or search terms are persisted. Only the daily request count is stored.
 return {features:data.features,query,skip,nextSkip:skip+50,hasMore:data.features.length===50&&skip<1000,used:usage.requests,limit:LIMIT};
}
