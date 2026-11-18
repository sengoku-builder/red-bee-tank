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
  pitchV:s=>12.5+17.5*s/100,      // 球速 m/s（学童：能力30約64km/h・60約83km/h・S約105km/h）
  pitchErr:s=>0.17+0.30*Y(s),     // コースのずれ m（1σ）
  batV:s=>18+12*s/100,             // スイングの速さ m/s
  timeErr:s=>0.014+0.04*Y(s),    // タイミングのずれ 秒（1σ、球速25m/sのとき）
  vertErr:s=>0.026+0.05*Y(s),    // 上下のずれ m（1σ）
  spotErr:s=>0.035+0.09*Y(s),     // 芯からのずれ m（1σ）
  eye:s=>0.025+0.20*Y(s),         // 見きわめのずれ m（1σ）
  transfer:s=>0.75+0.9*Y(s),       // 捕ってから投げるまで 秒（転がるボールを拾ったら＋0.2。S約0.7・60約1.0・30約1.3）
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
  return{v,px:ax+rng.gauss()*err,ph:ah+rng.gauss()*err*0.9,aimX:ax,aimH:ah,mv:rng.gauss()*(0.04+0.05*s/100)};
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
        dv=rng.gauss()*(PROF.vertErr(bs)*(vp/30)+0.05*far)+(pitch.mv||0)*(1-0.75*bs/100),                // ＋はボールの下を叩く
        e=rng.gauss()*PROF.spotErr(bs)+0.22*out;                   // ＋はバットの先、−は根元
  const r={swing:true,dt,dv,e};
  if(Math.abs(dt)>0.062||Math.abs(dv)>=CONTACT)return r;     // 空振り
  const u=dv/CONTACT,fs=clamp(1-0.55*Math.pow(Math.abs(e)/0.12,2),0.22,1);
  const vb=PROF.batV(bs)*(1+rng.gauss()*0.04)*(1-2.5*Math.abs(dt));
  let v=Math.max(3,(0.2*vp+1.15*vb)*fs*(1-0.5*u*u));
  let va=(5+5*(1-Y(bs)))+Math.asin(clamp(u,-1,1))/DEG*0.88+rng.gauss()*2;
  let ang=hand*(1100*dt+14*out/ZONE.hw)+rng.gauss()*4;          // ＋が一塁側
  if(va<6)v*=0.85-0.01*Math.max(0,-va)/2;   // 上をたたいたゴロは勢いが逃げる（学童のゴロの速さ）
  if(Math.abs(u)>0.72&&rng.chance(0.65)){ang+=180+rng.range(-35,35);va=rng.range(5,55);v*=0.6}  // かすって後ろへ
  const back=clamp(2600*u,-1800,3000),side=-ang*22;
  const ux=Math.sin(ang*DEG),uz=Math.cos(ang*DEG),c=Math.cos(va*DEG);
  Object.assign(r,{contact:true,u,v,va,ang,
    p:[pitch.px*0.5+hand*-0.05,0.35,pitch.ph],vel:[ux*v*c,uz*v*c,v*Math.sin(va*DEG)],w:[uz*back*RPM,-ux*back*RPM,side*RPM]});
  return r;
};

/* ---------- バント：バットに当てて勢いを殺す。うまいほど転がす場所を選べて、失敗（空振り・ファウル・小フライ）が少ない ---------- */
KE.bunt=function(B,pitch,cnt,rng,must){
  const bs=sk(B,'bat'),y=Y(bs),inZ=KE.inZone(pitch.px,pitch.ph);
  if(!inZ&&!must&&rng.chance(0.85))return{swing:false,bunt:true};        // ボール球はバットを引く
  if(rng.chance(0.08+0.35*y+(inZ?0:0.25)))return{swing:true,bunt:true,contact:false};   // 当たらない
  const hand=B.lefty?-1:1,side=rng.chance(0.5)?1:-1;
  let ang=side*rng.range(12,30)+rng.gauss()*(4+18*y),va=-6+rng.gauss()*(5+14*y),v=rng.range(6,9)*(1+rng.gauss()*0.12)*(1+0.7*y*rng());
  if(rng.chance(0.06+0.2*y)){va=rng.range(25,60);v=rng.range(8,13)}            // 小フライ
  if(rng.chance(0.08+0.15*y))ang=side*rng.range(46,80);                         // ファウル
  const ux=Math.sin(ang*DEG),uz=Math.cos(ang*DEG),c=Math.cos(va*DEG);
  return{swing:true,bunt:true,contact:true,v,va,ang,p:[pitch.px*0.5+hand*-0.05,0.35,pitch.ph],vel:[ux*v*c,uz*v*c,v*Math.sin(va*DEG)],w:[0,0,0]}};
// 送球にかかる時間（実際の弾道で計算し、距離と球速ごとに覚えておく）
const TT=new Map();
KE.throwTime=function(d,v){const k=Math.round(d)*1000+Math.round(v);let t=TT.get(k);
  if(t==null){t=d<1?0.05:KE.aimThrow([0,0,1.6],[0,Math.round(d)||1,1.2],Math.round(v)).t+0.05;TT.set(k,t)}return t};
/* ---------- 守備の司令塔 ---------- */
const ROLE_PREF={4:{C:0,P:2.5},1:{'1B':0,P:0.8,'2B':1.2},2:{SS:0,'2B':0,P:3},3:{'3B':0,SS:1.5,P:2.5}};
const IF=['P','C','1B','2B','3B','SS'],OF=['LF','CF','RF'];
class Defense{
  constructor(w){this.w=w;this.F={};this.involved=new Set();for(const f of w.fielders)this.F[f.role]=f;
    this.chaser=null;this.cover={};this.relay=null;this.nextPlan=0;this.decideAt=null;this.dove=new Set();this.tried=new Map();this.target=null;
    w.on('loose',()=>{this.nextPlan=w.t;this.decideAt=null});w.on('pickup',e=>{if(OF.includes(e.role))this.ofTouched=true});w.on('catch',e=>{if(OF.includes(e.role))this.ofTouched=true});w.on('wall',()=>this.nextPlan=w.t);}
  reset(){this.ofTouched=false;this.lockRelay=null;this.firstPlan=true;this.lunge=null;this.involved=new Set();this.lastThrow=null;this.chaser=null;this.cur=null;this.cover={};this.relay=null;this.cut=null;this.nextPlan=this.w.t;this.decideAt=null;this.dove.clear();this.tried.clear();this.target=null;this.mis=0}
  // 外野の深さ：打者が強いほど下がる（レフト・ライト 能力30約46m・60約50m・S約54m、センターは+7m）
  setDepth(bat){const r=42+13*bat/100,o={};for(const[role,cr]of[['LF',r],['RF',r],['CF',r+7]]){const[x,z]=FIELD.pos[role],d=hyp(x,z);o[role]=[x*cr/d,z*cr/d]}this.opos=o}
  posOf(role){return this.opos&&this.opos[role]||FIELD.pos[role]}
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
    this.chaser=best.f;this.cur=best;best.f.goTo(best.x,best.z,{react:true});this.involved.add(best.f);
    this.assign(best,second);
  }
  reEval(f,pr){for(const q of pr){if(q[0]<0.08||q[3]>this.reachH(f))continue;if(f.eta(q[1],q[2],1,0.55)<=q[0]+0.02)return{f,t:q[0],x:q[1],z:q[2]}}return null}
  // 役割表（設計書「守備の役割表」）：打球の位置とランナーの状況から、ベースカバーと中継を決める
  roleTable(px,pz,chaser,deep){
    const F=this.F,used=new Set([chaser]),cover={},right=px>=-1;   // センターラインを含めて右
    const take=(b,list)=>{if(cover[b])return cover[b];for(const r of list){const f=F[r];if(f&&!used.has(f)){cover[b]=f;used.add(f);return f}}return null};
    let relay=null;
    if(deep&&this.lockRelay&&this.lockRelay!==chaser){relay=this.lockRelay;used.add(relay)}   // 一度決まった中継は途中で入れ替えない
    else if(deep){const tb=this.relayTarget(),hit=!this.lastThrow&&hyp(px,pz)<56;   // 外野手が前で捕るふつうのヒット・タッチアップ（悪送球の処理・フェンスまでの長打は除く）
      if(tb===4&&hit&&px<-12)relay=F['3B'];                // レフトからの本塁：サード
      else if(tb===4&&hit&&px>12)relay=F['1B'];            // ライトからの本塁：ファースト
      else{const near=right?F['2B']:F.SS,far=right?F.SS:F['2B'];
        // 近いほうの二遊間（センターから左はショート、右はセカンド）。その子がこの打球を捕りに行く役のときだけもう一人
        relay=near===chaser?far:near}
      if(relay===chaser)relay=null;if(relay){used.add(relay);this.lockRelay=relay}}
    const on23=this.w.liveRunners.some(r=>r.rb.base>=2||(r.plan||0)>=3);   // 打者走者が二塁より先へ来ても本塁は空けない
    if(deep||on23)take(4,['C','P']);   // 二塁・三塁にランナーがいなければ、内野ゴロでキャッチャーは一塁の後ろへ
    if(relay===F['1B'])take(1,['2B','P']);else take(1,['1B','P','2B']);
    const pl=this.w.umpire.play;
    // バント（打者がバントの構えで当てたときだけ。場所では決めない）：前に出たファーストの代わりにセカンドが一塁、二塁はショート
    const bunt=this.buntPlay&&pl&&pl.batted&&!deep&&hyp(px,pz)<15;
    if(bunt){const f1=F['1B'],f2=F['2B'],[bx,bz]=basePos(1),cur=cover[1];
      if(f2&&!used.has(f2)&&(chaser===f1||cur===f1&&f1.eta(bx,bz)>f2.eta(bx,bz))){if(cur&&cur!==f1)used.delete(cur);cover[1]=f2;used.add(f2)}
      take(2,['SS','2B'])}
    if(pl&&!pl.batted&&this.batLefty!=null)take(2,this.batLefty?['SS','2B']:['2B','SS']);   // 盗塁：右打者ならセカンド、左打者ならショートが二塁へ
    take(2,right?['SS','2B']:['2B','SS']);
    const anyOn=this.w.liveRunners.some(r=>!r.rb.isBatter);
    if(chaser===F['3B']&&!deep){if(anyOn)take(3,['P'])}   // サードゴロ：ショートはサードの後ろ、三塁はランナーがいるときだけピッチャー
    else take(3,['3B','SS','P']);
    if(!cover[2]){if(deep){if(relay&&[F.SS,F['2B']].includes(relay)){cover[2]=relay;relay=null}}else take(2,['P'])}   // 二塁を空けない（外野の打球でピッチャーは入らない）
    return{cover,relay,used};
  }
  assign(best,second){
    const w=this.w,F=this.F,tb0=this.playBase(),[tbx,tbz]=basePos(tb0);
    const deep=OF.includes(best.f.role)&&this.useRelay(best.f,hyp(best.x-tbx,best.z-tbz))||hyp(best.x,best.z)>55;   // 中継が要るかは、直接と中継の速さを比べて決める
    const{cover,relay,used:busy}=this.roleTable(best.x,best.z,best.f,deep);this.fixCover(cover,busy,relay);
    this.cover=cover;this.relay=relay;const t=w.t;
    // まず打球へ：打球の通り道の近くにいる内野手は、届かなくても一歩二歩打球に向かう（抜けたら自分の役へ）
    if(this.firstPlan){this.firstPlan=false;this.lunge=new Map();
      if(this.pr&&w.ball.src==='bat')for(const f of w.fielders){if(!['P','1B','2B','SS','3B'].includes(f.role)||f===best.f)continue;
        let bd=1e9,bq=null;for(const q of this.pr){if(q[0]>1.6||q[3]>1.6)continue;if(hyp(q[1],q[2])>FIELD.infieldR+4)break;const d=hyp(q[1]-f.x,q[2]-f.z);if(d<bd){bd=d;bq=q}}
        if(bq&&bd<(f.role==='P'?2.5:7)){this.lunge.set(f,t+Math.min(1.1,bq[0]+0.25));f.goTo(bq[1],bq[2],{react:true});this.involved.add(f)}}
      // ピッチャー：自分より一塁側への打球は、まず一塁へ二、三歩スタート（要らなければそこで見守る）
      const P=F.P;if(P&&w.ball.src==='bat'&&best.f!==P&&cover[1]!==P&&!this.lunge.has(P)&&w.ball.vx>0.3){const[bx,bz]=basePos(1),d=P.dist(bx,bz)||1,s=Math.min(2.5,d);
        P.goTo(P.x+(bx-P.x)/d*s,P.z+(bz-P.z)/d*s,{react:true});this.lunge.set(P,t+0.9);this.involved.add(P)}}
    const lunging=f=>this.lunge&&this.lunge.get(f)>t;
    for(const b in cover){const f=cover[b],[bx,bz]=basePos(+b);if(f!==w.ball.holder&&!lunging(f))f.goTo(bx,bz,{react:true})}
    // 外野の前に落ちたヒット（中継までは要らない近さ）：近いほうの二遊間は、送球する塁と外野手を結ぶ線の上に数メートル出て受ける（カットに入る）
    this.cut=null;
    if(!deep&&OF.includes(best.f.role)){const rt=best.x>=-1,a1=rt?F['2B']:F.SS,a2=rt?F.SS:F['2B'],ok=f=>f&&f!==cover[2]&&f!==best.f&&!busy.has(f);
      const cut=ok(a1)?a1:ok(a2)?a2:null;
      if(cut){busy.add(cut);this.cut=cut;if(!lunging(cut)){const tb=Math.min(3,Math.max(2,this.playBase())),[bx,bz]=basePos(tb),d=hyp(best.x-bx,best.z-bz)||1,k=Math.min(0.45,9/d);cut.goTo(bx+(best.x-bx)*k,bz+(best.z-bz)*k,{react:true})}}}
    if(relay&&lunging(relay)){}else if(relay){const tb=this.relayTarget(),[tx,tz]=basePos(tb),k=0.42;relay.goTo(best.x+(tx-best.x)*k,best.z+(tz-best.z)*k,{react:true})}
    // バックアップ：ピッチャーゴロはセカンドが投手の後ろ、ファーストゴロはセカンドが一塁の手伝い
    // サードゴロ：ショートはサードの斜め後ろ近く（はじいたボールを拾う役）
    const ss=F.SS;if(!deep&&best.f===F['3B']&&ss&&!busy.has(ss)&&!lunging(ss)){const d=hyp(best.x,best.z)||1;ss.goTo(best.x*(d+4)/d+3,best.z*(d+4)/d+1,{react:true});busy.add(ss)}
    // 外野の打球：ピッチャーはバックアップ。本塁を狙われる→本塁の後ろ、三塁→三塁の後ろ、迷う場面→三塁と本塁の間のファウルエリア
    const pp=F.P,live2=w.liveRunners.filter(r=>!r.rb.isBatter);
    if(deep&&pp&&!busy.has(pp)&&pp!==best.f){const lt=this.lastThrow&&this.lastThrow.base;
      const p=lt===4?[1.5,-6]:lt===3?[-21,13]:live2.some(r=>r.rb.base>=2)?[-9,4]:this.relayTarget()>=3?[-21,13]:[-4,13];pp.goTo(p[0],p[1],{react:true});busy.add(pp)}
    // 内野ゴロ：外野は送球の後ろへ（ライト→一塁、センター→二塁、レフト→三塁）。キャッチャーは一塁の後ろ（二塁・三塁にランナーがいないとき）
    const lazy=f=>w.rng.chance(0.35*Y(sk(f,'iq')));   // 能力が低いとときどき出遅れる
    const pl0=w.umpire.play,steal=pl0&&!pl0.batted;
    // 盗塁：二塁に入らなかった二遊間とセンターは二塁の後ろ（送球がそれたとき用）
    if(steal)this.stealBack(cover,busy);
    if(!deep&&!steal){const bu=[['RF',[24,10]],['CF',[0,42]],['LF',[-24,10]]];
      for(const[role,[x,z]]of bu){const f=F[role];if(!f||busy.has(f)||f===best.f)continue;if(role==='LF'&&!live2.some(r=>r.rb.base>=1&&r.rb.base<=2))continue;if(!lazy(f)){f.goTo(x,z,{react:true,frac:0.9});busy.add(f)}}
      const cc=F.C;if(cc&&!busy.has(cc)&&cc!==best.f&&!Object.values(cover).includes(cc)&&!live2.some(r=>r.rb.base>=2)){cc.goTo(17.5,9.5,{react:true});busy.add(cc)}}
    const sb=F['2B'];if(!deep&&sb&&!busy.has(sb)&&!lunging(sb)){if(best.f===F.P){sb.goTo(2,21,{react:true});busy.add(sb)}else if(best.f===F['1B']){sb.goTo(14,21,{react:true});busy.add(sb)}}
    // 外野の打球は隣の外野手がうしろへ回る
    if(deep&&second&&OF.includes(second.f.role)&&!busy.has(second.f)){const d=hyp(best.x,best.z)||1;second.f.goTo(best.x*(d+6)/d,best.z*(d+6)/d,{react:true,frac:0.9});busy.add(second.f)}
    // ほかの子は定位置近くで様子を見る
    for(const f of w.fielders)if(!busy.has(f)&&f!==best.f&&f!==w.ball.holder&&!lunging(f)){const[px,pz]=this.posOf(f.role);if(f.tx==null&&f.dist(px,pz)>3)f.goTo(px,pz,{frac:0.6})}
  }
  relayTarget(){const w=this.w,live=w.liveRunners.filter(r=>!r.rb.isBatter),c=this.cur,b=w.ball;
    // 捕れそうなフライ：タッチアップで進む先の塁へ
    if(c&&c.air&&!c.late&&b.state==='air'&&b.bounces===0&&b.src==='bat'){const lead=Math.max(0,...live.map(r=>r.rb.base));return lead?Math.min(4,lead+1):2}
    return this.playBase()}
  // 状況判断：ランナー全員の位置と足、ボールが外野から（中継を通して）各塁に届く時間を比べ、
  // アウトを狙える見込みのあるいちばん先の塁へ。どこも無理なら、余分な進塁を止めたい塁へ
  playBase(){const w=this.w,b=w.ball,U=w.umpire,t=w.t,c=this.cur;
    let f,px,pz,t0;
    if(b.state==='held'&&b.holder&&b.holder.side==='F'){f=b.holder;px=f.x;pz=f.z;t0=Math.max(0,(this.decideAt??t)-t)}
    else if(c){f=c.f;px=c.x;pz=c.z;t0=Math.max(0,c.t-(t-(this.planT??t)))+PROF.transfer(sk(f,'fld'))+0.2}
    else return 2;
    const arm=PROF.armV(sk(f,'thr')),dm=this.directMax(f);
    const ballT=k=>{const[bx,bz]=basePos(k),d=hyp(bx-px,bz-pz);return t0+(OF.includes(f.role)?this.ofT(f,d):KE.throwTime(d,arm))+0.2};
    let best=null,stop=2;
    for(const r of w.liveRunners){if(r.rb.out||r.rd)continue;const lb=Math.max(U.legalBase(r),r.rb.base);let rt=0,x=r.x,z=r.z;
      for(let k=lb+1;k<=4;k++){const[bx,bz]=basePos(k),d=hyp(bx-x,bz-z);if(k===1&&OF.includes(f.role)){rt+=d/Math.max(1,r.vmax)+0.15;x=bx;z=bz;continue}   // 外野からの中継は一塁へは向けない（ライトゴロは直接）
        rt+=d/Math.max(1,r.vmax)+(k>lb+1?0.25:0)+(rt===0?0.15:0);x=bx;z=bz;
        const m=rt-ballT(k);   // ＋ならボールが先
        if(m>-0.6){if(!best||k>best.k)best={k,m};break}   // ここで勝負できる
        stop=Math.max(stop,Math.min(4,k+1))}}   // ここまでは楽に行かれる→その先を止める
    return best?best.k:stop}
  // 捕れるかどうか：手の届く範囲に来た瞬間に決める
  tryCatch(f,dive){
    const w=this.w,b=w.ball,t=w.t;
    const thrown=b.src==='throw',fly=b.state==='air'&&b.bounces===0&&!b.wall&&!thrown,rel=hyp(b.vx-f.vx,b.vz-f.vz,b.vh);
    const s=sk(f,'fld'),base=PROF.miss(s);
    let diff=thrown?0.35:fly?0.6+f.speed/7:b.state==='ground'||b.state==='rest'?0.5+rel/14:0.9+rel/12;   // はねるゴロは難しい
    if(b.state==='rest')diff=0.15;
    if(b.h>1.9)diff*=1.6;if(dive)diff=diff*2.2+1.2;
    const pFail=dive?clamp(0.62+0.3*Y(s),0,0.92):clamp(base*diff,0,0.92);   // 飛びついて捕れるのはS級でも半分ほど
    if(!w.rng.chance(pFail)){w.give(f,fly?'catch':'pickup');if(dive)w.emit('diveCatch',{who:f.id});return true}
    // 失敗：はじく・トンネル・落とす
    const rec=(dive?0.45+0.6*Y(s):0.35+0.4*Y(s));   // 飛びついたあと起き上がる時間（S約0.5秒）f.wait=Math.max(f.wait,rec);this.tried.set(f,t+rec);
    let kind;
    if(thrown&&w.rng.chance(0.6))kind='through';
    else if(!fly&&b.state!=='rest'&&w.rng.chance(0.45))kind='through';
    else{kind=fly?'drop':'bobble';const a=w.rng.range(0,Math.PI*2),sp=fly?w.rng.range(0.8,2.5):w.rng.range(1.2,3.5);
      w.release([f.x+Math.sin(a)*0.4,f.z+Math.cos(a)*0.4,Math.max(0.3,Math.min(b.h,1.2))],[Math.sin(a)*sp,Math.cos(a)*sp,fly?0.5:1.2],null,'deflect')}
    if(dive)w.emit('diveMiss',{who:f.id,role:f.role,kind});else w.emit('error',{who:f.id,role:f.role,kind,dive:false});   // 飛びついて届かなかったのはエラーにしない
    this.nextPlan=t;return false;
  }
  tick(){
    const w=this.w,b=w.ball,t=w.t;if(b.state==='out')return;
    if(b.state!=='held'){this.picked=b.state==='ground'||b.state==='rest';this.lastBallV=hyp(b.vx,b.vz)}
    if(b.state!=='held'){
      // 送球が飛んでいるあいだは、受ける子を動かさない（それたら届かなかった後で追う）
      const inFlight=b.src==='throw'&&this.lastThrow&&t<this.lastThrow.t1+0.15;
      if(t>=this.nextPlan&&!inFlight){this.nextPlan=t+0.3;this.plan()}
      // 手の届く範囲に来た子が捕る。ベースに入っている子は、踏んだまま体を伸ばして捕る（能力が高いほど遠くまで）
      for(const f of w.fielders){if(!w.canCatch(f))continue;const tr=this.tried.get(f);if(tr!=null&&t<tr)continue;
        if(inFlight&&this.lastThrow.to&&f!==this.lastThrow.to)continue;   // 送球は受ける子だけが捕る（となりの子が横取りしない）
        const cb=b.src==='throw'?this.baseOf(f):null,on=cb!=null&&f.dist(...basePos(cb))<0.8,reach=on?0.75+0.9*sk(f,'fld')/100:0.75;
        const d=hyp(b.x-f.x,b.z-f.z);if(d<reach&&b.h<this.reachH(f)+(on?0.2:0)){this.tryCatch(f,false);return}}
      // 飛びつき：追いかけている子の横を抜けそうなとき、一度だけ
      // 横を抜けていく打球には飛びつく（一度だけ）
      if(b.h<1.5&&b.src!=='throw')for(const c of w.fielders){if(this.dove.has(c)||c.wait>0||c.role==='C'||!w.canCatch(c))continue;const tr=this.tried.get(c);if(tr!=null&&t<tr)continue;
        const d=hyp(b.x-c.x,b.z-c.z),dn=hyp(b.x+b.vx*0.05-c.x,b.z+b.vz*0.05-c.z);
        if(d<1.9&&d>=0.75&&dn>d){this.dove.add(c);this.involved.add(c);c.x+=(b.x-c.x)*0.6;c.z+=(b.z-c.z)*0.6;w.emit('dive',{who:c.id});
          if(!this.tryCatch(c,true)){c.wait=Math.max(c.wait,0.45+0.6*Y(sk(c,'fld')))}else c.wait=0.5;return}}
      return;
    }
    const h=b.holder;if(!h||h.side!=='F')return;
    if(this.decideAt==null&&w.liveRunners.some(r=>r.rd)){this.decideAt=t+0.04+0.3*Y(sk(h,'fld'));this.target=null;this.assignHeld(h)}   // 挟殺中は捕ったらすぐ追う（S級はもたもたしない）
    if(this.decideAt==null){const charge=this.picked&&(this.lastBallV||0)<4+5*sk(h,'fld')/100&&h.speed>2.5&&!OF.includes(h.role);   // 前進して捕ったゴロは走りながら投げる（ランニングスロー）
      this.decideAt=t+PROF.transfer(sk(h,'fld'))*(charge?0.75+0.5*Y(sk(h,'fld')):b.src==='throw'?0.65:1)+(this.flyOF(h)?0.15:0)+(this.picked&&!charge?0.2:0);this.target=null;h.stop();this.assignHeld(h);
      // 塁の近くで捕ったら、まず塁を踏む（フォース・リタッチ）
      const U=w.umpire;for(const r of w.liveRunners){const fb=U.forced(r)?r.rb.forceBase:r.rb.mustRetouch?r.rb.start:null;if(fb==null)continue;const[bx,bz]=basePos(fb);
        if(h.dist(bx,bz)<3.5&&!r.rb.judged[fb]){h.goTo(bx,bz);this.decideAt=Math.max(t+0.05,Math.min(this.decideAt,t+h.eta(bx,bz)+0.1));break}}}
    if(t<this.decideAt)return;
    this.act(h);
  }
  flyOF(h){return OF.includes(h.role)}
  // ボールを持っているあいだのカバー（持った子以外）
  assignHeld(h){
    const tb0=this.playBase(),[tbx,tbz]=basePos(tb0),deep=(OF.includes(h.role)||hyp(h.x,h.z)>40)&&this.useRelay(h,hyp(h.x-tbx,h.z-tbz))||hyp(h.x,h.z)>55;
    const rt=this.roleTable(h.x,h.z,h,deep),{cover,relay}=rt;this.fixCover(cover,rt.used,relay);
    // 塁へ向かう途中で受けた子は、その塁を自分で受け持つ
    for(let b=1;b<=4;b++){const[bx,bz]=basePos(b);if(h.dist(bx,bz)<6&&(h.tx!=null&&hyp(h.tx-bx,h.tz-bz)<0.6||h.dist(bx,bz)<1.5||cover[b]&&h.dist(bx,bz)<cover[b].dist(bx,bz))){const o=cover[b];cover[b]=h;if(o&&o!==h&&o.dist(bx,bz)<2){const[px,pz]=this.posOf(o.role);o.goTo(px,pz,{frac:0.6})}}}
    this.cover=cover;this.relay=relay&&relay!==h?relay:null;
    for(const b in cover){const f=cover[b];if(f===h)continue;const[bx,bz]=basePos(+b);if(f.dist(bx,bz)>0.3)f.goTo(bx,bz)}
    const pl=this.w.umpire.play;if(pl&&!pl.batted)this.stealBack(cover,new Set([h,...Object.values(cover)]));   // 盗塁：キャッチャーが捕った後も、二塁の後ろに入る
  }
  // 盗塁のスタート（「走った!」の声）で、二塁のカバーとその後ろの子が動き出す。捕ってからでは遅い
  stealStart(){const F=this.F,c2=this.batLefty?F.SS:F['2B'];if(!c2)return;const[bx,bz]=basePos(2);c2.goTo(bx,bz,{react:true});this.stealBack({2:c2},new Set([c2]))}
  // 盗塁：二塁に入らなかった二遊間は二塁の後ろ、センターはさらに後ろ（送球がそれたとき用）
  stealBack(cover,busy){const F=this.F,[bx,bz]=basePos(2),t=this.w.t,lg=f=>this.lunge&&this.lunge.get(f)>t;
    for(const f of[F.SS,F['2B']]){if(!f||f===cover[2]||busy.has(f)||lg(f))continue;const x=bx+(f===F.SS?-3:3),z=bz+5;if(f.tx==null||hyp(f.tx-x,f.tz-z)>0.5)f.goTo(x,z,{react:true});busy.add(f)}
    const cf=F.CF;if(cf&&!busy.has(cf)){if(cf.tx==null||hyp(cf.tx-bx,cf.tz-bz-18)>0.5)cf.goTo(bx,bz+18,{react:true,frac:0.9});busy.add(cf)}}
  // 外野から直接投げてよい距離（S級でもおよそ40m、能力が低いほど短い）
  directMax(h){return 22+18*sk(h,'thr')/100}
  // 直接投げる時間（遠いほど・肩が弱いほど、それて捕り直す分がかかる）と、中継を通す時間
  directT(f,d){const s=sk(f,'thr');return KE.throwTime(d,PROF.armV(s))+0.12*Math.pow(d/25,2)*(0.15+Y(s))}
  relayT(f,d){const s=sk(f,'thr'),a=PROF.armV(s);return KE.throwTime(d*0.55,a)+0.06*Math.pow(d*0.55/25,2)+0.55+KE.throwTime(d*0.45,PROF.armV(75))}
  useRelay(f,d){return d>24&&this.relayT(f,d)<this.directT(f,d)}
  // 外野から塁へボールが届くまでの見込み（直接と中継の速いほう）
  ofT(f,d){return d>24?Math.min(this.directT(f,d),this.relayT(f,d)):KE.throwTime(d,PROF.armV(sk(f,'thr')))}
  // 状況判断でカバーを入れ替える：ランナーが来うる塁に、担当の子が間に合わず別の子のほうがずっと早ければ替える。空けない
  fixCover(cover,used,relay){const w=this.w,U=w.umpire,need=new Set();
    for(const r of w.liveRunners){if(r.rb.out)continue;const lb=Math.max(U.legalBase(r),r.rb.base);for(let k=lb+1;k<=Math.min(4,lb+2);k++)need.add(k)}
    for(const b of need){const[bx,bz]=basePos(b),f=cover[b];const busy=new Set([...used,...Object.values(cover)]);if(relay)busy.add(relay);
      let alt=null,ae=1e9;for(const g of w.fielders){if(busy.has(g)||OF.includes(g.role)||g.role==='C'&&b!==4)continue;const e=g.eta(bx,bz);if(e<ae){ae=e;alt=g}}
      if(!alt)continue;const fe=f?f.eta(bx,bz):1e9;if(!f||fe>ae+1.2&&fe>2.0){cover[b]=alt;used.add(alt)}}
    return cover}
  baseOf(f){for(const b in this.cover)if(this.cover[b]===f)return +b;return null}
  // 投げる時間の見込み
  throwT(h,x,z){const v=PROF.armV(sk(h,'thr')),d=hyp(x-h.x,z-h.z);return KE.throwTime(d,v)}
  armRange(h){const v=PROF.armV(sk(h,'thr'));return v*v/9.8*0.62}
  // 投げる先を決める：ランナーより先にボールが着く塁。なければ中継・内野へ返す
  act(h){
    const w=this.w,U=w.umpire,live=w.liveRunners,t=w.t,cands=[];
    // 審判がまだ判定中（きわどいタイミング）なら、塁を踏んだまま待つ
    if(U.pend.some(pd=>!pd.done&&pd.by===h.id)||live.some(r=>r.rb.tagPend)){this.decideAt=t+0.05;return}
    // 挟殺：近づいて追い込み、前の塁の子の近くまで来たら投げる
    const rdr=live.find(r=>r.rd);
    if(rdr){const hb=this.headingTo(rdr),ahead=hb!=null?this.cover[hb]:null,d=h.dist(rdr.x,rdr.z);
      if(d<2.2||!ahead||ahead===h){h.goTo(rdr.x+rdr.vx*0.25,rdr.z+rdr.vz*0.25);this.decideAt=t+0.08;return}
      if(ahead.dist(rdr.x,rdr.z)<3.2&&d>2.0){const[bx,bz]=basePos(hb);const tx=ahead.dist(bx,bz)<2?bx:ahead.x,tz=ahead.dist(bx,bz)<2?bz:ahead.z;
        const ra=w.throwTo(h,[tx,tz,1.25],1,0.8);this.lastThrow={x:tx,z:tz,t1:t+ra.t,to:ahead};this.decideAt=null;w.emit('throwTarget',{from:h.id,to:ahead.id,base:hb,rundown:true});
        // 受ける子は捕る前からランナーへ向かって走り出す（捕ったら一気に詰める）
        {const dx=rdr.x-tx,dz=rdr.z-tz,dd=hyp(dx,dz)||1,k=Math.min(1.8,dd*0.5);ahead.goTo(tx+dx/dd*k,tz+dz/dd*k,{frac:0.7})}
        return}
      h.goTo(rdr.x,rdr.z);this.decideAt=t+0.08;
      // 前の塁の子は塁と走者のあいだに立って待つ
      if(ahead&&ahead!==h){const[bx,bz]=basePos(hb),k=Math.min(1,4/Math.max(4,hyp(rdr.x-bx,rdr.z-bz)));ahead.goTo(bx+(rdr.x-bx)*k*0.5,bz+(rdr.z-bz)*k*0.5)}
      return}
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
      // 自分で走って踏むか、投げるか：早いほう（近くの子へ投げ返すより自分で踏むほうが早ければ走る）
      const runT=h.eta(bx,bz),thrT=c&&c!==h&&c.dist(h.x,h.z)>4?Math.max(this.throwT(h,bx,bz),c.eta(bx,bz)):Infinity;   // すぐ隣の子へは投げない
      if(runT<=thrT+0.15){bt=runT;how='run'}else{bt=thrT;how='throw'}
      const force=U.forced(r)||r.rb.mustRetouch,need=force?-0.15:0.0;   // きわどい塁は勝負する（フォースはタッチが要らない分さらに攻める）
      // 目の前（数m以内）の飛び出したランナーには走ってタッチ
      if(!force&&!U.onBase(r)&&h.dist(r.x,r.z)<4.5){cands.push({r,b,how:'tag',m:1,val:5});continue}
      // 本塁がきわどいときは前のランナー（本塁）を優先して狙う
      if(rt-bt>need||b===4&&rt-bt>-0.4)cands.push({r,b,how,m:rt-bt,val:({4:4,3:3,2:2,1:1})[b]+(force?0.5:0)+Math.min(1,rt-bt)*0.3});
    }
    cands.sort((a,c)=>c.val-a.val);
    let pick=cands[0];
    // 野球の頭が弱い子は、ときどき投げる塁をまちがえる・迷う
    const iq=sk(h,'iq');
    if(pick&&cands.length>1&&!this.mis&&w.rng.chance(0.3*Y(iq))){this.mis=1;pick=cands[1+((w.rng()*(cands.length-1))|0)];w.emit('misjudge',{who:h.id})}
    if(pick&&pick.how==='tag'){h.goTo(pick.r.x,pick.r.z);this.decideAt=t+0.1;return}
    if(pick&&pick.how==='run'){const[bx,bz]=basePos(pick.b);h.goTo(bx,bz);this.decideAt=t+0.15;return}
    // 受ける子がまだ塁へ向かえていない（打球側へ動いている途中など）なら、塁へ向かわせて呼吸を合わせる
    if(pick){const c=this.cover[pick.b],[bx,bz]=basePos(pick.b);
      if(c&&c.dist(bx,bz)>=1&&c.eta(bx,bz)>this.throwT(h,bx,bz)+0.1&&pick.m>0.3){if(this.lunge)this.lunge.delete(c);if(c.tx==null||hyp(c.tx-bx,c.tz-bz)>0.5)c.goTo(bx,bz);this.decideAt=t+0.06;return}}
    if(pick){this.throwTo(h,this.cover[pick.b],pick.b,'out',pick.m>1.2?0.72:pick.m>0.6?0.85:1);return}   // 余裕があれば軽く、きわどければ全力
    // アウトにできる塁がない：先へ進もうとしているランナーの、向かっている塁のひとつ先へ返して余分な進塁を止める
    // 投げるのは、その走者が本当に先の塁を狙える（位置・体勢・足と、送球が届く時間の比べ合い）ときだけ。余裕があれば投げない
    let stopT=null;
    for(const r of live){if(r.rb.mustRetouch||r.rd)continue;const hb=this.headingTo(r);if(hb==null||hb<=U.legalBase(r)||hb>=4)continue;if(r.rb.isBatter&&hb<=1)continue;
      const nb=hb+1,c=this.cover[nb];if(!c||c===h||h.dist(...basePos(nb))<=3)continue;
      const[ax,az]=basePos(hb),[nx,nz]=basePos(nb),V=Math.max(1,r.vmax);
      const rT=r.dist(ax,az)/V+FIELD.bd/V+(r.thru&&!r.stealGo?0.2:0.9);   // 塁で止まるつもりの走者（盗塁の滑り込みなど）は、もう一度加速する分おそい
      const bT=Math.max(this.throwT(h,nx,nz),c.eta(nx,nz))+0.6;   // 投げずに内野へ返していても、気づいて投げ直すまでの分
      if(rT<bT+0.4&&(!stopT||nb>stopT.nb))stopT={nb,c}}
    if(stopT){this.throwTo(h,stopT.c,stopT.nb,'stop');return}
    // 外野で持っている：中継か内野へ返す。内野どうしでは投げない（そのまま持って区切り）
    if(OF.includes(h.role)||hyp(h.x,h.z)>FIELD.infieldR+3||hyp(h.x,h.z-15)>22){   // 外野や、ファウルグラウンドの遠くで持っている
      let tgt=this.relay&&this.relay!==h?this.relay:this.cut&&this.cut!==h?this.cut:this.nearestIF(h);
      // 返す相手は自分より内野側（8m以上近い）の子だけ。いなければ自分で内野へ持って戻る
      if(tgt&&(OF.includes(h.role)&&!OF.includes(tgt.role)&&tgt.dist(h.x,h.z)>4||hyp(tgt.x,tgt.z)<hyp(h.x,h.z)-8)){this.throwTo(h,tgt,null);return}   // 外野手は内野の子へすぐ返す
      h.goTo(h.x*0.6,h.z*0.6+10,{frac:0.7});this.decideAt=t+0.3;return}
    if(live.some(r=>r.speed>0.5)){this.decideAt=t+0.2;return}
    this.decideAt=t+0.5;
  }
  headingTo(r){if(r.tx==null)return null;for(let b=1;b<=4;b++){const[bx,bz]=basePos(b);if(hyp(r.tx-bx,r.tz-bz)<0.6)return b}return null}
  runnerT(r,b){const[bx,bz]=basePos(b);const d=r.dist(bx,bz);const toward=r.speed>0.3?(r.vx*(bx-r.x)+r.vz*(bz-r.z))/(d||1):0;
    if(toward<-0.3)return 9;return r.eta(bx,bz)}
  nearestIF(h){let best=null,bd=1e9;for(const f of this.w.fielders){if(f===h||!['SS','2B','3B','1B','P'].includes(f.role))continue;const d=f.dist(h.x,h.z);if(d<bd){bd=d;best=f}}return best}
  throwTo(h,c,b,kind,effort){
    const w=this.w;let x=c.x,z=c.z;
    // 塁へ投げるときは、受ける子が間に合うなら塁の上へ。受ける子はそこへ向かう
    // 塁へ投げるときは塁の上へ（受ける子が着く場所とタイミングに合わせる）。受ける子はそこへ向かう
    if(b!=null){const[bx,bz]=basePos(b);x=bx;z=bz;if(this.lunge)this.lunge.delete(c)}
    // 外野から遠い塁へは中継を通す（直接は約40mまで。レフト・センターから一塁へは直接投げない）
    const d=hyp(x-h.x,z-h.z);
    if(OF.includes(h.role)&&this.useRelay(h,d)){   // 直接より中継を通すほうが速いとき
      const r=this.relay&&this.relay!==h&&this.relay!==c?this.relay:this.nearestIF(h);if(r&&r!==c&&r.dist(h.x,h.z)<d-6){x=r.x;z=r.z;c=r;b=null}}
    if(c.dist(x,z)>0.3)c.goTo(x,z);
    const v0=PROF.armV(sk(h,'thr')),dd0=hyp(x-h.x,z-h.z);   // 遠い送球は届く強さまで上げる
    const ef=Math.min(1,Math.max(effort??(kind==='out'?1:0.8),Math.sqrt(dd0*9.8/0.55)/v0));
    const aim=w.throwTo(h,[x,z,1.25],1,ef);this.lastThrow={x,z,t1:w.t+aim.t,to:c,base:b};this.decideAt=null;w.emit('throwTarget',{from:h.id,to:c.id,base:b,kind:kind||(b==null?'return':'out')});
    if(b==null)this.chaseHigh(c);
    this.nextPlan=w.t;
  }
  // 中継・返球：受ける子は飛んでくるボールの線に合わせて動く（それた球に寄る・頭を越えそうなら下がって跳ぶ）。届かなければ抜けて、後ろの子が処理する
  chaseHigh(c){const w=this.w,b=w.ball,rh=this.reachH(c);
    const sb=b.clone(),dt=1/60;let t=0,best=null;
    while(t<4&&sb.state==='air'&&sb.bounces===0){sb.step(dt);t+=dt;if(sb.h>rh||sb.h<0.25)continue;
      const need=Math.max(0,c.dist(sb.x,sb.z)-0.6),e=need<0.05?0:c.eta(sb.x,sb.z,1,0.6)+0.1+0.45*Y(sk(c,'fld'));   // それた球への反応は能力しだい（低いと間に合わずに抜ける）
      if(e<=t){const sc=need+Math.max(0,t-1.2)*0.5;if(!best||sc<best.sc)best={x:sb.x,z:sb.z,t,sc}}}   // 近くで捕れる場所ほどよい
    if(best){const d=c.dist(best.x,best.z);if(d>0.3){c.goTo(best.x,best.z);this.lastThrow.x=best.x;this.lastThrow.z=best.z}this.lastThrow.t1=w.t+best.t}}
}
KE.Defense=Defense;

/* ---------- 走塁：毎瞬「次の塁にボールより先に着けるか」を見て、進む・止まる・戻る ---------- */
const OVERRUN=[19.1,19.1];
class Running{
  constructor(w,def){this.w=w;this.def=def;
    const redo=()=>{for(const r of w.liveRunners)r.dcs=null};
    // タッチアップの用意をしていた子は、捕った瞬間にスタートできる（コーチの「ゴー!」）
    w.on('flyCatch',()=>{for(const r of w.liveRunners){r.plan=null;r.dcs=null;r.half=false;if(r.tagUp){r.awake=true;r.wait=0;r.ready=true}if(!r.rb.mustRetouch&&!r.rb.isBatter)r.stop()}});
    w.on('catch',redo);w.on('pickup',redo);w.on('throw',redo);w.on('error',redo);
    w.on('hr',()=>this.award());w.on('groundRule',()=>this.award());w.on('overthrow',()=>this.award());}
  reset(){for(const r of this.w.runners){r.plan=null;r.route=null;r.dcs=null;r.rd=false;r.half=false;r.next=null;r.said=false;r.rdT=null;r.nz=null;r.tagUp=false;r.over=false;r.ready=false}}
  award(){for(const r of this.w.liveRunners){r.stop();r.rd=false;r.route=[];for(let b=r.rb.base+1;b<=r.rb.awardTo;b++)r.route.push(b)}}
  // ボールがその塁に着くまでの見込み（守る子がそこにいないと投げられない）
  ballT(b,r){
    const w=this.w,d=this.def,ball=w.ball,[bx,bz]=basePos(b);let t;
    // 送球がそれる分も見込む（肩の弱い子ほど・遠いほど）
    const miss=(f,dd)=>f?1.5*Y(sk(f,'thr'))*Math.min(1,dd/40)+(OF.includes(f.role)&&dd>24?d.ofT(f,dd)-KE.throwTime(dd,PROF.armV(sk(f,'thr'))):0):0;   // 外野から遠い塁は中継を通す・それる分も
    if(ball.state==='held'&&ball.holder&&ball.holder.side==='F'){const h=ball.holder,dd=h.dist(bx,bz);t=Math.max(0,(d.decideAt??w.t)-w.t)+(dd<5?h.eta(bx,bz):d.throwT(h,bx,bz)+miss(h,dd))}
    else if(ball.src==='throw'&&ball.state==='air'&&d.lastThrow){const L=d.lastThrow,arr=Math.max(0,L.t1-w.t),dd=hyp(L.x-bx,L.z-bz),rc=L.to;
      t=dd<1.5?arr:arr+(rc?PROF.transfer(sk(rc,'fld'))+KE.throwTime(dd,PROF.armV(sk(rc,'thr')))+miss(rc,dd):0.6+dd/20)}
    else{const c=d.cur;if(!c)return 9;const left=Math.max(0,c.t-(w.t-(d.planT??w.t)));
      const dd=hyp(bx-c.x,bz-c.z);t=left+0.15+PROF.transfer(sk(c.f,'fld'))+0.2+KE.throwTime(dd,PROF.armV(sk(c.f,'thr')))+miss(c.f,dd)}
    // 誰かがその塁に入れないと投げられない（いちばん早く入れる子）
    let cov=9;for(const f of w.fielders)cov=Math.min(cov,f.eta(bx,bz));t=Math.max(t,cov);
    // 押し出しでない塁は、捕ってからタッチする分かかる
    if(r&&!(r.rb.forceBase===b&&this.w.umpire.forced(r)))t+=0.25;
    // 挟殺のあいだ、守備の目はそちらに向いている
    if(r&&!r.rd&&this.w.liveRunners.some(q=>q.rd&&q!==r))t+=2.5;
    return t}
  // 塁にはすべりこむので、止まるための減速はいらない
  arrive(r,b){const[bx,bz]=basePos(b);return Math.max(0,r.eta(bx,bz)-r.vmax/(2*r.dec))}
  // 判断：見込みに能力のずれを足す。少年野球は「行けたのに行かない」寄り
  judge(r,margin,need,ready){const y=Y(sk(r,'iq')),rng=this.w.rng;if(this.w.outs===2)need-=0.6;   // ツーアウトは思いきって
    if(r.nz==null)r.nz=rng.gauss();   // その子のそのプレーでの見込みのくせ
    const seen=margin+r.nz*0.7*y-0.9*y;let go=seen>need;
    // 迷って足が出ない（野球の頭が弱い子ほど）
    if(go&&!ready&&margin>need+0.3&&rng.chance(0.45*y))go=false;
    if(go&&margin<-0.15)this.w.emit('rash',{who:r.id,name:r.name});
    if(!go&&margin>need+0.6&&!r.said){r.said=true;this.w.emit('couldHaveGone',{who:r.id,name:r.name})}
    return go}
  // フライのとき離れてよい距離：捕られてから戻るのに間に合う分だけ（浅いフライは少し、深いフライはハーフウェイ）
  halfDist(r,lb){const c=this.def.cur;if(!c)return 2;const[lx,lz]=basePos(lb);
    const back=PROF.transfer(sk(c.f,'fld'))+KE.throwTime(hyp(c.x-lx,c.z-lz),PROF.armV(sk(c.f,'thr')))-r.react-0.35;
    return clamp(back*r.vmax*0.8,0.8,FIELD.bd*0.5)}
  cap(r){const U=this.w.umpire,lead=this.w.liveRunners.filter(q=>q!==r&&q.rb.start>r.rb.start).map(q=>q.plan>0&&!q.rd?Math.max(q.plan,q.plan>U.legalBase(q)?q.next||0:0,U.legalBase(q)):U.legalBase(q));return lead.length?Math.min(...lead):5}
  tick(){
    const w=this.w,U=w.umpire,p=U.play,D=this.def;if(!p||U.ended)return;const t=w.t,b=w.ball;
    const flying=p.fly&&b.state==='air'&&b.bounces===0&&b.src==='bat'&&!p.flyCaught;
    const cur=D.cur,catchable=flying&&cur&&!cur.late&&cur.air;
    for(const r of w.liveRunners){
      if(r.route&&r.route.length){if(r.tx==null){const nb=r.route[0];if(r.rb.base>=nb){r.route.shift();continue}const[bx,bz]=basePos(nb);r.goTo(bx,bz,{react:true})}continue}
      if(p.dead)continue;
      const lb=U.legalBase(r),[lx,lz]=basePos(lb);
      // フライを捕られて戻るときは、回った塁を踏み直して（逆の順に）元の塁へ。近道はしない
      if(r.rb.mustRetouch){if(!r.backVia){r.backVia=[];for(let k=Math.min(3,r.rb.base);k>r.rb.start;k--)r.backVia.push(k)}
        while(r.backVia.length){const[vx,vz]=basePos(r.backVia[0]);if(r.dist(vx,vz)<0.6)r.backVia.shift();else break}
        const[gx,gz]=r.backVia.length?basePos(r.backVia[0]):[lx,lz];
        if(r.plan!==lb||r.tx==null||hyp(r.tx-gx,r.tz-gz)>0.3){r.plan=lb;r.goTo(gx,gz,{react:r.tx==null,thru:r.backVia.length>0})}continue}
      r.backVia=null;
      const pf=r.rb.forceBase&&r.rb.base<r.rb.forceBase&&!p.flyCaught&&p.fair!==false&&(()=>{let f=r.rb.forcer;while(f){if(f.rb.out)return false;f=f.rb.forcer}return true})();
      // 打者：内野ゴロは一塁を駆け抜ける。外野へ抜けたら回る
      if(r.rb.isBatter&&r.rb.base===0){
        // 内野手が捕るゴロなら駆け抜け、それ以外は一塁で止まって先を見る
        // 一塁への送球が間に合いそう（きわどい）なら駆け抜ける。間に合うはずのない当たりなら一塁を回る
        const fly=cur&&cur.air&&!cur.late&&b.state==='air'&&b.bounces===0;
        const ifBall=!fly&&!D.ofTouched&&(cur&&!cur.air&&!OF.includes(cur.f.role)&&hyp(cur.x,cur.z)<FIELD.infieldR+3||b.state==='held'&&b.holder&&IF.includes(b.holder.role));
        const inIF=ifBall||!fly&&(b.state!=='air'||b.bounces>0||cur&&!cur.air)&&this.ballT(1,r)<this.arrive(r,1)+0.8;   // 内野ゴロは駆け抜け。外野の打球は一塁への送球が間に合いそうなときだけ
        if(r.over&&!inIF&&r.dist(16.3,16.3)>2.5&&r.z<16.3){r.over=false;r.plan=1;r.goTo(16.3,16.3,{thru:true})}
        else if(r.over){if(r.tx==null)r.goTo(OVERRUN[0],OVERRUN[1],{thru:true});continue}
        if(inIF){r.plan=1;r.over=true;r.goTo(OVERRUN[0],OVERRUN[1],{react:true,thru:true});continue}
        if(r.plan!==1){r.plan=1;r.goTo(16.3,16.3,{react:true})}
        // 外野へ飛んだ：ふつうの走者と同じく、一塁の手前で二塁まで行くか決める
      }
      // 押し出し：次の塁までは必ず。フライが上がっているあいだは半分まで
      if(pf&&!r.rb.isBatter){const[cx,cz]=basePos(r.rb.forceBase);
        if(flying&&(catchable||r.half)&&w.outs<2){if(!r.half){r.half=true;const f=this.halfDist(r,lb)/FIELD.bd;r.goTo(lx+(cx-lx)*f,lz+(cz-lz)*f,{react:true})}continue}
        if(r.plan!==r.rb.forceBase||r.tx==null&&r.dist(cx,cz)>0.3){r.plan=r.rb.forceBase;r.half=false;r.goTo(cx,cz,{react:true})}continue}
      // フライ：捕られそうならハーフウェイ。深いフライなら塁に戻ってタッチアップの用意
      if(flying&&!r.rb.isBatter&&(catchable||r.half||r.tagUp)&&w.outs<2){
        const nb=lb+1;if(nb>4)continue;const[cx,cz]=basePos(nb);
        // タッチアップできるか：捕ってから送球がその塁に届く時間と、塁を離れて走って着く時間を比べる（深さの決め打ちはしない）
        const bT=PROF.transfer(sk(cur.f,'fld'))+0.15+D.ofT(cur.f,hyp(cur.x-cx,cur.z-cz))+(nb===4?0.15:0.25),rT=KE.etaRest(r,FIELD.bd,0.25);
        const deep=this.judge(r,bT-rT,nb===4?0.0:0.3,true);   // 本塁へのタッチアップはコーチが思いきって回す
        if(r.tagUp||deep&&nb<this.cap(r)+(nb===4?1:0)||nb>=this.cap(r)&&nb<4){r.tagUp=true;if(r.dist(lx,lz)>0.3&&(r.tx==null||hyp(r.tx-lx,r.tz-lz)>0.3))r.goTo(lx,lz,{react:true})}
        else if(!r.half){r.half=true;const f=this.halfDist(r,lb)/FIELD.bd;r.goTo(lx+(cx-lx)*f,lz+(cz-lz)*f,{react:true})}
        continue}
      r.half=false;
      if(r.rb.base>=4)continue;
      // 一塁を駆け抜けている最中はそのまま走り抜けてから戻る
      if(r.over&&r.tx!=null&&hyp(r.tx-OVERRUN[0],r.tz-OVERRUN[1])<0.1)continue;
      const cap=this.cap(r);
      // 挟まれている：進む・戻るのどちらがましかを見て、行ったり来たり
      if(r.rd){
        if(U.onBase(r)&&r.tx==null){r.rd=false;r.plan=null;r.dcs=null;continue}
        // ボールから遠ざかる向きへ（ボールが前の塁へ投げられたら引き返す）
        const fb=Math.min(lb+1,4),[fx,fz]=basePos(fb),bp=b.state==='held'?[b.x,b.z]:D.lastThrow?[D.lastThrow.x,D.lastThrow.z]:[b.x,b.z];
        const dF=hyp(bp[0]-fx,bp[1]-fz),dB=hyp(bp[0]-lx,bp[1]-lz),hy=r.plan===fb?-1.5:1.5;
        // 前の塁へ投げられても、ボールより先に着けそうならそのまま滑り込む
        const beat=r.plan===fb&&b.state!=='held'&&D.lastThrow&&this.arrive(r,fb)<Math.max(0,D.lastThrow.t1-t)+0.35;
        const want=(fb<cap||fb===4)&&(beat||dF>dB+hy)?fb:lb;
        if(r.plan!==want){r.plan=want;r.wait=Math.max(r.wait,0.25);const[x,z]=basePos(want);r.goTo(x,z)}
        if(t-r.rdT>15){r.rd=false;r.plan=fb}
        continue}
      // 走っている途中
      if(r.plan>lb){
        const pb=r.plan,[cx,cz]=basePos(pb);
        if(pb>=cap&&pb<4){r.plan=null;r.goTo(lx,lz);continue}
        const mf=this.ballT(pb,r)-this.arrive(r,pb),mb=this.ballT(lb,r)-this.arrive(r,lb);
        const prog=1-hyp(r.x-cx,r.z-cz)/FIELD.bd;
        // はっきり負ける（0.5秒以上）とわかったときだけ、走り出してすぐなら戻る
        // 戻れないし進んでも間に合わない（どちらも0.5秒以上負ける）なら、挟まれる
        if(mf<-0.5&&!pf){
          // 戻るほうがはっきり分がいい（戻れば間に合う）なら戻る
          if(mb>0.1&&mb>mf+0.3){r.plan=null;r.dcs={t:t+2,go:false};   // 引き返したら、しばらくは行き直さない（行ったり来たりしない）
            r.goTo(lx,lz);w.emit('retreat',{who:r.id});continue}
          // 進んでも戻っても間に合わない：戻るほうがましなら挟まれる。進むほうがましならそのまま滑り込む
          if(mb<-0.5&&mb>mf&&!U.onBase(r)){r.rd=true;r.rdT=t;w.emit('rundown',{who:r.id,name:r.name,base:lb});continue}}
        // 塁の手前で、その先まで行くか決める（行くなら止まらずに回る）
        const dd=r.dist(cx,cz);
        if(dd<5&&r.next==null&&pb<4){const nb2=pb+1,[ex,ez]=basePos(nb2);
          const m2=this.ballT(nb2,r)-(this.arrive(r,pb)+hyp(ex-cx,ez-cz)/r.vmax+0.3);
          r.next=(nb2<cap||nb2===4)&&this.judge(r,m2,0.2+(nb2===4?0.15:0))?nb2:0;
          r.goTo(cx,cz,{thru:r.next>0||this.rounds(r,pb)})}
        if(r.rb.base>=pb){const nx=r.next;r.next=null;r.dcs=null;
          if(nx){r.plan=nx;const[ex,ez]=basePos(nx);r.goTo(ex,ez,{thru:true})}
          else{r.plan=null;r.goTo(cx,cz)}}
        else if(r.tx==null)r.goTo(cx,cz,{thru:r.next>0});
        continue}
      // 外野へのヒット：打者走者は一塁を数歩回ってから戻る（オーバーラン）。その間も二塁へ行けるかは見続ける
      if(lb===1&&r.rb.isBatter&&r.roundP!==p&&this.rounds(r,1)&&r.dist(lx,lz)<1.2){r.roundP=p;r.plan=null;const[ex,ez]=basePos(2),k=2.5/FIELD.bd;r.goTo(lx+(ex-lx)*k+0.8,lz+(ez-lz)*k-0.8);r.roundT=t+1.2}
      // 塁にいる（駆け抜けた打者・回りすぎた走者も含む）：次の塁へ行けるか
      const nb=lb+1;if(nb>4)continue;
      const away=r.dist(lx,lz)>0.4;
      if(nb>=cap&&nb<4){if(away&&(r.tx==null||hyp(r.tx-lx,r.tz-lz)>0.3))r.goTo(lx,lz);continue}
      const[cx,cz]=basePos(nb);
      if(r.dcs==null||t-r.dcs.t>0.3){
        const m=this.ballT(nb,r)-this.arrive(r,nb),rdy=r.ready,go=this.judge(r,m,0.15+(nb===4?0.15:0),r.ready);r.dcs={t,go};r.ready=false;
        if(go){r.plan=nb;r.next=null;r.goTo(cx,cz,{react:!rdy});continue}}   // タッチアップのスタートは捕った瞬間（反応の遅れなし）
      if(r.roundT&&t<r.roundT&&r.tx!=null)continue;   // 回っている途中（回りきってから戻る）
      if(away&&(r.tx==null||hyp(r.tx-lx,r.tz-lz)>0.3))r.goTo(lx,lz);
    }
  }
  // 打者走者が一塁を回るか：外野へ抜けたヒット（ボールが外野にある）
  rounds(r,pb){const b=this.w.ball;return r.rb.isBatter&&pb===1&&!r.rd&&(this.def.ofTouched||hyp(b.x,b.z)>FIELD.infieldR+3)}
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
  resetField(){const w=this.w;for(const f of w.fielders){const[x,z]=this.def.posOf(f.role);f.x=x;f.z=z;f.vx=f.vz=0;f.stop();f.wait=0}
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
    this.curInn=inn;
    const w=this.w,T=this.teams[half],pl=T.players[this.order[half]%9];this.order[half]++;this.stat.PA++;
    const B=new KE.Player({id:pl.id,name:pl.name,sk:pl.sk,lefty:pl.lefty,team:half});B.x=B.lefty?0.95:-0.95;B.z=0;
    this.def.setDepth(sk(B,'bat'));this.def.batLefty=!!B.lefty;   // 打者を見て外野の深さ・盗塁のときの二塁カバーを決める
    w.emit('paStart',{inn,half,who:B.name});
    const cnt={b:0,s:0},P=()=>this.def.F.P,occ=b=>w.runners.find(r=>r.rb.base===b&&!r.rb.out&&!r.rb.scored);
    let guardP=0;
    while(guardP++<60){
      this.resetField();
      // 一塁ランナーがいて二塁が空いていれば、ファーストは一塁ベースについてランナーを見る
      if(occ(1)&&!occ(2)){const f=this.def.F['1B'];f.x=15.6;f.z=15.4}
      // ベンチの作戦（状況判断）：スクイズ・送りバント・盗塁・牽制
      const plan=this.manager(B,cnt,inn,half);
      if(plan.pick){this.pickoff(plan.pick);if(w.outs>=3)return;continue}
      // バント警戒：攻撃の作戦は見ずに、状況（ノーアウト一二塁・接戦・打つのが得意でない打者）から守備が読んで前へ。能力が低いと読み落とす
      {const Pp=P(),F=this.def.F,close=Math.abs(w.score[half]-w.score[1-half])<=2;
        if(w.outs===0&&(occ(1)||occ(2))&&!occ(3)&&cnt.s<2&&close&&sk(B,'bat')<sk(Pp,'thr')+15&&!this.rng.chance(0.4*Y(sk(F['3B'],'iq'))))for(const[r,dx]of[['1B',-1.5],['3B',1.5]]){const f=F[r];f.x+=dx;f.z-=5}}
      const pitch=KE.makePitch(P(),cnt,this.rng);this.stat.pitches++;
      // リード：塁から少し離れ、投球と同時にもう一歩（第2リード）。盗塁・スクイズの走者は投球と同時にスタート
      for(const r of w.runners){const b0=r.rb.base;if(b0<1||b0>3)continue;const[ax,az]=basePos(b0),[cx,cz]=basePos(b0+1),L=1.2+2.0*(1-Y(sk(r,'iq'))),d=FIELD.bd;
        const ux=(cx-ax)/d,uz=(cz-az)/d;r.x=ax+ux*L;r.z=az+uz*L;
        if(plan.steal.includes(r)){const jl=(0.6+0.5*Y(sk(P(),'thr')))*r.vmax*0.6;r.x+=ux*jl;r.z+=uz*jl;r.stealGo=true;r.awake=true;r.wait=0;r.goTo(cx,cz,{thru:true})}else r.goTo(ax+ux*(L+1.3),az+uz*(L+1.3),{frac:0.4})}
      // 投球を物理で飛ばす
      const aim=KE.aimThrow(REL,[pitch.px,0.3,pitch.ph],pitch.v),c=Math.cos(aim.el);
      w.ball.holder=null;w.ball.launch(REL,[Math.sin(aim.yaw)*pitch.v*c,Math.cos(aim.yaw)*pitch.v*c,pitch.v*Math.sin(aim.el)],[Math.cos(aim.yaw)*150,-Math.sin(aim.yaw)*150,0],'pitch');
      w.ball.from=P();w.ball.relT=w.t;w.emit('pitchOut',{steal:plan.steal.length>0,bunt:!!plan.bunt});
      if(plan.steal.some(r=>r.rb.base===1)&&!plan.bunt)this.def.stealStart();
      const sw=plan.bunt?KE.bunt(B,pitch,cnt,this.rng,plan.squeeze):plan.steal.length&&cnt.s<2&&this.rng.chance(0.75)?{swing:false}:KE.swing(B,pitch,cnt,this.rng);
      this.def.buntPlay=!!sw.bunt;   // 守備は打者の構えでバントとわかる
      let guard=0;while(w.ball.z>0.35&&w.ball.state==='air'&&guard++<300)w.step();
      const inZ=KE.inZone(pitch.px,pitch.ph);
      if(!sw.swing||!sw.contact){
        const C=this.def.F.C;let k3=false,bb=false;
        if(sw.swing||inZ){cnt.s++;if(cnt.s>=3)k3=true}else{cnt.b++;if(cnt.b>=4)bb=true}
        if(!k3&&!bb)w.emit('pitchResult',{r:sw.swing?'swing':inZ?'strike':'ball',b:cnt.b,s:cnt.s});
        if(sw.bunt&&sw.swing&&cnt.s>=3)k3=true;   // スリーバント失敗も三振
        // キャッチャーが捕れるか：ワンバウンドや大きくそれた球はこぼす（ワイルドピッチ・パスボール）
        const loose=!bb&&this.wild(pitch,C);
        // 振り逃げ：三振でもキャッチャーが捕れず、一塁が空いている（ツーアウトなら関係なし）
        const drop3=k3&&loose&&(!occ(1)||w.outs===2);
        if(k3&&!drop3){w.outs++;this.stat.K[half]++;w.emit('out',{who:B.id,name:B.name,outType:'strike',outs:w.outs});this.log(inn,half,B,'三振');
          if(w.outs>=3){this.clearSteal();return}}
        if(bb){this.walk(B);this.stat.BB[half]++;this.log(inn,half,B,'フォアボール');this.clearSteal();return}
        const live=plan.steal.length>0||loose||drop3;
        if(live){if(drop3){this.stat.K[half]++;w.emit('dropThird',{who:B.id,name:B.name})}
          this.livePlay(B,pitch,loose,drop3);
          if(drop3||k3||w.outs>=3)return}
        else for(let i=0;i<30;i++)w.step();
        if(k3)return;
        continue;
      }
      // 打った（バントも）
      this.stat.contacts.push({v:sw.v,va:sw.va,ang:sw.ang});w.emit('pitchResult',{r:sw.bunt?'bunt':'inplay',b:cnt.b,s:cnt.s});
      const res=this.play(B,sw,inn,half);
      this.clearSteal();
      if(res==='foul'){if(cnt.s<2||sw.bunt)cnt.s++;w.emit('pitchResult',{r:'foul',b:cnt.b,s:cnt.s});if(cnt.s>=3){w.outs++;this.stat.K[half]++;w.emit('out',{who:B.id,name:B.name,outType:'strike',outs:w.outs});this.log(inn,half,B,'スリーバント失敗');return}continue}
      return;
    }
  }
  clearSteal(){for(const r of this.w.runners)r.stealGo=false}
  // ベンチの作戦：その場の状況（点差・アウト・カウント・走者と捕手の力）で決める
  manager(B,cnt,inn,half){
    const w=this.w,rng=this.rng,occ=b=>w.runners.find(r=>r.rb.base===b&&!r.rb.out&&!r.rb.scored),res={steal:[]};
    const diff=w.score[half]-w.score[1-half],close=Math.abs(diff)<=2,late=inn>=4,C=this.def.F.C,Pp=this.def.F.P;
    // スクイズ：三塁ランナー・ツーアウト未満・接戦の終盤・追い込まれる前
    if(occ(3)&&w.outs<2&&cnt.s<2&&close&&inn>=3&&rng.chance(0.18)){res.bunt=true;res.squeeze=true;res.steal=[occ(3)];return res}
    // 送りバント：ノーアウトで一塁（一二塁）、接戦、打つのが得意でない子
    if(w.outs===0&&(occ(1)||occ(2))&&!occ(3)&&cnt.s<2&&close&&sk(B,'bat')<sk(Pp,'thr')+15&&rng.chance(0.4)){res.bunt=true;return res}
    // 盗塁：走者がボールより先に着ける見込み（投球の時間＋捕手の捕ってから投げるまで＋送球）で決める
    const pv=PROF.pitchV(sk(Pp,'thr'));
    for(const b of[2,1]){const r=occ(b);if(!r||occ(b+1)||cnt.b===3&&cnt.s===2)continue;if(b===2&&w.outs===2)continue;
      const[bx,bz]=basePos(b+1),L=1.2+2.0*(1-Y(sk(r,'iq'))),tDef=16/pv+PROF.transfer(sk(C,'fld'))*0.9+KE.throwTime(hyp(bx,bz),PROF.armV(sk(C,'thr')))+0.25;
      const jump=0.6+0.5*Y(sk(Pp,'thr')),tRun=KE.etaRest(r,FIELD.bd-L,0.12)-jump,m=tDef-tRun+rng.gauss()*0.6*Y(sk(r,'iq'));   // 投手が投げ始めた瞬間にスタート（投球動作の分だけ先に出る）
      if(m>-0.1&&rng.chance(0.3+0.4*Math.min(1,m+0.1))){res.steal=[r];break}}
    // 牽制：一塁ランナーのリードが大きいとき、ときどき
    if(!res.steal.length&&occ(1)&&!occ(2)&&rng.chance(0.05+0.05*(1-Y(sk(Pp,'iq')))))res.pick=occ(1);
    return res}
  // ワイルドピッチ・パスボール：ワンバウンドや大きくそれた球ほど、捕手がうまくないほどこぼす
  wild(pitch,C){const low=Math.max(0,0.3-pitch.ph),wide=Math.max(0,Math.abs(pitch.px)-0.4),y=Y(sk(C,'fld'));
    const p=clamp((low*3.5+wide*2.5)*(0.1+0.55*y)+0.002+0.008*y,0,0.5);return this.rng.chance(p)}
  // 投球のあとのプレー（盗塁・ワイルドピッチ・振り逃げ）
  livePlay(B,pitch,loose,drop3){
    const w=this.w,C=this.def.F.C,steal=w.runners.filter(r=>r.stealGo);
    const f0=w.frames.length,t0=w.t,i0=w.log.length;
    this.def.reset();this.run_.reset();
    if(drop3){B.x=B.lefty?0.95:-0.95;B.z=0;B.vx=B.vz=0;B.stop();B.awake=true;B.wait=0.25;w.runners.push(B);B.side='R';
      B.rb={base:0,start:0,isBatter:true,out:false,scored:false,forceBase:null,forcer:null,mustRetouch:false,arr:{},judged:{}}}
    w.umpire.startPlay({forceAll:drop3});   // 振り逃げは打者が一塁へ。押し出しの鎖もできる
    for(const r of steal){r.plan=r.rb.base+1;r.goTo(...basePos(r.plan),{thru:true})}
    if(loose){const a=this.rng.range(-2.4,2.4),sp=this.rng.range(3,8);w.release([pitch.px*0.6,-0.4,0.25],[Math.sin(a)*sp,-Math.abs(Math.cos(a))*sp,0.6],null,'deflect');w.emit('wildPitch',{})}
    else{w.ball.state='held';w.ball.holder=C;w.ball.x=C.x;w.ball.z=C.z;w.give(C,'catch')}
    let n=0;while(!w.umpire.ended&&n++<60*45){this.def.tick();this.run_.tick();w.step()}
    if(!w.umpire.ended)w.umpire.endPlay('time');
    this.clearSteal();w.runners=w.runners.filter(r=>!r.rb.out&&!r.rb.scored&&r.rb.base>0);
    const L=w.log.slice(i0),outs=L.filter(e=>e.type==='out').length,runs=L.filter(e=>e.type==='home').length;
    this.plays.push({inn:this.curInn,half:w.half,who:B.name,txt:(drop3?'振り逃げ':loose?'ワイルドピッチ':'盗塁')+(outs?`（アウト${outs}）`:'')+(runs?`（${runs}点）`:''),outs:w.outs,score:[...w.score],f0,f1:w.frames.length,t0,t1:w.t,ev:L,live:true})}
  // 牽制：投手が一塁へ投げ、ランナーは帰塁する
  pickoff(r){
    const w=this.w,Pp=this.def.F.P,F1=this.def.F['1B'],[bx,bz]=basePos(1),[cx,cz]=basePos(2);
    const f0=w.frames.length,t0=w.t,i0=w.log.length;
    this.def.reset();this.run_.reset();
    const L=1.2+2.0*(1-Y(sk(r,'iq'))),ux=(cx-bx)/FIELD.bd,uz=(cz-bz)/FIELD.bd;r.x=bx+ux*(L+0.5);r.z=bz+uz*(L+0.5);
    F1.x=bx+0.2;F1.z=bz-0.4;w.umpire.startPlay({});r.awake=false;r.goTo(bx,bz,{react:true});
    const aim=w.throwTo(Pp,[bx,bz,1.0],1,0.75);this.def.lastThrow={x:bx,z:bz,t1:w.t+aim.t,to:F1,base:1};this.def.cover={1:F1};w.emit('pickoff',{who:r.id});
    let n=0;while(!w.umpire.ended&&n++<60*45){this.def.tick();this.run_.tick();w.step()}
    if(!w.umpire.ended)w.umpire.endPlay('time');
    w.runners=w.runners.filter(q=>!q.rb.out&&!q.rb.scored&&q.rb.base>0);
    const Lg=w.log.slice(i0);this.plays.push({inn:this.curInn,half:w.half,who:r.name,txt:'牽制'+(Lg.some(e=>e.type==='out')?'（アウト）':''),outs:w.outs,score:[...w.score],f0,f1:w.frames.length,t0,t1:w.t,ev:Lg,live:true})}
  walk(B){const w=this.w,occ=b=>w.runners.find(r=>r.rb.base===b&&!r.rb.out&&!r.rb.scored);
    // 押し出し：一塁から続いているランナーだけ1つずつ進む
    const chain=[];for(let b=1;b<=3;b++){const r=occ(b);if(r)chain.push(r);else break}
    for(const r of chain.reverse()){r.rb.base++;if(r.rb.base===4){r.rb.scored=true;w.score[w.half]++;w.emit('home',{who:r.id,name:r.name,walk:true})}}
    w.addRunner(B,1,false);w.emit('walk',{who:B.id});
  }
  play(B,sw,inn,half){
    const w=this.w;this.playErr=0;
    B.x=B.lefty?0.95:-0.95;B.z=0;B.vx=B.vz=0;B.stop();B.plan=null;B.route=null;B.awake=true;B.wait=0.1+0.2*Y(sk(B,'iq'));   // 振り終わってすぐ走り出す
    w.runners.push(B);B.side='R';B.rb={base:0,start:0,isBatter:true,out:false,scored:false,forceBase:null,forcer:null,mustRetouch:false,arr:{},judged:{}};
    this.def.reset();this.run_.reset();
    // 投球と同時に塁から数歩出ている（第2リード）：二塁走者は大きめ。ツーアウトならさらにスタートを切っている
    for(const r of w.liveRunners){if(r===B||r.rb.base<1||r.rb.base>3)continue;const[bx,bz]=basePos(r.rb.base),[nx,nz]=basePos(r.rb.base+1),d=hyp(nx-bx,nz-bz);
      const L=(r.rb.base===2?3.5:2.5)*(0.55+0.45*sk(r,'run')/100)+(w.outs===2?1.5:0)+(r.stealGo?4:0);r.x=bx+(nx-bx)/d*L;r.z=bz+(nz-bz)/d*L;r.vx=r.vz=0;r.stop();r.awake=true;r.wait=0.05;
      if(r.stealGo){r.plan=r.rb.base+1;r.goTo(nx,nz,{thru:true})}}   // 盗塁・スクイズでスタートを切っていた走者はそのまま次の塁へ
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
  log(inn,half,B,txt,ex={}){this.w.emit('paEnd',{txt});this.plays.push({inn,half,who:B.name,txt,outs:this.w.outs,score:[...this.w.score],...ex})}
}
KE.Game=Game;

if(typeof module!=='undefined'&&module.exports)module.exports=KE;
})(typeof window!=='undefined'?window:globalThis);
