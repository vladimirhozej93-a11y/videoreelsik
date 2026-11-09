function text(value,max){return typeof value==='string'?value.trim().slice(0,max):''}
function website(raw){try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return ''}}
export function makeYandexDraft(feature,criteria){
 const p=feature?.properties||{},c=p.CompanyMetaData||{};
 const name=text(c.name||p.name,200)||'Организация';
 const address=text(c.address||p.description,2000);
 const locality=c.Address?.Components?.find(item=>item.kind==='locality')?.name;
 const city=text(locality||criteria.city,200);
 const mapUrl='https://yandex.ru/maps/?text='+encodeURIComponent(`${name} ${address}`);
 const phones=(c.Phones||[]).filter(item=>item.type!=='fax').map(item=>text(item.formatted,100)).filter(Boolean);
 const yandexId=text(c.id,100);
 const comment=[address&&'Адрес: '+address,'Яндекс Карты: '+mapUrl,phones.length>1?'Другие телефоны: '+phones.slice(1).join(', '):'', 'Рейтинг 4,7+ пока не проверен. Бюджет и готовность к рекламе не подтверждены.'].filter(Boolean).join('\n').slice(0,8000);
 return {name,niche:text(criteria.niche,200),city,phone:phones[0]||'',site:website(c.url),source:'Карты',comment,...(yandexId?{yandexId}:{})};
}
function phoneKey(value){const phone=String(value||'').replace(/\D/g,'');return phone.length===11&&phone.startsWith('8')?'7'+phone.slice(1):phone}
function normalized(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
export function findYandexDuplicate(draft,leads){
 return leads.find(lead=>{
  if(draft.yandexId&&lead.yandexId)return draft.yandexId===lead.yandexId;
  const a=phoneKey(draft.phone),b=phoneKey(lead.phone);
  return a.length>=10&&a===b&&normalized(draft.name)===normalized(lead.name)&&normalized(draft.city)===normalized(lead.city);
 });
}
