// Owner dashboard: availability calendar, driven against a stateful stub API.
//
// Capacity save, range block, re-open, synced bookings not removable, month navigation, tap size, overflow.
//
// Run:   npm run build && npx vite preview --port 4303 &
//        node scripts/browser-checks/calendar.cjs
// Needs: playwright (already installed globally in Claude Code cloud sessions,
//        otherwise `npm i -D playwright`).
// Env:   PW_CHROMIUM (optional browser path), BASE_URL (default http://localhost:4303), OUT_DIR (screenshots/results,
//        default the OS temp dir).

const BASE = process.env.BASE_URL || 'http://localhost:4303';
const OUT = (process.env.OUT_DIR || require('os').tmpdir()) + '/';
// If this repo pins its own Playwright, point at an installed Chromium:  PW_CHROMIUM=/path/to/chromium
const LAUNCH = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const {chromium}=require('playwright');
const S=(process.env.OUT_DIR||require('os').tmpdir())+'/';
const J=(o,status=200)=>({status,contentType:'application/json',body:JSON.stringify(o)});
const iso=d=>d.toISOString().slice(0,10);
const now=new Date();const MONTH=iso(now).slice(0,7);
const D=n=>`${MONTH}-${String(n).padStart(2,'0')}`;
const lastDay=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
(async()=>{const br=await chromium.launch(LAUNCH);let fails=0;const ok=(n,c,d)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+n+(c?'':' '+JSON.stringify(d)));};
 for(const [vn,vp] of [['phone',{width:390,height:844}],['desktop',{width:1440,height:900}]]){
  const st={cap:null,events:[{id:'b1',kind:'booking',source:'nextgent:airbnb',title:'airbnb · A1',start:D(10),last_day:D(12),removable:false}],seq:0,posts:[],months:[]};
  const ctx=await br.newContext({viewport:vp});
  await ctx.addInitScript(()=>localStorage.setItem('gcr_business_session_v1',JSON.stringify({access_token:'t',refresh_token:'r',user:{id:'u1',email:'o@t.dev'},expires_at:Math.floor(Date.now()/1000)+86400})));
  await ctx.route(/\/api\//,async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;
   if(/\/business\/me$/.test(p))return r.fulfill(J({slug:'s',name:'Sunset Condo',hasAccess:true}));
   if(/\/business\/calendar$/.test(p)){const month=u.searchParams.get('month')||MONTH;st.months.push(month);const [y,mo]=month.split('-').map(Number);const n=new Date(Date.UTC(y,mo,0)).getUTCDate();
     const days=[];for(let i=1;i<=n;i++){const date=`${month}-${String(i).padStart(2,'0')}`;const ev=st.events.filter(e=>e.start<=date&&e.last_day>=date);
       let status=st.cap==null?'unknown':'available';if(ev.some(e=>e.kind==='block'))status='blocked';else if(ev.length)status='booked';
       days.push({date,status,remaining:st.cap==null?null:st.cap,total:st.cap,assumed:true,events:ev.map(e=>e.id)});}
     return r.fulfill(J({slug:'s',name:'Sunset Condo',month,from:`${month}-01`,to:`${month}-${n}`,capacity_known:st.cap!=null,daily_capacity:st.cap,days,events:st.events}));}
   if(/calendar\/capacity$/.test(p)&&m==='PUT'){const b=JSON.parse(r.request().postData());st.cap=b.daily_capacity;return r.fulfill(J({daily_capacity:st.cap}));}
   if(/calendar\/block$/.test(p)&&m==='POST'){const b=JSON.parse(r.request().postData());st.posts.push(b);const id='o'+(++st.seq);st.events.push({id,kind:'block',source:'owner',title:b.note||'Blocked by you',start:b.date,last_day:b.end_date||b.date,removable:true});return r.fulfill(J({id},201));}
   if(/calendar\/block\//.test(p)&&m==='DELETE'){const id=p.split('/').pop();st.events=st.events.filter(e=>e.id!==id);return r.fulfill(J({removed:true}));}
   if(/business\/ical$/.test(p))return r.fulfill(J({active_slug:'s',units:[{slug:'s',name:'Sunset Condo',can_edit:true,export_url:'https://x/y.ics',feeds:[]}]}));
   return r.fulfill(J({}));});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/');await p.waitForTimeout(1200);
  await p.getByText(/^\s*(📅\s*)?Calendar\s*$/i).first().click({force:true});await p.waitForTimeout(900);
  ok(vn+': month grid renders every day',(await p.locator('.avail-day').count())===lastDay,await p.locator('.avail-day').count());
  ok(vn+': tells owner guests cannot see them yet',/can't see when you're free/.test(await p.locator('.avail').innerText()));
  await p.fill('.avail-capacity input','1');await p.getByRole('button',{name:'Save'}).click();await p.waitForTimeout(700);
  ok(vn+': saving capacity removes the warning and opens dates',!(await p.locator('.avail-notice').count())&&(await p.locator('.avail-day.avail-available').count())>20,await p.locator('.avail-day.avail-available').count());
  ok(vn+': booking shown as booked',(await p.locator('.avail-day.avail-booked').count())===3,await p.locator('.avail-day.avail-booked').count());
  // range block
  await p.getByRole('gridcell',{name:new RegExp('^.*'+'')}).nth(19).click(); // day 20
  ok(vn+': first tap prompts for the end day',/tap the last day/i.test(await p.locator('.avail').innerText()));
  await p.getByRole('gridcell').nth(21).click();await p.waitForTimeout(200);
  const label=await p.locator('.avail-panel strong').innerText();
  ok(vn+': range panel opens with both dates',/–/.test(label),label);
  await p.fill('.avail-block input','Maintenance');await p.getByRole('button',{name:/^Close /}).click();await p.waitForTimeout(800);
  ok(vn+': block posted with start, end and note',st.posts.length===1&&st.posts[0].date===D(20)&&st.posts[0].end_date===D(22)&&st.posts[0].note==='Maintenance',st.posts);
  ok(vn+': blocked days now show closed',(await p.locator('.avail-day.avail-blocked').count())===3,await p.locator('.avail-day.avail-blocked').count());
  ok(vn+': confirmation message shown',/Guests will see these dates as unavailable/.test(await p.locator('.avail-message').innerText()));
  // synced booking is not removable
  await p.getByRole('gridcell').nth(10).click();await p.waitForTimeout(200);
  const panel=await p.locator('.avail-panel').innerText();
  ok(vn+': a synced booking says to change it at its source, with no Re-open',/synced calendar/.test(panel)&&!/Re-open/.test(panel),panel);
  // re-open owner block
  await p.getByRole('gridcell').nth(20).click();await p.waitForTimeout(200);
  await p.getByRole('button',{name:'Re-open'}).click();await p.waitForTimeout(800);
  ok(vn+': re-open frees the dates',(await p.locator('.avail-day.avail-blocked').count())===0,await p.locator('.avail-day.avail-blocked').count());
  // month nav
  await p.getByRole('button',{name:'Next month'}).click();await p.waitForTimeout(700);
  ok(vn+': next month requests the next month',st.months.at(-1)!==MONTH,st.months);
  await p.getByRole('button',{name:'Today'}).click();await p.waitForTimeout(600);
  ok(vn+': Today returns to this month',st.months.at(-1)===MONTH,st.months);
  ok(vn+': no horizontal overflow',(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=2);
  const small=await p.evaluate(()=>[...document.querySelectorAll('.avail button')].filter(b=>{const r=b.getBoundingClientRect();return r.height<40&&!b.classList.contains('avail-day')}).length);
  ok(vn+': buttons are tap-sized (>=40px)',small===0,small);
  ok(vn+': no page errors',errs.length===0,errs);
  await p.locator('.avail').screenshot({path:S+`shot-avail-${vn}.png`});
  await ctx.close();}
 await br.close();console.log(fails?fails+' failed':'all calendar ui checks passed');process.exit(fails?1:0);})();
