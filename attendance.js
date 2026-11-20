'use strict';
if (ATTENDANCE_FEED_URL) {
  const id='attendance-feed';
  const panel=$('feedStatus');
  const message=document.createElement('span');
  const open=document.createElement('button');
  open.textContent='Показать последний срез';
  panel.hidden=false;panel.append(message,' ',open);
  let busy=false, failed=false;
  function mostRecent(data){
    // The provider orders slices newest first, also for multiple time-of-day slices.
    return data.slices[0];
  }
  function key(s){return [s.from,s.until,s.time].join('/');}
  function activate(s){
    source=id;slice=s;period={from:s.from,until:s.until,time:s.time};mode='clean';render();
  }
  function status(){
    const d=datasets.get(id);open.hidden=!d;
    if(!d){message.textContent=failed?'Поток посещаемости недоступен.':'Получаем данные посещаемости…';return;}
    const when=new Date(d.observedAt);
    const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(when);
    const stale=Date.now()-when.getTime()>15*60000;
    message.textContent=d.name+' · измерение '+time+' МСК.'+(stale?' Срез старше 15 минут.':'')+(failed?' Ошибка обновления. Сохранён последний полученный срез.':'');
  }
  open.onclick=()=>{activate(mostRecent(datasets.get(id)));fit();};
  async function poll(){
    if(busy || document.hidden)return;
    busy=true;
    try{
      const r=await fetch(ATTENDANCE_FEED_URL,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error();
      const next=validate(await r.json());
      if(typeof next.observedAt!=='string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(next.observedAt) || !Number.isFinite(Date.parse(next.observedAt)) || Date.parse(next.observedAt)>Date.now()+60000)throw Error();
      const old=datasets.get(id);
      if(old && Date.parse(next.observedAt)<Date.parse(old.observedAt))throw Error();
      datasets.set(id,next);
      if(!old)$('dataset').add(new Option(next.name,id));
      else Array.from($('dataset').options).find(o=>o.value===id).textContent=next.name;
      if($('periodDialog').open && $('dataset').value===id){
        const asEntered={from:$('from').value,until:$('until').value,time:$('time').value};
        listSlices();$('slices').selectedIndex=next.slices.findIndex(s=>key(s)===key(asEntered));
      }
      if(source===id){
        if(old && key(period)===key(mostRecent(old)))activate(mostRecent(next));
        else {slice=next.slices.find(s=>key(s)===key(period))||null;render();}
      }
      failed=false;
    }catch{failed=true;}
    finally{busy=false;status();}
  }
  status();poll();setInterval(poll,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
}
