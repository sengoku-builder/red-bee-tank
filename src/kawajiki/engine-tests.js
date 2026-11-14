/* 新しい試合エンジン 第1段の自動チェック
   node でもブラウザでも動く： KT.runAll(KE,{stress:300}) → {tests,stress} */
(function(root){
'use strict';
const KT={};
const hyp=Math.hypot,RPM=Math.PI/30,DEG=Math.PI/180;

function mk(KE,id,role,lv=60,o={}){const s={};['bat','fld','thr','run','iq'].forEach(k=>s[k]=o[k]??lv);
  const p=new KE.Player({id,name:o.name||id,role,sk:s});const ps=KE.FIELD.pos[role];if(ps){p.x=ps[0];p.z=ps[1]}if(o.at){p.x=o.at[0];p.z=o.at[1]}return p}
// 打球：v(m/s)・上下の角度va(度)・左右ang(度、＋が一塁側)・バックスピン/横回転(rpm)
function hitVec(v,va,ang,back=0,side=0){const ux=Math.sin(ang*DEG),uz=Math.cos(ang*DEG),c=Math.cos(va*DEG);
  return{p:[0.3,0.5,0.9],v:[ux*v*c,uz*v*c,v*Math.sin(va*DEG)],w:[uz*back*RPM,-ux*back*RPM,side*RPM]}}
function grounder(w){w.umpire.startPlay({batted:true});w.umpire.play.fair=true;w.umpire.play.fly=false}
function bat(w,h){w.release(h.p,h.v,h.w,'bat')}
// 走者の道順（塁を順に回る）
function route(r,bases){r.route=bases.slice();}
function routeTick(w){for(const r of w.runners){if(r.rb.out||!r.route||!r.route.length||r.tx!=null&&r.speed>0.2)continue;
  const b=r.route[0],[bx,bz]=KE_.basePos(b);if(hyp(r.x-bx,r.z-bz)<0.1){r.route.shift();continue}if(r.tx==null)r.goTo(bx,bz,{react:true})}}
let KE_=null;
function catchNear(w,f,reach=1.0){const b=w.ball;if(!w.canCatch(f))return false;
  if(hyp(b.x-f.x,b.z-f.z)<reach&&b.h<2.3){w.give(f,b.state==='air'&&b.bounces===0?'catch':'pickup');return true}return false}
function scene(KE,seed,setup,each,sec=20){
  const w=new KE.World({seed,record:true}),ck=new KE.Checker(w,{ai:false}),S={w,ck};setup(S);
  w.run(sec,()=>{routeTick(w);each&&each(S)});
  return S;
}
const outsOf=w=>w.log.filter(e=>e.type==='out');

/* ================= ボールの物理 ================= */
function physics(KE,T){
  const add=(name,ok,detail)=>T.push({group:'ボールの飛び方',name,ok,detail});
  const land=h=>{const b=new KE.Ball();b.launch(h.p,h.v,h.w);let t=0;while(t<12&&b.bounces===0&&b.state!=='out'){b.step(1/60);t+=1/60}return{t,d:hyp(b.x,b.z),b}};
  { const b=new KE.Ball();b.launch([0,0,10],[0,0,0]);let t=0;while(b.bounces===0){b.step(1/60);t+=1/60}
    add('10mの高さから落とすと約1.4秒で地面につく',t>1.38&&t<1.55,`${t.toFixed(2)}秒`);}
  { const ds=[18,22,26,30].map(v=>land(hitVec(v,25,0,1800)).d);
    add('打球の速さが上がるほど遠くへ飛ぶ（25度・バックスピン）',ds.every((d,i)=>!i||d>ds[i-1])&&ds[3]>48&&ds[3]<75,
      ds.map((d,i)=>`${[65,79,94,108][i]}km/h→${d.toFixed(0)}m`).join('、'));}
  { const a=land(hitVec(30,25,0,0)).d,b=land(hitVec(30,25,0,2200)).d;
    add('バックスピンのフライは伸びる',b>a+2,`回転なし${a.toFixed(0)}m／バックスピン${b.toFixed(0)}m`);}
  { const r=land(hitVec(26,77,10,1500));add('ポップフライは高く上がって近くに落ちる',r.t>3&&r.t<6&&r.d<25,`滞空${r.t.toFixed(1)}秒・${r.d.toFixed(0)}m`);}
  { const b=new KE.Ball(),h=hitVec(22,-8,-20,-1200);b.launch(h.p,h.v,h.w);let t=0,first=null,rolled=false;
    while(t<15&&b.state!=='rest'){b.step(1/60);t+=1/60;if(b.bounces&&first==null)first=hyp(b.x,b.z);if(b.state==='ground')rolled=true}
    add('強いゴロは手前ではねて、転がって止まる',first<8&&rolled&&b.bounces>=2,`最初のバウンド${first.toFixed(1)}m・${b.bounces}回はねて${hyp(b.x,b.z).toFixed(0)}mで止まる`);}
  { const b=new KE.Ball(),h=hitVec(42,30,0,2000);b.launch(h.p,h.v,h.w);let t=0;while(t<10&&b.state!=='out'&&b.bounces===0){b.step(1/60);t+=1/60}
    add('フェンスを越えたらホームラン（フェア）',b.state==='out'&&b.over&&b.over.fair&&!b.over.bounced,b.over?`越えた・フェア=${b.over.fair}`:'越えない');}
  { const b=new KE.Ball(),h=hitVec(42,30,52,2000);b.launch(h.p,h.v,h.w);let t=0;while(t<10&&b.state!=='out'&&b.bounces===0){b.step(1/60);t+=1/60}
    add('ポールの外を越えたらファウル',b.state==='out'&&b.over&&!b.over.fair,'');}
  { const b=new KE.Ball(),h=hitVec(46,10,-5,500);b.launch(h.p,h.v,h.w);let t=0;while(t<10&&!b.wall&&b.state!=='rest'){b.step(1/60);t+=1/60}
    add('低い強い打球はフェンスに当たってはね返る',b.wall&&b.state!=='out','');}
  { const a=land(hitVec(28,22,0,1500,0)),b=land(hitVec(28,22,0,1500,-900));
    add('横回転の打球は一塁側へ切れていく',b.b.x>a.b.x+1.5,`回転なし x=${a.b.x.toFixed(1)}m／横回転 x=${b.b.x.toFixed(1)}m`);}
  // 送球
  const miss=(thr,n,seed)=>{const rng=KE.makeRng(seed),f=mk(KE,'s','SS',thr),ds=[];let tt=0;
    for(let i=0;i<n;i++){const from=[f.x,f.z,1.6],to=[16.3,16.3,1.2],aim=KE.aimThrow(from,to,KE.PROF.armV(thr)),tv=KE.throwVec(aim,f,rng);
      const b=new KE.Ball();b.launch(from,tv.v,tv.w);let best=99,t=0,bt=0;while(t<4){b.step(1/120);t+=1/120;const d=hyp(b.x-16.3,b.z-16.3,b.h-1.2);if(d<best){best=d;bt=t}}ds.push(best);tt+=bt}
    ds.sort((a,b)=>a-b);return{med:ds[n>>1],p90:ds[(n*0.9)|0],t:tt/n}};
  { const f=mk(KE,'s','SS',60),from=[f.x,f.z,1.6],aim=KE.aimThrow(from,[16.3,16.3,1.2],KE.PROF.armV(60));
    const b=new KE.Ball(),c=Math.cos(aim.el);b.launch(from,[Math.sin(aim.yaw)*aim.v0*c,Math.cos(aim.yaw)*aim.v0*c,aim.v0*Math.sin(aim.el)],[Math.cos(aim.yaw)*120,-Math.sin(aim.yaw)*120,0]);
    let best=99,t=0,bt=0;while(t<3){b.step(1/120);t+=1/120;const d=hyp(b.x-16.3,b.z-16.3,b.h-1.2);if(d<best){best=d;bt=t}}
    add('ねらいどおりの送球はちょうど一塁手の胸に届く',best<0.3&&bt>0.7&&bt<1.7,`ずれ${best.toFixed(2)}m・${bt.toFixed(2)}秒`);}
  { const s=miss(90,200,3),w=miss(25,200,3);
    add('肩の弱い子ほど送球がそれる（S級はほぼ正確）',s.p90<0.9&&w.med>s.med*2.5,`S級：ふつう${s.med.toFixed(2)}m・悪いとき${s.p90.toFixed(2)}m／能力25：ふつう${w.med.toFixed(2)}m・悪いとき${w.p90.toFixed(2)}m`);
    add('S級の送球は速い',s.t<w.t*0.75,`ショート→一塁 S級${s.t.toFixed(2)}秒／能力25 ${w.t.toFixed(2)}秒`);}
  { const aim=KE.aimThrow([-30,55,1.6],[0,0,1.2],KE.PROF.armV(15));
    add('肩が足りない遠投はワンバウンドで返ってくる',aim.short===true,`レフト奥→ホーム ${aim.dist.toFixed(0)}m・能力15`);}
  { const r1=[],r2=[];for(const arr of[r1,r2]){const w=new KE.World({seed:7}),f=w.addFielder(mk(KE,'s','SS',40));w.give(f);w.throwTo(f,[16.3,16.3,1.2]);w.run(2);arr.push(w.ball.x,w.ball.z,w.ball.h)}
    add('同じ種なら同じ結果になる（再現できる）',r1.every((v,i)=>v===r2[i]),'');}
}

/* ================= 選手の動き ================= */
function movement(KE,T){
  const add=(name,ok,detail)=>T.push({group:'選手の動き',name,ok,detail});
  const toFirst=run=>{const w=new KE.World({seed:1}),b=w.addRunner(mk(KE,'b','',60,{run,at:[0.6,0]}),0,true);w.umpire.startPlay({});b.goTo(16.3,16.3,{react:true});
    let t=0;while(t<10&&!(b.rb.arr[1]!=null)){w.step();t+=w.dt}return t};
  const ts=[20,50,90].map(toFirst);
  add('ホーム→一塁（23m）の時間が走力で変わる',ts[0]>ts[1]&&ts[1]>ts[2]&&ts[1]>3.8&&ts[1]<5.3&&ts[2]<4.4,`走力20：${ts[0].toFixed(2)}秒、50：${ts[1].toFixed(2)}秒、90：${ts[2].toFixed(2)}秒`);
  let worst=0;for(const[run,d]of[[30,8],[60,15],[90,25],[50,3]]){const w=new KE.World(),p=w.addFielder(mk(KE,'f','CF',60,{run}));const e=p.eta(p.x+d*0.6,p.z-d*0.8);
    p.goTo(p.x+d*0.6,p.z-d*0.8,{react:true});let t=0;while(t<12&&(p.tx!=null)){w.step();t+=w.dt}worst=Math.max(worst,Math.abs(t-e))}
  add('「何秒で着くか」の見込みが実際と合う',worst<0.35,`いちばん大きいずれ ${worst.toFixed(2)}秒`);
  const re=[20,60,95].map(s=>KE.PROF.react(s));
  add('野球の頭が良いほど反応が速い',re[0]>re[1]&&re[1]>re[2]&&re[2]<0.25,re.map(v=>v.toFixed(2)+'秒').join('→'));
}

/* ================= 審判役 ================= */
function umpire(KE,T){
  const add=(name,ok,detail,S)=>T.push({group:'審判（アウト・セーフ）',name,ok,detail:detail+(S&&S.ck.v.length?` ／チェック:${S.ck.v.map(v=>v.msg).join('、')}`:''),frames:S&&S.w.frames,log:S&&S.w.log.filter(e=>/out|safe|home|playEnd|fair|foul|hr|groundRule|runVoid|flyCatch|retouch/.test(e.type))});
  // ショートゴロ→一塁送球
  const groundOut=(throwAt,seed=1)=>scene(KE,seed,S=>{const w=S.w;S.ss=w.addFielder(mk(KE,'ss','SS',60,{at:[-6,27]}));S.fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));
      S.b=w.addRunner(mk(KE,'打者','',60,{at:[0.6,0]}),0,true);grounder(w);w.give(S.ss,'pickup');route(S.b,[1]);S.thrown=false},
    S=>{const w=S.w;if(!S.thrown&&w.t>=throwAt){S.thrown=true;w.throwTo(S.ss,[S.fb.x,S.fb.z,1.2],0)}catchNear(w,S.fb,1.2)},10);
  { const S=groundOut(1.2),o=outsOf(S.w);add('ショートゴロ：送球が先に届けば一塁アウト（フォース）',o.length===1&&o[0].outType==='force'&&!S.ck.v.length,o.map(e=>`${e.outType} 差${e.margin}秒`).join(''),S);}
  { const S=groundOut(4.2),o=outsOf(S.w);add('送球が遅ければ一塁セーフ',o.length===0&&S.b.rb.base===1&&!S.ck.v.length,`打者は${S.b.rb.base}塁`,S);}
  // きわどい一塁：差ごとの割合
  { const base=scene(KE,1,S=>{const w=S.w;S.b=w.addRunner(mk(KE,'打者','',60,{at:[0.6,0]}),0,true);grounder(w);route(S.b,[1])},null,8);
    const ta=base.b.rb.arr[1],rows=[];let ok=true;
    for(const[dl,lo,hi]of[[-0.15,1,1],[-0.05,0.62,0.92],[0,0.38,0.62],[0.05,0.12,0.38],[0.15,0,0]]){let outs=0;const N=240;
      for(let i=0;i<N;i++){const w=new KE.World({seed:100+i}),fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]})),b=w.addRunner(mk(KE,'打者','',60,{at:[0.6,0]}),0,true);
        grounder(w);route(b,[1]);let given=false;
        w.run(7,()=>{routeTick(w);if(!given&&w.t>=ta+dl-1e-9){given=true;w.give(fb,'catch')}});if(b.rb.out)outs++}
      const r=outs/N;rows.push(`${dl<0?'送球が'+(-dl)+'秒先':dl>0?'走者が'+dl+'秒先':'同時'}→アウト${Math.round(r*100)}%`);if(r<lo-0.001||r>hi+0.001)ok=false}
    add('きわどいとき（差0.1秒未満）だけ五分五分に近づく',ok,rows.join('、'));}
  // ゲッツー
  { const S=scene(KE,2,S=>{const w=S.w;S.ss=w.addFielder(mk(KE,'ss','SS',70,{at:[-1.2,30.8]}));S.fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));
      S.r1=w.addRunner(mk(KE,'一塁走者','',50),1);S.b=w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);grounder(w);
      w.give(S.ss,'pickup');route(S.b,[1]);route(S.r1,[2]);S.ss.goTo(0,32.6);S.st=0},
    S=>{const w=S.w;if(S.st===0&&w.ball.holder===S.ss&&S.r1.rb.out){S.st=1;w.throwTo(S.ss,[S.fb.x,S.fb.z,1.2],0)}catchNear(w,S.fb,1.2)},10);
    const o=outsOf(S.w);add('ゲッツー：二塁フォース→一塁フォース',o.length===2&&o[0].base===2&&o[1].base===1&&o.every(e=>e.outType==='force')&&!S.ck.v.length,o.map(e=>`${e.base}塁${e.outType}`).join('→'),S);}
  // フォースが消える
  { const S=scene(KE,3,S=>{const w=S.w;S.fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));S.ss=w.addFielder(mk(KE,'ss','SS',60,{at:[0,32.6]}));
      S.r1=w.addRunner(mk(KE,'一塁走者','',30),1);S.b=w.addRunner(mk(KE,'打者','',30,{at:[0.6,0]}),0,true);grounder(w);
      w.give(S.fb,'pickup');route(S.b,[1]);S.r1.goTo(4.5,28.3,{react:true});S.st=0},
    S=>{const w=S.w;if(S.st===0&&S.b.rb.out){S.st=1;w.throwTo(S.fb,[0,32.6,1.2],0)}catchNear(w,S.ss,1.2)},8);
    const o=outsOf(S.w);add('打者が一塁でアウトになると、二塁はベースを踏むだけではアウトにならない',o.length===1&&o[0].base===1&&!S.r1.rb.out&&S.w.ball.holder===S.ss,'二塁走者は二塁の手前で止まり、ショートは二塁ベース上',S);}
  // タッチ
  { const S=scene(KE,4,S=>{const w=S.w;S.r=w.addRunner(mk(KE,'走者','',50,{at:[-8,24.5]}),2);S.r.x=-8;S.r.z=24.5;S.f=w.addFielder(mk(KE,'3b','3B',60,{at:[-14,18]}));
      w.umpire.startPlay({});w.give(S.f,'pickup');S.f.goTo(-8.3,24.2)},null,5);
    const o=outsOf(S.w);add('塁と塁のあいだの走者にタッチ→アウト',o.length===1&&o[0].outType==='tag'&&!S.ck.v.length,'',S);}
  { const S=scene(KE,5,S=>{const w=S.w;S.r=w.addRunner(mk(KE,'走者','',50),2);S.f=w.addFielder(mk(KE,'ss','SS',60,{at:[-5,28]}));
      w.umpire.startPlay({});w.give(S.f,'pickup');S.f.goTo(-0.4,32.3)},null,4);
    add('塁の上にいる走者はタッチされてもセーフ',outsOf(S.w).length===0,'',S);}
  { const S=scene(KE,6,S=>{const w=S.w;S.r=w.addRunner(mk(KE,'走者','',50,{at:[-8,24.5]}),2);S.r.x=-8;S.r.z=24.5;S.f=w.addFielder(mk(KE,'3b','3B',60,{at:[-11,22]}));
      w.umpire.startPlay({});w.give(S.f,'pickup')},null,3);
    add('離れていればアウトにならない（3m）',outsOf(S.w).length===0,'',S);}
  // 一塁の駆け抜け
  { const run=(turn)=>scene(KE,7,S=>{const w=S.w;S.f=w.addFielder(mk(KE,'1b','1B',60,{at:[18.5,17]}));S.b=w.addRunner(mk(KE,'打者','',60,{at:[0.6,0]}),0,true);
      grounder(w);w.give(S.f,'pickup');S.b.goTo(20,20,{react:true});S.st=0},
    S=>{const w=S.w,b=S.b;if(S.st===0&&b.tx==null){S.st=1;if(turn)b.goTo(15,21.5);else b.goTo(17.4,17.4)}
      if(S.st===1&&b.tx==null){S.st=2;S.f.goTo(b.x+0.3,b.z+0.3)}},12);
    const a=run(false),b=run(true);
    add('一塁を駆け抜けて戻る打者はタッチされてもアウトにならない',outsOf(a.w).length===0,'',a);
    add('一塁を回って二塁へ向かいかけたら、タッチでアウト',outsOf(b.w).length===1,'',b);}
  // フライとリタッチ
  const flyPlay=(seed,setup,each,sec)=>scene(KE,seed,S=>{const w=S.w;S.cf=w.addFielder(mk(KE,'cf','CF',60));S.b=w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);setup(S);
      w.umpire.startPlay({batted:true});const h=hitVec(27,38,-2,1800);bat(w,h);route(S.b,[1]);
      const pr=KE.predict(w.ball,8,0.05),L=pr.find(q=>q[5]>0||q[3]<1.5&&q[0]>1);S.cf.goTo(L[1],L[2],{react:true});S.land=L},
    S=>{catchNear(S.w,S.cf,1.0);each&&each(S)},sec);
  { const S=flyPlay(8,S=>{const w=S.w;S.cf.sk.thr=95;S.fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));S.r1=w.addRunner(mk(KE,'一塁走者','',30),1);route(S.r1,[2]);S.st=0},
      S=>{const w=S.w;if(S.st===0&&w.ball.holder===S.cf){S.st=1;S.r1.route=[1];S.r1.goTo(16.3,16.3);w.throwTo(S.cf,[16.3,16.3,1.2],0)}catchNear(w,S.fb,1.3)},14);
    const o=outsOf(S.w);add('フライを捕ったら打者アウト、飛び出した一塁走者は一塁に送球されてアウト',o.length===2&&o[0].outType==='fly'&&o[1].outType==='appeal'&&!S.ck.v.length,o.map(e=>e.outType).join('→'),S);}
  { const S=flyPlay(9,S=>{const w=S.w;S.r3=w.addRunner(mk(KE,'三塁走者','',60),3);S.c=w.addFielder(mk(KE,'c','C',60,{at:[0,-1.25]}));S.st=0},
      S=>{const w=S.w;if(S.st===0&&w.ball.holder===S.cf){S.st=1;route(S.r3,[4])}},14);
    add('タッチアップ：捕ったあとにスタートした三塁走者のホームインは1点',S.w.score[0]===1&&outsOf(S.w).length===1&&!S.ck.v.length,`得点${S.w.score[0]}`,S);}
  { const S=flyPlay(10,S=>{const w=S.w;S.r3=w.addRunner(mk(KE,'三塁走者','',60),3);S.c=w.addFielder(mk(KE,'c','C',60,{at:[0,-1.25]}));route(S.r3,[4]);S.st=0},
      S=>{const w=S.w;if(S.st===0&&w.ball.holder===S.cf){S.st=1;w.throwTo(S.cf,[-16.3,16.3,1.2],0)}if(S.st===1&&!S.p3){S.p3=w.addFielder(mk(KE,'3b','3B',60,{at:[-16.3,16.3]}))}if(S.p3)catchNear(w,S.p3,1.4)},16);
    const o=outsOf(S.w);add('捕る前にスタートしてホームを踏んでも、三塁に送球されたらアウト・得点なし',S.w.score[0]===0&&o.length===2&&o[1].outType==='appeal',`得点${S.w.score[0]}・${o.map(e=>e.outType).join('→')}`,S);}
  // 3アウト目と得点
  const third=(seed,tagFirst)=>scene(KE,seed,S=>{const w=S.w;w.outs=2;S.r3=w.addRunner(mk(KE,'三塁走者','',60),3);S.r2=w.addRunner(mk(KE,'二塁走者','',40),2);
      S.b=w.addRunner(mk(KE,'打者','',60,{at:[0.6,0]}),0,true);S.f=w.addFielder(mk(KE,'3b','3B',60,{at:[-12,26]}));
      grounder(w);w.give(S.f,'pickup');route(S.r3,[4]);route(S.b,[1]);S.st=0},
    S=>{const w=S.w;if(w.t>3&&!S.go){S.go=1;route(S.r2,[3])}if(S.st===0&&(tagFirst?w.t>0.3:S.r3.rb.scored)){S.st=1;if(tagFirst)S.f.goTo(S.r2.x-0.3,S.r2.z-0.3);else S.f.goTo(-13.6,19.4)}},12);
  { const S=third(11,false);add('3アウト目がタッチで、その前にホームインしていれば1点',S.w.score[0]===1&&S.w.outs===3,`得点${S.w.score[0]}`,S);}
  { const S=third(12,true),o=outsOf(S.w);add('ホームインより先に3アウト目なら得点なし',S.w.score[0]===0&&S.w.outs===3,`得点${S.w.score[0]}`,S);}
  { const S=scene(KE,13,S=>{const w=S.w;w.outs=2;S.r3=w.addRunner(mk(KE,'三塁走者','',90),3);S.r1=w.addRunner(mk(KE,'一塁走者','',20),1);
      S.b=w.addRunner(mk(KE,'打者','',20,{at:[0.6,0]}),0,true);S.f=w.addFielder(mk(KE,'2b','2B',60,{at:[1.5,31]}));
      grounder(w);w.give(S.f,'pickup');route(S.r3,[4]);route(S.r1,[2]);route(S.b,[1]);S.st=0},
    S=>{const w=S.w;if(S.st===0&&S.r3.rb.scored){S.st=1;S.f.goTo(0,32.6)}},10);
    const o=outsOf(S.w);add('3アウト目がフォースなら、先にホームインしていても得点なし',S.w.score[0]===0&&o.length===1&&o[0].outType==='force'&&S.w.log.some(e=>e.type==='runVoid'),`得点${S.w.score[0]}`,S);}
  // フェア・ファウル
  const fairCase=(name,h,expect,pre)=>{const S=scene(KE,14,S=>{const w=S.w;S.b=w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);w.umpire.startPlay({batted:true});
      if(pre)pre(S);else bat(w,h)},null,12);const e=S.w.log.find(e=>e.type==='fair'||e.type==='foul');
    add(name,e&&e.type===expect,e?`${e.type==='fair'?'フェア':'ファウル'}（${({land:'落ちた場所',pass:'塁を過ぎた場所',stop:'止まった場所',touch:'触れた場所',wall:'フェンス',over:'越えた場所'})[e.why]||e.why}）`:'判定なし',S)};
  fairCase('一塁の手前で転がって外へ出て止まる→ファウル',null,'foul',S=>{const w=S.w;w.ball.launch([0.5,2,0.04],[6.2*Math.sin(60*DEG),6.2*Math.cos(60*DEG),0],null,'bat');w.ball.state='ground';w.emit('loose',{})});
  fairCase('一塁より先のフェアに落ちてから外へ切れる→フェア',hitVec(24,30,41,800,-600),'fair');
  fairCase('一塁より先のファウルに落ちる→ファウル',hitVec(22,20,48,600),'foul');
  { const S=scene(KE,15,S=>{const w=S.w;S.b=w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);w.umpire.startPlay({batted:true});const h=hitVec(18,68,58,1500);bat(w,h);
      const pr=KE.predict(w.ball,8,0.05),L=pr.find(q=>q[0]>1&&q[3]<1.4);S.f=w.addFielder(mk(KE,'1b','1B',60,{at:[L[1]-4,L[2]+3]}));S.f.goTo(L[1],L[2],{react:true})},S=>catchNear(S.w,S.f,1.0),10);
    const o=outsOf(S.w);add('ファウルフライを捕ったらアウト',o.length===1&&o[0].outType==='fly'&&S.w.log.some(e=>e.type==='foulFlyOut'),'',S);}
  // ホームラン・エンタイトル
  const award=(seed,h,n,pre)=>scene(KE,seed,S=>{const w=S.w;S.r=[1,2,3].map(b=>w.addRunner(mk(KE,`${b}塁走者`,'',50),b));S.b=w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);
      w.umpire.startPlay({batted:true});if(pre)pre(S);else bat(w,h);w.on('hr',()=>w.runners.forEach(r=>route(r,[1,2,3,4].filter(b=>b>r.rb.start))));
      w.on('groundRule',()=>w.runners.forEach(r=>route(r,[1,2,3,4].filter(b=>b>r.rb.start&&b<=r.rb.start+2))))},null,60);
  { const S=award(16,hitVec(42,30,-15,2000));add('満塁ホームラン→全員ホームインで4点',S.w.score[0]===4&&!S.ck.v.length,`得点${S.w.score[0]}`,S);}
  { const S=award(17,null,0,S=>{const w=S.w;w.ball.launch([14,72,0.04],[2.5,9,7],null,'bat');w.ball.bounces=1;w.emit('bounce',{x:12,z:52,n:1})});const gr=S.w.log.some(e=>e.type==='groundRule');
    add('はねてフェンスを越えたら2つ進める（エンタイトル二塁打）',gr&&S.w.score[0]===2&&S.b.rb.base===2,gr?`得点${S.w.score[0]}・打者は${S.b.rb.base}塁`:'フェンスを越えなかった',S);}
  // 同じ塁に2人
  { const S=scene(KE,18,S=>{const w=S.w;S.a=w.addRunner(mk(KE,'前の走者','',50),2);S.b=w.addRunner(mk(KE,'後ろの走者','',50),1);
      S.f=w.addFielder(mk(KE,'ss','SS',60,{at:[-3,31]}));w.umpire.startPlay({});S.b.x=0.15;S.b.z=32.3;S.b.rb.base=2;w.give(S.f,'pickup');S.f.goTo(0.3,32.1)},null,4);
    const o=outsOf(S.w);add('同じ塁に2人いてタッチされたら、後ろの走者がアウト',o.length===1&&o[0].who==='後ろの走者',o.map(e=>e.name).join(''),S);}
}

/* ================= 自動チェックそのものの確認 ================= */
function checker(KE,T){
  const add=(name,ok,detail)=>T.push({group:'自動チェックが見つけられるか',name,ok,detail});
  const W=()=>{const w=new KE.World({seed:5}),ck=new KE.Checker(w);return{w,ck}};
  { const{w,ck}=W(),r=w.addRunner(mk(KE,'走者','',50,{at:[-8,24]}),2);r.x=-8;r.z=24;const f=w.addFielder(mk(KE,'3b','3B',60,{at:[-14,18]}));w.umpire.startPlay({});w.give(f,'pickup');w.step();
    w.umpire.out(r,'tag',{by:'3b'});add('わざと「離れているのにアウト」を起こす→見つける',ck.v.some(v=>v.code==='farTag'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W(),r=w.addRunner(mk(KE,'打者','',50),1);const f=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));w.umpire.startPlay({});w.give(f,'pickup');for(let i=0;i<30;i++)w.step();
    w.umpire.out(r,'force',{base:1});add('わざと「先に着いているのにアウト」を起こす→見つける',ck.v.some(v=>v.code==='arrived'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W(),a=w.addRunner(mk(KE,'a','',50),2),b=w.addRunner(mk(KE,'b','',50),1);w.umpire.startPlay({});b.rb.base=2;b.x=0;b.z=32.6;w.umpire.endPlay('time');
    add('わざと「同じ塁に2人」を起こす→見つける',ck.v.some(v=>v.code==='twoOnBase'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W(),ss=w.addFielder(mk(KE,'ss','SS',60)),lf=w.addFielder(mk(KE,'lf','LF',60));w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);w.umpire.startPlay({});
    w.ball.launch([-6,24,0.04],[0,0,0]);w.ball.state='rest';w.emit('loose',{src:'bat'});w.run(4);lf.x=-6.5;lf.z=24;w.give(lf,'pickup');
    add('わざと「遠い子が拾う」を起こす→見つける',ck.v.some(v=>v.code==='farPick'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W(),f=w.addFielder(mk(KE,'rf','RF',60)),r=w.addRunner(mk(KE,'走者','',30),1);w.umpire.startPlay({});w.give(f,'pickup');r.goTo(-60,80);w.run(8);
    add('わざと「ボールを持ったまま止まる」を起こす→見つける',ck.v.some(v=>v.code==='hold'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W();w.addFielder(mk(KE,'cf','CF',60));w.addRunner(mk(KE,'打者','',50,{at:[0.6,0]}),0,true);w.umpire.startPlay({});w.ball.launch([10,40,0.04],[0,0,0]);w.ball.state='rest';w.run(5);
    add('わざと「止まったボールに誰も向かわない」を起こす→見つける',ck.v.some(v=>v.code==='still'),ck.v.map(v=>v.msg).join(''));}
}

/* ================= たくさんの打球を流す（かんたんな守備で） ================= */
function stress(KE,N,seed0=1000,trace){
  const st={plays:0,viol:[],codes:{},outs:{},ends:{},fair:0,foul:0,hr:0,gr:0,runs:0,crash:0,time:0};
  const roles=['P','C','1B','2B','3B','SS','LF','CF','RF'];
  for(let n=0;n<N;n++){
    const seed=seed0+n,rng=KE.makeRng(seed*7+3),w=new KE.World({seed}),ck=new KE.Checker(w),lv=rng.range(20,95);
    try{
      const F={};roles.forEach(r=>F[r]=w.addFielder(mk(KE,r,r,Math.round(lv+rng.range(-10,10)))));
      w.outs=(rng()*3)|0;
      for(const b of[3,2,1])if(rng.chance(0.4))w.addRunner(mk(KE,`走${b}`,'',Math.round(rng.range(20,95))),b);
      const B=w.addRunner(mk(KE,'打者','',Math.round(rng.range(20,95)),{at:[0.6,0]}),0,true);
      w.umpire.startPlay({batted:true});
      const va=rng.range(-15,50),h=hitVec(rng.range(8,38),va,rng.range(-52,52),rng.range(va<5?-1500:0,2500),rng.range(-900,900));bat(w,h);
      const fly=va>12;let chaser=null,plan=0.001,holdAt=null;
      // 走者：打者は一塁へ。押し出しはゴロなら次の塁へ、フライなら半分まで
      route(B,[1]);
      for(const r of w.liveRunners)if(!r.rb.isBatter&&r.rb.forceBase){if(!fly)route(r,[r.rb.forceBase]);else{const[a,c]=[KE.basePos(r.rb.start),KE.basePos(r.rb.start+1)];r.goTo((a[0]+c[0])/2,(a[1]+c[1])/2,{react:true})}}
      w.on('bounce',e=>{if(e.n===1&&w.umpire.play&&w.umpire.play.firstTouchT==null&&w.ball.src==='bat')for(const r of w.liveRunners)if(!r.rb.isBatter&&(r.rb.forceBase||hyp(e.x,e.z)>34)&&!r.route?.length){r.stop();route(r,[Math.min(4,r.rb.start+1)])}});
      w.on('flyCatch',()=>{for(const r of w.liveRunners)if(r.rb.mustRetouch){r.route=[];r.stop();route(r,[r.rb.start])}else if(!r.rb.isBatter){r.route=[];const[bx,bz]=KE.basePos(r.rb.base);r.goTo(bx,bz)}});
      w.on('hr',()=>w.liveRunners.forEach(r=>{r.stop();route(r,[1,2,3,4].filter(b=>b>r.rb.base))}));
      w.on('groundRule',()=>w.liveRunners.forEach(r=>{r.stop();route(r,[1,2,3,4].filter(b=>b>r.rb.base&&b<=r.rb.awardTo))}));
      const cover={1:F['1B'],2:F['SS'],3:F['3B'],4:F['C']};
      const plan2=()=>{const pr=KE.predict(w.ball,10,0.05);let best=null;
        for(const f of w.fielders){for(const q of pr){if(q[3]>2.2)continue;const e=f.eta(q[1],q[2]);if(e<=q[0]){if(!best||q[0]<best.t)best={f,t:q[0],x:q[1],z:q[2]};break}}
          const L=pr[pr.length-1],e=f.eta(L[1],L[2]),tt=Math.max(L[0],e);if(!best||tt<best.t-1e-6&&!pr.some(q=>q[3]<=2.2&&f.eta(q[1],q[2])<=q[0]))if(!best||tt<best.t)best={f,t:tt,x:L[1],z:L[2]}}
        if(chaser&&chaser!==best.f)chaser.stop();chaser=best.f;chaser.goTo(best.x,best.z,{react:true});
        for(const b of[1,2,3,4]){const c=cover[b];if(c===chaser){if(b===2&&F['2B']!==chaser){cover[2]=F['2B']}else continue}const[bx,bz]=KE.basePos(b);if(cover[b]!==chaser)cover[b].goTo(bx,bz,{react:true})}};
      w.on('loose',()=>{plan=w.t+0.01});w.on('wall',()=>{plan=w.t+0.01});
      w.run(45,()=>{routeTick(w);if(trace&&Math.round(w.t*60)%30===0)trace(w,chaser);
        const b=w.ball;if(b.state==='out')return;
        if(b.state!=='held'){if(plan&&w.t>=plan){plan=w.t+0.5;plan2()}
          for(const f of w.fielders)if(catchNear(w,f,f===chaser?1.0:0.9)){holdAt=w.t;break}return}
        const k=b.holder;if(!k||holdAt==null||w.t-holdAt<0.3+k.react*0.5)return;
        // ボールを持った子：まだ着いていない押し出しの塁→走っている走者の先の塁→外野なら内野へ
        const live=w.liveRunners;let tgt=null;
        const f2=live.filter(r=>w.umpire.forced(r)).sort((a,c)=>c.rb.forceBase-a.rb.forceBase);
        for(const r of f2){const c=cover[r.rb.forceBase];if(c&&c!==k&&hyp(c.x-KE.basePos(r.rb.forceBase)[0],c.z-KE.basePos(r.rb.forceBase)[1])<1.5){tgt=c;break}
          if(c===k||hyp(k.x-KE.basePos(r.rb.forceBase)[0],k.z-KE.basePos(r.rb.forceBase)[1])<5){const[bx,bz]=KE.basePos(r.rb.forceBase);k.goTo(bx,bz);holdAt=null;return}}
        if(!tgt)for(const r of live){if(r.rb.mustRetouch){const c=cover[r.rb.start]||F['1B'];if(c!==k){tgt=c;break}const[bx,bz]=KE.basePos(r.rb.start);k.goTo(bx,bz);holdAt=null;return}}
        if(!tgt){const mv=live.find(r=>r.speed>0.5&&r.tx!=null);if(mv){const nb=Math.min(4,mv.rb.base+1),c=cover[nb];if(c&&c!==k)tgt=c}}
        if(!tgt&&hyp(k.x,k.z)>KE.FIELD.infieldR+6)tgt=F['SS']===k?F['2B']:F['SS'];
        if(tgt){w.throwTo(k,[tgt.x,tgt.z,1.2]);holdAt=null}else{holdAt=w.t}
      });
      if(!w.umpire.ended)ck.bad('stall45','45秒たってもプレーが終わらない');
      st.plays++;const L=w.log;st.fair+=L.some(e=>e.type==='fair');st.foul+=L.some(e=>e.type==='foul');st.hr+=L.some(e=>e.type==='hr');st.gr+=L.some(e=>e.type==='groundRule');
      for(const e of L)if(e.type==='out'){const k=({force:'フォース',tag:'タッチ',fly:'フライ',appeal:'リタッチ'})[e.outType]||e.outType;st.outs[k]=(st.outs[k]||0)+1}
      const end=L.find(e=>e.type==='playEnd');const ek=end?({time:'ふつうに終わる',foul:'ファウル',threeOuts:'3アウト',hr:'ホームラン',groundRule:'エンタイトル'})[end.why]||end.why:'終わらない';st.ends[ek]=(st.ends[ek]||0)+1;
      st.runs+=w.score[0];st.time+=w.t;
      for(const v of ck.v){st.codes[v.code]=(st.codes[v.code]||0)+1;if(st.viol.length<20)st.viol.push({seed,...v})}
    }catch(err){st.crash++;if(st.viol.length<20)st.viol.push({seed,code:'crash',msg:String(err&&err.stack||err).slice(0,300)})}
  }
st.avgT=st.time/Math.max(1,st.plays);
  return st;
}


/* ================= 第2段：打つ・捕る・投げる ================= */
function batting(KE,T){
  const add=(name,ok,detail)=>T.push({group:'打つ（投球と打撃の計算）',name,ok,detail});
  const sample=(lv,n,seed)=>{const rng=KE.makeRng(seed),P={sk:{thr:lv,fld:lv,iq:lv}},B={sk:{bat:lv,iq:lv},lefty:false},c=[];let sw=0,miss=0,pa=0,K=0,BB=0;
    while(c.length<n){const cnt={b:0,s:0};pa++;
      while(true){const p=KE.makePitch(P,cnt,rng),r=KE.swing(B,p,cnt,rng);if(r.swing)sw++;
        if(r.contact){const foul=!(Math.abs(r.ang)<=45);c.push({...r,foul});if(foul){if(cnt.s<2)cnt.s++;continue}break}
        if(r.swing)miss++;
        if(r.swing||KE.inZone(p.px,p.ph)){if(++cnt.s>=3){K++;break}}else if(++cnt.b>=4){BB++;break}}}
    const fair=c.filter(x=>!x.foul),m=a=>a.reduce((s,v)=>s+v,0)/a.length,sd=a=>{const mu=m(a);return Math.sqrt(m(a.map(v=>(v-mu)**2)))};
    return{c,fair,sw,miss,pa,K,BB,v:m(fair.map(x=>x.v))*3.6,vaSD:sd(fair.map(x=>x.va)),foulR:(c.length-fair.length)/c.length,missR:miss/sw}};
  const L=[30,60,90].map((lv,i)=>sample(lv,600,11+i));
  { const c=L[1].c;let same=0;for(let i=1;i<c.length;i++){const a=c[i-1],b=c[i];if(Math.abs(a.v-b.v)<1&&Math.abs(a.va-b.va)<2&&Math.abs(a.ang-b.ang)<3)same++}
    add('同じような打球が続かない（600球で、ほぼ同じ打球が続いた割合）',same/c.length<0.02,`${(same/c.length*100).toFixed(1)}%`);}
  add('打撃の能力が上がるほど打球が強い',L[0].v<L[1].v&&L[1].v<L[2].v,L.map((x,i)=>`能力${[30,60,90][i]}：平均${x.v.toFixed(0)}km/h`).join('、'));
  add('能力が低いほど打球の角度がばらつく',L[0].vaSD>L[2].vaSD,L.map((x,i)=>`能力${[30,60,90][i]}：${x.vaSD.toFixed(0)}度`).join('、'));
  add('ファウルと空振りも同じ計算から生まれる',L.every(x=>x.foulR>0.12&&x.missR>0.08),L.map((x,i)=>`能力${[30,60,90][i]}：ファウル${(x.foulR*100).toFixed(0)}%・空振り${(x.missR*100).toFixed(0)}%`).join('、'));
  add('能力が低い投手ほどフォアボールが多い',L[0].BB/L[0].pa>L[2].BB/L[2].pa+0.05,L.map((x,i)=>`能力${[30,60,90][i]}：四球${(x.BB/x.pa*100).toFixed(0)}%・三振${(x.K/x.pa*100).toFixed(0)}%`).join('、'));
}
function fieldScene(KE,o){
  const lv=o.lv||70,w=new KE.World({seed:o.seed||1,record:true}),ck=new KE.Checker(w),rng=KE.makeRng(o.seed||1),T=KE.mkTeam('守',lv,rng);
  w.fielders=T.players.map(p=>{const f=new KE.Player({id:p.id,name:p.pos,role:p.pos,sk:p.sk});[f.x,f.z]=KE.FIELD.pos[p.pos];f.side='F';return f});
  const def=new KE.Defense(w),run=new KE.Running(w,def);w.outs=o.outs||0;
  for(const b of(o.on||[]))w.addRunner(new KE.Player({id:`走${b}`,name:`${b}塁走者`,sk:{run:o.run||50,iq:o.iq||o.run||60}}),b);
  const B=new KE.Player({id:'打者',name:'打者',sk:{run:o.run||50,iq:60}});B.x=-0.95;w.addRunner(B,0,true);
  w.umpire.startPlay({batted:true});const h=hitVec(...o.hit);w.release(h.p,h.v,h.w,'bat');
  let n=0;while(!w.umpire.ended&&n++<60*40){def.tick();run.tick();w.step()}
  return{w,ck,outs:w.log.filter(e=>e.type==='out'),log:w.log};
}
function fielding(KE,T){
  const add=(name,ok,detail,S)=>T.push({group:'捕る・投げる（守備）',name,ok,detail:detail+(S&&S.ck.v.length?` ／チェック:${S.ck.v.map(v=>v.msg).join('、')}`:''),frames:S&&S.w.frames,log:S&&S.w.log.filter(e=>/^(out|safe|home|playEnd|fair|foul|error|throwTarget|catch|pickup|dive)$/.test(e.type))});
  { let home=0,N=10,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:70,seed:40+i,on:[1,2,3],hit:[13,-8,3,-600]}),o=S.outs[0];if(o&&o.base===4)home++;if(!last||o&&o.base===4)last=S}
    add('満塁でピッチャーゴロ→ホームでアウト（156の件）',home>=N*0.8,`${N}回中${home}回ホームでアウト（ほかは投げる塁をまちがえた・エラー）`,last);}
  { let dp=0,N=12,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:90,seed:20+i,on:[1],run:40,hit:[21,-6,-18,-900]});if(S.outs.length===2&&S.outs[0].base===2&&S.outs[1].base===1)dp++;last=S}
    add('一塁ランナーありのショートゴロ→二塁→一塁のゲッツー（S級）',dp>=N*0.6,`${N}回中${dp}回ゲッツー`,last);}
  { let dp=0,N=12;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:30,seed:20+i,on:[1],run:40,hit:[21,-6,-18,-900]});if(S.outs.length===2)dp++}
    add('同じ打球でも能力30ではゲッツーがとりにくい',dp<=N*0.5,`${N}回中${dp}回ゲッツー`);}
  { const S=fieldScene(KE,{lv:70,hit:[27,12,2,1200]}),pk=S.log.find(e=>e.type==='pickup'||e.type==='catch'),th=S.log.find(e=>e.type==='throw'&&pk&&e.t>=pk.t);
    add('センター前のヒットはセンターが拾って、すぐ内野へ返す',pk&&pk.role==='CF'&&th&&th.t-pk.t<1.5&&!S.ck.v.length,pk?`${pk.role}が拾い、${th?(th.t-pk.t).toFixed(1)+'秒で返球':'返球なし'}`:'',S);}
  { const S=fieldScene(KE,{lv:70,hit:[28,16,38,1500,-300]}),pk=S.log.find(e=>e.type==='pickup'||e.type==='catch');
    add('ライト線の打球はライトが拾う（内野手が外野まで行かない）',pk&&pk.role==='RF',pk?pk.role:'',S);}
  { const S=fieldScene(KE,{lv:70,on:[2],hit:[26,12,-26,900]}),pk=S.log.find(e=>e.type==='pickup'||e.type==='catch'),thr=S.log.filter(e=>e.type==='throwTarget');
    add('二塁ランナーがいるレフト前：レフトが拾って、持ったまま止まらずに投げる',pk&&pk.role==='LF'&&thr.length>0&&!S.ck.v.length,thr.map(e=>e.base?`${e.base===4?'ホーム':e.base+'塁'}へ`:'中継・内野へ').join('→'),S);}
  // 役割表どおりか（S級）
  { const rl=(S,id)=>(S.w.fielders.find(f=>f.id===id)||{}).role;let ok=0,N=8,last;
    for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:90,seed:600+i,on:[1],hit:[16,-7,3,-600]});const th=S.log.find(e=>e.type==='throwTarget'&&e.base===2);if(th&&rl(S,th.to)==='SS'&&rl(S,th.from)==='P')ok++;last=S}
    add('S級：ランナー一塁のピッチャーゴロは、ショートが二塁に入ってゲッツーを狙う',ok>=N*0.75,`${N}回中${ok}回`,last);}
  { const rl=(S,id)=>(S.w.fielders.find(f=>f.id===id)||{}).role;let ok=0,N=8,last;
    for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:90,seed:620+i,hit:[18,-7,30,-600]});const th=S.log.find(e=>e.type==='throwTarget'&&e.base===1);const o=S.log.find(e=>e.type==='out'&&e.base===1);
      if(th&&rl(S,th.to)==='P'||o&&rl(S,o.by)==='1B')ok++;last=S}
    add('S級：ファーストゴロは、ピッチャーが一塁に入るか、ファーストが自分で踏む',ok>=N*0.75,`${N}回中${ok}回`,last);}
  { const err=lv=>{let e=0,ch=0;for(let i=0;i<40;i++){const S=fieldScene(KE,{lv,seed:100+i,hit:[18+(i%5)*3,-6+(i%3)*2,-40+(i*7)%80,-600]});e+=S.log.filter(x=>x.type==='error').length;ch++}return e/ch};
    const a=err(30),b=err(90);add('エラーは能力が低いほど多く、S級ではほとんど出ない',a>b*3&&b<0.08,`同じ40本のゴロで、能力30：1本あたり${a.toFixed(2)}回、能力90：${b.toFixed(2)}回`);}
}
function games(KE,T,N){
  const add=(name,ok,detail)=>T.push({group:'試合を通して',name,ok,detail});
  for(const lv of[30,60,90]){const agg={runs:0,H:0,E:0,K:0,BB:0,HR:0},codes={};
    for(let g=0;g<N;g++){const rng=KE.makeRng(500+g);const s=new KE.Game({seed:500+g,teams:[KE.mkTeam('赤',lv,rng),KE.mkTeam('青',lv,rng)]}).run();
      for(const k in agg)agg[k]+=s[k][0]+s[k][1];for(const v of s.viol)codes[v.code]=(codes[v.code]||0)+1}
    const per=k=>(agg[k]/N/2).toFixed(1),nv=Object.values(codes).reduce((a,b)=>a+b,0);
    add(`能力${lv}どうしで${N}試合：おかしな場面0件`,nv===0,`1チーム1試合あたり 得点${per('runs')}・安打${per('H')}・エラー${per('E')}・三振${per('K')}・四球${per('BB')}・本塁打${per('HR')}`+(nv?` ／${Object.entries(codes).map(([k,v])=>k+':'+v).join('、')}`:''));}
}


/* ================= 第3段：走る ================= */
function liveScene(KE,o){
  const lv=o.lv||60,w=new KE.World({seed:o.seed||1,record:true}),ck=new KE.Checker(w),rng=KE.makeRng(o.seed||1),T=KE.mkTeam('守',lv,rng);
  w.fielders=T.players.map(p=>{const f=new KE.Player({id:p.id,name:p.pos,role:p.pos,sk:p.sk});[f.x,f.z]=KE.FIELD.pos[p.pos];f.side='F';return f});
  const F={};w.fielders.forEach(f=>F[f.role]=f);const def=new KE.Defense(w),run=new KE.Running(w,def);
  o.setup(w,F,KE);let n=0;while(!w.umpire.ended&&n++<60*30){def.tick();run.tick();w.step()}
  return{w,ck,log:w.log,outs:w.log.filter(e=>e.type==='out')};
}
function running(KE,T){
  const add=(name,ok,detail,S)=>T.push({group:'走る（ランナーの判断）',name,ok,detail:detail+(S&&S.ck.v.length?` ／チェック:${S.ck.v.map(v=>v.msg).join('、')}`:''),frames:S&&S.w.frames,log:S&&S.w.log.filter(e=>/^(out|safe|home|playEnd|fair|foul|error|catch|pickup|rundown|retreat|couldHaveGone|rash|flyCatch|retouch)$/.test(e.type))});
  // 167：一三塁で三塁ランナーが挟まれたら、一塁ランナーは二塁へ
  { let adv=0,end=0,N=10,last,bad=0;
    for(let i=0;i<N;i++){const S=liveScene(KE,{lv:60,seed:60+i,setup:(w,F,KE)=>{
        const r3=w.addRunner(new KE.Player({id:'走3',name:'三塁走者',sk:{run:50,iq:50}}),3),r1=w.addRunner(new KE.Player({id:'走1',name:'一塁走者',sk:{run:50,iq:60}}),1);
        w.umpire.startPlay({});r3.x=-9.6;r3.z=9.6;r3.plan=4;r3.rd=true;r3.rdT=0;r3.goTo(0,0);F.C.x=0.6;F.C.z=-0.4;F['3B'].x=-15.8;F['3B'].z=15.8;w.give(F.C,'pickup')}});
      const r1=S.w.runners.find(r=>r.id==='走1'),r3=S.w.runners.find(r=>r.id==='走3');if(r1.rb.base>=2)adv++;if(S.w.umpire.ended)end++;bad+=S.ck.v.length;if(!last||S.log.some(e=>e.type==='rundown'))last=S}
    add('一三塁で三塁ランナーが挟まれたら、そのあいだに一塁ランナーが二塁へ進む（167の件）',adv>=N*0.8&&end===N&&bad===0,`${N}回中、二塁へ進んだ${adv}回・挟殺が終わった${end}回`,last);}
  { let tagged=0,thru=0,safe=0,N=16,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:40,run:80,seed:70+i,hit:[10+(i%4)*3,-8,-30+(i%5)*12,-800]});const B=S.w.runners.find(r=>r.id==='打者');
      if(S.outs.some(e=>e.who==='打者'&&e.outType==='tag'&&B.rb.base===1))tagged++;if(B.rb.out)continue;safe++;if(S.w.frames.some(f=>f.r.some(q=>q[3]==='打者'&&q[0]>17.5))){thru++;last=S}}
    add('内野ゴロでは一塁を駆け抜け、戻るときにタッチされない',tagged===0&&safe>0&&thru>=safe*0.6,`一塁セーフ${safe}回のうち駆け抜け${thru}回・駆け抜け後のタッチアウト${tagged}回`,last);}
  { let sc=0,N=10,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:60,seed:80+i,on:[3],hit:[26,36,-4,2200]});const r=S.w.runners.find(r=>r.id==='走3');
      const caught=S.log.some(e=>e.type==='flyCatch');if(caught&&r.rb.scored)sc++;if(caught&&!last)last=S}
    add('深い外野フライ：三塁ランナーは捕ったのを見てからタッチアップでホームイン',sc>=N*0.4,`${N}回中${sc}回ホームイン`,last);}
  { let ok=0,N=10,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:60,seed:90+i,on:[1],hit:[19,48,8,1800]});const r=S.w.runners.find(r=>r.id==='走1');
      if(S.log.some(e=>e.type==='flyCatch')&&!r.rb.out)ok++;last=S}
    add('浅いフライ：一塁ランナーは飛び出しすぎず、捕られたら戻ってセーフ',ok>=N*0.8,`${N}回中${ok}回戻ってセーフ`,last);}
  { let two=0,N=10,last;for(let i=0;i<N;i++){const S=fieldScene(KE,{lv:50,run:70,seed:100+i,hit:[30,16,-40+i%2,800]});const B=S.w.runners.find(r=>r.id==='打者');
      if(!B.rb.out&&B.rb.base>=2)two++;if(B.rb.base>=2&&!last)last=S}
    add('三塁手の頭を越えてレフト線へ転がる当たりでは、打者は一塁を回って二塁をねらう',two>=N*0.2,`${N}回中${two}回二塁打以上`,last);}
  { const cnt=lv=>{let hes=0,rash=0;for(let i=0;i<40;i++){const S=fieldScene(KE,{lv,run:lv,seed:400+i,on:[1,2],hit:[24+(i%5)*2,4+(i%4)*4,-40+(i*13)%80,900]});
      hes+=S.log.filter(e=>e.type==='couldHaveGone').length;rash+=S.log.filter(e=>e.type==='rash').length}return{hes,rash}};
    const a=cnt(30),b=cnt(90);
    add('判断ミスは「行けたのに行かない」が多く「飛び出し」は少ない。S級ではどちらも少ない',a.hes>a.rash&&b.hes+b.rash<a.hes+a.rash,`同じ40プレーで、能力30：行けたのに${a.hes}回・飛び出し${a.rash}回／S級：行けたのに${b.hes}回・飛び出し${b.rash}回`);}
}

KT.AI_CODES=['farPick','hold','still','stall45','stall','pingPong','noCover'];
KT.runPlay=function(KE,o={}){KE_=KE;const T=[];batting(KE,T);fielding(KE,T);running(KE,T);if(o.games!==0)games(KE,T,o.games||4);return T};
KT.runAll=function(KE,o={}){KE_=KE;const T=[];physics(KE,T);movement(KE,T);umpire(KE,T);checker(KE,T);if(KE.Game&&!o.base){T.push(...KT.runPlay(KE,o))}
  const s=o.stress?stress(KE,o.stress):null;return{tests:T,stress:s}};
KT.fieldScene=(KE,o)=>{KE_=KE;return fieldScene(KE,o)};KT.liveScene=(KE,o)=>{KE_=KE;return liveScene(KE,o)};KT.stress=(KE,N,s0,tr)=>{KE_=KE;return stress(KE,N,s0,tr)};KT.hitVec=hitVec;KT.mk=mk;
if(typeof module!=='undefined'&&module.exports)module.exports=KT;else root.KT=KT;
})(typeof window!=='undefined'?window:globalThis);
