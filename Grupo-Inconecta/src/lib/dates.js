const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
export function todayBR(now=new Date()){const p=Object.fromEntries(formatter.formatToParts(now).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
export function plusDays(day,count){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function nextDueAtLeast30Days(day,dueDay){const limit=plusDays(day,30);const [yy,mm]=limit.split('-').map(Number);let date=`${yy}-${String(mm).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;if (date<limit){const yy2=mm===12?yy+1:yy;const mm2=mm===12?1:mm+1;date=`${yy2}-${String(mm2).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;}return date;}
export function nextMonthDue(day,dueDay){let [y,m]=day.slice(0,7).split('-').map(Number);if(++m===13){y++;m=1;}return `${y}-${String(m).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;}
export function currentMonth(day){return day.slice(0,7);}
