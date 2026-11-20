'use strict';
const $ = id => document.getElementById(id);
const number = n => new Intl.NumberFormat('ru-RU').format(n);
const formatDate = s => s.split('-').reverse().join('.');
const times = {all:'Все часы',morning:'Утро',day:'День',evening:'Вечер',night:'Ночь'};
const original = {from:'2025-01-01',until:'2025-01-23',time:'all',tourists:748151,excursionists:1689,marks:DATA.marks,cells:[]};
const datasets = new Map([['photo',{name:'Фотография пользователя',slices:[original]}]]);
let source = 'photo', slice = original, period = {...original}, mode = 'clean', selected = null, expanded = false;
const map = L.map('map',{zoomControl:false,zoomSnap:0,zoomDelta:.75,minZoom:8,maxZoom:17,attributionControl:true});
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ODbL');
L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
const base = L.imageOverlay('assets/city.webp',DATA.cityBounds).addTo(map);
const detail = L.imageOverlay('assets/center.webp',[[56.300,43.935],[56.350,44.075]],{zIndex:1});
const photoLayer = L.imageOverlay('assets/photo.webp',DATA.photoBounds,{zIndex:5});
const coverage = L.imageOverlay('assets/coverage.webp',DATA.cityBounds,{zIndex:3});
const marks = L.imageOverlay('assets/marks.webp',DATA.cityBounds,{zIndex:4});
const importedCells = L.layerGroup(), importedMarks=L.layerGroup(), landmarks=L.layerGroup();
const pointName = p => p.name || (p.kind==='cluster'?'Скопление':p.kind==='group'?'Группа отметок':'Отметка')+' № '+p.id;
const realRange = () => slice?.marks.length || slice?.cells.length;
function fit(){
 const values = source==='photo' || !realRange() ? DATA.view : [...slice.marks.map(p=>[p.lat,p.lon]), ...slice.cells.flatMap(c=>[[c.south,c.west],[c.north,c.east]])];
 map.fitBounds(L.latLngBounds(values),{paddingTopLeft:[20,58],paddingBottomRight:[20,23],maxZoom:14,animate:false});
}
function setLayer(layer,show){if(show && !map.hasLayer(layer)) layer.addTo(map);else if(!show && map.hasLayer(layer))map.removeLayer(layer);}
map.on('zoomend',()=>setLayer(detail,map.getZoom()>=13 && mode==='clean'));
function focusAt(p,title,center=true) {
 if(selected) selected.remove();
 if(center) map.setView([p.lat,p.lon],Math.max(map.getZoom(),13.5),{animate:false});
 selected=L.circleMarker([p.lat,p.lon],{radius:11,color:'#bd7622',weight:3,fill:false,interactive:false}).addTo(map);
 selected.bindTooltip(document.createTextNode(title),{permanent:true,direction:'top',offset:[0,-10]}).openTooltip();
}
function clearFocus(){
 if(selected)selected.remove(); selected=null;
 $('featureTitle').textContent='Разбор отметок';
 $('featureBody').textContent=!slice?'Для этого среза нет данных.':source==='photo'?'Выберите тёмную отметку. Всего на снимке различимы 33 контура, в том числе одно крупное скопление в центре города.':'Выберите точку или ячейку загруженной выгрузки.';
}
function showInfo(title,paragraphs){
 $('featureTitle').textContent=title;
 $('featureBody').replaceChildren(...paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
}
function showMark(p,center=true){
 const title=pointName(p);
 if(source==='photo'){
  const nearby=DATA.places.filter(v=>v.region===p.id && !v.osmId);
  const candidates=DATA.places.filter(v=>v.region===p.id && v.osmId);
  const texts=[p.district+' район по центру контура. На фотографии его размер '+p.w+' × '+p.h+' пикселей.'];
  if(p.kind==='cluster')texts.push('Знаки перекрывают друг друга. Число объектов внутри скопления неизвестно.');
  if(nearby.length)texts.push('В пределах контура или на его краю по совмещению карты расположены '+nearby.slice(0,5).map(v=>v.name).join(', ')+'. Это ориентиры для проверки.');
  else if(!candidates.length)texts.push('Название объекта по снимку установить не удалось.');
  texts.push('Центр ≈ '+p.lat.toFixed(3)+'°, '+p.lon.toFixed(3)+'°. Посещаемость точки неизвестна.');
  showInfo(title,texts);
  if(candidates.length){
   const list=document.createElement('ul');
   for(const c of candidates){const item=document.createElement('li');item.append(osmLink(c),' · ≈ '+c.meters+' м');list.append(item);}
   const header=document.createElement('p');header.textContent='Кандидаты OSM и расстояние от центра';
   $('featureBody').append(header,list);
  }
 }else showInfo(title,['Объект из загруженного файла.',p.lat+'°, '+p.lon+'°']);
 focusAt(p,title,center);
}
function osmLink(p){
 const a=document.createElement('a');a.href='https://www.openstreetmap.org/'+p.osmId;a.target='_blank';a.rel='noopener noreferrer';a.textContent=p.name;return a;
}
function showPlace(p,center=true){
 $('places').checked=true;setLayer(landmarks,true);
 const text=['Справочный ориентир OpenStreetMap.'];
 if(source==='photo'&&slice){
  text.push(p.osmId?'Кандидат для контура № '+p.region+'. Расстояние от центра около '+p.meters+' м.':'Координаты попадают в контур № '+p.region+' или к его краю.');
  text.push('Название объекта в исходном каталоге требует подтверждения.');
 }
 if(p.osmId&&p.versionDate>'2025-01-23')text.push('Версия записи OSM обновлена после даты фотографии.');
 showInfo(p.name,text);if(p.osmId)$('featureBody').append(osmLink(p));
 focusAt(p,p.name,center);
}
function circle(p,options,handler){
 const mark=L.circleMarker([p.lat,p.lon],{radius:5,weight:2,...options}).on('click',e=>{L.DomEvent.stopPropagation(e);handler(p,false);});
 mark.bindTooltip(document.createTextNode(pointName(p)));return mark;
}
for(const p of DATA.places)landmarks.addLayer(circle(p,{color:'#a56c25',fillColor:'#fff4cf',fillOpacity:1,bubblingMouseEvents:false},showPlace));
function rawPixel(ll){
 const rad=Math.PI/180, merc=lat=>Math.asinh(Math.tan(lat*rad));
 const u=(ll.lng-43.57)*592/.64-296,z=(merc(56.44)-merc(ll.lat))*592/(.64*rad)-250;
 return DATA.v.map(([a,b,c])=>a*u+b*z+c);
}
map.on('click',e=>{
 if(source!=='photo'||!slice || (mode==='clean'&&!$('marks').checked))return;
 const [x,y]=rawPixel(e.latlng);
 const [x2]=rawPixel(map.containerPointToLatLng(e.containerPoint.add([10,0])));
 const tolerance=Math.min(5,Math.max(1,Math.abs(x2-x)));
 let pick=null, best=tolerance;
 for(const p of slice.marks){
  if(Math.abs(p.x-x)>p.w+tolerance || Math.abs(p.y-y)>p.h+tolerance)continue;
  for(const [row,left,right] of p.runs){
   const distance=Math.hypot(Math.max(0,left-x,x-right),row-y);
   if(distance<=best){best=distance;pick=p;}
  }
 }
 if(pick)showMark(pick,false);
});
function legendCell(count){
 if(count>35000)return '#823b27'; if(count>27000)return '#ab5b26';
 if(count>19000)return '#b88b28'; if(count>12000)return '#538644';
 if(count>3800)return '#469ea5'; return '#c1dfdc';
}
function rebuildImported(){
 importedCells.clearLayers(); importedMarks.clearLayers();
 if(source==='photo'||!slice)return;
 for(const c of slice.cells){
  const rect=L.rectangle([[c.south,c.west],[c.north,c.east]],{weight:1,color:'#faf9ed',fillColor:legendCell(c.value),fillOpacity:.72,bubblingMouseEvents:false});
  rect.on('click',()=>{if(selected)selected.remove();selected=null;showInfo('Ячейка тепловой карты',[number(c.value)+' визитеров в выбранном срезе.','Значение из загруженной выгрузки.']);});importedCells.addLayer(rect);
 }
 for(const p of slice.marks)importedMarks.addLayer(circle(p,{color:'#452950',fillColor:'#452950',fillOpacity:.95,bubblingMouseEvents:false},showMark));
}
function layers(){
 const has=!!slice, photographic=mode==='photo' && has && source==='photo';
 $('photo').disabled=source!=='photo'||!has;
 $('photo').setAttribute('aria-pressed',String(photographic));$('clean').setAttribute('aria-pressed',String(!photographic));
 for(const id of ['marks','heat'])$(id).disabled=photographic||!has;
 $('mapNote').hidden=has;$('mapNote').textContent='Для выбранного периода и времени суток нет выгрузки. Доступный срез указан в настройках периода.';
 setLayer(detail,map.getZoom()>=13&&!photographic);
 setLayer(coverage,has&&source==='photo'&&!photographic&&$('heat').checked);
 setLayer(marks,has&&source==='photo'&&!photographic&&$('marks').checked);
 setLayer(importedCells,has&&source!=='photo'&&$('heat').checked);
 setLayer(importedMarks,has&&source!=='photo'&&$('marks').checked);
 setLayer(photoLayer,photographic);setLayer(landmarks,$('places').checked);
 $('layerNote').textContent=photographic?'Фотография содержит оба исходных слоя. Переключитесь на карту для раздельного просмотра.':source==='photo'?'Бирюзовый цвет показывает, где на фотографии различима сетка. Числа по ячейкам неизвестны.':'Цвет ячейки соответствует числу визитеров из файла. Пороги шкалы — 3,8 / 12 / 19 / 27 / 35 тыс.';
}
function render(){
 $('periodBtn').textContent=formatDate(period.from)+' — '+formatDate(period.until)+(period.time==='all'?'':' · '+times[period.time])+' ▾';
 for(const [id,val] of [['total',slice?slice.tourists+slice.excursionists:null],['tourists',slice?.tourists],['exc',slice?.excursionists]])$(id).textContent=val==null?'—':number(val);
 clearFocus();rebuildImported();layers();
}
function switchMode(value){mode=value;clearFocus();layers();}
$('clean').onclick=()=>switchMode('clean');$('photo').onclick=()=>switchMode('photo');
for(const id of ['marks','heat','places'])$(id).onchange=()=>{clearFocus();layers();};
$('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();$('home').onclick=fit;
function expand(value){
 expanded=value;$('atlas').classList.toggle('grown',value);document.body.classList.toggle('expanded',value);
 $('expand').setAttribute('aria-label',value?'Свернуть карту':'Развернуть карту');map.invalidateSize();
}
$('expand').onclick=()=>expand(!expanded);
document.addEventListener('keydown',e=>{if(e.key==='Escape' && expanded && !document.querySelector('dialog[open]'))expand(false);});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}
});
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
$('aboutBtn').onclick=()=>$('aboutDialog').showModal();
function available(){return datasets.get($('dataset').value);}
function listSlices(){
 const list=available().slices;
 $('sliceChoice').hidden=$('dataset').value==='photo';
 $('slices').replaceChildren(...list.map((s,i)=>new Option(formatDate(s.from)+' — '+formatDate(s.until)+' · '+times[s.time],String(i))));
}
$('slices').onchange=()=>setFields(available().slices[Number($('slices').value)]);
function setFields(s){$('from').value=s.from;$('until').value=s.until;$('time').value=s.time;$('until').setCustomValidity('');}
$('periodBtn').onclick=()=>{$('dataset').value=source;listSlices();setFields(period);$('slices').selectedIndex=available().slices.indexOf(slice);$('periodDialog').showModal();};
$('dataset').onchange=()=>{listSlices();setFields(available().slices[0]);};
$('restore').onclick=()=>{$('dataset').value='photo';setFields(original);apply();};
$('from').oninput=$('until').oninput=()=>$('until').setCustomValidity('');
function apply(){
 if($('from').value>$('until').value){$('until').setCustomValidity('Окончание должно быть не раньше начала.');$('until').reportValidity();return;}
 const changed=source!==$('dataset').value;
 source=$('dataset').value;period={from:$('from').value,until:$('until').value,time:$('time').value};
 slice=available().slices.find(s=>s.from===period.from&&s.until===period.until&&s.time===period.time) || null;
 if(!slice||source!=='photo')mode='clean';render();if(changed)fit();$('periodDialog').close();
}
$('filters').onsubmit=e=>{e.preventDefault();apply();};
const normalize = s=>String(s).toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[№#]/g,' ').trim();
function search(){
 const q=normalize($('query').value), kind=$('searchKind').value, items=[];
 if(kind!=='place'&&slice)for(const p of slice.marks){
  const names=source==='photo'?DATA.places.filter(v=>v.region===p.id).map(v=>v.name).join(' '):'';
  if(!normalize([pointName(p),p.district||'',names].join(' ')).includes(q) || (/^\d+$/.test(q)&&String(p.id)!==q))continue;
  items.push([pointName(p),p.district?p.district+' район · контур на фотографии':'Выгрузка',()=>{if(mode==='clean')$('marks').checked=true;layers();showMark(p);}]);
 }
 if(kind!=='mark')for(const p of DATA.places)if(normalize(p.name).includes(q))items.push([p.name,'Справочный ориентир',()=>showPlace(p)]);
 $('resultsCount').textContent=items.length?'Найдено результатов — '+items.length:'Совпадений нет. Попробуйте название района или номер отметки.';
 $('results').replaceChildren(...items.map(([name,subtitle,fn])=>{const b=document.createElement('button');b.className='result';b.textContent=name;const small=document.createElement('small');small.textContent=subtitle;b.append(small);b.onclick=()=>{$('searchDialog').close();fn();};return b;}));
}
$('searchBtn').onclick=()=>{search();$('searchDialog').showModal();$('query').focus();};
$('query').oninput=$('searchKind').onchange=search;
function download(content,type,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('report').onclick=()=>{
 const report={source:datasets.get(source).name,...period,status:slice?'available':'no_data',totals:slice?{visitors:slice.tourists+slice.excursionists,tourists:slice.tourists,excursionists:slice.excursionists}:null};
 if(source==='attendance-feed')report.observedAt=datasets.get(source).observedAt;
 if(slice){
  report.marks=slice.marks.map(({runs,...m})=>m);report.cells=source==='photo'?null:slice.cells;
  if(source==='photo'){report.notes='Контуры оцифрованы с фотографии. Координаты приблизительны. Состав скоплений и значения ячеек неизвестны.';report.referencePlaces=DATA.places;}
 }
 download(JSON.stringify(report,null,2),'application/json','Отчёт_'+period.from+'_'+period.until+'.json');
};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const count=n=>Number.isSafeInteger(n)&&n>=0;
const coord=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
function validate(d){
 if(!d||typeof d.name!=='string'||!d.name.trim()||!Array.isArray(d.slices)||!d.slices.length)throw Error('Нужны название источника и массив slices.');
 const keys=new Set();
 for(const s of d.slices){
  if(!s||!validDate(s.from)||!validDate(s.until)||s.from>s.until||!Object.hasOwn(times,s.time)||!count(s.tourists)||!count(s.excursionists)||!count(s.tourists+s.excursionists))throw Error('Проверьте даты, время суток и целые неотрицательные итоги среза.');
  const key=[s.from,s.until,s.time].join('/');if(keys.has(key))throw Error('Период и время суток повторяются.');keys.add(key);
  if(!Array.isArray(s.marks)||!Array.isArray(s.cells))throw Error('У каждого среза должны быть массивы marks и cells.');
  const ids=new Set();
  for(const m of s.marks){
   if(!m||!count(m.id)||ids.has(m.id)||typeof m.name!=='string'||!m.name.trim()||!coord(m.lat,-85,85)||!coord(m.lon,-180,180))throw Error('Проверьте идентификаторы, названия и координаты точек.');ids.add(m.id);
  }
  for(const c of s.cells)if(!c||!coord(c.south,-85,85)||!coord(c.north,-85,85)||!coord(c.west,-180,180)||!coord(c.east,-180,180)||c.north<=c.south||c.east<=c.west||!count(c.value))throw Error('Некорректные границы или значение ячейки.');
 }
 return d;
}
$('upload').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{
  if(f.size>10*1024*1024)throw Error('Максимальный размер файла — 10 МБ.');
  const d=validate(JSON.parse(await f.text())),id='import-'+datasets.size;datasets.set(id,d);
  $('dataset').add(new Option(d.name,id));$('dataset').value=id;listSlices();setFields(d.slices[0]);$('uploadStatus').textContent='Принято срезов — '+d.slices.length+'. Нажмите «Применить».';
 }catch(err){$('uploadStatus').textContent='Файл не загружен. '+err.message;}
 e.target.value='';
};
fit();render();
