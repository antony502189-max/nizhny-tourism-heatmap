'use strict';
const get=id=>document.getElementById(id);
const displayTime=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'});
const query='[out:json][timeout:25][bbox:56.20,43.76,56.38,44.10];(nwr[tourism~"^(museum|zoo|theme_park|attraction|aquarium|gallery)$"][name][opening_hours];nwr[leisure~"^(park|stadium)$"][name][opening_hours];nwr[amenity~"^(theatre|planetarium)$"][name][opening_hours];nwr[aeroway=terminal][name][opening_hours];);out center tags;';
const endpoint='https://overpass.nextgis.com/api/interpreter?data='+encodeURIComponent(query);
const map=L.map('map',{zoomSnap:0}).fitBounds([[56.215,43.78],[56.365,44.08]],{padding:[10,10]});
map.attributionControl.setPrefix(false);
L.imageOverlay('assets/city.webp',[[56.14,43.57],[56.44,44.21]],{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ODbL'}).addTo(map);
const grid=L.layerGroup().addTo(map), dots=L.layerGroup().addTo(map);
const labels={open:'Открыто',closed:'Закрыто',unknown:'Уточните расписание'};
const colors={open:'#087a6c',closed:'#637175',unknown:'#ae6816'};
const storageKey='nn-venue-schedules-v1';
let catalog=SCHEDULES_SEED,checked=0,fetching=false,notice='Сохранённая копия.';
try {
  const stored=JSON.parse(localStorage.getItem(storageKey));
  if(stored && Date.parse(stored.catalog.stamp)>=Date.parse(catalog.stamp) && Array.isArray(stored.catalog.places) && stored.catalog.places.length && stored.catalog.places.every(p=>typeof p.hours==='string' && Number.isFinite(p.lat) && Number.isFinite(p.lon) && /^(node|way|relation)\/\d+$/.test(p.id))){
    catalog=stored.catalog;checked=stored.checked;
  }
} catch {}
function info(){
  const stamp=new Date(catalog.stamp);
  get('sourceStatus').textContent=notice+' База OSM на '+displayTime.format(stamp)+' МСК, объектов с графиком — '+catalog.places.length+'.';
}
function redraw(){
  const now=new Date();get('clock').textContent=displayTime.format(now)+' МСК';
  grid.clearLayers();dots.clearLayers();
  const counts={open:0,closed:0,unknown:0},bins=new Map();
  for(const p of catalog.places){
    const state=VenueHours.status(p.hours,now);counts[state]++;
    if(state==='open'){
      const row=Math.floor(p.lat/.009),col=Math.floor(p.lon/.016),key=row+'/'+col;
      const cell=bins.get(key)||{row,col,count:0};cell.count++;bins.set(key,cell);
    }
    if(state!=='open' && get('onlyOpen').checked)continue;
    const box=document.createElement('div'),title=document.createElement('strong'),link=document.createElement('a');
    title.textContent=p.name;link.href='https://www.openstreetmap.org/'+p.id;link.target='_blank';link.rel='noopener';link.textContent='Карточка OSM';
    box.append(title,document.createElement('br'),labels[state]+' по расписанию',document.createElement('br'),p.hours,document.createElement('br'),link);
    L.circleMarker([p.lat,p.lon],{radius:6,color:'#fff',weight:1.5,fillColor:colors[state],fillOpacity:1}).bindPopup(box).addTo(dots);
  }
  if(get('showGrid').checked)for(const {row,col,count} of bins.values()){
    L.rectangle([[row*.009,col*.016],[(row+1)*.009,(col+1)*.016]],{weight:1,color:'#378b80',fillColor:'#078a77',fillOpacity:Math.min(.75,.1+count*.075)}).bindPopup('Открыто по расписанию в ячейке — '+count).addTo(grid).bringToBack();
  }
  for(const [k,v] of Object.entries(counts))get(k+'Count').textContent=String(v);
  info();
}
async function refresh(force=false){
  if(fetching || (!force && Date.now()-checked<6*3600e3))return;
  fetching=true;get('refresh').disabled=true;notice='Проверяем обновление.';info();
  try {
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(30000),credentials:'omit'});
    if(!response.ok)throw Error();
    const next=VenueHours.readOverpass(await response.json());
    if(Date.parse(next.stamp)<Date.parse(catalog.stamp))throw Error();
    catalog=next;checked=Date.now();notice='Получено из Overpass.';
    try{localStorage.setItem(storageKey,JSON.stringify({catalog,checked}));}catch{}
    redraw();
  } catch {notice='Источник недоступен. Показана сохранённая копия.';info();}
  finally {fetching=false;get('refresh').disabled=false;}
}
get('onlyOpen').onchange=get('showGrid').onchange=redraw;get('refresh').onclick=()=>refresh(true);
redraw();refresh();
setInterval(()=>{if(!document.hidden)redraw();},60000);
setInterval(()=>{if(!document.hidden)refresh();},15*60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){redraw();refresh();}});
