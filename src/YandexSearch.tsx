import {useEffect,useRef,useState} from 'react';
import {Search,ArrowUpRight,ChevronDown} from 'lucide-react';
type Feature={properties?:{name?:string;description?:string;CompanyMetaData?:{id?:string;name?:string;address?:string;url?:string;Phones?:{formatted?:string;type?:string}[]}}};
type Results={features:Feature[];query:string;skip:number;nextSkip:number;hasMore:boolean;used:number;limit:number};
function safeLink(raw?:string){if(!raw)return null;try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
export default function YandexSearch(){
 const [niche,setNiche]=useState('Цветочный магазин'),[city,setCity]=useState('Москва'),[status,setStatus]=useState<{configured:boolean;used:number;limit:number}|null>(null),[result,setResult]=useState<Results|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(false);
 useEffect(()=>{let mounted=true;fetch('/api/yandex/status').then(async r=>{if(r.status===401)window.dispatchEvent(new Event('leadflow-session-expired'));const d=await r.json();if(!r.ok)throw Error(d.error||'Не удалось проверить подключение');if(mounted)setStatus(d)}).catch(e=>{if(mounted)setError((e as Error).message)});return()=>{mounted=false}},[]);
 async function search(more=false){
  if(active.current)return;active.current=true;setBusy(true);setError('');
  if(!more)setResult(null);
  const next=more&&result?result.nextSkip:0;
  try{
   const r=await fetch('/api/yandex/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche,city,skip:next})});
   if(r.status===401)window.dispatchEvent(new Event('leadflow-session-expired'));
   const d=await r.json();
   if(!r.ok){const check=await fetch('/api/yandex/status');if(check.ok)setStatus(await check.json());throw Error(d.error||'Поиск не выполнен')}
   setResult(prev=>more&&prev?{...d,features:[...prev.features,...d.features]}:d);setStatus({configured:true,used:d.used,limit:d.limit});
  }catch(e){setError((e as Error).message)}finally{active.current=false;setBusy(false)}
 }
 const sameQuery=result?.query===`${niche.trim()}, ${city.trim()}`;
 return <section className="panel yandex-search"><div className="panel-heading"><div><span className="eyebrow">ЯНДЕКС КАРТЫ</span><h2>Найдите компании для нового проекта</h2><p>Укажите нишу и город — организации появятся прямо здесь.</p></div><span className="yandex-quota">{status?`${status.used} / ${status.limit} запросов за сутки`:'Проверяем подключение…'}</span></div>
 <div className="chips" style={{marginBottom:16}}>{["Цветочный магазин","Кондитерская","Подарочные наборы"].map(value=><button type="button" key={value} disabled={busy} onClick={()=>setNiche(value)}>{value}</button>)}</div><form className="yandex-form" onSubmit={e=>{e.preventDefault();void search()}}><label>Ниша<input required maxLength={150} value={niche} placeholder="Например, ремонт квартир" disabled={busy} onChange={e=>setNiche(e.target.value)}/></label><label>Город<input required maxLength={150} value={city} placeholder="Например, Москва" disabled={busy} onChange={e=>setCity(e.target.value)}/></label><button className="primary" disabled={busy||!status?.configured||status.used>=status.limit}><Search size={17}/>{busy?'Ищем компании…':'Найти компании'}</button></form>
 {status&&!status.configured&&<p className="yandex-alert">Для подключения добавьте в Cloudflare секрет YANDEX_MAPS_API_KEY и примените его к Production. Затем обновите страницу.</p>}
 {error&&<p className="yandex-alert" role="alert">{error}</p>}
 <p className="yandex-note">Для отбора нужны компании с рейтингом от 4,7. Рейтинг проверяется отдельно в карточке Яндекс Карт: подключённый API его не передаёт.</p><p className="yandex-note">Один поиск — один запрос, до 50 результатов. Счётчик учитывает обращения из этой CRM; общий расход смотрите в кабинете Яндекса. Обновление лимита — в полночь по Москве.</p>
 {result&&<><div className="yandex-results-heading"><strong>{result.query}</strong><span>Показано: {result.features.length}</span></div><div className="yandex-results">{result.features.map((feature,i)=>{const p=feature.properties||{},c=p.CompanyMetaData||{};const site=safeLink(c.url);return <article className="yandex-result" key={`${c.id||'company'}-${i}`}><div className="yandex-company-icon">Я</div><div className="yandex-company-body"><h3>{p.name||c.name||'Организация'}</h3><p>{p.description||c.address||'Адрес не указан'}</p>{c.Phones?.map((phone,n)=><p key={n}>{phone.formatted}</p>)}<div className="yandex-company-links">{site&&<a href={site} target="_blank" rel="noopener noreferrer">Сайт <ArrowUpRight size={14}/></a>}<a href={'https://yandex.ru/maps/?text='+encodeURIComponent(`${c.name||p.name||''} ${c.address||p.description||''}`)} target="_blank" rel="noopener noreferrer">Открыть в Яндекс Картах <ArrowUpRight size={14}/></a></div></div></article>})}</div>{result.features.length===0&&<p className="yandex-note">Компании не найдены. Попробуйте другое название ниши или город.</p>}{result.hasMore&&sameQuery&&<button className="secondary" disabled={busy||!!status&&status.used>=status.limit} onClick={()=>void search(true)}><ChevronDown size={17}/>Следующие 50 компаний</button>}</>}
 <div className="yandex-license-note">Данные предоставлены <a href="https://yandex.ru/maps/" target="_blank" rel="noopener noreferrer">Яндекс Картами</a>. Результаты показываются в текущей вкладке. Постоянное сохранение и ежедневный импорт пока не включены: для них нужно подтвердить право хранения данных по лицензии Яндекса.</div>
 </section>
}
