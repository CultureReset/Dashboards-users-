// Owner dashboard: a malformed calendar response must show an error, never blank the dashboard.
//
// Empty object, null, 500 and wrong-shape responses.
//
// Run:   npm run build && npx vite preview --port 4303 &
//        node scripts/browser-checks/calendar-bad-payload.cjs
// Needs: playwright (already installed globally in Claude Code cloud sessions,
//        otherwise `npm i -D playwright`).
// Env:   PW_CHROMIUM (optional browser path), BASE_URL (default http://localhost:4303), OUT_DIR (screenshots/results,
//        default the OS temp dir).

const BASE = process.env.BASE_URL || 'http://localhost:4303';
const OUT = (process.env.OUT_DIR || require('os').tmpdir()) + '/';
// If this repo pins its own Playwright, point at an installed Chromium:  PW_CHROMIUM=/path/to/chromium
const LAUNCH = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const {chromium}=require('playwright');
const J=(o,s=200)=>({status:s,contentType:'application/json',body:JSON.stringify(o)});
(async()=>{const b=await chromium.launch(LAUNCH);let fails=0;const ok=(n,c,d)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+n+(c?'':' '+JSON.stringify(d)));};
 for(const [label,reply] of [['empty object',()=>J({})],['null body',()=>({status:200,contentType:'application/json',body:'null'})],['server error',()=>J({error:'boom'},500)],['days is not a list',()=>J({from:'2026-11-01',days:'nope'})]]){
  const c=await b.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>localStorage.setItem('gcr_business_session_v1',JSON.stringify({access_token:'t',refresh_token:'r',user:{id:'u'},expires_at:Math.floor(Date.now()/1000)+86400})));
  await c.route(/\/api\//,r=>{const p=new URL(r.request().url()).pathname;
    if(/business\/me$/.test(p))return r.fulfill(J({slug:'s',name:'S',hasAccess:true}));
    if(/business\/calendar$/.test(p))return r.fulfill(reply());
    if(/business\/ical$/.test(p))return r.fulfill(J({units:[{slug:'s',name:'S',can_edit:true,export_url:'https://x/y.ics',feeds:[]}]}));
    return r.fulfill(J({}));});
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/');await p.waitForTimeout(1200);await p.getByText(/^\s*(📅\s*)?Calendar\s*$/i).first().click({force:true});await p.waitForTimeout(900);
  const txt=await p.locator('body').innerText();
  ok(label+': no crash',errs.length===0,errs);
  ok(label+': error shown with Try again',/Try again/.test(txt)&&/(expect|Could not|boom|went wrong|failed)/i.test(txt),txt.slice(0,200));
  ok(label+': rest of the Calendar page still works (iCal panel visible)',/Export iCal/.test(txt),txt.slice(0,200));
  await c.close();}
 await b.close();console.log(fails?fails+' failed':'all bad-payload checks passed');process.exit(fails?1:0)})();
