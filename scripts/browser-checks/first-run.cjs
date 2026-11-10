// Owner dashboard: a business opens its invite link, sets a password and lands in its dashboard.
//
// Used link, password validation, sign-in with the slug login, and the sections discovered from the data.
//
// Run:   npm run build && npx vite preview --port 4303 &
//        node scripts/browser-checks/first-run.cjs
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
const SLUG='pelican-grill';
const sections={
 menu_items:[{id:1,entity_slug:SLUG,item_name:'Gulf Shrimp Basket',description:'Fried, with fries',price:14.5,is_available:true},{id:2,entity_slug:SLUG,item_name:'Snow Crab Legs',description:'1 lb',price:29,is_available:true}],
 entity_hours:[{id:1,entity_slug:SLUG,day_of_week:'monday',opens_at:'11:00:00',closes_at:'21:00:00',is_closed:false},{id:2,entity_slug:SLUG,day_of_week:'tuesday',opens_at:'11:00:00',closes_at:'21:00:00',is_closed:false}],
 entity_photos:[{id:1,entity_slug:SLUG,url:'https://example.test/a.jpg',is_cover:true,is_current:true},{id:2,entity_slug:SLUG,url:'https://example.test/b.jpg',is_cover:false,is_current:null}],
 entity_tags:[{id:1,entity_slug:SLUG,tag_name:'seafood'},{id:2,entity_slug:SLUG,tag_name:'dog friendly'}],
 faqs:[{id:1,entity_slug:SLUG,question:'Do you take reservations?',answer:'Yes, call ahead.'}]};
(async()=>{const br=await chromium.launch(LAUNCH);let fails=0;const ok=(n,c,d)=>{if(!c)fails++;console.log((c?'  ok   ':'  FAIL ')+n+(c?'':' '+JSON.stringify(d)));};
 for(const [vn,vp] of [['phone',{width:390,height:844}],['desktop',{width:1440,height:900}]]){
  const ctx=await br.newContext({viewport:vp});let accepted=null,signedIn=null,signedUp=false;
  await ctx.route(/\/api\//,async r=>{const u=new URL(r.request().url()),p=u.pathname,m=r.request().method();
   if(/\/auth\/invite\/tok-good$/.test(p))return r.fulfill(J({email:`${SLUG}@biz.gulfcoastradar.com`,entity_slug:SLUG,business_name:'Pelican Grill'}));
   if(/\/auth\/invite\/tok-used$/.test(p))return r.fulfill(J({error:'This invite has already been used.'},409));
   if(/\/auth\/accept-invite$/.test(p)){accepted=JSON.parse(r.request().postData());return r.fulfill(J({token:'x'},201));}
   if(/business-auth\/password$/.test(p)){signedIn=JSON.parse(r.request().postData());signedUp=true;return r.fulfill(J({success:true,session:{access_token:'t',refresh_token:'r',user:{id:'u1',email:signedIn.identifier},expires_at:Math.floor(Date.now()/1000)+86400}}));}
   if(/\/business\/me$/.test(p))return signedUp?r.fulfill(J({slug:SLUG,name:'Pelican Grill',hasAccess:true,isAdmin:false})):r.fulfill(J({error:'no'},401));
   if(/\/business\/sections$/.test(p))return r.fulfill(J({slug:SLUG,sections,via:'rpc'}));
   if(/\/business\/schema$/.test(p))return r.fulfill(J({tables:Object.keys(sections),columns:{}}));
   if(/\/gcr\/entity\//.test(p))return r.fulfill(J({slug:SLUG,name:'Pelican Grill',description:'Casual seafood on the water.',city:'Orange Beach',phone:'+12515550123',menu_sections:[{id:'unsorted-menu-items',section_name:'Menu',synthetic:true,items:sections.menu_items}],hours:sections.entity_hours,photos:sections.entity_photos,tags:sections.entity_tags,faqs:sections.faqs}));
   return r.fulfill(J({}));});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  // bad link first
  await p.goto(BASE+'/?token=tok-used');await p.waitForTimeout(800);
  ok(vn+': used link explains itself and what to do',/doesn.t work/.test(await p.locator('body').innerText())&&/Ask whoever sent it/.test(await p.locator('body').innerText()));
  await p.goto(BASE+'/?token=tok-good');await p.waitForTimeout(900);
  let txt=await p.locator('body').innerText();
  ok(vn+': names the business',/Set up Pelican Grill/.test(txt));
  ok(vn+': shows the business login, not the internal address',/business login is\s+pelican-grill/i.test(txt)&&!/biz\.gulfcoastradar\.com/.test(txt),txt);
  await p.fill('input[autocomplete=new-password] >> nth=0','short');await p.fill('input[autocomplete=new-password] >> nth=1','short');await p.getByRole('button',{name:'Continue'}).click();
  ok(vn+': a too-short password is stopped (browser validation) and the form stays put',await p.locator('input[autocomplete=new-password] >> nth=0').evaluate(e=>!e.validity.valid)&&/Set up Pelican Grill/.test(await p.locator('body').innerText()));
  await p.fill('input[autocomplete=new-password] >> nth=0','longenough1');await p.fill('input[autocomplete=new-password] >> nth=1','different12');await p.getByRole('button',{name:'Continue'}).click();
  ok(vn+': mismatch rejected',/do not match/.test(await p.locator('body').innerText()));
  await p.fill('input[autocomplete=new-password] >> nth=1','longenough1');await p.getByRole('button',{name:'Continue'}).click();await p.waitForTimeout(300);
  ok(vn+': industry step',/What kind of business/.test(await p.locator('body').innerText()));
  await p.getByRole('button',{name:'Skip for now'}).click();await p.waitForTimeout(1800);
  ok(vn+': account accepted with the token and password',accepted&&accepted.token==='tok-good'&&accepted.password==='longenough1',accepted);
  ok(vn+': then signs in with the account address and the same password',signedIn&&/pelican-grill@biz/.test(signedIn.identifier)&&signedIn.password==='longenough1',signedIn);
  const dash=await p.locator('body').innerText();
  ok(vn+': lands in the dashboard, not a login or error',/Pelican Grill/.test(dash)&&!/doesn.t work|Sign in/.test(dash),dash.slice(0,200));
  ok(vn+': sections discovered from the data (menu, hours, photos, tags, FAQs)',['Menu','Hours','Photos','FAQ'].every(w=>new RegExp(w,'i').test(dash)),dash.slice(0,400));
  ok(vn+': no horizontal overflow',(await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=2);
  ok(vn+': no page errors',errs.length===0,errs);
  await p.screenshot({path:S+`shot-firstrun-${vn}.png`});
  await ctx.close();}
 await br.close();console.log(fails?fails+' failed':'all first-run checks passed');process.exit(fails?1:0);})();
