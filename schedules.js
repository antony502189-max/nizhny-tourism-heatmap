// Weekly OSM schedules only. Unhandled syntax has an explicit unknown state.
const VenueHours = (() => {
  const days = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Moscow', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  function status(hours, now) {
    if (hours === '24/7') return 'open';
    const parts = Object.fromEntries(clock.formatToParts(now).map(p => [p.type,p.value]));
    const today = days.indexOf(parts.weekday.slice(0,2));
    const minutes = Number(parts.hour)*60 + Number(parts.minute);
    let state = 'closed';
    for (const rule of hours.split(';')) {
      const match = rule.trim().match(/^(?:([A-Za-z ,-]+?)\s+)?(off|closed|\d.*)$/);
      if (!match) return 'unknown';
      const allowed = new Set();
      for (const term of (match[1] || 'Mo-Su').split(',')) {
        const ends = term.trim().split('-');
        const first = days.indexOf(ends[0]), last = days.indexOf(ends.at(-1));
        if (ends.length>2 || first<0 || last<0) return 'unknown';
        for (let k=0; k<=(last-first+7)%7; k++) allowed.add((first+k)%7);
      }
      let inside = false;
      if (!['off','closed'].includes(match[2])) {
        for (const interval of match[2].split(',')) {
          const t = interval.trim().match(/^(\d{1,2}):([0-5]\d)-(\d{1,2}):([0-5]\d)$/);
          if (!t) return 'unknown';
          const start = +t[1]*60 + +t[2], end = +t[3]*60 + +t[4];
          if (start>=1440 || end>1440 || end<=start) return 'unknown';
          if (minutes>=start && minutes<end) inside=true;
        }
      }
      // A bare time after a semicolon may extend the preceding selector.
      if (!match[1] && hours.includes(';')) return 'unknown';
      if (allowed.has(today)) state = inside ? 'open' : 'closed';
    }
    return state;
  }
  function readOverpass(raw) {
    const stamp=raw?.osm3s?.timestamp_osm_base;
    if (raw.remark || !Number.isFinite(Date.parse(stamp)) || !Array.isArray(raw.elements)) throw Error('Неполный ответ Overpass');
    const places=[];
    for (const el of raw.elements) {
      if (!el.tags?.opening_hours || !el.tags.name) continue;
      const point=el.center || el;
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !['node','way','relation'].includes(el.type) || !Number.isSafeInteger(el.id)) continue;
      places.push({id:el.type+'/'+el.id,name:el.tags.name,lat:point.lat,lon:point.lon,hours:el.tags.opening_hours});
    }
    if (!places.length) throw Error('В ответе нет расписаний');
    return {stamp,places};
  }
  return {status,readOverpass};
})();
