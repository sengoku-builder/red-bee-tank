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
  { const b=new KE.Ball(),h=hitVec(36,10,-5,500);b.launch(h.p,h.v,h.w);let t=0;while(t<10&&!b.wall&&b.state!=='rest'){b.step(1/60);t+=1/60}
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
    add('ねらいどおりの送球はちょうど一塁手の胸に届く',best<0.3&&bt>0.7&&bt<1.4,`ずれ${best.toFixed(2)}m・${bt.toFixed(2)}秒`);}
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
  add('野球の頭が良いほど反応が速い',re[0]>re[1]&&re[1]>re[2]&&re[2]<0.2,re.map(v=>v.toFixed(2)+'秒').join('→'));
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
    for(const[dl,lo,hi]of[[-0.15,1,1],[-0.05,0.62,0.88],[0,0.38,0.62],[0.05,0.12,0.38],[0.15,0,0]]){let outs=0;const N=240;
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
  { const S=flyPlay(8,S=>{const w=S.w;S.fb=w.addFielder(mk(KE,'1b','1B',60,{at:[16.3,16.3]}));S.r1=w.addRunner(mk(KE,'一塁走者','',50),1);route(S.r1,[2]);S.st=0},
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
  { const S=award(17,null,0,S=>{const w=S.w;w.ball.launch([12,52,0.04],[2.5,9,7],null,'bat');w.ball.bounces=1;w.emit('bounce',{x:12,z:52,n:1})});const gr=S.w.log.some(e=>e.type==='groundRule');
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
    w.ball.launch([-6,24,0.04],[0,0,0]);w.ball.state='rest';w.emit('loose',{});lf.x=-6.5;lf.z=24;w.give(lf,'pickup');
    add('わざと「遠い子が拾う」を起こす→見つける',ck.v.some(v=>v.code==='farPick'),ck.v.map(v=>v.msg).join(''));}
  { const{w,ck}=W(),f=w.addFielder(mk(KE,'rf','RF',60)),r=w.addRunner(mk(KE,'走者','',30),1);w.umpire.startPlay({});w.give(f,'pickup');r.goTo(-30,40);w.run(6);
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

KT.AI_CODES=['farPick','hold','still','stall45','stall'];
KT.runAll=function(KE,o={}){KE_=KE;const T=[];physics(KE,T);movement(KE,T);umpire(KE,T);checker(KE,T);
  const s=o.stress?stress(KE,o.stress):null;return{tests:T,stress:s}};
KT.stress=(KE,N,s0,tr)=>{KE_=KE;return stress(KE,N,s0,tr)};KT.hitVec=hitVec;KT.mk=mk;
if(typeof module!=='undefined'&&module.exports)module.exports=KT;else root.KT=KT;
})(typeof window!=='undefined'?window:globalThis);
