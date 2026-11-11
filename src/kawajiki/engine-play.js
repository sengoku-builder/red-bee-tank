/* 河川敷の少年野球 新しい試合エンジン ── 第2段「打つ・捕る・投げる」
   投球と打撃の物理（打った瞬間の計算）・守備の司令塔（捕りに行く子・ベースカバー・中継）・捕球とエラー・投げる先の判断・試合の進行
   走塁はまだ仮のかんたんな判断（第3段で作り直す）。 */
(function(root){
'use strict';
const KE=root.KE||require('./engine.js');
const{Y,sk,PROF,FIELD,basePos,isFair}=KE;
const hyp=Math.hypot,clamp=(v,a,b)=>v<a?a:v>b?b:v,DEG=Math.PI/180,RPM=Math.PI/30;

/* ---------- 投球と打撃の能力（調整はここに集める） ---------- */
Object.assign(PROF,{
  pitchV:s=>17+23*s/100,          // 球速 m/s（61〜144km/h）
  pitchErr:s=>0.08+0.40*Y(s),     // コースのずれ m（1σ）
  batV:s=>15+12*s/100,            // スイングの速さ m/s
  timeErr:s=>0.014+0.04*Y(s),    // タイミングのずれ 秒（1σ、球速25m/sのとき）
  vertErr:s=>0.026+0.05*Y(s),    // 上下のずれ m（1σ）
  spotErr:s=>0.035+0.09*Y(s),     // 芯からのずれ m（1σ）
  eye:s=>0.025+0.20*Y(s),         // 見きわめのずれ m（1σ）
  transfer:s=>0.22+0.45*Y(s),     // 捕ってから投げるまで 秒
  miss:s=>0.004+0.16*Y(s),        // 捕りそこないやすさ（ふつうの打球）
});
const ZONE={hw:0.25,lo:0.45,hi:1.05,mid:0.75},CONTACT=0.068,REL=[0,15.2,1.45];
KE.ZONE=ZONE;

/* ---------- 投球：狙い→ずれ ---------- */
KE.makePitch=function(P,cnt,rng){
  const s=sk(P,'thr'),y=Y(s),err=PROF.pitchErr(s);
  // うまい投手はコースの四すみを狙う。ボールが先行していたら真ん中へ
  let edge=cnt.b>=3?0.07:0.10+0.17*(1-y);
  // 追い込んだら、うまい投手はボール球で振らせにいく
  if(cnt.s===2&&cnt.b<3&&rng.chance(0.55*(1-y)))edge=0.36;
  const ax=(rng.chance(0.5)?1:-1)*rng.range(edge*0.55,edge),ah=ZONE.mid+rng.range(-1,1)*Math.min(0.32,edge*1.3);
  const v=PROF.pitchV(s)*(1+rng.gauss()*0.025);
  // 球の動き（打者には読みきれない）：うまい投手ほど大きい
  return{v,px:ax+rng.gauss()*err,ph:ah+rng.gauss()*err*0.9,aimX:ax,aimH:ah,mv:rng.gauss()*(0.03+0.03*s/100)};
};
KE.inZone=(px,ph)=>Math.abs(px)<=ZONE.hw&&ph>=ZONE.lo&&ph<=ZONE.hi;

/* ---------- 打者：振るか見逃すか、振ったらバットとボールがどう当たるか ---------- */
KE.swing=function(B,pitch,cnt,rng){
  const bs=sk(B,'bat'),iq=sk(B,'iq'),eye=PROF.eye((bs+iq)/2);
  const seeX=pitch.px+rng.gauss()*eye,seeH=pitch.ph+rng.gauss()*eye,seeIn=KE.inZone(seeX,seeH);
  let p=seeIn?[0.62,0.78,0.93][cnt.s]:[0.07,0.12,0.30][cnt.s]+0.22*Y(bs);
  if(cnt.b===3&&cnt.s===0)p*=0.35;
  if(!rng.chance(p))return{swing:false};
  const hand=B.lefty?-1:1,vp=pitch.v;
  const out=hand*pitch.px,                                     // ＋が外角
        dt=rng.gauss()*PROF.timeErr(bs)*(vp/25)+0.006*out/ZONE.hw, // ＋は振り遅れ（外角は少し遅れ気味）
        far=Math.max(0,Math.abs(pitch.px)-ZONE.hw*0.6)+Math.max(0,Math.abs(pitch.ph-ZONE.mid)-0.2),
        dv=rng.gauss()*(PROF.vertErr(bs)*(vp/30)+0.05*far)+(pitch.mv||0)*(1-0.5*bs/100),                // ＋はボールの下を叩く
        e=rng.gauss()*PROF.spotErr(bs)+0.22*out;                   // ＋はバットの先、−は根元
  const r={swing:true,dt,dv,e};
  if(Math.abs(dt)>0.062||Math.abs(dv)>=CONTACT)return r;     // 空振り
  const u=dv/CONTACT,fs=clamp(1-0.55*Math.pow(Math.abs(e)/0.12,2),0.22,1);
  const vb=PROF.batV(bs)*(1+rng.gauss()*0.04)*(1-2.5*Math.abs(dt));
  let v=Math.max(3,(0.2*vp+1.15*vb)*fs*(1-0.5*u*u));
  let va=(5+5*(1-Y(bs)))+Math.asin(clamp(u,-1,1))/DEG*0.88+rng.gauss()*2;
  let ang=hand*(1100*dt+14*out/ZONE.hw)+rng.gauss()*4;          // ＋が一塁側
  if(Math.abs(u)>0.72&&rng.chance(0.65)){ang+=180+rng.range(-35,35);va=rng.range(5,55);v*=0.6}  // かすって後ろへ
  const back=clamp(2600*u,-1800,3000),side=-ang*22;
  const ux=Math.sin(ang*DEG),uz=Math.cos(ang*DEG),c=Math.cos(va*DEG);
  Object.assign(r,{contact:true,u,v,va,ang,
    p:[pitch.px*0.5+hand*-0.05,0.35,pitch.ph],vel:[ux*v*c,uz*v*c,v*Math.sin(va*DEG)],w:[uz*back*RPM,-ux*back*RPM,side*RPM]});
  return r;
};

/* ---------- 守備の司令塔 ---------- */
const ROLE_PREF={4:{C:0,P:2.5},1:{'1B':0,P:0.8,'2B':1.2},2:{SS:0,'2B':0,P:3},3:{'3B':0,SS:1.5,P:2.5}};
const IF=['P','C','1B','2B','3B','SS'],OF=['LF','CF','RF'];
class Defense{
  constructor(w){this.w=w;this.F={};for(const f of w.fielders)this.F[f.role]=f;
    this.chaser=null;this.cover={};this.relay=null;this.nextPlan=0;this.decideAt=null;this.dove=new Set();this.tried=new Map();this.target=null;
    w.on('loose',()=>{this.nextPlan=w.t;this.decideAt=null});w.on('wall',()=>this.nextPlan=w.t);}
  reset(){this.chaser=null;this.cur=null;this.cover={};this.relay=null;this.nextPlan=this.w.t;this.decideAt=null;this.dove.clear();this.tried.clear();this.target=null;this.mis=0}
  setFielders(){this.F={};for(const f of this.w.fielders)this.F[f.role]=f;this.reset()}
  reachH(f){return KE.reachH(f)}
  // ボールに一番早く追いつける子を探す
  plan(){
    const w=this.w,b=w.ball,pr=KE.predict(b,10,0.05);this.pr=pr;this.planT=w.t;let best=null,second=null;
    const all=[];
    for(const f of w.fielders){
      let got=null;
      for(const q of pr){if(q[0]<0.08||q[3]>this.reachH(f))continue;if(w.ball.from===f&&q[0]<0.5)continue;
        const e=f.eta(q[1],q[2],1,0.55);if(e<=q[0]+0.02){got={f,t:q[0],x:q[1],z:q[2],air:q[5]===0&&q[4]==='air',slack:q[0]-e};break}}
      if(!got){const L=pr[pr.length-1];got={f,t:Math.max(L[0],f.eta(L[1],L[2])),x:L[1],z:L[2],air:false,late:true,slack:0}}
      all.push(got);
    }
    all.sort((a,c)=>a.t-c.t);
    // ほぼ同時に届くなら、余裕のある子。フライは外野手→内野手→投手・捕手の順にゆずる
    const pri=g=>(g.air?(OF.includes(g.f.role)?0.8:['P','C'].includes(g.f.role)?-0.6:0):0)+Math.min(g.slack,1.5);
    const near=all.filter(g=>g.t<=all[0].t+0.35);near.sort((a,c)=>pri(c)-pri(a));
    best=near[0];second=all.find(g=>g!==best);
    // ころころ変えない（0.25秒以上早い子がいたら交代）
    if(this.chaser&&this.chaser!==best.f){const cur=this.cur;if(cur&&cur.f===this.chaser&&cur.t<=best.t+0.25&&this.chaser.wait<=0){best=this.reEval(this.chaser,pr)||best}}
    if(this.chaser&&this.chaser!==best.f)this.chaser.stop();
    this.chaser=best.f;this.cur=best;best.f.goTo(best.x,best.z,{react:true});
    this.assign(best,second);
  }
  reEval(f,pr){for(const q of pr){if(q[0]<0.08||q[3]>this.reachH(f))continue;if(f.eta(q[1],q[2],1,0.55)<=q[0]+0.02)return{f,t:q[0],x:q[1],z:q[2]}}return null}
  // ベースカバー・中継・バックアップ
  assign(best,second){
    const w=this.w,F=this.F,busy=new Set([best.f]),cover={};
    const deep=hyp(best.x,best.z)>FIELD.infieldR+5;
    let relay=null;
    if(deep){const ss=F.SS,sb=F['2B'];relay=best.x<0?ss:sb;if(relay===best.f)relay=relay===ss?sb:ss;if(relay)busy.add(relay)}
    const pairs=[];
    for(const b of[4,1,2,3])for(const f of w.fielders){if(busy.has(f))continue;const pref=(ROLE_PREF[b]||{})[f.role];if(pref==null&&!(OF.includes(f.role)))continue;
      const[bx,bz]=basePos(b);pairs.push({b,f,c:f.eta(bx,bz)*0.6+(pref??6)})}
    pairs.sort((a,c)=>a.c-c.c);
    for(const p of pairs){if(cover[p.b]||busy.has(p.f))continue;cover[p.b]=p.f;busy.add(p.f)}
    this.cover=cover;this.relay=relay;
    for(const b in cover){const f=cover[b],[bx,bz]=basePos(+b);if(f!==w.ball.holder)f.goTo(bx,bz,{react:true})}
    if(relay){const tb=this.relayTarget(),[tx,tz]=basePos(tb),k=0.42;relay.goTo(best.x+(tx-best.x)*k,best.z+(tz-best.z)*k,{react:true})}
    // 外野の打球は隣の外野手がうしろへ回る
    if(deep&&second&&OF.includes(second.f.role)&&!busy.has(second.f)){const d=hyp(best.x,best.z)||1;second.f.goTo(best.x*(d+6)/d,best.z*(d+6)/d,{react:true,frac:0.9});busy.add(second.f)}
    // ほかの子は定位置近くで様子を見る
    for(const f of w.fielders)if(!busy.has(f)&&f!==best.f&&f!==w.ball.holder){const[px,pz]=FIELD.pos[f.role];if(f.tx==null&&f.dist(px,pz)>3)f.goTo(px,pz,{frac:0.6})}
  }
  relayTarget(){const w=this.w,live=w.liveRunners.filter(r=>!r.rb.isBatter);
    if(live.some(r=>r.rb.base>=2))return 4;if(live.some(r=>r.rb.base===1))return 3;return 2}
  // 捕れるかどうか：手の届く範囲に来た瞬間に決める
  tryCatch(f,dive){
    const w=this.w,b=w.ball,t=w.t;
    const thrown=b.src==='throw',fly=b.state==='air'&&b.bounces===0&&!b.wall&&!thrown,rel=hyp(b.vx-f.vx,b.vz-f.vz,b.vh);
    const s=sk(f,'fld'),base=PROF.miss(s);
    let diff=thrown?0.35:fly?0.6+f.speed/7:b.state==='ground'||b.state==='rest'?0.5+rel/14:0.9+rel/12;   // はねるゴロは難しい
    if(b.state==='rest')diff=0.15;
    if(b.h>1.9)diff*=1.6;if(dive)diff=diff*2.2+1.2;
    const pFail=clamp(base*diff,0,0.92);
    if(!w.rng.chance(pFail)){w.give(f,fly?'catch':'pickup');if(dive)w.emit('diveCatch',{who:f.id});return true}
    // 失敗：はじく・トンネル・落とす
    const rec=(dive?1.0:0.35)+0.4*Y(s);f.wait=Math.max(f.wait,rec);this.tried.set(f,t+rec);
    let kind;
    if(thrown&&w.rng.chance(0.6))kind='through';
    else if(!fly&&b.state!=='rest'&&w.rng.chance(0.45))kind='through';
    else{kind=fly?'drop':'bobble';const a=w.rng.range(0,Math.PI*2),sp=fly?w.rng.range(0.8,2.5):w.rng.range(1.2,3.5);
      w.release([f.x+Math.sin(a)*0.4,f.z+Math.cos(a)*0.4,Math.max(0.3,Math.min(b.h,1.2))],[Math.sin(a)*sp,Math.cos(a)*sp,fly?0.5:1.2],null,'deflect')}
    w.emit('error',{who:f.id,role:f.role,kind,dive:!!dive});
    this.nextPlan=t;return false;
  }
  tick(){
    const w=this.w,b=w.ball,t=w.t;if(b.state==='out')return;
    if(b.state!=='held'){
      if(t>=this.nextPlan){this.nextPlan=t+0.3;this.plan()}
      // 手の届く範囲に来た子が捕る（投げた本人・失敗した直後の子はのぞく）
      for(const f of w.fielders){if(!w.canCatch(f))continue;const tr=this.tried.get(f);if(tr!=null&&t<tr)continue;
        const d=hyp(b.x-f.x,b.z-f.z);if(d<0.75&&b.h<this.reachH(f)){this.tryCatch(f,false);return}}
      // 飛びつき：追いかけている子の横を抜けそうなとき、一度だけ
      // 横を抜けていく打球には飛びつく（一度だけ）
      if(b.h<1.5&&b.src!=='throw')for(const c of w.fielders){if(this.dove.has(c)||c.wait>0||c.role==='C'||!w.canCatch(c))continue;const tr=this.tried.get(c);if(tr!=null&&t<tr)continue;
        const d=hyp(b.x-c.x,b.z-c.z),dn=hyp(b.x+b.vx*0.05-c.x,b.z+b.vz*0.05-c.z);
        if(d<1.9&&d>=0.75&&dn>d){this.dove.add(c);c.x+=(b.x-c.x)*0.6;c.z+=(b.z-c.z)*0.6;w.emit('dive',{who:c.id});
          if(!this.tryCatch(c,true)){c.wait=Math.max(c.wait,1.1)}else c.wait=0.6;return}}
      return;
    }
    const h=b.holder;if(!h||h.side!=='F')return;
    if(this.decideAt==null){this.decideAt=t+PROF.transfer(sk(h,'fld'))+(this.flyOF(h)?0.15:0);this.target=null;h.stop();this.assignHeld(h)}
    if(t<this.decideAt)return;
    this.act(h);
  }
  flyOF(h){return OF.includes(h.role)}
  // ボールを持っているあいだのカバー（持った子以外）
  assignHeld(h){const w=this.w,busy=new Set([h]),pairs=[];
    for(const b of[4,1,2,3])for(const f of w.fielders){if(busy.has(f))continue;const pref=(ROLE_PREF[b]||{})[f.role];if(pref==null)continue;const[bx,bz]=basePos(b);pairs.push({b,f,c:f.eta(bx,bz)*0.6+pref})}
    pairs.sort((a,c)=>a.c-c.c);const cover={};for(const p of pairs){if(cover[p.b]||busy.has(p.f))continue;cover[p.b]=p.f;busy.add(p.f)}
    this.cover=cover;for(const b in cover){const[bx,bz]=basePos(+b);if(cover[b].dist(bx,bz)>0.3)cover[b].goTo(bx,bz)}
    // 中継：外野の深いところから遠い塁へ
    const d=hyp(h.x,h.z);this.relay=null;
    if(d>FIELD.infieldR+5){const rf=h.x<0?this.F.SS:this.F['2B'];if(rf&&rf!==h&&!Object.values(cover).includes(rf)){this.relay=rf}}
  }
  // 投げる時間の見込み
  throwT(h,x,z){const v=PROF.armV(sk(h,'thr')),d=hyp(x-h.x,z-h.z);return d/(v*0.86)+0.05}
  armRange(h){const v=PROF.armV(sk(h,'thr'));return v*v/9.8*0.62}
  // 投げる先を決める：ランナーより先にボールが着く塁。なければ中継・内野へ返す
  act(h){
    const w=this.w,U=w.umpire,live=w.liveRunners,t=w.t,cands=[];
    for(const r of live){
      let b;
      if(r.rb.mustRetouch)b=r.rb.start;
      else if(U.forced(r))b=r.rb.forceBase;
      else if(U.onBase(r)&&r.tx==null)continue;
      else b=this.headingTo(r)??U.nextBase(r);
      if(b==null||b>4)continue;
      const[bx,bz]=basePos(b);if(b<=r.rb.base&&!r.rb.mustRetouch&&U.onBase(r))continue;
      const rt=this.runnerT(r,b);
      const c=this.cover[b];
      let bt,how;
      if(h.dist(bx,bz)<5||!c){bt=h.eta(bx,bz);how='run'}
      else{bt=this.throwT(h,bx,bz);how='throw';if(c.eta(bx,bz)>bt)bt=c.eta(bx,bz)}
      const force=U.forced(r)||r.rb.mustRetouch,need=force?0.05:0.25;
      // 目の前（数m以内）の飛び出したランナーには走ってタッチ
      if(!force&&!U.onBase(r)&&h.dist(r.x,r.z)<4.5){cands.push({r,b,how:'tag',m:1,val:5});continue}
      if(rt-bt>need)cands.push({r,b,how,m:rt-bt,val:({4:4,3:3,2:2,1:1})[b]+(force?0.5:0)+Math.min(1,rt-bt)*0.3});
    }
    cands.sort((a,c)=>c.val-a.val);
    let pick=cands[0];
    // 野球の頭が弱い子は、ときどき投げる塁をまちがえる・迷う
    const iq=sk(h,'iq');
    if(pick&&cands.length>1&&!this.mis&&w.rng.chance(0.3*Y(iq))){this.mis=1;pick=cands[1+((w.rng()*(cands.length-1))|0)];w.emit('misjudge',{who:h.id})}
    if(pick&&pick.how==='tag'){h.goTo(pick.r.x,pick.r.z);this.decideAt=t+0.1;return}
    if(pick&&pick.how==='run'){const[bx,bz]=basePos(pick.b);h.goTo(bx,bz);this.decideAt=t+0.15;return}
    if(pick){this.throwTo(h,this.cover[pick.b],pick.b);return}
    // アウトにできる塁がない：走っているランナーの先の塁へ。外野なら中継か内野へ返す
    const mv=live.filter(r=>r.speed>0.5&&r.tx!=null).sort((a,c)=>c.rb.base-a.rb.base)[0];
    if(mv){const nb=Math.min(4,this.headingTo(mv)||mv.rb.base+1),c=this.cover[nb];if(c&&c!==h){this.throwTo(h,c,nb);return}}
    if(hyp(h.x,h.z)>FIELD.infieldR+4){const tgt=this.relay||this.nearestIF(h);if(tgt){this.throwTo(h,tgt,null);return}}
    // 内野で持っている：ピッチャーへ返すか、そのまま持って止まる（プレーの区切り）
    if(live.some(r=>r.speed>0.5)){this.decideAt=t+0.2;return}
    this.decideAt=t+0.5;
  }
  headingTo(r){if(r.tx==null)return null;for(let b=1;b<=4;b++){const[bx,bz]=basePos(b);if(hyp(r.tx-bx,r.tz-bz)<0.6)return b}return null}
  runnerT(r,b){const[bx,bz]=basePos(b);const d=r.dist(bx,bz);const toward=r.speed>0.3?(r.vx*(bx-r.x)+r.vz*(bz-r.z))/(d||1):0;
    if(toward<-0.3)return 9;return r.eta(bx,bz)}
  nearestIF(h){let best=null,bd=1e9;for(const f of this.w.fielders){if(f===h||!['SS','2B','3B','1B','P'].includes(f.role))continue;const d=f.dist(h.x,h.z);if(d<bd){bd=d;best=f}}return best}
  throwTo(h,c,b){
    const w=this.w;let x=c.x,z=c.z;
    // 塁へ投げるときは、受ける子が間に合うなら塁の上へ。受ける子はそこへ向かう
    if(b!=null){const[bx,bz]=basePos(b);if(c.dist(bx,bz)<3||c.eta(bx,bz)<=this.throwT(h,bx,bz)+0.1){x=bx;z=bz}}
    // 肩が届かない遠投は中継へ
    const d=hyp(x-h.x,z-h.z);
    if(d>this.armRange(h)){const r=this.relay&&this.relay!==h&&this.relay!==c?this.relay:null;if(r&&r.dist(h.x,h.z)<d-6){x=r.x;z=r.z;c=r}}
    if(c.dist(x,z)>0.3)c.goTo(x,z);
    w.throwTo(h,[x,z,1.25]);this.decideAt=null;w.emit('throwTarget',{from:h.id,to:c.id,base:b});
    this.nextPlan=w.t;
  }
}
KE.Defense=Defense;

/* ---------- 仮の走塁（第3段で作り直す） ---------- */
class Running{
  constructor(w,def){this.w=w;this.def=def;this.flyHold=new Set();
    w.on('flyCatch',()=>{for(const r of w.liveRunners){r.plan=null;r.stop()}});
    w.on('hr',()=>this.award());w.on('groundRule',()=>this.award());w.on('overthrow',()=>this.award());}
  reset(){for(const r of this.w.runners){r.plan=null;r.route=null}}
  award(){for(const r of this.w.liveRunners){r.stop();r.route=[];for(let b=r.rb.base+1;b<=r.rb.awardTo;b++)r.route.push(b)}}
  // ボールがその塁に着くまでの見込み
  ballT(b){const w=this.w,d=this.def,ball=w.ball,[bx,bz]=basePos(b);
    if(ball.state==='held'&&ball.holder&&ball.holder.side==='F'){const h=ball.holder;return Math.max(0,(d.decideAt||w.t)-w.t)+(h.dist(bx,bz)<5?h.eta(bx,bz):d.throwT(h,bx,bz))}
    const c=d.cur;if(!c)return 9;const left=Math.max(0,c.t-(w.t-(d.planT||w.t)));
    return left+0.2+PROF.transfer(sk(c.f,'fld'))+hyp(bx-c.x,bz-c.z)/(PROF.armV(sk(c.f,'thr'))*0.86)}
  tick(){
    const w=this.w,U=w.umpire,p=U.play;if(!p||U.ended)return;
    for(const r of w.liveRunners){
      if(r.route&&r.route.length){if(r.tx==null){const b=r.route[0];if(r.rb.base>=b){r.route.shift();continue}const[bx,bz]=basePos(b);r.goTo(bx,bz,{react:true})}continue}
      if(p.dead)continue;
      if(r.rb.mustRetouch){this.go(r,r.rb.start);continue}
      const flying=p.fly&&w.ball.state==='air'&&w.ball.bounces===0&&w.ball.src==='bat';
      const pf=r.rb.forceBase&&r.rb.base<r.rb.forceBase&&!p.flyCaught&&p.fair!==false&&(()=>{let f=r.rb.forcer;while(f){if(f.rb.out)return false;f=f.rb.forcer}return true})();
      if(r.rb.isBatter&&r.rb.base===0&&!r.rb.out){this.go(r,1);continue}
      if(pf&&flying){if(r.plan==null){r.plan=-1;const[ax,az]=basePos(r.rb.base),[cx,cz]=basePos(r.rb.forceBase);r.goTo((ax+cx)/2,(az+cz)/2,{react:true})}continue}
      if(pf){this.go(r,r.rb.forceBase);continue}
      const lb=U.legalBase(r);
      if(flying){if(r.plan==null&&r.rb.base===lb){const[bx,bz]=basePos(lb);if(r.dist(bx,bz)>0.3)r.goTo(bx,bz)}continue}
      if(r.plan===-1)r.plan=null;
      // 前のランナーが行く（いる）塁より先へは行かない
      const lead=w.liveRunners.filter(q=>q!==r&&q.rb.start>r.rb.start).map(q=>q.plan>0?q.plan:U.legalBase(q));
      const cap=lead.length?Math.min(...lead):5;
      if(r.plan>0&&r.plan>=cap&&r.plan<4){r.plan=null;const[bx,bz]=basePos(lb);r.goTo(bx,bz);continue}
      if(r.plan!=null){
        // 途中：ボールに負けそうなら戻る（半分より手前だけ）
        const[ax,az]=basePos(r.rb.base),[cx,cz]=basePos(r.plan),frac=1-hyp(r.x-cx,r.z-cz)/FIELD.bd;
        if(r.rb.base<r.plan&&frac<0.45&&this.ballT(r.plan)-r.eta(cx,cz)<0.2){r.plan=null;r.goTo(ax,az);continue}
        if(r.rb.base>=r.plan){r.plan=null}else if(r.tx==null)r.goTo(cx,cz);
        continue}
      if(r.tx!=null||r.rb.base>=4)continue;
      // 塁の上：次の塁へ行けるか（少年野球らしく慎重め＝行けたのに行かないが多い）
      const nb=r.rb.base+1,[cx,cz]=basePos(nb);
      if(nb>=cap&&nb<4)continue;
      const margin=this.ballT(nb)-r.eta(cx,cz),need=0.2+0.7*Y(sk(r,"iq"));
      if(margin>need){r.plan=nb;r.goTo(cx,cz,{react:true})}
      else if(r.rb.base>0){const[bx,bz]=basePos(r.rb.base);if(r.dist(bx,bz)>0.3)r.goTo(bx,bz)}
    }
  }
  go(r,b){if(r.plan!==b){r.plan=b;const[bx,bz]=basePos(b);r.goTo(bx,bz,{react:true})}else if(r.tx==null&&r.rb.base<b){const[bx,bz]=basePos(b);r.goTo(bx,bz)}}
}
KE.Running=Running;

/* ---------- 試合の進行 ---------- */
const POSN=['P','C','1B','2B','3B','SS','LF','CF','RF'];
function mkTeam(name,lv,rng,n=9){const ps=[];for(let i=0;i<n;i++){const s={};for(const k of['bat','fld','thr','run','iq'])s[k]=Math.round(clamp(lv+rng.range(-12,12),5,99));
  ps.push({id:`${name}${i+1}`,name:`${name}${i+1}`,sk:s,lefty:rng.chance(0.2),pos:POSN[i]})}return{name,players:ps}}
KE.mkTeam=mkTeam;
class Game{
  constructor(o){this.o=Object.assign({innings:7,seed:1,record:false,maxRunsHalf:99},o);this.rng=KE.makeRng(this.o.seed*13+7);
    this.w=new KE.World({seed:this.o.seed,record:this.o.record});this.ck=new KE.Checker(this.w);this.teams=this.o.teams;
    this.order=[0,0];this.line=[[],[]];this.stat={runs:[0,0],H:[0,0],E:[0,0],K:[0,0],BB:[0,0],HR:[0,0],pitches:0,PA:0,contacts:[]};this.plays=[];
    this.w.on('error',e=>{this.playErr=(this.playErr||0)+1});}
  setDefense(ti){const w=this.w,T=this.teams[ti];
    w.fielders=T.players.slice(0,9).map(p=>{const f=new KE.Player({id:p.id,name:p.name,role:p.pos,sk:p.sk,lefty:p.lefty,team:ti});const[x,z]=FIELD.pos[p.pos];f.x=x;f.z=z;f.side='F';return f});
    if(!this.def){this.def=new Defense(w);this.run_=new Running(w,this.def)}else this.def.setFielders();}
  resetField(){const w=this.w;for(const f of w.fielders){const[x,z]=FIELD.pos[f.role];f.x=x;f.z=z;f.vx=f.vz=0;f.stop();f.wait=0}
    w.runners=w.runners.filter(r=>!r.rb.out&&!r.rb.scored&&r.rb.base>0);for(const r of w.runners){const[x,z]=basePos(r.rb.base);r.x=x;r.z=z;r.vx=r.vz=0;r.stop();r.rb.isBatter=false;r.plan=null;r.route=null}
    for(const p of[...w.fielders,...w.runners])p.awake=false;
    const P=this.def.F.P;w.ball.state='held';w.ball.holder=P;w.ball.x=P.x;w.ball.z=P.z;w.ball.h=1.1;w.umpire.play=null;w.umpire.ended=true;}
  run(){
    const o=this.o;let inn=1;
    for(;inn<=o.innings||this.stat.runs[0]===this.stat.runs[1]&&inn<=o.innings+2;inn++){
      for(let half=0;half<2;half++){
        if(half===1&&inn>=o.innings&&this.stat.runs[1]>this.stat.runs[0])break;
        this.half(inn,half);
        if(half===1&&inn>=o.innings&&this.stat.runs[1]>this.stat.runs[0])break;
        if(this.w.t>4*3600)return this.done(inn);
      }
      if(inn>=o.innings&&this.stat.runs[0]!==this.stat.runs[1])break;
    }
    return this.done(Math.min(inn,o.innings+2));
  }
  done(inn){this.stat.innings=inn;this.stat.viol=this.ck.v;this.stat.simT=this.w.t;return this.stat}
  half(inn,half){
    const w=this.w;w.half=half;w.outs=0;w.runners=[];this.setDefense(1-half);
    const start=w.score[half];
    while(w.outs<3){
      if(w.score[half]-start>=this.o.maxRunsHalf)break;
      if(half===1&&inn>=this.o.innings&&w.score[1]>w.score[0])break;
      this.atBat(inn,half);
    }
    this.stat.runs[half]=w.score[half];
  }
  atBat(inn,half){
    const w=this.w,T=this.teams[half],pl=T.players[this.order[half]%9];this.order[half]++;this.stat.PA++;
    const B=new KE.Player({id:pl.id,name:pl.name,sk:pl.sk,lefty:pl.lefty,team:half});B.x=B.lefty?0.95:-0.95;B.z=0;
    const cnt={b:0,s:0},P=()=>this.def.F.P;
    while(true){
      this.resetField();
      const pitch=KE.makePitch(P(),cnt,this.rng);this.stat.pitches++;
      // 投球を物理で飛ばす
      const aim=KE.aimThrow(REL,[pitch.px,0.3,pitch.ph],pitch.v),c=Math.cos(aim.el);
      w.ball.holder=null;w.ball.launch(REL,[Math.sin(aim.yaw)*pitch.v*c,Math.cos(aim.yaw)*pitch.v*c,pitch.v*Math.sin(aim.el)],[Math.cos(aim.yaw)*150,-Math.sin(aim.yaw)*150,0],'pitch');
      w.ball.from=P();w.ball.relT=w.t;
      const sw=KE.swing(B,pitch,cnt,this.rng);
      let guard=0;while(w.ball.z>0.35&&w.ball.state==='air'&&guard++<300)w.step();
      const inZ=KE.inZone(pitch.px,pitch.ph);
      if(!sw.swing||!sw.contact){
        const C=this.def.F.C;w.ball.state='held';w.ball.holder=C;
        if(sw.swing||inZ){cnt.s++;if(cnt.s>=3){w.outs++;this.stat.K[half]++;w.emit('out',{who:B.id,name:B.name,outType:'strike',outs:w.outs});this.log(inn,half,B,'三振');return}}
        else{cnt.b++;if(cnt.b>=4){this.walk(B);this.stat.BB[half]++;this.log(inn,half,B,'フォアボール');return}}
        for(let i=0;i<30;i++)w.step();
        continue;
      }
      // 打った
      this.stat.contacts.push({v:sw.v,va:sw.va,ang:sw.ang});
      const res=this.play(B,sw,inn,half);
      if(res==='foul'){if(cnt.s<2)cnt.s++;continue}
      return;
    }
  }
  walk(B){const w=this.w,occ=b=>w.runners.find(r=>r.rb.base===b&&!r.rb.out&&!r.rb.scored);
    // 押し出し：一塁から続いているランナーだけ1つずつ進む
    const chain=[];for(let b=1;b<=3;b++){const r=occ(b);if(r)chain.push(r);else break}
    for(const r of chain.reverse()){r.rb.base++;if(r.rb.base===4){r.rb.scored=true;w.score[w.half]++;w.emit('home',{who:r.id,name:r.name,walk:true})}}
    w.addRunner(B,1,false);w.emit('walk',{who:B.id});
  }
  play(B,sw,inn,half){
    const w=this.w;this.playErr=0;
    B.x=B.lefty?0.95:-0.95;B.z=0;B.vx=B.vz=0;B.stop();B.wait=0;B.plan=null;B.route=null;B.awake=false;
    w.runners.push(B);B.side='R';B.rb={base:0,start:0,isBatter:true,out:false,scored:false,forceBase:null,forcer:null,mustRetouch:false,arr:{},judged:{}};
    this.def.reset();this.run_.reset();
    const f0=w.frames.length,t0=w.t,outs0=w.outs,s0=w.score[half];
    w.umpire.startPlay({batted:true});
    w.release(sw.p,sw.vel,sw.w,'bat');w.emit('contact',{v:+(sw.v*3.6).toFixed(0),va:+sw.va.toFixed(0),ang:+sw.ang.toFixed(0)});
    let n=0;while(!w.umpire.ended&&n++<60*70){this.def.tick();this.run_.tick();w.step()}
    if(!w.umpire.ended){this.ck.bad('stall','プレーが70秒以上終わらない');w.umpire.endPlay('time')}
    const L=w.log.filter(e=>e.t>=t0),end=L.find(e=>e.type==='playEnd');
    if(end&&end.why==='foul'){w.runners=w.runners.filter(r=>r!==B);if(w.record)w.frames.length=f0;return'foul'}
    // 記録：エラー・ヒット・ホームラン
    this.stat.E[1-half]+=this.playErr;
    const bOut=B.rb.out,hr=L.some(e=>e.type==='hr');
    let txt;
    if(hr){this.stat.HR[half]++;this.stat.H[half]++;txt='ホームラン'}
    else if(bOut){const o=L.find(e=>e.type==='out'&&e.who===B.id);txt=o&&o.outType==='fly'?'フライアウト':'ゴロアウト'}
    else if(this.playErr)txt='エラーで出塁';
    else if(L.some(e=>e.type==='out'))txt='フィルダースチョイス';
    else{this.stat.H[half]++;txt=['','ヒット','二塁打','三塁打','ランニングホームラン'][B.rb.scored?4:B.rb.base]||'ヒット';if(L.some(e=>e.type==='groundRule'))txt='エンタイトル二塁打'}
    const runs=w.score[half]-s0;
    this.log(inn,half,B,txt+(runs?`（${runs}点）`:'')+(this.playErr?`・エラー${this.playErr}`:''),{f0,f1:w.frames.length,t0,t1:w.t,ev:L});
    return txt;
  }
  log(inn,half,B,txt,ex={}){this.plays.push({inn,half,who:B.name,txt,outs:this.w.outs,score:[...this.w.score],...ex})}
}
KE.Game=Game;

if(typeof module!=='undefined'&&module.exports)module.exports=KE;
})(typeof window!=='undefined'?window:globalThis);
