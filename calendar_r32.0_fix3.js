/* Review & Todo Calendar
   Rev. r31.2_260928 / Calendar Phase 3
   Daily planning engine:
   - Big3
   - Brain Dump
   - 30-minute TimeTable
   - ↑ / ↓ relocation
   - + / - duration
   - create Item modal
   - 00:00~24:00 with configurable folded hours
   - daily memo/review
   - basic Week / Month overview

   Calendar data is intentionally isolated from index.html.
   Completion/Review sync is added in the next phase.
*/
window.RTCalendarScriptLoaded=true;
const CAL_KEY='review_todo_calendar_v2';
const CAL_SCHEMA=2;
const SLOT=30;
const DAY_MINUTES=1440;

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];

const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

const clone=value=>{
  if(value===undefined)return undefined;
  if(typeof structuredClone==='function'){
    try{return structuredClone(value)}catch{}
  }
  return JSON.parse(JSON.stringify(value));
};

const uuid=()=>{
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);
    return v.toString(16)
  })
};

const nowIso=()=>new Date().toISOString();

const localDateKey=(d=new Date())=>{
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`
};

const parseDate=s=>{
  const [y,m,d]=String(s).split('-').map(Number);
  return new Date(y,m-1,d)
};

const shiftDate=(s,days)=>{
  const d=parseDate(s);
  d.setDate(d.getDate()+days);
  return localDateKey(d)
};

const minuteLabel=minute=>{
  if(minute===1440)return '24:00';
  const h=Math.floor(minute/60);
  const m=minute%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
};

const prettyDate=s=>{
  const d=parseDate(s);
  const w=['일','월','화','수','목','금','토'];
  return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')} (${w[d.getDay()]})`
};

const DAY_COLORS=['default','red','orange','yellow','green','blue','indigo','purple','black'];
const WORK_COLORS=['gray','red','orange','yellow','green','blue','indigo','purple'];
const WORK_COLOR_LABELS={
  gray:'회색',red:'빨강',orange:'주황',yellow:'노랑',
  green:'초록',blue:'파랑',indigo:'남색',purple:'보라'
};

const defaultState=()=>({
  schemaVersion:CAL_SCHEMA,
  entries:[],
  dayMeta:{},
  settings:{
    collapseBeforeMinute:360,
    collapseAfterMinute:1320,
    workStartMinute:510,
    workEndMinute:1050,
    workColor:'gray'
  }
});

const normalizeDayMeta=(date,value={})=>({
  date,
  label:String(value.label||''),
  color:DAY_COLORS.includes(value.color)?value.color:'default',
  memo:String(value.memo||''),
  review:String(value.review||''),
  routineOverrides:Array.isArray(value.routineOverrides)
    ?value.routineOverrides
      .filter(x=>x&&x.routineId)
      .map(x=>({
        routineId:String(x.routineId),
        startMinute:Number.isFinite(Number(x.startMinute))?Number(x.startMinute):null,
        plannedDurationMinutes:Math.max(SLOT,Number(x.plannedDurationMinutes)||SLOT),
        deletedAt:x.deletedAt||null,
        updatedAt:x.updatedAt||null
      }))
    :[],
  routineSuppressions:Array.isArray(value.routineSuppressions)
    ?value.routineSuppressions
      .filter(x=>x&&x.routineId)
      .map(x=>({
        routineId:String(x.routineId),
        suppressed:x.suppressed!==false,
        updatedAt:x.updatedAt||null
      }))
    :[],
  createdAt:value.createdAt||null,
  updatedAt:value.updatedAt||null
});

const normalizeState=raw=>{
  const base=defaultState();
  if(!raw||typeof raw!=='object')return base;

  const dayMeta={};
  if(raw.dayMeta&&typeof raw.dayMeta==='object'){
    Object.entries(raw.dayMeta).forEach(([date,value])=>{
      dayMeta[date]=normalizeDayMeta(date,value||{})
    })
  }

  /* r31.1/r31.2의 dayNotes를 신규 Daily Meta로 자동 이전 */
  if(raw.dayNotes&&typeof raw.dayNotes==='object'){
    Object.entries(raw.dayNotes).forEach(([date,value])=>{
      if(!dayMeta[date]){
        dayMeta[date]=normalizeDayMeta(date,{
          memo:value?.memo||'',
          review:value?.review||''
        })
      }else{
        if(!dayMeta[date].memo)dayMeta[date].memo=String(value?.memo||'');
        if(!dayMeta[date].review)dayMeta[date].review=String(value?.review||'')
      }
    })
  }

  return{
    schemaVersion:CAL_SCHEMA,
    entries:Array.isArray(raw.entries)?raw.entries.filter(Boolean):[],
    dayMeta,
    settings:{
      collapseBeforeMinute:Number.isFinite(Number(raw.settings?.collapseBeforeMinute))
        ?Math.max(0,Math.min(720,Number(raw.settings.collapseBeforeMinute)))
        :360,
      collapseAfterMinute:Number.isFinite(Number(raw.settings?.collapseAfterMinute))
        ?Math.max(720,Math.min(1440,Number(raw.settings.collapseAfterMinute)))
        :1320,
      workStartMinute:Number.isFinite(Number(raw.settings?.workStartMinute))
        ?Math.max(0,Math.min(1410,Number(raw.settings.workStartMinute)))
        :510,
      workEndMinute:Number.isFinite(Number(raw.settings?.workEndMinute))
        ?Math.max(30,Math.min(1440,Number(raw.settings.workEndMinute)))
        :1050,
      workColor:WORK_COLORS.includes(raw.settings?.workColor)
        ?raw.settings.workColor:'gray'
    }
  }
};

let state=(()=>{
  try{return normalizeState(JSON.parse(localStorage.getItem(CAL_KEY)||'null'))}
  catch{return defaultState()}
})();

let selectedDate=localDateKey();
let viewMode='day';
let expandedEarly=false;
let expandedLate=false;
let core=null;

let calendarDirty=false;
let completionEditingEntryId=null;
let completionRoutineContext=null;

const scheduleRemoteSync=()=>{
  /* r31.6:
     Calendar 변경은 localStorage/RTCore 메모리에 즉시 저장하지만
     서버 동기화는 여기서 실행하지 않습니다.
     기존 앱의 5분 자동 sync 또는 사용자의 수동 Sync 버튼만 서버에 접근합니다. */
  calendarDirty=true
};

const refreshEntriesFromCore=()=>{
  if(!core?.getCalendarEntries)return;
  try{
    state.entries=core.getCalendarEntries()||[];
    save()
  }catch(e){
    console.warn('Calendar core refresh failed',e)
  }
};

const mergeRoutineOverrides=(left=[],right=[])=>{
  const map=new Map();
  [...(left||[]),...(right||[])].forEach(value=>{
    if(!value?.routineId)return;
    const old=map.get(value.routineId);
    if(!old){
      map.set(value.routineId,{...value});
      return
    }
    const oldTime=Date.parse(old.updatedAt||0)||0;
    const newTime=Date.parse(value.updatedAt||0)||0;
    if(newTime>=oldTime)map.set(value.routineId,{...value})
  });
  return [...map.values()]
};

const mergeRoutineSuppressions=(left=[],right=[])=>{
  const map=new Map();
  [...(left||[]),...(right||[])].forEach(value=>{
    if(!value?.routineId)return;
    const old=map.get(value.routineId);
    if(!old){
      map.set(value.routineId,{...value});
      return
    }
    const oldTime=Date.parse(old.updatedAt||0)||0;
    const newTime=Date.parse(value.updatedAt||0)||0;
    if(newTime>=oldTime)map.set(value.routineId,{...value})
  });
  return [...map.values()]
};

const mergeDailyMetaValue=(left,right)=>{
  if(!left)return right?{...right}:null;
  if(!right)return{...left};
  const lt=Date.parse(left.updatedAt||left.createdAt||0)||0;
  const rt=Date.parse(right.updatedAt||right.createdAt||0)||0;
  const winner=rt>=lt?{...right}:{...left};
  winner.routineOverrides=mergeRoutineOverrides(
    left.routineOverrides,
    right.routineOverrides
  );
  winner.routineSuppressions=mergeRoutineSuppressions(
    left.routineSuppressions,
    right.routineSuppressions
  );
  return winner
};

const refreshDailyMetaFromCore=()=>{
  if(!core?.getDailyMetaMap)return;
  try{
    const remote=core.getDailyMetaMap()||{};
    Object.entries(remote).forEach(([date,value])=>{
      const incoming=normalizeDayMeta(date,value||{});
      state.dayMeta[date]=mergeDailyMetaValue(state.dayMeta[date],incoming)
    });
    save()
  }catch(e){
    console.warn('Daily Meta core refresh failed',e)
  }
};

const persistDailyMeta=(date,{sync=true}={})=>{
  const meta=ensureDayMeta(date);
  if(!meta.createdAt)meta.createdAt=nowIso();
  meta.updatedAt=nowIso();
  save();

  try{
    const stored=core?.upsertDailyMeta?.(date,meta);
    if(stored)state.dayMeta[date]=normalizeDayMeta(date,stored)
  }catch(e){
    console.error(e);
    toast(e?.message||'날짜 메모를 저장하지 못했습니다.','warn')
  }

  save();
  if(sync)scheduleRemoteSync()
};


const persistEntry=(entry,{sync=true}={})=>{
  save();
  try{
    core?.upsertCalendarEntry?.(entry)
  }catch(e){
    console.error(e);
    toast(e?.message||'일정을 저장하지 못했습니다.','warn')
  }
  if(sync)scheduleRemoteSync()
};



const save=()=>{
  localStorage.setItem(CAL_KEY,JSON.stringify(state));
};

const activeItems=()=>{
  const list=core?.getItems?.()||[];
  return list.filter(item=>item&&item.status!=='deleted')
};

const itemMap=()=>new Map(activeItems().map(item=>[item.id,item]));

const itemTitle=item=>{
  const raw=String(item?.content||'').replace(/\r/g,'');
  const firstLine=(raw.split('\n')[0]||'').trim();
  if(firstLine)return firstLine;
  const firstTask=(item?.tasks||[]).find(t=>!t.deletedAt&&String(t.text||'').trim());
  return firstTask?.text?.trim()||'제목 없는 항목'
};

const itemBody=item=>{
  const raw=String(item?.content||'').replace(/\r/g,'');
  const lines=raw.split('\n');
  if(lines.length<=1)return'';
  return lines.slice(1).join('\n').trim()
};

const itemPreview=(item,max=20)=>{
  const body=itemBody(item).replace(/\s+/g,' ').trim();
  if(!body)return'';
  return body.length>max?`${body.slice(0,max)}…`:body
};

const calendarTokenHtml=text=>{
  const source=String(text||'');
  const tokenRe=/([#@][가-힣A-Za-z0-9_-]+)/g;
  let out='',last=0;

  source.replace(tokenRe,(match,_token,offset)=>{
    out+=esc(source.slice(last,offset));
    if(match.startsWith('#')){
      out+=`<span class="cal-inline-tag">${esc(match)}</span>`
    }else{
      out+=`<span class="cal-inline-project">${esc(match)}</span>`
    }
    last=offset+match.length;
    return match
  });

  out+=esc(source.slice(last));
  return out
};



const durationSlots=duration=>Math.max(1,Math.ceil(Math.max(SLOT,Number(duration)||SLOT)/SLOT));
const bodyLinesForDuration=duration=>Math.max(0,Math.min(7,durationSlots(duration)-1));
const isWorkMinute=minute=>
  Number(minute)>=Number(state.settings.workStartMinute)&&
  Number(minute)<Number(state.settings.workEndMinute);
const workToneClass=()=>`cal-work-${state.settings.workColor||'gray'}`;


const entriesForDate=date=>state.entries
  .filter(e=>e.date===date&&e.status!=='deleted')
  .sort((a,b)=>{
    const am=a.startMinute==null?-1:Number(a.startMinute);
    const bm=b.startMinute==null?-1:Number(b.startMinute);
    return am-bm||Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0)
  });

const visibleEntriesForDate=date=>{
  const items=itemMap();
  return entriesForDate(date).filter(e=>items.has(e.itemId)&&e.status!=='obsolete')
};

const getEntry=id=>state.entries.find(e=>e.id===id&&e.status!=='deleted');

const ensureDayMeta=date=>{
  if(!state.dayMeta[date])state.dayMeta[date]=normalizeDayMeta(date,{});
  return state.dayMeta[date]
};

const dayToneClass=(date,meta=ensureDayMeta(date))=>{
  if(meta.color&&meta.color!=='default')return `cal-tone-${meta.color}`;
  const day=parseDate(date).getDay();
  if(day===0)return'cal-tone-red';
  if(day===6)return'cal-tone-blue';
  return'cal-tone-default'
};

const daySummary=(date,items=itemMap())=>{
  const entries=visibleEntriesForDate(date).filter(e=>e.status!=='obsolete');
  const big3=entries.filter(e=>e.isBig3).slice(0,3);
  const scheduledOther=entries.filter(e=>e.startMinute!=null&&!e.isBig3);
  return{
    entries,
    big3,
    otherCount:scheduledOther.length,
    meta:ensureDayMeta(date),
    big3Titles:big3.map(e=>itemTitle(items.get(e.itemId)))
  }
};

const effectiveEnd=(entry,start=entry.startMinute)=>{
  if(start==null)return null;
  return Math.min(DAY_MINUTES,start+Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT))
};

const overlaps=(start,end,other)=>{
  if(other.startMinute==null)return false;
  const os=Number(other.startMinute);
  const oe=effectiveEnd(other,os);
  return start<oe&&end>os
};

const hasCollision=(entry,candidateStart,candidateDuration=entry.plannedDurationMinutes)=>{
  const end=Math.min(DAY_MINUTES,candidateStart+Math.max(SLOT,Number(candidateDuration)||SLOT));
  return visibleEntriesForDate(entry.date)
    .filter(other=>other.id!==entry.id&&other.startMinute!=null&&other.status!=='obsolete')
    .some(other=>overlaps(candidateStart,end,other))
};

const findMoveSlot=(entry,direction)=>{
  const dir=direction==='up'?-1:1;
  let candidate=Number(entry.startMinute)+dir*SLOT;

  while(candidate>=0&&candidate<DAY_MINUTES){
    if(!hasCollision(entry,candidate))return candidate;
    candidate+=dir*SLOT
  }
  return null
};

const firstOpenSlot=(date,duration=SLOT)=>{
  const settings=state.settings;
  const entry={id:'__probe__',date,plannedDurationMinutes:duration,startMinute:null};
  const starts=[];
  for(let m=settings.collapseBeforeMinute;m<DAY_MINUTES;m+=SLOT)starts.push(m);
  for(let m=0;m<settings.collapseBeforeMinute;m+=SLOT)starts.push(m);

  for(const candidate of starts){
    const end=Math.min(DAY_MINUTES,candidate+duration);
    if(end<=candidate)continue;
    if(!hasCollision(entry,candidate,duration))return candidate
  }
  return null
};


const calendarRangeFits=(entry,date,startMinute,duration,ignoreEntryId=entry.id)=>{
  startMinute=Number(startMinute);
  duration=Math.max(SLOT,Number(duration)||SLOT);
  if(!Number.isFinite(startMinute)||startMinute<0||startMinute>=DAY_MINUTES)return false;

  const end=Math.min(DAY_MINUTES,startMinute+duration);
  return !visibleEntriesForDate(date)
    .filter(other=>
      other.id!==ignoreEntryId &&
      other.startMinute!=null &&
      other.status!=='obsolete' &&
      other.entryType!=='routine' &&
      other.entryType!=='routine_override'
    )
    .some(other=>overlaps(startMinute,end,other))
};

const calendarEntryFits=(entry,date,startMinute,ignoreEntryId=entry.id)=>
  calendarRangeFits(
    entry,
    date,
    startMinute,
    Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT),
    ignoreEntryId
  );

const moveEntryTo=(entry,date,startMinute)=>{
  startMinute=Math.max(0,Math.min(DAY_MINUTES-SLOT,Math.round(Number(startMinute)/SLOT)*SLOT));

  if(!calendarEntryFits(entry,date,startMinute,entry.id)){
    toast('다른 일정과 겹쳐 이 위치로 옮길 수 없습니다.','warn');
    return false
  }

  const oldDate=entry.date;
  entry.date=date;
  entry.startMinute=startMinute;

  if(entry.isBig3&&oldDate!==date){
    const targetCount=visibleEntriesForDate(date)
      .filter(e=>e.id!==entry.id&&e.isBig3).length;
    if(targetCount>=3){
      entry.isBig3=false;
      toast('대상 날짜의 Big3가 이미 3개라 Big3는 해제하고 이동했습니다.','warn')
    }
  }

  entry.updatedAt=nowIso();
  persistEntry(entry);
  render();
  return true
};

const deferEntryToAdjacentMonday=(entry,direction)=>{
  const monday=direction==='previous'
    ?previousMondayFromWeek(entry.date)
    :nextMondayFromWeek(entry.date);

  entry.date=monday;
  entry.startMinute=null;
  entry.isBig3=false;
  entry.status='planned';
  entry.obsoleteReason=null;
  entry.updatedAt=nowIso();
  persistEntry(entry);
  selectedDate=monday;
  toast(direction==='previous'
    ?'이전 주 월요일 브레인 덤프로 넘겼습니다.'
    :'다음 주 월요일 브레인 덤프로 넘겼습니다.');
  render()
};


let dailyDragState=null;
let dailyRoutineDragState=null;
let dailyResizeState=null;
let lastCalendarDragAt=0;

const clearDailyDrag=()=>{
  if(dailyDragState||dailyRoutineDragState)lastCalendarDragAt=Date.now();
  dailyDragState=null;
  dailyRoutineDragState=null;
  document.body.classList.remove('cal-day-dragging');
  $$('.cal-drag-source').forEach(el=>el.classList.remove('cal-drag-source'));
  $$('.cal-day-drop-hover').forEach(el=>el.classList.remove('cal-day-drop-hover'))
};

const finishDailyResize=valid=>{
  const stateValue=dailyResizeState;
  if(!stateValue)return;

  dailyResizeState=null;
  document.body.classList.remove('cal-day-resizing');

  const entry=getEntry(stateValue.entryId);
  if(!entry){
    render();
    return
  }

  if(!valid||!stateValue.valid){
    toast('다른 일정과 겹쳐 시간 범위를 변경하지 않았습니다.','warn');
    render();
    return
  }

  entry.startMinute=stateValue.previewStart;
  entry.plannedDurationMinutes=stateValue.previewDuration;
  entry.updatedAt=nowIso();
  persistEntry(entry);
  render()
};

const onDailyResizeMove=e=>{
  const rs=dailyResizeState;
  if(!rs)return;

  const deltaSlots=Math.round((e.clientY-rs.originY)/rs.slotHeight);
  const delta=deltaSlots*SLOT;

  let nextStart=rs.originalStart;
  let nextDuration=rs.originalDuration;

  if(rs.edge==='top'){
    const originalEnd=rs.originalStart+rs.originalDuration;
    nextStart=Math.max(
      rs.gridFrom,
      Math.min(rs.originalStart+delta, Math.min(rs.gridTo-SLOT,originalEnd-SLOT))
    );
    nextDuration=Math.max(SLOT,originalEnd-nextStart)
  }else{
    const maxDuration=Math.max(SLOT,rs.gridTo-rs.originalStart);
    nextDuration=Math.max(
      SLOT,
      Math.min(rs.originalDuration+delta,maxDuration)
    )
  }

  nextStart=Math.round(nextStart/SLOT)*SLOT;
  nextDuration=Math.max(SLOT,Math.round(nextDuration/SLOT)*SLOT);

  const entry=getEntry(rs.entryId);
  if(!entry)return;

  const valid=calendarRangeFits(
    entry,
    entry.date,
    nextStart,
    nextDuration,
    entry.id
  );

  rs.previewStart=nextStart;
  rs.previewDuration=nextDuration;
  rs.valid=valid;

  const previewEnd=Math.min(DAY_MINUTES,nextStart+nextDuration);
  rs.block.style.setProperty('--cal-start',String(nextStart));
  rs.block.style.setProperty('--cal-end',String(previewEnd));
  rs.block.classList.toggle('resize-invalid',!valid)
};

const onDailyResizeUp=()=>{
  if(!dailyResizeState)return;
  const valid=dailyResizeState.valid;
  finishDailyResize(valid)
};

const startDailyResize=(entry,block,edge,event)=>{
  if(!entry||entry.status==='completed')return;
  const grid=block.closest('.cal-time-grid');
  const slot=grid?.querySelector('.cal-slot');
  if(!grid||!slot)return;

  event.preventDefault();
  event.stopPropagation();

  const originalStart=Number(entry.startMinute);
  const originalDuration=Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT);

  dailyResizeState={
    entryId:entry.id,
    block,
    edge,
    originY:event.clientY,
    slotHeight:slot.getBoundingClientRect().height||34,
    gridFrom:Number(grid.dataset.gridFrom)||0,
    gridTo:Number(grid.dataset.gridTo)||DAY_MINUTES,
    originalStart,
    originalDuration,
    previewStart:originalStart,
    previewDuration:originalDuration,
    valid:true
  };

  document.body.classList.add('cal-day-resizing')
};

window.addEventListener('pointermove',onDailyResizeMove);
window.addEventListener('pointerup',onDailyResizeUp);
window.addEventListener('pointercancel',()=>finishDailyResize(false));

let weeklyDragState=null;

const clearWeeklyDrag=()=>{
  if(weeklyDragState)lastCalendarDragAt=Date.now();
  weeklyDragState=null;
  document.body.classList.remove('cal-week-dragging');
  $$('.cal-week-drag-source').forEach(el=>el.classList.remove('cal-week-drag-source'));
  $$('.cal-week-drop-hover').forEach(el=>el.classList.remove('cal-week-drop-hover'));
  $('#calPreviousWeekDropZone')?.classList.remove('show','active');
  $('#calNextWeekDropZone')?.classList.remove('show','active')
};

const toast=(message,type='info')=>{
  let el=$('#calToast');
  if(!el){
    el=document.createElement('div');
    el.id='calToast';
    el.className='cal-toast';
    document.body.appendChild(el)
  }
  el.textContent=message;
  el.className=`cal-toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer=setTimeout(()=>el.classList.remove('show'),2400)
};

const markUpdated=entry=>{
  entry.updatedAt=nowIso();
  persistEntry(entry);
};

const big3Count=date=>visibleEntriesForDate(date).filter(e=>e.isBig3).length;

const toggleBig3=entry=>{
  if(entry.isBig3){
    entry.isBig3=false;
    markUpdated(entry);
    render();
    return
  }
  if(big3Count(entry.date)>=3){
    toast('Big3는 하루 최대 3개까지 지정할 수 있습니다.','warn');
    return
  }
  entry.isBig3=true;
  markUpdated(entry);
  render()
};

const moveEntry=(entry,direction)=>{
  if(entry.startMinute==null)return;
  const target=findMoveSlot(entry,direction);
  if(target==null){
    toast(direction==='up'
      ?'위쪽에 이 일정이 들어갈 빈 시간이 없습니다.'
      :'아래쪽에 이 일정이 들어갈 빈 시간이 없습니다.','warn');
    return
  }
  entry.startMinute=target;
  markUpdated(entry);
  render()
};

const growEntry=entry=>{
  const next=Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT)+SLOT;

  if(entry.startMinute!=null){
    const currentEnd=effectiveEnd(entry);
    const nextEnd=Math.min(DAY_MINUTES,Number(entry.startMinute)+next);

    // 자정을 넘는 예상시간 증가는 허용한다.
    // 실제 오늘 점유 영역이 늘어나는 경우에만 충돌을 검사한다.
    if(nextEnd>currentEnd&&hasCollision(entry,Number(entry.startMinute),next)){
      toast('다음 일정과 겹쳐 시간을 늘릴 수 없습니다. 다음 일정을 조정한 후 다시 시도해주세요.','warn');
      return
    }
  }

  entry.plannedDurationMinutes=next;
  markUpdated(entry);
  render()
};

const shrinkEntry=entry=>{
  const duration=Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT);
  if(duration>SLOT){
    entry.plannedDurationMinutes=duration-SLOT;
  }else{
    entry.startMinute=null;
  }
  markUpdated(entry);
  render()
};

const checkIn=entry=>{
  if(entry.startMinute!=null)return;
  const slot=firstOpenSlot(entry.date,Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT));
  if(slot==null){
    toast('오늘 일정에 들어갈 수 있는 빈 시간이 없습니다.','warn');
    return
  }
  entry.startMinute=slot;
  markUpdated(entry);
  render()
};

const removeEntryAndTrashItem=entry=>{
  if(!confirm('이 항목을 삭제하여 휴지통으로 이동하시겠습니까?'))return;
  try{
    core.updateItem(entry.itemId,{status:'deleted'});
    state.entries.forEach(e=>{
      if(e.itemId===entry.itemId&&e.status!=='deleted'){
        e.status='deleted';
        e.updatedAt=nowIso();
        try{core?.upsertCalendarEntry?.(e)}catch{}
      }
    });
    save();
    scheduleRemoteSync();
    render();
    toast('휴지통으로 이동했습니다.')
  }catch(err){
    console.error(err);
    toast(err?.message||'삭제하지 못했습니다.','warn')
  }
};

const openItemInWorkspace=itemId=>{
  core?.setMode?.('memo');
  setTimeout(()=>{
    const card=document.querySelector(`.card[data-id="${CSS.escape(itemId)}"]`);
    if(card){
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('calendar-jump-highlight');
      setTimeout(()=>card.classList.remove('calendar-jump-highlight'),1600)
    }
  },80)
};

const createEntryForItem=(itemId,date=selectedDate)=>{
  let existing=state.entries.find(e=>
    e.itemId===itemId&&e.date===date&&e.status!=='deleted'
  );
  if(existing)return existing;

  const stamp=nowIso();
  const entry={
    id:uuid(),
    itemId,
    date,
    startMinute:null,
    plannedDurationMinutes:SLOT,
    isBig3:false,
    entryType:'normal',
    routineId:null,
    status:'planned',
    obsoleteReason:null,
    createdAt:stamp,
    updatedAt:stamp
  };
  state.entries.push(entry);
  persistEntry(entry);
  return entry
};


const closeCompletionModal=()=>{
  completionEditingEntryId=null;
  completionRoutineContext=null;
  $('#calCompletionModal')?.classList.add('hidden')
};

const openCompletionModal=entry=>{
  const item=core?.getItem?.(entry.itemId);
  if(!item)return;

  completionRoutineContext=null;
  completionEditingEntryId=entry.id;
  $('#calCompletionTitle').textContent=itemTitle(item);

  const history=(core?.getCompletionHistory?.(entry.itemId)||[])
    .filter(r=>r?.revokedAt)
    .sort((a,b)=>Date.parse(b.completedAt||0)-Date.parse(a.completedAt||0));

  const previous=
    history.find(r=>r.calendarEntryId===entry.id)||
    history[0]||
    null;

  $$('input[name="calPlanResult"]').forEach(input=>{
    input.checked=!!previous&&input.value===previous.planResult
  });
  $('#calGapCause').value=previous?.gapCause||'';
  $('#calImprovement').value=previous?.improvement||'';
  $('#calCompletionModal')?.classList.remove('hidden')
};


const openRoutineCompletionModal=(routineId,date)=>{
  const routine=core?.getRoutineById?.(routineId);
  if(!routine)return;

  completionEditingEntryId=null;
  completionRoutineContext={routineId,date};
  $('#calCompletionTitle').textContent=routine.title||'Routine';

  const previous=core?.getRoutineLog?.(routineId,date)||null;
  $$('input[name="calPlanResult"]').forEach(input=>{
    input.checked=!!previous&&input.value===previous.planResult
  });
  $('#calGapCause').value=previous?.gapCause||'';
  $('#calImprovement').value=previous?.improvement||'';
  $('#calCompletionModal')?.classList.remove('hidden')
};

const undoRoutineCompletion=(routineId,date)=>{
  if(!confirm('Routine 완료를 취소하고 다시 진행 중 상태로 되돌리시겠습니까?'))return;
  try{
    core?.undoRoutine?.(routineId,date);
    render();
    scheduleRemoteSync();
    toast('Routine 완료를 취소했습니다.')
  }catch(e){
    console.error(e);
    toast(e?.message||'Routine 완료를 취소하지 못했습니다.','warn')
  }
};

const submitCompletion=()=>{
  const selected=$('input[name="calPlanResult"]:checked');
  if(!selected){
    toast('계획 대비 결과를 선택해주세요.','warn');
    return
  }

  try{
    if(completionRoutineContext){
      core?.completeRoutine?.(
        completionRoutineContext.routineId,
        completionRoutineContext.date,
        {
          planResult:selected.value,
          gapCause:$('#calGapCause')?.value||'',
          improvement:$('#calImprovement')?.value||''
        }
      );

      closeCompletionModal();
      render();
      scheduleRemoteSync();
      toast('수고하셨습니다. Routine 완료로 기록했습니다.');
      return
    }

    const entry=getEntry(completionEditingEntryId);
    if(!entry){
      closeCompletionModal();
      return
    }

    core.completeItem(entry.itemId,{
      calendarEntryId:entry.id,
      planResult:selected.value,
      gapCause:$('#calGapCause')?.value||'',
      improvement:$('#calImprovement')?.value||''
    });

    refreshEntriesFromCore();
    closeCompletionModal();
    render();
    scheduleRemoteSync();
    toast('수고하셨습니다. 완료로 기록했습니다.')
  }catch(e){
    console.error(e);
    toast(e?.message||'완료 처리하지 못했습니다.','warn')
  }
};

const undoCompletion=entry=>{
  if(!confirm('완료를 취소하고 다시 진행 중 상태로 되돌리시겠습니까?'))return;

  try{
    core.undoCompleteItem(entry.itemId);
    refreshEntriesFromCore();
    render();
    scheduleRemoteSync();
    toast('완료를 취소했습니다.')
  }catch(e){
    console.error(e);
    toast(e?.message||'완료를 취소하지 못했습니다.','warn')
  }
};



let calendarItemEditingId=null;

const calendarItemTasks=item=>
  (item?.tasks||[]).filter(task=>task&&!task.deletedAt);

const closeCalendarItemModal=()=>{
  calendarItemEditingId=null;
  $('#calItemModal')?.classList.add('hidden')
};

const renderCalendarItemChecklist=()=>{
  const list=$('#calItemChecklist');
  const item=core?.getItem?.(calendarItemEditingId);
  if(!list||!item)return;

  const tasks=calendarItemTasks(item);
  list.innerHTML=tasks.length
    ?tasks.map(task=>`<div class="cal-item-check-row" data-task-id="${task.id}">
        <input type="checkbox" data-item-check ${task.done?'checked':''}>
        <input type="text" data-item-check-text value="${esc(task.text||'')}" maxlength="300">
        <button type="button" data-item-check-delete title="체크리스트 삭제">×</button>
      </div>`).join('')
    :'<div class="cal-item-check-empty">체크리스트가 없습니다.</div>';

  $$('[data-task-id]',list).forEach(row=>{
    const taskId=row.dataset.taskId;

    $('[data-item-check]',row)?.addEventListener('change',e=>{
      core?.updateChecklistItem?.(calendarItemEditingId,taskId,{done:e.target.checked});
      scheduleRemoteSync()
    });

    $('[data-item-check-text]',row)?.addEventListener('change',e=>{
      const text=String(e.target.value||'').trim();
      if(!text){
        const fresh=core?.getItem?.(calendarItemEditingId);
        const task=(fresh?.tasks||[]).find(t=>t.id===taskId);
        e.target.value=task?.text||'';
        return
      }
      core?.updateChecklistItem?.(calendarItemEditingId,taskId,{text});
      scheduleRemoteSync()
    });

    $('[data-item-check-delete]',row)?.addEventListener('click',()=>{
      core?.removeChecklistItem?.(calendarItemEditingId,taskId);
      renderCalendarItemChecklist();
      scheduleRemoteSync()
    })
  })
};

const openCalendarItemModal=itemId=>{
  const item=core?.getItem?.(itemId);
  if(!item)return;

  calendarItemEditingId=itemId;
  $('#calItemContent').value=String(item.content||'');
  $('#calItemCreatedAt').textContent=item.createdAt
    ?`생성 ${String(item.createdAt).replace('T',' ').slice(0,16)}`
    :'';
  renderCalendarItemChecklist();
  $('#calItemModal')?.classList.remove('hidden')
};

const saveCalendarItemContent=()=>{
  if(!calendarItemEditingId)return;
  const input=$('#calItemContent');
  if(!input)return;

  const content=String(input.value||'');
  const item=core?.getItem?.(calendarItemEditingId);
  if(!item||String(item.content||'')===content)return;

  core?.updateItem?.(calendarItemEditingId,{content});
  scheduleRemoteSync()
};

const addCalendarItemChecklist=()=>{
  if(!calendarItemEditingId)return;
  const input=$('#calItemChecklistNew');
  const text=String(input?.value||'').trim();
  if(!text)return;

  core?.addChecklistItem?.(calendarItemEditingId,text);
  if(input)input.value='';
  renderCalendarItemChecklist();
  scheduleRemoteSync()
};

const openCreateModal=()=>{
  $('#calCreateModal')?.classList.remove('hidden');
  const input=$('#calCreateTitle');
  if(input){
    input.value='';
    setTimeout(()=>input.focus(),20)
  }
};

const closeCreateModal=()=>{
  $('#calCreateModal')?.classList.add('hidden')
};

const submitCreate=()=>{
  const input=$('#calCreateTitle');
  const title=String(input?.value||'').trim();
  if(!title){
    toast('할 일 제목을 입력해주세요.','warn');
    input?.focus();
    return
  }
  try{
    const item=core.createItem({content:title});
    createEntryForItem(item.id,selectedDate);
    closeCreateModal();
    render();
    toast('브레인 덤프에 추가했습니다.')
  }catch(err){
    console.error(err);
    toast(err?.message||'추가하지 못했습니다.','warn')
  }
};

const timeOptions=(selected,min,max)=>{
  const rows=[];
  for(let m=min;m<=max;m+=SLOT){
    rows.push(`<option value="${m}" ${m===selected?'selected':''}>${minuteLabel(m)}</option>`)
  }
  return rows.join('')
};

let pendingWorkColor='gray';

const renderWorkColorPalette=()=>{
  const root=$('#calWorkColorPalette');
  if(!root)return;
  root.innerHTML=WORK_COLORS.map(color=>`
    <button type="button"
      class="cal-work-color cal-work-${color} ${pendingWorkColor===color?'active':''}"
      data-work-color="${color}"
      title="${WORK_COLOR_LABELS[color]||color}">
      <i></i><span>${WORK_COLOR_LABELS[color]||color}</span>
    </button>`).join('');

  $$('[data-work-color]',root).forEach(button=>button.onclick=()=>{
    pendingWorkColor=button.dataset.workColor;
    renderWorkColorPalette()
  })
};

const openSettings=()=>{
  const modal=$('#calSettingsModal');
  if(!modal)return;
  $('#calCollapseBefore').innerHTML=timeOptions(
    state.settings.collapseBeforeMinute,0,720
  );
  $('#calCollapseAfter').innerHTML=timeOptions(
    state.settings.collapseAfterMinute,720,1440
  );
  $('#calWorkStart').innerHTML=timeOptions(
    state.settings.workStartMinute,0,1410
  );
  $('#calWorkEnd').innerHTML=timeOptions(
    state.settings.workEndMinute,30,1440
  );
  pendingWorkColor=state.settings.workColor||'gray';
  renderWorkColorPalette();
  modal.classList.remove('hidden')
};

const closeSettings=()=>$('#calSettingsModal')?.classList.add('hidden');

const saveSettings=()=>{
  const before=Number($('#calCollapseBefore')?.value);
  const after=Number($('#calCollapseAfter')?.value);
  const workStart=Number($('#calWorkStart')?.value);
  const workEnd=Number($('#calWorkEnd')?.value);

  if(!Number.isFinite(before)||!Number.isFinite(after)||before>=after){
    toast('접는 시간 범위를 확인해주세요.','warn');
    return
  }
  if(!Number.isFinite(workStart)||!Number.isFinite(workEnd)||workStart>=workEnd){
    toast('업무시간 범위를 확인해주세요.','warn');
    return
  }

  state.settings.collapseBeforeMinute=before;
  state.settings.collapseAfterMinute=after;
  state.settings.workStartMinute=workStart;
  state.settings.workEndMinute=workEnd;
  state.settings.workColor=WORK_COLORS.includes(pendingWorkColor)?pendingWorkColor:'gray';

  expandedEarly=false;
  expandedLate=false;
  save();
  closeSettings();
  render()
};

const blockHtml=(entry,item,displayStart=null,displayEnd=null)=>{
  const duration=Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT);
  const start=Number(entry.startMinute);
  const end=effectiveEnd(entry,start);
  const drawStart=displayStart==null?start:Number(displayStart);
  const drawEnd=displayEnd==null?end:Number(displayEnd);
  const preview=duration>=60?itemPreview(item,20):'';
  const completed=!!item.completedAt||entry.status==='completed';
  const editable=!completed&&entry.entryType==='normal';

  return `<article
    class="cal-time-block ${completed?'completed':''} ${entry.isBig3?'big3':''} ${editable?'editable':''}"
    data-entry-id="${entry.id}"
    data-cal-item-open="${entry.itemId}"
    ${editable?`data-daily-entry="${entry.id}" draggable="true"`:''}
    style="--cal-start:${drawStart};--cal-end:${drawEnd}">
    ${editable?'<span class="cal-resize-handle cal-resize-top" data-cal-resize="top" title="시작시간 조절"></span>':''}
    <div class="cal-time-block-main">
      <strong>${calendarTokenHtml(itemTitle(item))}</strong>
      ${preview?`<p class="cal-time-block-preview">${calendarTokenHtml(preview)}</p>`:''}
    </div>
    ${entry.isBig3?'<span class="cal-block-big3-badge">BIG3</span>':''}
    <div class="cal-time-actions">
      <button type="button" class="cal-move-step" data-cal-act="up" title="30분 위로">↑</button>
      <button type="button" class="cal-move-step" data-cal-act="down" title="30분 아래로">↓</button>
      <button type="button" data-cal-act="shrink" title="30분 줄이기">−</button>
      <button type="button" data-cal-act="grow" title="30분 늘리기">＋</button>
      <button type="button" class="${entry.isBig3?'active':''}" data-cal-act="big3">Big3</button>
      ${completed
        ?'<button type="button" class="cal-undo-btn" data-cal-act="undo">완료 취소</button>'
        :'<button type="button" class="cal-check-btn" data-cal-act="check">Check!</button>'}
    </div>
    ${editable?'<span class="cal-resize-handle cal-resize-bottom" data-cal-resize="bottom" title="종료시간 조절"></span>':''}
  </article>`
};

const currentMinuteOfDay=()=>{
  const d=new Date();
  return d.getHours()*60+d.getMinutes()
};

const currentTimeLineHtml=(from,to)=>{
  if(selectedDate!==localDateKey())return'';
  const minute=currentMinuteOfDay();
  const visible=minute>=from&&minute<to;
  return `<div class="cal-current-time-line ${visible?'':'hidden'}"
    data-current-time-line
    style="--cal-now:${minute}">
    <i></i>
  </div>`
};

const updateCurrentTimeIndicator=()=>{
  const minute=currentMinuteOfDay();
  $$('[data-current-time-line]').forEach(line=>{
    const grid=line.closest('.cal-time-grid');
    if(!grid)return;
    const from=Number(grid.dataset.gridFrom)||0;
    const to=Number(grid.dataset.gridTo)||DAY_MINUTES;
    line.style.setProperty('--cal-now',String(minute));
    line.classList.toggle(
      'hidden',
      selectedDate!==localDateKey()||viewMode!=='day'||minute<from||minute>=to
    )
  })
};

const renderTimeGrid=(from,to,entries,items)=>{
  const rows=[];
  for(let m=from;m<to;m+=SLOT){
    rows.push(`<div class="cal-slot ${m%60===0?'hour':''} ${isWorkMinute(m)?'work-hour':''}" data-minute="${m}">
      <span>${m%60===0?minuteLabel(m):''}</span><i></i>
    </div>`)
  }

  const blocks=entries.filter(e=>{
    if(e.startMinute==null)return false;
    const s=Number(e.startMinute),en=effectiveEnd(e,s);
    return s<to&&en>from
  }).map(e=>{
    const item=items.get(e.itemId);
    if(!item)return '';
    const s=Number(e.startMinute),en=effectiveEnd(e,s);
    const displayStart=Math.max(s,from);
    const displayEnd=Math.min(en,to);
    return (e.entryType==='routine'||e.entryType==='routine_override')
      ?routineBlockHtml(e,item,displayStart,displayEnd)
      :blockHtml(e,item,displayStart,displayEnd)
  }).join('');

  return `<div class="cal-time-grid ${workToneClass()}"
    data-grid-from="${from}" data-grid-to="${to}"
    style="--segment-from:${from};--segment-to:${to}">
    <div class="cal-slot-list">${rows.join('')}</div>
    <div class="cal-block-layer">${blocks}</div>
    ${currentTimeLineHtml(from,to)}
  </div>`
};

const collapsedCount=(from,to,entries)=>{
  return entries.filter(e=>{
    if(e.startMinute==null)return false;
    const s=Number(e.startMinute),en=effectiveEnd(e,s);
    return s<to&&en>from
  }).length
};


const routineSuppressionState=(date,routineId)=>{
  const meta=ensureDayMeta(date);
  const rows=Array.isArray(meta.routineSuppressions)?meta.routineSuppressions:[];
  const row=rows
    .filter(x=>x?.routineId===routineId)
    .sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0))[0];
  return row?.suppressed===true
};

const activeRoutineOverride=(date,routineId)=>{
  const meta=ensureDayMeta(date);
  return (meta.routineOverrides||[])
    .filter(x=>x?.routineId===routineId&&!x.deletedAt)
    .sort((a,b)=>(Date.parse(b.updatedAt||0)||0)-(Date.parse(a.updatedAt||0)||0))[0]||null
};

const templateRoutineScheduled=(routineId,date)=>
  (core?.getRoutinesForDate?.(date)||[]).some(r=>r.id===routineId);

const routineOccurrenceExists=(routineId,date)=>{
  if(activeRoutineOverride(date,routineId))return true;
  if(routineSuppressionState(date,routineId))return false;
  return templateRoutineScheduled(routineId,date)
};

const routineSoftEntriesForDate=(date,hardEntries)=>{
  const template=core?.getRoutinesForDate?.(date)||[];
  const meta=ensureDayMeta(date);
  const activeOverrides=(meta.routineOverrides||[]).filter(x=>x?.routineId&&!x.deletedAt);
  const map=new Map(template.map(r=>[r.id,r]));

  activeOverrides.forEach(override=>{
    if(map.has(override.routineId))return;
    const routine=core?.getRoutineById?.(override.routineId);
    if(routine)map.set(routine.id,routine)
  });

  const routines=[...map.values()];
  const placed=[],unplaced=[];

  routines.forEach(routine=>{
    const override=activeRoutineOverride(date,routine.id);
    const suppressed=routineSuppressionState(date,routine.id);

    if(suppressed&&!override)return;

    const start=override
      ?Number(override.startMinute)
      :Number(routine.defaultStartMinute);
    const duration=override
      ?Math.max(SLOT,Number(override.plannedDurationMinutes)||SLOT)
      :Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT);

    if(!Number.isFinite(start)){
      unplaced.push({...routine,unplacedReason:'시간 미설정'});
      return
    }

    const virtual={
      id:`routine:${routine.id}:${date}`,
      itemId:`routine-item:${routine.id}`,
      date,
      startMinute:start,
      plannedDurationMinutes:duration,
      isBig3:false,
      entryType:override?'routine_override':'routine',
      routineId:routine.id,
      status:'planned',
      routineCompleted:!!core?.getRoutineLog?.(routine.id,date)?.done
    };

    const end=Math.min(DAY_MINUTES,start+duration);
    const collision=hardEntries
      .filter(e=>
        e.startMinute!=null &&
        e.status!=='obsolete' &&
        e.entryType!=='routine' &&
        e.entryType!=='routine_override'
      )
      .some(e=>overlaps(start,end,e));

    if(collision)unplaced.push({...routine,unplacedReason:'일반 일정과 겹침'});
    else placed.push(virtual)
  });

  return{placed,unplaced,routines}
};

const upsertRoutineOverride=(routineId,date,startMinute,duration)=>{
  const meta=ensureDayMeta(date);
  meta.routineOverrides=Array.isArray(meta.routineOverrides)?meta.routineOverrides:[];
  const stamp=nowIso();
  const next={
    routineId,
    startMinute:Math.max(0,Math.min(DAY_MINUTES-SLOT,Math.round(Number(startMinute)/SLOT)*SLOT)),
    plannedDurationMinutes:Math.max(SLOT,Number(duration)||SLOT),
    deletedAt:null,
    updatedAt:stamp
  };
  const idx=meta.routineOverrides.findIndex(x=>x.routineId===routineId);
  if(idx>=0)meta.routineOverrides[idx]=next;
  else meta.routineOverrides.push(next);
  return next
};

const tombstoneRoutineOverride=(routineId,date)=>{
  const meta=ensureDayMeta(date);
  meta.routineOverrides=Array.isArray(meta.routineOverrides)?meta.routineOverrides:[];
  const old=activeRoutineOverride(date,routineId);
  if(!old)return;
  const next={...old,deletedAt:nowIso(),updatedAt:nowIso()};
  const idx=meta.routineOverrides.findIndex(x=>x.routineId===routineId);
  if(idx>=0)meta.routineOverrides[idx]=next;
  else meta.routineOverrides.push(next)
};

const setRoutineSuppressed=(routineId,date,suppressed)=>{
  const meta=ensureDayMeta(date);
  meta.routineSuppressions=Array.isArray(meta.routineSuppressions)?meta.routineSuppressions:[];
  const next={routineId,suppressed:!!suppressed,updatedAt:nowIso()};
  const idx=meta.routineSuppressions.findIndex(x=>x.routineId===routineId);
  if(idx>=0)meta.routineSuppressions[idx]=next;
  else meta.routineSuppressions.push(next)
};

const routineTargetFits=(routineId,date,startMinute)=>{
  const routine=core?.getRoutineById?.(routineId);
  if(!routine)return false;
  const duration=Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT);
  const end=Math.min(DAY_MINUTES,Number(startMinute)+duration);

  return !visibleEntriesForDate(date)
    .filter(other=>other.startMinute!=null)
    .some(other=>overlaps(Number(startMinute),end,other))
};

const placeRoutineOverride=(routineId,date,startMinute)=>{
  const routine=core?.getRoutineById?.(routineId);
  if(!routine){
    toast('Routine을 찾을 수 없습니다.','warn');
    return false
  }

  if(!routineTargetFits(routineId,date,startMinute)){
    toast('일반 일정과 겹쳐 이 시간에는 Routine을 배치할 수 없습니다.','warn');
    return false
  }

  upsertRoutineOverride(
    routineId,
    date,
    startMinute,
    Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT)
  );
  setRoutineSuppressed(routineId,date,false);
  persistDailyMeta(date);
  render();
  return true
};

const moveRoutineOccurrence=(routineId,sourceDate,targetDate,startMinute)=>{
  const routine=core?.getRoutineById?.(routineId);
  if(!routine){
    toast('Routine을 찾을 수 없습니다.','warn');
    return false
  }

  if(sourceDate!==targetDate&&routineOccurrenceExists(routineId,targetDate)){
    toast('대상 날짜에는 이미 같은 Routine이 있습니다. 같은 Routine은 하루에 한 번만 배치합니다.','warn');
    return false
  }

  if(!routineTargetFits(routineId,targetDate,startMinute)){
    toast('일반 일정과 겹쳐 이 위치로 Routine을 옮길 수 없습니다.','warn');
    return false
  }

  const duration=Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT);

  if(sourceDate!==targetDate){
    if(activeRoutineOverride(sourceDate,routineId))tombstoneRoutineOverride(routineId,sourceDate);
    if(templateRoutineScheduled(routineId,sourceDate))setRoutineSuppressed(routineId,sourceDate,true);

    setRoutineSuppressed(routineId,targetDate,false);
    upsertRoutineOverride(routineId,targetDate,startMinute,duration);

    persistDailyMeta(sourceDate,{sync:false});
    persistDailyMeta(targetDate,{sync:false});
    scheduleRemoteSync()
  }else{
    setRoutineSuppressed(routineId,targetDate,false);
    upsertRoutineOverride(routineId,targetDate,startMinute,duration);
    persistDailyMeta(targetDate)
  }

  render();
  return true
};

const migrateLegacyRoutineOverrides=()=>{
  const legacy=(state.entries||[]).filter(e=>e?.entryType==='routine_override'&&e.routineId);
  if(!legacy.length)return 0;

  legacy.forEach(entry=>{
    const meta=ensureDayMeta(entry.date);
    meta.routineOverrides=Array.isArray(meta.routineOverrides)?meta.routineOverrides:[];
    const value={
      routineId:entry.routineId,
      startMinute:entry.startMinute,
      plannedDurationMinutes:Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT),
      deletedAt:null,
      updatedAt:entry.updatedAt||entry.createdAt||nowIso()
    };
    const idx=meta.routineOverrides.findIndex(x=>x.routineId===entry.routineId);
    if(idx<0)meta.routineOverrides.push(value);
    else{
      const old=meta.routineOverrides[idx];
      if((Date.parse(value.updatedAt)||0)>=(Date.parse(old.updatedAt)||0)){
        meta.routineOverrides[idx]=value
      }
    }
  });

  state.entries=state.entries.filter(e=>e?.entryType!=='routine_override');
  save();
  return legacy.length
};

const routineFakeItemMap=(items,routines)=>{
  routines.forEach(r=>{
    items.set(`routine-item:${r.id}`,{
      id:`routine-item:${r.id}`,
      content:[r.title||'Routine',r.goal||''].filter(Boolean).join('\n'),
      tasks:[],
      routineSoft:true
    })
  });
  return items
};

const routineBlockHtml=(entry,item,displayStart=null,displayEnd=null)=>{
  const duration=Math.max(SLOT,Number(entry.plannedDurationMinutes)||SLOT);
  const start=Number(entry.startMinute);
  const end=Math.min(DAY_MINUTES,start+duration);
  const drawStart=displayStart==null?start:Number(displayStart);
  const drawEnd=displayEnd==null?end:Number(displayEnd);
  const completed=!!core?.getRoutineLog?.(entry.routineId,entry.date)?.done;
  const preview=duration>=60?itemPreview(item,20):'';

  return `<article
    class="cal-time-block cal-routine-soft-block ${completed?'completed':''} ${completed?'':'editable'}"
    data-routine-block="${entry.routineId}"
    data-routine-date="${entry.date}"
    ${completed?'':`data-daily-routine="${entry.routineId}" draggable="true"`}
    style="--cal-start:${drawStart};--cal-end:${drawEnd}">
    <div class="cal-time-block-main">
      <strong>${calendarTokenHtml(itemTitle(item))}</strong>
      ${preview?`<p class="cal-time-block-preview">${calendarTokenHtml(preview)}</p>`:''}
    </div>
    <span class="cal-routine-badge">ROUTINE</span>
    <div class="cal-time-actions cal-routine-actions">
      ${completed
        ?'<button type="button" data-routine-act="undo">완료 취소</button>'
        :'<button type="button" class="cal-check-btn" data-routine-act="check">Check!</button>'}
      <button type="button" data-routine-act="dashboard">관리</button>
    </div>
  </article>`
};

const renderDaily=()=>{
  const items=itemMap();
  const entries=visibleEntriesForDate(selectedDate);
  const brain=entries.filter(e=>e.startMinute==null);
  const hardTimed=entries.filter(e=>e.startMinute!=null);
  const routineSoft=routineSoftEntriesForDate(selectedDate,hardTimed);
  routineFakeItemMap(items,routineSoft.routines);
  const timed=[...hardTimed,...routineSoft.placed];
  const big3=entries.filter(e=>e.isBig3).slice(0,3);
  const note=ensureDayMeta(selectedDate);
  const before=state.settings.collapseBeforeMinute;
  const after=state.settings.collapseAfterMinute;

  const big3Html=big3.length?big3.map((entry,i)=>{
    const item=items.get(entry.itemId);
    return `<button type="button" class="cal-big3-item" data-cal-item-open="${entry.itemId}">
      <b>${i+1}</b><span>${esc(itemTitle(item))}</span>
    </button>`
  }).join(''):'<div class="cal-empty-mini">오늘의 Big3를 지정하세요.</div>';

  const brainHtml=brain.length?brain.map(entry=>{
    const item=items.get(entry.itemId);
    return `<article
      class="cal-brain-item ${entry.isBig3?'big3':''}"
      data-entry-id="${entry.id}"
      data-cal-item-open="${entry.itemId}"
      data-brain-entry="${entry.id}"
      draggable="true">
      <div class="cal-brain-title">
        <strong>${esc(itemTitle(item))}</strong>
      </div>
      <div class="cal-brain-actions">
        <button type="button" class="cal-brain-icon cal-brain-checkin"
          data-cal-act="checkin" title="TimeTable에 배치" aria-label="TimeTable에 배치">➜</button>
        <button type="button" class="cal-brain-icon cal-brain-flag ${entry.isBig3?'active':''}"
          data-cal-act="big3" title="Big3" aria-label="Big3">${entry.isBig3?'⚑':'⚐'}</button>
        <button type="button" class="cal-brain-icon cal-brain-delete"
          data-cal-act="delete" title="삭제" aria-label="삭제">🗑</button>
      </div>
    </article>`
  }).join(''):'<div class="cal-empty-mini">아직 브레인 덤프가 비어 있습니다.</div>';

  const earlyCount=collapsedCount(0,before,timed);
  const lateCount=collapsedCount(after,DAY_MINUTES,timed);

  const dayPalette=DAY_COLORS.map(color=>{
    const label={
      default:'기본',red:'빨강',orange:'주황',yellow:'노랑',green:'초록',
      blue:'파랑',indigo:'남색',purple:'보라',black:'검정'
    }[color];
    return `<button type="button" class="cal-color-swatch cal-tone-${color} ${note.color===color?'active':''}"
      data-cal-day-color="${color}" title="${label}" aria-label="${label}"></button>`
  }).join('');

  return `<div class="cal-day-layout">
    <aside class="cal-day-left">
      <section class="cal-panel cal-day-label-panel">
        <div class="cal-panel-head"><strong>오늘은 무슨 날?</strong><small>날짜 메모</small></div>
        <div class="cal-day-label-body">
          <div class="cal-color-palette">${dayPalette}</div>
          <input id="calDayLabel" maxlength="80" value="${esc(note.label||'')}"
            placeholder="예: 이삿날, 연차, 추석, 출장">
        </div>
      </section>

      <section class="cal-panel cal-big3-panel">
        <div class="cal-panel-head"><strong>Big3</strong><small>${big3.length}/3</small></div>
        <div class="cal-big3-list">${big3Html}</div>
      </section>

      <section class="cal-panel cal-brain-panel">
        <div class="cal-panel-head"><strong>브레인 덤프</strong><small>${brain.length}</small></div>
        <div class="cal-brain-list">${brainHtml}</div>
      </section>

      ${routineSoft.unplaced.length?`<section class="cal-panel cal-routine-unplaced-panel">
        <div class="cal-panel-head"><strong>미배치 Routine</strong><small>${routineSoft.unplaced.length}</small></div>
        <div class="cal-routine-unplaced-list">
          ${routineSoft.unplaced.map(r=>{
            const done=!!core?.getRoutineLog?.(r.id,selectedDate)?.done;
            return `<div class="cal-routine-unplaced-item"
              data-unplaced-routine="${r.id}" ${done?'':`draggable="true"`}>
              <button type="button" data-cal-routine-place="${r.id}">
                <b>${esc(r.title||'Routine')}</b><span>${esc(r.unplacedReason||'미배치')}</span>
              </button>
              <button type="button" class="${done?'':'cal-check-btn'}"
                data-unplaced-routine-action="${done?'undo':'check'}"
                data-routine-id="${r.id}">
                ${done?'완료 취소':'Check!'}
              </button>
            </div>`
          }).join('')}
        </div>
      </section>`:''}

      <section class="cal-panel cal-daily-text-panel">
        <label><strong>오늘의 메모</strong>
          <textarea id="calDailyMemo" placeholder="오늘 기억해둘 내용을 적으세요.">${esc(note.memo||'')}</textarea>
        </label>
        <label><strong>오늘의 리뷰</strong>
          <textarea id="calDailyReview" placeholder="하루를 마치며 적어두고 싶은 내용을 남기세요.">${esc(note.review||'')}</textarea>
        </label>
      </section>
    </aside>

    <section class="cal-panel cal-timetable-panel">
      <div class="cal-panel-head cal-timetable-head">
        <div><strong>TimeTable</strong><small>30분 단위</small></div>
      </div>

      ${before>0?`<button type="button" class="cal-fold cal-fold-early" data-cal-fold="early">
        ${expandedEarly?'▴ 접기':'▾ 펼치기'} · 00:00–${minuteLabel(before)}
        ${earlyCount?`<b>${earlyCount}개 일정</b>`:''}
      </button>`:''}

      ${renderTimeGrid(expandedEarly?0:before,expandedLate?DAY_MINUTES:after,timed,items)}

      ${after<DAY_MINUTES?`<button type="button" class="cal-fold cal-fold-late" data-cal-fold="late">
        ${expandedLate?'▴ 접기':'▾ 펼치기'} · ${minuteLabel(after)}–24:00
        ${lateCount?`<b>${lateCount}개 일정</b>`:''}
      </button>`:''}

      <span class="cal-floating-shortcut" aria-hidden="true">Ctrl+Enter</span>
      <button type="button" class="cal-floating-add" data-cal-open-create aria-label="새 할 일 추가">＋</button>
    </section>
  </div>`
};

const startOfWeek=dateKey=>{
  const d=parseDate(dateKey);
  d.setDate(d.getDate()-d.getDay());
  return localDateKey(d)
};

const previousMondayFromWeek=dateKey=>{
  const sunday=startOfWeek(dateKey);
  return shiftDate(sunday,-6)
};

const nextMondayFromWeek=dateKey=>{
  const sunday=startOfWeek(dateKey);
  return shiftDate(sunday,8)
};

const renderWeek=()=>{
  const start=startOfWeek(selectedDate);
  const items=itemMap();
  const days=Array.from({length:7},(_,i)=>shiftDate(start,i));
  const from=state.settings.collapseBeforeMinute;
  const to=state.settings.collapseAfterMinute;
  const slotCount=Math.max(1,Math.ceil((to-from)/SLOT));

  const routineByDate=new Map();
  days.forEach(date=>{
    const hard=visibleEntriesForDate(date).filter(e=>e.startMinute!=null);
    const soft=routineSoftEntriesForDate(date,hard);
    routineFakeItemMap(items,soft.routines);
    routineByDate.set(date,soft.placed)
  });

  const weekdayHtml=['일','월','화','수','목','금','토']
    .map((label,i)=>`<span class="${i===0?'sun':i===6?'sat':''}">${label}</span>`).join('');

  const dateHtml=days.map(date=>{
    const d=parseDate(date);
    const meta=ensureDayMeta(date);
    const tone=dayToneClass(date,meta);
    return `<button type="button"
      class="cal-week-date-cell ${date===localDateKey()?'today':''} ${tone}"
      data-cal-date="${date}">
      <b>${d.getDate()}</b>
      <span title="${esc(meta.label||'')}">${esc(meta.label||'')}</span>
    </button>`
  }).join('');

  const cells=[];
  for(let row=0;row<slotCount;row++){
    const minute=from+row*SLOT;
    const gridRow=row+1;
    cells.push(`<div class="cal-week-time-label ${minute%60===0?'hour':''}"
      style="grid-column:1;grid-row:${gridRow}">${minute%60===0?minuteLabel(minute):''}</div>`);

    days.forEach((date,dayIndex)=>{
      cells.push(`<div class="cal-week-time-cell ${isWorkMinute(minute)?'work-hour':''}"
        style="grid-column:${dayIndex+2};grid-row:${gridRow}"
        data-week-drop-date="${date}"
        data-week-drop-minute="${minute}"></div>`)
    })
  }

  const blocks=[];
  days.forEach((date,dayIndex)=>{
    const all=[
      ...visibleEntriesForDate(date).filter(e=>e.startMinute!=null),
      ...(routineByDate.get(date)||[])
    ];

    all.forEach(entry=>{
      const item=items.get(entry.itemId);
      if(!item)return;

      const rawStart=Number(entry.startMinute);
      const rawEnd=effectiveEnd(entry,rawStart);
      if(rawStart>=to||rawEnd<=from)return;

      const startMinute=Math.max(rawStart,from);
      const endMinute=Math.min(rawEnd,to);
      const rowStart=Math.floor((startMinute-from)/SLOT)+1;
      const rowSpan=Math.max(1,Math.ceil((endMinute-startMinute)/SLOT));
      const routine=entry.entryType==='routine'||entry.entryType==='routine_override';
      const completed=routine
        ?!!core?.getRoutineLog?.(entry.routineId,date)?.done
        :!!item.completedAt||entry.status==='completed';
      const preview=Number(entry.plannedDurationMinutes)>=60
        ?itemPreview(item,20):'';

      let attrs='';
      if(routine){
        attrs=`data-cal-routine-open data-week-routine="${entry.routineId}" data-routine-date="${date}"`;
        if(!completed)attrs+=' draggable="true"'
      }else{
        attrs=`data-cal-item-open="${entry.itemId}" data-cal-date="${date}"`;
        if(!completed)attrs+=` data-week-entry="${entry.id}" draggable="true"`
      }

      blocks.push(`<button type="button"
        class="cal-week-time-block ${completed?'completed':''} ${entry.isBig3?'big3':''} ${routine?'routine':''}"
        ${attrs}
        title="${esc(itemTitle(item))}"
        style="grid-column:${dayIndex+2};grid-row:${rowStart}/span ${rowSpan}">
        <span class="cal-week-block-copy">
          <strong>${calendarTokenHtml(itemTitle(item))}</strong>
          ${preview?`<small>${calendarTokenHtml(preview)}</small>`:''}
        </span>
        ${entry.isBig3?'<b>BIG3</b>':routine?'<b>ROUTINE</b>':''}
      </button>`)
    })
  });

  return `<div class="cal-week-workspace">
    <div class="cal-week-scroll">
      <div class="cal-week-layout">
        <div class="cal-week-weekdays">
          <i></i>${weekdayHtml}
        </div>
        <div class="cal-week-dates">
          <i></i>${dateHtml}
        </div>
        <div class="cal-week-timetable ${workToneClass()}" style="--cal-week-slots:${slotCount}">
          ${cells.join('')}
          ${blocks.join('')}
        </div>
      </div>
    </div>

    <div id="calPreviousWeekDropZone" class="cal-adjacent-week-drop previous">
      <b>←</b>
      <span>이전 주 월요일로 넘기기</span>
      <small>Brain Dump로 이동</small>
    </div>

    <div id="calNextWeekDropZone" class="cal-adjacent-week-drop next">
      <span>다음 주 월요일로 넘기기</span>
      <b>→</b>
      <small>Brain Dump로 이동</small>
    </div>
  </div>
  <div class="cal-overview-note">
    일반 일정과 Routine을 드래그해 이번 주 안에서 날짜·시간을 조정할 수 있습니다.
    같은 Routine은 같은 날짜에 중복 배치되지 않습니다.
  </div>`
};

const monthMatrix=dateKey=>{
  const d=parseDate(dateKey);
  const first=new Date(d.getFullYear(),d.getMonth(),1);
  const last=new Date(d.getFullYear(),d.getMonth()+1,0);
  const start=new Date(first);
  start.setDate(first.getDate()-first.getDay());
  const rows=[];
  for(let i=0;i<42;i++){
    const day=new Date(start);day.setDate(start.getDate()+i);
    rows.push({
      key:localDateKey(day),
      day:day.getDate(),
      inMonth:day.getMonth()===d.getMonth()
    })
  }
  return rows
};

const renderMonth=()=>{
  const cells=monthMatrix(selectedDate);
  const items=itemMap();

  return `<div class="cal-month-weekdays">
    ${['일','월','화','수','목','금','토'].map((x,i)=>`<span class="${i===0?'sun':i===6?'sat':''}">${x}</span>`).join('')}
  </div>
  <div class="cal-month-grid">
    ${cells.map(cell=>{
      const summary=daySummary(cell.key,items);
      const tone=dayToneClass(cell.key,summary.meta);

      return `<button type="button"
        class="cal-month-day ${cell.inMonth?'':'outside'} ${cell.key===localDateKey()?'today':''} ${tone}"
        data-cal-date="${cell.key}">
        <div class="cal-month-date-row">
          <b>${cell.day}</b>
          <span title="${esc(summary.meta.label||'')}">${esc(summary.meta.label||'')}</span>
        </div>

        <div class="cal-month-big3">
          ${summary.big3Titles.map((title,i)=>`<span><i>${i+1}</i>${esc(title)}</span>`).join('')}
        </div>

        ${summary.otherCount?`<strong class="cal-month-count">+${summary.otherCount}</strong>`:''}
      </button>`
    }).join('')}
  </div>
  <div class="cal-overview-note">
    날짜 셀은 ‘무슨 날인지 / Big3 / Big3를 제외한 실제 TimeTable 일정 수’를 보여줍니다.
  </div>`
};


const routineWeekdayText=r=>{
  const labels=['일','월','화','수','목','금','토'];
  return (r.weekdays||[]).map(d=>labels[d]).join(' · ')
};

const routineTimeText=r=>{
  if(!Number.isFinite(Number(r.defaultStartMinute)))return'시간 미설정';
  const duration=Math.max(SLOT,Number(r.defaultDurationMinutes)||SLOT);
  return `${minuteLabel(Number(r.defaultStartMinute))} · ${duration}분`
};


let routinePlacementId=null;

const closeRoutinePlacementModal=()=>{
  routinePlacementId=null;
  $('#calRoutinePlacementModal')?.classList.add('hidden')
};

const openRoutinePlacementModal=routineId=>{
  const routine=core?.getRoutineById?.(routineId);
  if(!routine)return;

  routinePlacementId=routineId;
  $('#calRoutinePlacementTitle').textContent=routine.title||'Routine';
  const select=$('#calRoutinePlacementTime');
  if(select){
    const from=state.settings.collapseBeforeMinute;
    const to=state.settings.collapseAfterMinute;
    select.innerHTML=timeOptions(
      Number.isFinite(Number(routine.defaultStartMinute))
        ?Number(routine.defaultStartMinute)
        :from,
      0,1410
    )
  }
  $('#calRoutinePlacementModal')?.classList.remove('hidden')
};

const submitRoutinePlacement=()=>{
  if(!routinePlacementId)return closeRoutinePlacementModal();
  const start=Number($('#calRoutinePlacementTime')?.value);
  const routine=core?.getRoutineById?.(routinePlacementId);
  if(!routine)return closeRoutinePlacementModal();

  const duration=Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT);
  const probe={
    id:`routine-place-probe:${routine.id}`,
    date:selectedDate,
    startMinute:start,
    plannedDurationMinutes:duration
  };

  const end=Math.min(DAY_MINUTES,start+duration);
  const collision=visibleEntriesForDate(selectedDate)
    .filter(e=>
      e.startMinute!=null &&
      e.entryType!=='routine' &&
      e.entryType!=='routine_override'
    )
    .some(e=>overlaps(start,end,e));

  if(collision){
    toast('일반 일정과 겹쳐 이 시간에는 Routine을 배치할 수 없습니다.','warn');
    return
  }

  placeRoutineOverride(routine.id,selectedDate,start);
  closeRoutinePlacementModal();
  toast('Routine을 오늘의 새 시간에 배치했습니다.')
};

let routineDashboardSelectedId=null;

const routinePlanResultLabel=value=>({
  on_plan:'😀 계획대로 됨',
  partial:'🙂 일부만 됨',
  below:'😕 기대에 못 미침'
}[value]||'');

const routineRecordHtml=log=>{
  const status=log.done?'완료':log.revokedAt?'완료 취소':'기록';
  const result=routinePlanResultLabel(log.planResult);
  return `<article class="cal-routine-record ${log.done?'done':log.revokedAt?'revoked':''}">
    <div class="cal-routine-record-head">
      <strong>${esc(log.date||'')}</strong>
      <span>${status}${log.completedAt?` · ${esc(String(log.completedAt).replace('T',' ').slice(0,16))}`:''}</span>
    </div>
    ${result?`<b class="cal-routine-record-result">${result}</b>`:''}
    ${log.gapCause?`<div><small>계획 대비 갭 / 원인</small><p>${esc(log.gapCause)}</p></div>`:''}
    ${log.improvement?`<div><small>다음 개선</small><p>${esc(log.improvement)}</p></div>`:''}
    ${log.note?`<div><small>기존 메모</small><p>${esc(log.note)}</p></div>`:''}
    ${log.value!==null&&log.value!==undefined?`<div><small>기록값</small><p>${esc(String(log.value))}</p></div>`:''}
  </article>`
};

const renderCalendarRoutineDashboard=()=>{
  const body=$('#calRoutineBody');
  if(!body)return;

  const routines=core?.getRoutines?.()||[];
  const stats=core?.getRoutineStats?.(30)||{
    rate:0,completedDays:0,totalDone:0,bestStreak:0,totalScheduled:0,dayRows:[]
  };

  if(!routines.some(r=>r.id===routineDashboardSelectedId)){
    routineDashboardSelectedId=routines[0]?.id||null
  }

  const selected=routines.find(r=>r.id===routineDashboardSelectedId)||null;
  const logs=selected?(core?.getRoutineLogs?.(selected.id)||[]):[];

  const heat=(stats.dayRows||[]).map(day=>{
    const cls=day.total===0?'none':day.ratio>=1?'full':day.ratio>0?'partial':'miss';
    return `<i class="cal-routine-heat ${cls}" title="${day.key} · ${day.done}/${day.total}"></i>`
  }).join('');

  body.innerHTML=`
    <div class="cal-routine-dashboard-head">
      <div>
        <h2>Routine</h2>
        <p>반복 일정을 관리하고 실행 기록과 개선점을 한 화면에서 확인합니다.</p>
      </div>
      <button type="button" class="primary" data-cal-routine-add>+ 루틴 추가</button>
    </div>

    <div class="cal-routine-stats">
      <div><b>${stats.rate||0}%</b><span>전체 달성률</span></div>
      <div><b>${stats.completedDays||0}일</b><span>완료한 날</span></div>
      <div><b>${stats.totalDone||0}회</b><span>총 수행</span></div>
      <div><b>${stats.bestStreak||0}일</b><span>최고 연속</span></div>
    </div>

    <div class="cal-routine-heat-wrap">
      <strong>최근 30일 달성 현황</strong>
      <div class="cal-routine-heatmap">${heat||'<span>아직 기록이 없습니다.</span>'}</div>
    </div>

    <div class="cal-routine-dashboard-columns">
      <section>
        <div class="cal-routine-list-head"><strong>내 Routine</strong><span>${routines.length}개</span></div>
        <div class="cal-routine-manage-list">
          ${routines.length?routines.map(r=>`
            <div class="cal-routine-manage-row ${r.id===routineDashboardSelectedId?'selected':''}">
              <button type="button" data-cal-routine-select="${r.id}">
                <span><b>${esc(r.title||'Routine')}</b><small>${esc(r.goal||routineWeekdayText(r))}</small></span>
                <span>
                  <b>${routineTimeText(r)}</b>
                  <small>${routineWeekdayText(r)}</small>
                </span>
              </button>
              <button type="button" class="cal-routine-edit-mini" data-cal-routine-edit="${r.id}">수정</button>
            </div>`).join(''):'<div class="cal-routine-empty">새 Routine을 추가해보세요.</div>'}
        </div>
      </section>

      <section class="cal-routine-history">
        <div class="cal-routine-history-head">
          <div>
            <strong>${selected?esc(selected.title||'Routine'):'Routine 기록'}</strong>
            ${selected?`<small>${esc(routineWeekdayText(selected))}</small>`:''}
          </div>
          <span>${logs.length}개 기록</span>
        </div>
        <div class="cal-routine-history-scroll">
          ${selected
            ?(logs.length?logs.map(routineRecordHtml).join(''):'<div class="cal-routine-empty">아직 실행 기록이 없습니다.</div>')
            :'<div class="cal-routine-empty">왼쪽에서 Routine을 선택하세요.</div>'}
        </div>
      </section>
    </div>
  `;

  $('[data-cal-routine-add]',body)?.addEventListener('click',()=>core?.openRoutineEditor?.(null));
  $$('[data-cal-routine-edit]',body).forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    core?.openRoutineEditor?.(btn.dataset.calRoutineEdit)
  });
  $$('[data-cal-routine-select]',body).forEach(btn=>btn.onclick=()=>{
    routineDashboardSelectedId=btn.dataset.calRoutineSelect;
    renderCalendarRoutineDashboard()
  })
};

const openCalendarRoutineDashboard=()=>{
  renderCalendarRoutineDashboard();
  $('#calRoutineDashboardModal')?.classList.remove('hidden')
};

const closeCalendarRoutineDashboard=()=>{
  $('#calRoutineDashboardModal')?.classList.add('hidden')
};

const renderHeader=()=>{
  const d=parseDate(selectedDate);
  const monthTitle=`${d.getFullYear()}년 ${d.getMonth()+1}월`;
  const title=viewMode==='day'?prettyDate(selectedDate):monthTitle;
  return `<header class="cal-header">
    <div class="cal-date-nav">
      <button type="button" data-cal-nav="-1" aria-label="이전">‹</button>
      <span class="cal-date-title">${esc(title)}</span>
      <button type="button" data-cal-nav="1" aria-label="다음">›</button>
      <button type="button" class="cal-today-button" data-cal-today>Today</button>
    </div>
    <div class="cal-view-switch">
      <button type="button" class="${viewMode==='month'?'active':''}" data-cal-view="month">Month</button>
      <button type="button" class="${viewMode==='week'?'active':''}" data-cal-view="week">Week</button>
      <button type="button" class="${viewMode==='day'?'active':''}" data-cal-view="day">Day</button>
    </div>
    <div class="cal-header-actions">
      <button type="button" data-cal-routine>Routine</button>
      <button type="button" data-cal-settings>⚙</button>
    </div>
  </header>`
};

const render=()=>{
  const root=$('#calendarPage');
  if(!root||!core)return;
  refreshEntriesFromCore();
  refreshDailyMetaFromCore();
  root.innerHTML=`${renderHeader()}
    <div class="cal-view-body">
      ${viewMode==='day'?renderDaily():viewMode==='week'?renderWeek():renderMonth()}
    </div>`;

  bindRenderedEvents();
  updateCurrentTimeIndicator()
};

const shiftCurrentView=direction=>{
  if(viewMode==='day')selectedDate=shiftDate(selectedDate,direction);
  else if(viewMode==='week')selectedDate=shiftDate(selectedDate,direction*7);
  else{
    const d=parseDate(selectedDate);
    d.setMonth(d.getMonth()+direction);
    selectedDate=localDateKey(d)
  }
  expandedEarly=false;
  expandedLate=false;
  render()
};

const bindRenderedEvents=()=>{
  const root=$('#calendarPage');
  if(!root)return;

  $$('[data-cal-nav]',root).forEach(btn=>btn.onclick=()=>shiftCurrentView(Number(btn.dataset.calNav)));
  $('[data-cal-today]',root)?.addEventListener('click',()=>{
    selectedDate=localDateKey();
    expandedEarly=false;expandedLate=false;
    render()
  });

  $$('[data-cal-view]',root).forEach(btn=>btn.onclick=()=>{
    viewMode=btn.dataset.calView;
    render()
  });

  $$('[data-cal-date]',root).forEach(btn=>btn.onclick=e=>{
    if(e?.target?.closest?.('[data-cal-item-open]'))return;
    selectedDate=btn.dataset.calDate;
    viewMode='day';
    expandedEarly=false;expandedLate=false;
    render()
  });

  $$('[data-week-entry]',root).forEach(block=>{
    block.addEventListener('dragstart',e=>{
      const entry=getEntry(block.dataset.weekEntry);
      if(!entry){
        e.preventDefault();
        return
      }

      weeklyDragState={type:'item',entryId:entry.id};
      block.classList.add('cal-week-drag-source');
      document.body.classList.add('cal-week-dragging');
      $('#calPreviousWeekDropZone')?.classList.add('show');
      $('#calNextWeekDropZone')?.classList.add('show');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',entry.id)
      }catch{}
    });

    block.addEventListener('dragend',clearWeeklyDrag)
  });

  $$('[data-week-routine][draggable="true"]',root).forEach(block=>{
    block.addEventListener('dragstart',e=>{
      const routineId=block.dataset.weekRoutine;
      const sourceDate=block.dataset.routineDate;
      if(!routineId||!sourceDate){
        e.preventDefault();
        return
      }

      weeklyDragState={type:'routine',routineId,sourceDate};
      block.classList.add('cal-week-drag-source');
      document.body.classList.add('cal-week-dragging');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',`routine:${routineId}:${sourceDate}`)
      }catch{}
    });

    block.addEventListener('dragend',clearWeeklyDrag)
  });

  const weekGrid=$('.cal-week-timetable',root);
  if(weekGrid){
    const weekTargetFromPointer=e=>{
      const rect=weekGrid.getBoundingClientRect();
      const firstTimeLabel=weekGrid.querySelector('.cal-week-time-label');
      const timeWidth=firstTimeLabel?.getBoundingClientRect().width||54;
      const usableWidth=Math.max(1,rect.width-timeWidth);
      const x=e.clientX-rect.left-timeWidth;

      if(x<0||x>=usableWidth)return null;

      const dayIndex=Math.max(0,Math.min(6,Math.floor(x/(usableWidth/7))));
      const start=startOfWeek(selectedDate);
      const date=shiftDate(start,dayIndex);

      const firstCell=weekGrid.querySelector('.cal-week-time-cell');
      const rowHeight=firstCell?.getBoundingClientRect().height||32;
      const y=Math.max(0,Math.min(rect.height-1,e.clientY-rect.top));
      const row=Math.max(0,Math.floor(y/rowHeight));
      const minute=Math.min(
        state.settings.collapseAfterMinute-SLOT,
        state.settings.collapseBeforeMinute+row*SLOT
      );

      return{date,minute}
    };

    const markWeekTarget=target=>{
      $$('.cal-week-drop-hover',weekGrid).forEach(el=>el.classList.remove('cal-week-drop-hover'));
      if(!target)return;
      const cell=weekGrid.querySelector(
        `.cal-week-time-cell[data-week-drop-date="${target.date}"][data-week-drop-minute="${target.minute}"]`
      );
      cell?.classList.add('cal-week-drop-hover')
    };

    const weeklyTargetAllowed=target=>{
      if(!target||!weeklyDragState)return false;

      if(weeklyDragState.type==='item'){
        const entry=getEntry(weeklyDragState.entryId);
        return !!entry&&calendarEntryFits(entry,target.date,target.minute,entry.id)
      }

      if(weeklyDragState.type==='routine'){
        const sameDate=weeklyDragState.sourceDate===target.date;
        if(!sameDate&&routineOccurrenceExists(weeklyDragState.routineId,target.date)){
          return false
        }
        return routineTargetFits(
          weeklyDragState.routineId,
          target.date,
          target.minute
        )
      }

      return false
    };

    weekGrid.addEventListener('dragover',e=>{
      if(!weeklyDragState)return;
      const target=weekTargetFromPointer(e);
      if(!target)return;

      if(weeklyTargetAllowed(target)){
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        markWeekTarget(target)
      }else{
        markWeekTarget(null)
      }
    });

    weekGrid.addEventListener('dragleave',e=>{
      if(!weekGrid.contains(e.relatedTarget))markWeekTarget(null)
    });

    weekGrid.addEventListener('drop',e=>{
      if(!weeklyDragState)return;
      e.preventDefault();

      const target=weekTargetFromPointer(e);
      markWeekTarget(null);

      if(target&&weeklyTargetAllowed(target)){
        if(weeklyDragState.type==='item'){
          const entry=getEntry(weeklyDragState.entryId);
          if(entry)moveEntryTo(entry,target.date,target.minute)
        }else if(weeklyDragState.type==='routine'){
          moveRoutineOccurrence(
            weeklyDragState.routineId,
            weeklyDragState.sourceDate,
            target.date,
            target.minute
          )
        }
      }

      clearWeeklyDrag()
    })
  }

  [
    ['#calPreviousWeekDropZone','previous'],
    ['#calNextWeekDropZone','next']
  ].forEach(([selector,direction])=>{
    const zone=$(selector,root);
    if(!zone)return;

    zone.addEventListener('dragover',e=>{
      if(weeklyDragState?.type!=='item')return;
      e.preventDefault();
      zone.classList.add('active');
      e.dataTransfer.dropEffect='move'
    });

    zone.addEventListener('dragleave',()=>zone.classList.remove('active'));

    zone.addEventListener('drop',e=>{
      if(weeklyDragState?.type!=='item')return;
      e.preventDefault();
      const entry=getEntry(weeklyDragState.entryId);
      if(entry)deferEntryToAdjacentMonday(entry,direction);
      clearWeeklyDrag()
    })
  });

  $$('[data-cal-item-open]',root).forEach(el=>{
    el.addEventListener('click',e=>{
      if(Date.now()-lastCalendarDragAt<250)return;
      if(weeklyDragState||dailyDragState||dailyRoutineDragState||dailyResizeState)return;
      if(e.target.closest?.('.cal-time-actions,[data-cal-act],[data-routine-act],.cal-resize-handle'))return;
      e.preventDefault();
      e.stopPropagation();
      openCalendarItemModal(el.dataset.calItemOpen)
    })
  });

  $$('[data-cal-settings]',root).forEach(btn=>btn.onclick=openSettings);
  $$('[data-cal-open-create]',root).forEach(btn=>btn.onclick=openCreateModal);

  $('[data-cal-fold="early"]',root)?.addEventListener('click',()=>{
    expandedEarly=!expandedEarly;render()
  });
  $('[data-cal-fold="late"]',root)?.addEventListener('click',()=>{
    expandedLate=!expandedLate;render()
  });



  $$('[data-brain-entry][draggable="true"]',root).forEach(card=>{
    card.addEventListener('dragstart',e=>{
      if(e.target.closest?.('button')){
        e.preventDefault();
        return
      }

      const entry=getEntry(card.dataset.brainEntry);
      if(!entry){
        e.preventDefault();
        return
      }

      dailyDragState={entryId:entry.id};
      dailyRoutineDragState=null;
      card.classList.add('cal-drag-source');
      document.body.classList.add('cal-day-dragging');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',entry.id)
      }catch{}
    });

    card.addEventListener('dragend',clearDailyDrag)
  });

  const brainDropZone=$('.cal-brain-panel',root);
  if(brainDropZone){
    brainDropZone.addEventListener('dragover',e=>{
      if(!dailyDragState)return;
      const entry=getEntry(dailyDragState.entryId);
      if(!entry||entry.startMinute==null)return;

      e.preventDefault();
      e.dataTransfer.dropEffect='move';
      brainDropZone.classList.add('cal-brain-drop-active')
    });

    brainDropZone.addEventListener('dragleave',e=>{
      if(!brainDropZone.contains(e.relatedTarget)){
        brainDropZone.classList.remove('cal-brain-drop-active')
      }
    });

    brainDropZone.addEventListener('drop',e=>{
      if(!dailyDragState)return;
      e.preventDefault();

      const entry=getEntry(dailyDragState.entryId);
      brainDropZone.classList.remove('cal-brain-drop-active');

      if(entry&&entry.startMinute!=null){
        entry.startMinute=null;
        entry.updatedAt=nowIso();
        persistEntry(entry);
        toast('브레인 덤프로 되돌렸습니다.');
        render()
      }

      clearDailyDrag()
    })
  }

  $$('[data-daily-entry][draggable="true"]',root).forEach(block=>{
    block.addEventListener('dragstart',e=>{
      if(e.target.closest?.('.cal-time-actions,.cal-resize-handle')){
        e.preventDefault();
        return
      }

      const entry=getEntry(block.dataset.dailyEntry);
      if(!entry||entry.status==='completed'){
        e.preventDefault();
        return
      }

      dailyDragState={entryId:entry.id};
      dailyRoutineDragState=null;
      block.classList.add('cal-drag-source');
      document.body.classList.add('cal-day-dragging');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',entry.id)
      }catch{}
    });

    block.addEventListener('dragend',clearDailyDrag);

    block.querySelectorAll('[data-cal-resize]').forEach(handle=>{
      handle.addEventListener('pointerdown',e=>{
        const entry=getEntry(block.dataset.dailyEntry);
        startDailyResize(entry,block,handle.dataset.calResize,e)
      })
    })
  });

  $$('[data-daily-routine][draggable="true"]',root).forEach(block=>{
    block.addEventListener('dragstart',e=>{
      if(e.target.closest?.('.cal-time-actions')){
        e.preventDefault();
        return
      }

      dailyDragState=null;
      dailyRoutineDragState={
        routineId:block.dataset.dailyRoutine,
        date:block.dataset.routineDate||selectedDate
      };
      block.classList.add('cal-drag-source');
      document.body.classList.add('cal-day-dragging');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',`routine:${block.dataset.dailyRoutine}`)
      }catch{}
    });
    block.addEventListener('dragend',clearDailyDrag)
  });

  $$('[data-unplaced-routine][draggable="true"]',root).forEach(row=>{
    row.addEventListener('dragstart',e=>{
      const routineId=row.dataset.unplacedRoutine;
      if(!routineId)return;
      dailyDragState=null;
      dailyRoutineDragState={routineId,date:selectedDate};
      row.classList.add('cal-drag-source');
      document.body.classList.add('cal-day-dragging');

      try{
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',`routine:${routineId}`)
      }catch{}
    });
    row.addEventListener('dragend',clearDailyDrag)
  });

  $$('.cal-time-grid',root).forEach(grid=>{
    const minuteFromPointer=e=>{
      const rect=grid.getBoundingClientRect();
      const firstSlot=grid.querySelector('.cal-slot');
      const slotHeight=firstSlot?.getBoundingClientRect().height||34;
      const from=Number(grid.dataset.gridFrom)||0;
      const to=Number(grid.dataset.gridTo)||DAY_MINUTES;
      const y=Math.max(0,Math.min(rect.height-1,e.clientY-rect.top));
      const offset=Math.floor(y/slotHeight)*SLOT;
      return Math.max(from,Math.min(to-SLOT,from+offset))
    };

    const markTarget=minute=>{
      $$('.cal-day-drop-hover',grid).forEach(el=>el.classList.remove('cal-day-drop-hover'));
      const slot=grid.querySelector(`.cal-slot[data-minute="${minute}"]`);
      slot?.classList.add('cal-day-drop-hover')
    };

    grid.addEventListener('dragover',e=>{
      const minute=minuteFromPointer(e);

      if(dailyDragState){
        const entry=getEntry(dailyDragState.entryId);
        if(!entry)return;

        if(calendarEntryFits(entry,selectedDate,minute,entry.id)){
          e.preventDefault();
          e.dataTransfer.dropEffect='move';
          markTarget(minute)
        }else{
          $$('.cal-day-drop-hover',grid).forEach(el=>el.classList.remove('cal-day-drop-hover'))
        }
        return
      }

      if(dailyRoutineDragState){
        const routine=core?.getRoutineById?.(dailyRoutineDragState.routineId);
        if(!routine)return;

        const duration=Math.max(SLOT,Number(routine.defaultDurationMinutes)||SLOT);
        const end=Math.min(DAY_MINUTES,minute+duration);
        const collision=visibleEntriesForDate(selectedDate)
          .filter(other=>other.startMinute!=null)
          .some(other=>overlaps(minute,end,other));

        if(!collision){
          e.preventDefault();
          e.dataTransfer.dropEffect='move';
          markTarget(minute)
        }
      }
    });

    grid.addEventListener('dragleave',e=>{
      if(!grid.contains(e.relatedTarget)){
        $$('.cal-day-drop-hover',grid).forEach(el=>el.classList.remove('cal-day-drop-hover'))
      }
    });

    grid.addEventListener('drop',e=>{
      e.preventDefault();
      const minute=minuteFromPointer(e);

      if(dailyDragState){
        const entry=getEntry(dailyDragState.entryId);
        if(entry)moveEntryTo(entry,selectedDate,minute)
      }else if(dailyRoutineDragState){
        placeRoutineOverride(
          dailyRoutineDragState.routineId,
          selectedDate,
          minute
        )
      }

      clearDailyDrag()
    })
  });

  $$('[data-routine-block]',root).forEach(block=>{
    block.addEventListener('click',e=>{
      const action=e.target.closest?.('[data-routine-act]');
      if(!action)return;

      e.preventDefault();
      e.stopPropagation();

      const routineId=block.dataset.routineBlock;
      const date=block.dataset.routineDate||selectedDate;

      if(action.dataset.routineAct==='check'){
        openRoutineCompletionModal(routineId,date)
      }else if(action.dataset.routineAct==='undo'){
        undoRoutineCompletion(routineId,date)
      }else if(action.dataset.routineAct==='dashboard'){
        openCalendarRoutineDashboard()
      }
    })
  });

  $$('[data-unplaced-routine-action]',root).forEach(button=>{
    button.onclick=e=>{
      e.preventDefault();
      e.stopPropagation();
      const routineId=button.dataset.routineId;
      if(button.dataset.unplacedRoutineAction==='check'){
        openRoutineCompletionModal(routineId,selectedDate)
      }else{
        undoRoutineCompletion(routineId,selectedDate)
      }
    }
  });

  $$('[data-entry-id]',root).forEach(container=>{
    container.addEventListener('click',e=>{
      const button=e.target.closest?.('[data-cal-act]');
      if(!button)return;
      e.preventDefault();
      e.stopPropagation();

      const entry=getEntry(container.dataset.entryId);
      if(!entry)return;

      switch(button.dataset.calAct){
        case 'checkin': checkIn(entry); break;
        case 'big3': toggleBig3(entry); break;
        case 'up': moveEntry(entry,'up'); break;
        case 'down': moveEntry(entry,'down'); break;
        case 'grow': growEntry(entry); break;
        case 'shrink': shrinkEntry(entry); break;
        case 'check': openCompletionModal(entry); break;
        case 'undo': undoCompletion(entry); break;
        case 'open': openCalendarItemModal(entry.itemId); break;
        case 'delete': removeEntryAndTrashItem(entry); break;
      }
    })
  });

  const dayLabel=$('#calDayLabel',root);
  if(dayLabel)dayLabel.oninput=()=>{
    ensureDayMeta(selectedDate).label=dayLabel.value;
    persistDailyMeta(selectedDate)
  };

  $$('[data-cal-day-color]',root).forEach(button=>button.onclick=()=>{
    ensureDayMeta(selectedDate).color=button.dataset.calDayColor;
    persistDailyMeta(selectedDate);
    render()
  });

  const memo=$('#calDailyMemo',root);
  if(memo)memo.oninput=()=>{
    ensureDayMeta(selectedDate).memo=memo.value;
    persistDailyMeta(selectedDate)
  };
  const review=$('#calDailyReview',root);
  if(review)review.oninput=()=>{
    ensureDayMeta(selectedDate).review=review.value;
    persistDailyMeta(selectedDate)
  };

  $('[data-cal-routine]',root)?.addEventListener('click',openCalendarRoutineDashboard);
  $$('[data-cal-routine-open]',root).forEach(btn=>btn.onclick=()=>{
    if(Date.now()-lastCalendarDragAt<250)return;
    openCalendarRoutineDashboard()
  });
  $$('[data-cal-routine-place]',root).forEach(btn=>btn.onclick=()=>openRoutinePlacementModal(btn.dataset.calRoutinePlace))
};

const installShell=()=>{
  if($('#calendarPage'))return;

  const wrap=$('.main .wrap');
  if(!wrap)return;

  const page=document.createElement('section');
  page.id='calendarPage';
  page.className='calendar-page hidden';
  wrap.appendChild(page);

  document.body.insertAdjacentHTML('beforeend',`
    <div id="calCreateModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-create-dialog">
        <h2>새 할 일</h2>
        <input id="calCreateTitle" maxlength="300" autocomplete="off" placeholder="할 일 제목">
        <div class="cal-dialog-actions">
          <button type="button" data-cal-create-cancel>취소</button>
          <button type="button" class="primary" data-cal-create-confirm>확인</button>
        </div>
      </div>
    </div>

    <div id="calSettingsModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-settings-dialog">
        <h2>Calendar 설정</h2>
        <p>표시시간과 업무시간을 30분 단위로 설정합니다.</p>

        <div class="cal-settings-section">
          <strong>접어둘 시간</strong>
          <label>아침 접기
            <span><select id="calCollapseBefore"></select> 이전</span>
          </label>
          <label>저녁 접기
            <span><select id="calCollapseAfter"></select> 이후</span>
          </label>
        </div>

        <div class="cal-settings-section">
          <strong>업무시간</strong>
          <div class="cal-work-time-row">
            <label>시작 <select id="calWorkStart"></select></label>
            <label>종료 <select id="calWorkEnd"></select></label>
          </div>
          <div class="cal-work-color-label">업무시간 배경색</div>
          <div id="calWorkColorPalette" class="cal-work-color-palette"></div>
        </div>

        <div class="cal-dialog-actions">
          <button type="button" data-cal-settings-cancel>취소</button>
          <button type="button" class="primary" data-cal-settings-save>저장</button>
        </div>
      </div>
    </div>

    <div id="calRoutineDashboardModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-routine-dashboard-dialog">
        <button type="button" class="cal-routine-close" data-cal-routine-close>×</button>
        <div id="calRoutineBody"></div>
      </div>
    </div>

    <div id="calItemModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-item-dialog">
        <div class="cal-item-dialog-head">
          <div>
            <h2>일정</h2>
            <small id="calItemCreatedAt"></small>
          </div>
          <button type="button" data-cal-item-close aria-label="닫기">×</button>
        </div>

        <label class="cal-item-content-field">
          <span>메모 · 첫 줄이 일정 제목입니다</span>
          <textarea id="calItemContent"
            placeholder="첫 줄: 할 일 이름&#10;둘째 줄부터: 메모, 기록, 참고내용"></textarea>
        </label>

        <section class="cal-item-check-section">
          <div class="cal-item-check-head"><strong>체크리스트</strong></div>
          <div id="calItemChecklist" class="cal-item-check-list"></div>
          <div class="cal-item-check-add">
            <input class="cal-item-check-pending-box" type="checkbox" disabled aria-hidden="true" tabindex="-1">
            <input id="calItemChecklistNew" type="text" maxlength="300" placeholder="체크리스트 추가">
            <button type="button" data-cal-item-check-add>추가</button>
          </div>
        </section>

        <div class="cal-dialog-actions">
          <button type="button" data-cal-item-workspace>Workspace에서 열기</button>
          <button type="button" class="primary" data-cal-item-close>확인</button>
        </div>
      </div>
    </div>

    <div id="calRoutinePlacementModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-routine-placement-dialog">
        <h2 id="calRoutinePlacementTitle">Routine 배치</h2>
        <p>오늘 이 Routine을 어느 시간에 배치할지 선택하세요.</p>
        <label>시작 시간
          <select id="calRoutinePlacementTime"></select>
        </label>
        <div class="cal-dialog-actions">
          <button type="button" data-cal-routine-placement-cancel>취소</button>
          <button type="button" class="primary" data-cal-routine-placement-confirm>배치</button>
        </div>
      </div>
    </div>

    <div id="calCompletionModal" class="cal-modal hidden" role="dialog" aria-modal="true">
      <div class="cal-dialog cal-completion-dialog">
        <div class="cal-completion-kicker">Check!</div>
        <h2 id="calCompletionTitle"></h2>
        <p class="cal-completion-question">수고하셨습니다. 결과는 계획 대비 어땠습니까?</p>

        <div class="cal-result-options">
          <label><input type="radio" name="calPlanResult" value="on_plan"><span>😀 계획대로 됨</span></label>
          <label><input type="radio" name="calPlanResult" value="partial"><span>🙂 일부만 됨</span></label>
          <label><input type="radio" name="calPlanResult" value="below"><span>😕 기대에 못 미침</span></label>
        </div>

        <textarea id="calGapCause" rows="4" placeholder="계획 대비 갭차이가 발생한 부분과 그에 대한 원인을 적어보세요"></textarea>
        <p class="cal-completion-help">계획 대비 갭차이가 발생한 부분과 그에 대한 원인을 적어보세요.</p>

        <p class="cal-completion-question second">다음에 같은 일을 한다면 무엇을 개선하시겠습니까?</p>
        <textarea id="calImprovement" rows="4" placeholder="다음번에 개선할 점을 적어보세요"></textarea>

        <div class="cal-dialog-actions">
          <button type="button" data-cal-completion-cancel>취소</button>
          <button type="button" class="primary" data-cal-completion-confirm>확인</button>
        </div>
      </div>
    </div>
  `);

  const createModal=$('#calCreateModal');
  createModal?.addEventListener('pointerdown',e=>{
    if(e.target===createModal)closeCreateModal()
  });
  $('[data-cal-create-cancel]')?.addEventListener('click',closeCreateModal);
  $('[data-cal-create-confirm]')?.addEventListener('click',submitCreate);
  $('#calCreateTitle')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      submitCreate()
    }
  });

  const settingsModal=$('#calSettingsModal');
  settingsModal?.addEventListener('pointerdown',e=>{
    if(e.target===settingsModal)closeSettings()
  });
  $('[data-cal-settings-cancel]')?.addEventListener('click',closeSettings);
  $('[data-cal-settings-save]')?.addEventListener('click',saveSettings);

  const itemModal=$('#calItemModal');
  itemModal?.addEventListener('pointerdown',e=>{
    if(e.target===itemModal){
      saveCalendarItemContent();
      closeCalendarItemModal();
      render()
    }
  });
  $$('[data-cal-item-close]').forEach(btn=>btn.addEventListener('click',()=>{
    saveCalendarItemContent();
    closeCalendarItemModal();
    render()
  }));
  $('#calItemContent')?.addEventListener('input',saveCalendarItemContent);
  $('[data-cal-item-check-add]')?.addEventListener('click',addCalendarItemChecklist);
  $('#calItemChecklistNew')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      addCalendarItemChecklist()
    }
  });
  $('[data-cal-item-workspace]')?.addEventListener('click',()=>{
    const itemId=calendarItemEditingId;
    saveCalendarItemContent();
    closeCalendarItemModal();
    if(itemId)openItemInWorkspace(itemId)
  });

  const routinePlacementModal=$('#calRoutinePlacementModal');
  routinePlacementModal?.addEventListener('pointerdown',e=>{
    if(e.target===routinePlacementModal)closeRoutinePlacementModal()
  });
  $('[data-cal-routine-placement-cancel]')?.addEventListener('click',closeRoutinePlacementModal);
  $('[data-cal-routine-placement-confirm]')?.addEventListener('click',submitRoutinePlacement);

  const routineDashboardModal=$('#calRoutineDashboardModal');
  routineDashboardModal?.addEventListener('pointerdown',e=>{
    if(e.target===routineDashboardModal)closeCalendarRoutineDashboard()
  });
  $('[data-cal-routine-close]')?.addEventListener('click',closeCalendarRoutineDashboard);

  const completionModal=$('#calCompletionModal');
  completionModal?.addEventListener('pointerdown',e=>{
    if(e.target===completionModal)closeCompletionModal()
  });
  $('[data-cal-completion-cancel]')?.addEventListener('click',closeCompletionModal);
  $('[data-cal-completion-confirm]')?.addEventListener('click',submitCompletion);

  render()
};


let calendarHotkeysInstalled=false;

const isTypingTarget=target=>{
  if(!target)return false;
  if(target.matches?.('input,textarea,select'))return true;
  if(target.isContentEditable)return true;
  if(target.closest?.('[contenteditable="true"]'))return true;
  return false
};

const closeTopCalendarModal=()=>{
  const item=$('#calItemModal');
  if(item&&!item.classList.contains('hidden')){
    saveCalendarItemContent();
    closeCalendarItemModal();
    render();
    return true
  }

  const completion=$('#calCompletionModal');
  if(completion&&!completion.classList.contains('hidden')){
    closeCompletionModal();
    return true
  }

  const placement=$('#calRoutinePlacementModal');
  if(placement&&!placement.classList.contains('hidden')){
    closeRoutinePlacementModal();
    return true
  }

  const settings=$('#calSettingsModal');
  if(settings&&!settings.classList.contains('hidden')){
    closeSettings();
    return true
  }

  const dashboard=$('#calRoutineDashboardModal');
  if(dashboard&&!dashboard.classList.contains('hidden')){
    closeCalendarRoutineDashboard();
    return true
  }

  const create=$('#calCreateModal');
  if(create&&!create.classList.contains('hidden')){
    closeCreateModal();
    return true
  }

  return false
};

const installCalendarHotkeys=()=>{
  if(calendarHotkeysInstalled)return;
  calendarHotkeysInstalled=true;

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(closeTopCalendarModal()){
        e.preventDefault();
        e.stopPropagation()
      }
      return
    }

    if(isTypingTarget(e.target))return;

    const routineDashboard=$('#calRoutineDashboardModal');
    const routineDashboardOpen=!!routineDashboard&&!routineDashboard.classList.contains('hidden');
    const otherModalOpen=[...document.querySelectorAll('.cal-modal:not(.hidden),.modal:not(.hidden)')]
      .some(modal=>modal!==routineDashboard);

    const navKey=
      e.key==='1'||e.key==='2'||e.key==='3'||
      e.key==='`'||e.code==='Backquote';

    if(otherModalOpen)return;

    if(navKey&&routineDashboardOpen){
      closeCalendarRoutineDashboard()
    }

    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      if(routineDashboardOpen)return;
      if(core?.getMode?.()!=='calendar')return;
      e.preventDefault();
      openCreateModal();
      return
    }

    if(e.key==='1'||e.key==='2'||e.key==='3'){
      e.preventDefault();
      viewMode=e.key==='1'?'month':e.key==='2'?'week':'day';
      core?.setMode?.('calendar');
      render();
      return
    }

    if(e.key==='4'){
      if(routineDashboardOpen)return;
      e.preventDefault();
      viewMode='week';
      core?.setMode?.('calendar');
      render();
      setTimeout(openCalendarRoutineDashboard,0);
      return
    }

    if(e.key==='`'||e.code==='Backquote'){
      e.preventDefault();
      core?.setMode?.('memo')
    }
  })
};
const boot=()=>{
  core=window.RTCore||null;
  if(!core)return false;

  try{
    const overrideMigrated=migrateLegacyRoutineOverrides();
    if(overrideMigrated){
      console.info(`[Calendar] migrated ${overrideMigrated} Routine overrides to Daily Meta`)
    }

    const imported=core.importCalendarEntries?.(state.entries||[])||0;
    if(imported)console.info(`[Calendar] migrated ${imported} local entries to RTCore`);

    const metaImported=core.importDailyMeta?.(state.dayMeta||{})||0;
    if(metaImported)console.info(`[Calendar] migrated ${metaImported} Daily Meta records to RTCore`);
  }catch(e){
    console.warn('Calendar migration failed',e)
  }

  refreshEntriesFromCore();
  refreshDailyMetaFromCore();
  installShell();
  installCalendarHotkeys();

  if(!window.__rtCurrentTimeTimer){
    window.__rtCurrentTimeTimer=setInterval(updateCurrentTimeIndicator,60000)
  }

  // Workspace "Go to TimeTable" / external integration.
  window.RTCalendar=Object.freeze({
    version:'r32.0_260929_fix3',
    activate:(date=localDateKey())=>{
      selectedDate=date;
      viewMode='day';
      core.setMode?.('calendar');
      render()
    },
    planItem:(itemId,date=localDateKey())=>{
      const item=core.getItem?.(itemId);
      if(!item)throw new Error('Item을 찾을 수 없습니다.');
      if(item.completedAt)throw new Error('이미 완료된 Item입니다. 완료 취소 후 다시 계획할 수 있습니다.');
      selectedDate=date;
      createEntryForItem(itemId,date);
      core.setMode?.('calendar');
      render();
      return clone(state.entries.find(e=>e.itemId===itemId&&e.date===date&&e.status!=='deleted'))
    },
    getEntries:date=>clone(date?entriesForDate(date):state.entries),
    getSettings:()=>clone(state.settings)
  });

  render();
  return true
};

window.addEventListener('rtcalendar:activate',()=>{
  if(!core)boot();
  render()
});

window.addEventListener('rtcore:ready',()=>boot(),{once:true});

if(!boot()){
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(boot()){
      clearInterval(timer);
      return
    }
    if(tries>80){
      clearInterval(timer);
      console.error('[Calendar] RTCore를 찾지 못했습니다. index와 calendar 파일의 버전/위치를 확인하세요.');
    }
  },50)
}

let pendingCoreRender=false;

const calendarIsEditing=()=>{
  const active=document.activeElement;
  const page=$('#calendarPage');
  if(!active||!page?.contains(active))return false;
  return active.matches?.('input,textarea,select')||active.isContentEditable
};

window.addEventListener('rtcore:itemschanged',()=>{
  if(!core)return;
  refreshEntriesFromCore();
  refreshDailyMetaFromCore();
  calendarDirty=false;

  if(calendarIsEditing()){
    pendingCoreRender=true;
    return
  }

  pendingCoreRender=false;
  render()
});

document.addEventListener('focusout',()=>{
  if(!pendingCoreRender)return;
  setTimeout(()=>{
    if(!calendarIsEditing()&&pendingCoreRender){
      pendingCoreRender=false;
      render()
    }
  },0)
});

window.addEventListener('rtroutine:changed',()=>{
  if(!core)return;
  render();
  if(!$('#calRoutineDashboardModal')?.classList.contains('hidden')){
    renderCalendarRoutineDashboard()
  }
});

window.addEventListener('storage',e=>{
  if(e.key!==CAL_KEY)return;
  try{
    state=normalizeState(JSON.parse(e.newValue||'null'));
    render()
  }catch{}
});
