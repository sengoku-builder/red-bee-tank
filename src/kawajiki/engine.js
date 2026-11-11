/* 河川敷の少年野球 新しい試合エンジン ── 第1段「土台」
   共通の状況（World）・ボール・選手の移動・審判役（Umpire）・できごと・自動チェック（Checker）
   座標：ホーム(0,0)、x＝一塁側が＋、z＝センター方向、h＝高さ。単位は m・秒。
   絵は描かない。表示する側は world の位置を読むだけ（台本は持たない）。 */
(function(root){
'use strict';
const KE={version:'1.0.0'};
const clamp=(v,a,b)=>v<a?a:v>b?b:v, hyp=Math.hypot;

/* ---------- 乱数（種を決めれば同じ試合をくり返せる） ---------- */
function makeRng(seed){
  let s=(seed>>>0)||1;
  const r=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
  r.range=(a,b)=>a+r()*(b-a);r.chance=p=>r()<p;r.pick=a=>a[(r()*a.length)|0];
  r.gauss=()=>{let u=0;while(!u)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r())};
  return r;
}
KE.makeRng=makeRng;

/* ---------- 球場 ---------- */
const FIELD={
  bd:23.05,                                  // 塁間
  bases:[[0,0],[16.3,16.3],[0,32.6],[-16.3,16.3]],
  mound:[0,16],
  fence:60,fenceH:1.2,                       // 簡易フェンス（ホームから60m）
  backstopZ:-7,backstopH:3.5,
  infieldR:29,                               // 内野の土
  pos:{P:[0,15.6],C:[0,-1.25],'1B':[14.6,19.5],'2B':[6.8,28.5],'3B':[-14.6,19.5],SS:[-6.8,28.5],LF:[-23,45],CF:[0,52],RF:[23,45]}
};
const basePos=b=>FIELD.bases[((b%4)+4)%4];
const isFair=(x,z)=>z>=Math.abs(x)-0.05;     // ラインの上はフェア
KE.FIELD=FIELD;KE.basePos=basePos;KE.isFair=isFair;

/* ---------- 能力 → 動きの大きさ（調整はここに集める） ----------
   Y(s)：少年野球らしさ。能力が低いと1に近く、S級（90台）でほぼ0＝甲子園常連校の動き */
const Y=s=>Math.pow(1-clamp(s,0,100)/100,1.4);
const sk=(k,key)=>k&&k.sk&&k.sk[key]!=null?k.sk[key]:60;
const PROF={
  runV:s=>4.6+2.7*s/100,          // 全力で走る速さ m/s（4.6〜7.3）
  runA:s=>3.4+2.2*s/100,          // 加速 m/s²
  react:s=>0.16+0.5*Y(s),         // 反応の遅れ 秒（野球の頭）
  armV:s=>14+24*s/100,            // 送球の初速 m/s（50〜137km/h）
  armErr:s=>0.010+0.075*Y(s),     // 送球の向きのずれ（ラジアン、1σ）
};
KE.Y=Y;KE.sk=sk;KE.PROF=PROF;

/* ---------- ボール ----------
   状態：held（誰かが持つ）・air（飛んでいる／はねている）・ground（転がる）・rest（止まった）・out（場外） */
const GR=9.8,KD=0.0072,KM=0.00042,BR=0.035,SPIN_TAU=4,SUB=4;
class Ball{
  constructor(){this.x=0;this.z=0;this.h=1;this.vx=0;this.vz=0;this.vh=0;this.wx=0;this.wz=0;this.wh=0;
    this.state='rest';this.holder=null;this.bounces=0;this.wall=false;this.over=null;this.src=null}
  clone(){const b=new Ball();Object.assign(b,this);b.holder=null;return b}
  get speed(){return hyp(this.vx,this.vz,this.vh)}
  get r(){return hyp(this.x,this.z)}
  // 飛ばす：位置・速度・回転（回転はベクトル rad/s、順番は x,z,h）
  launch(p,v,w,src){Object.assign(this,{x:p[0],z:p[1],h:p[2],vx:v[0],vz:v[1],vh:v[2],wx:w?w[0]:0,wz:w?w[1]:0,wh:w?w[2]:0,
    state:'air',holder:null,bounces:0,wall:false,over:null,src:src||null})}
  step(dt,emit){
    if(this.state==='held'){const k=this.holder;if(k){this.x=k.x;this.z=k.z;this.h=1.1}return}
    if(this.state==='rest'||this.state==='out')return;
    const d=dt/SUB;for(let i=0;i<SUB&&this.state!=='rest'&&this.state!=='out';i++)this.sub(d,emit);
  }
  sub(d,emit){
    if(this.state==='air'){
      const v=hyp(this.vx,this.vz,this.vh);
      // 空気の抵抗＋回転で曲がる力（マグヌス）
      const ax=-KD*v*this.vx+KM*(this.wz*this.vh-this.wh*this.vz);
      const az=-KD*v*this.vz+KM*(this.wh*this.vx-this.wx*this.vh);
      const ah=-GR-KD*v*this.vh+KM*(this.wx*this.vz-this.wz*this.vx);
      this.vx+=ax*d;this.vz+=az*d;this.vh+=ah*d;
      this.x+=this.vx*d;this.z+=this.vz*d;this.h+=this.vh*d;
      const sd=Math.exp(-d/SPIN_TAU);this.wx*=sd;this.wz*=sd;this.wh*=sd;
      if(this.h<=BR&&this.vh<0)this.bounce(emit);
    }else if(this.state==='ground'){
      const v=hyp(this.vx,this.vz),dirt=this.r<FIELD.infieldR,dec=(dirt?2.6:3.4)+0.03*v;
      if(v<=dec*d||v<0.12){this.vx=this.vz=0;this.state='rest';emit&&emit('ballStop',{x:this.x,z:this.z});return}
      const f=(v-dec*d)/v;this.vx*=f;this.vz*=f;this.x+=this.vx*d;this.z+=this.vz*d;this.h=BR;
    }
    this.walls(emit);
  }
  bounce(emit){
    const dirt=this.r<FIELD.infieldR,iv=-this.vh;
    const e=clamp((dirt?0.56:0.48)-0.007*iv,0.22,0.6);       // 軟式球はよくはねる
    // 回転の向き：バックスピンは止まり気味、トップスピンは伸びる
    const hv=hyp(this.vx,this.vz)||1,bs=(this.wx*this.vz-this.wz*this.vx)/hv;  // ＋ならバックスピン
    const fr=clamp((dirt?0.80:0.72)-0.0006*bs,0.4,0.95);
    this.h=BR;this.vh=iv*e;this.vx*=fr;this.vz*=fr;this.wx*=0.5;this.wz*=0.5;this.wh*=0.5;this.bounces++;
    emit&&emit('bounce',{x:this.x,z:this.z,n:this.bounces});
    if(this.vh<0.6){this.vh=0;this.state='ground'}
  }
  walls(emit){
    const r=this.r;
    if(r>=FIELD.fence&&this.z>-2){
      if(this.h>FIELD.fenceH+BR){this.over={fair:isFair(this.x,this.z),bounced:this.bounces>0};this.state='out';emit&&emit('overFence',{...this.over,x:this.x,z:this.z});return}
      const nx=this.x/r,nz=this.z/r,vr=this.vx*nx+this.vz*nz;
      if(vr>0){const tx=this.vx-vr*nx,tz=this.vz-vr*nz;this.vx=tx*0.7-vr*0.3*nx;this.vz=tz*0.7-vr*0.3*nz;
        this.x=nx*(FIELD.fence-0.05);this.z=nz*(FIELD.fence-0.05);this.wall=true;emit&&emit('wall',{x:this.x,z:this.z})}
    }
    if(this.z<=FIELD.backstopZ&&this.vz<0){
      if(this.h>FIELD.backstopH){this.state='out';this.over={fair:false,bounced:this.bounces>0};emit&&emit('overFence',{fair:false});return}
      this.vz=-this.vz*0.35;this.vx*=0.7;this.z=FIELD.backstopZ+0.01;emit&&emit('wall',{x:this.x,z:this.z,backstop:true});
    }
  }
}
KE.Ball=Ball;
// この先のボールの通り道（野手が追いつく場所を考えるのに使う）
KE.predict=function(ball,T=8,step=0.05){
  const b=ball.clone(),out=[[0,b.x,b.z,b.h,b.state,b.bounces]],dt=1/60;let t=0,next=step;
  while(t<T&&b.state!=='rest'&&b.state!=='out'){b.step(dt);t+=dt;if(t>=next-1e-9){out.push([t,b.x,b.z,b.h,b.state,b.bounces]);next+=step}}
  if(out[out.length-1][0]<t)out.push([t,b.x,b.z,b.h,b.state,b.bounces]);
  return out;
};

/* ---------- 送球：届く角度を計算し、能力に応じてずらす ---------- */
const THROW_SPIN=120;
function simThrow(from,dx,dz,v0,el,dist){
  const b=new Ball(),c=Math.cos(el),ux=dx/dist,uz=dz/dist;
  b.launch([from[0],from[1],from[2]],[ux*v0*c,uz*v0*c,v0*Math.sin(el)],[uz*THROW_SPIN,-ux*THROW_SPIN,0]);
  let t=0;const dt=1/120;
  while(t<6){b.step(dt);t+=dt;const s=(b.x-from[0])*ux+(b.z-from[1])*uz;
    if(s>=dist)return{h:b.h,t,reached:true,bounced:b.bounces>0};
    if(b.state==='rest'||b.state==='out')break}
  return{h:-9,t,reached:false};
}
// from=[x,z,h], to=[x,z,h]。戻り値：初速ベクトル・回転・届くまでの時間
KE.aimThrow=function(from,to,v0){
  const dx=to[0]-from[0],dz=to[1]-from[1],dist=Math.max(0.3,hyp(dx,dz));
  let lo=-0.35,hi=0.62,best=null;
  const top=simThrow(from,dx,dz,v0,hi,dist);
  if(!top.reached||top.h<to[2]){best={el:0.62,t:top.t,short:true}}   // 肩が足りない→ワンバウンド
  else{for(let i=0;i<22;i++){const m=(lo+hi)/2,r=simThrow(from,dx,dz,v0,m,dist);if(r.reached&&r.h>=to[2])hi=m;else lo=m}
    best={el:hi,t:simThrow(from,dx,dz,v0,hi,dist).t,short:false}}
  return{el:best.el,yaw:Math.atan2(dx,dz),v0,t:best.t,short:best.short,dist};
};
// 実際に投げる：k=投げる子、rng=乱数。ずれは能力で決まる
KE.throwVec=function(aim,k,rng,quality=1){
  const er=PROF.armErr(sk(k,'thr'))*quality;
  const el=aim.el+rng.gauss()*er*0.8,yaw=aim.yaw+rng.gauss()*er,v=aim.v0*(1+rng.gauss()*0.03),c=Math.cos(el);
  const ux=Math.sin(yaw),uz=Math.cos(yaw);
  return{v:[ux*v*c,uz*v*c,v*Math.sin(el)],w:[uz*THROW_SPIN,-ux*THROW_SPIN,0]};
};

/* ---------- 選手（野手も走者も同じ動き方） ---------- */
class Player{
  constructor(o){Object.assign(this,{id:'',name:'',sk:{},role:'',team:0,x:0,z:0,vx:0,vz:0,tx:null,tz:null,frac:1,wait:0,face:0,active:true},o)}
  get vmax(){return PROF.runV(sk(this,'run'))*(this.frac||1)}
  get acc(){return PROF.runA(sk(this,'run'))}
  get dec(){return this.acc*2.5}
  get react(){return PROF.react(sk(this,'iq'))}
  get speed(){return hyp(this.vx,this.vz)}
  dist(x,z){return hyp(x-this.x,z-this.z)}
  // 目的地へ。react=true なら反応の遅れのあと動き出す
  goTo(x,z,o={}){const was=this.tx!=null||this.speed>0.3;this.tx=x;this.tz=z;this.frac=o.frac||1;if(o.react&&!was)this.wait=Math.max(this.wait,this.react)}
  stop(){this.tx=this.tz=null}
  step(dt){
    if(this.wait>0){this.wait-=dt;return}
    let dvx=0,dvz=0;
    if(this.tx!=null){const dx=this.tx-this.x,dz=this.tz-this.z,d=hyp(dx,dz);
      if(d<0.03&&this.speed<0.5){this.x=this.tx;this.z=this.tz;this.vx=this.vz=0;this.tx=this.tz=null;return}
      const want=Math.min(this.vmax,Math.sqrt(2*this.dec*d));dvx=dx/d*want;dvz=dz/d*want}
    let ax=dvx-this.vx,az=dvz-this.vz;const a=hyp(ax,az),lim=(hyp(dvx,dvz)<this.speed-0.05?this.dec:this.acc)*dt;
    if(a>lim){ax*=lim/a;az*=lim/a}
    this.vx+=ax;this.vz+=az;this.x+=this.vx*dt;this.z+=this.vz*dt;
    if(this.speed>0.2)this.face=Math.atan2(this.vx,this.vz);
  }
  // そこに着くまでの見込み時間（止まった状態からなら反応も足す）
  eta(x,z,frac=1){const d=this.dist(x,z),V=PROF.runV(sk(this,'run'))*frac;if(d<0.05)return 0;
    const u=d>0?Math.max(0,(this.vx*(x-this.x)+(this.vz*(z-this.z)))/d):0,re=this.speed<0.3?Math.max(this.wait,this.react):Math.max(0,this.wait);
    return re+d/V+Math.max(0,V-u)*Math.max(0,V-u)/(2*this.acc*V)+V/(2*this.dec)}
}
KE.Player=Player;

/* ---------- 共通の状況 ---------- */
class World{
  constructor(o={}){
    this.rng=makeRng(o.seed||1);this.t=0;this.dt=o.dt||1/60;this.ball=new Ball();
    this.fielders=[];this.runners=[];this.listeners={};this.log=[];
    this.outs=0;this.score=[0,0];this.half=0;this.record=!!o.record;this.frames=[];this.fc=0;
    this.umpire=new Umpire(this);this.checkers=[];
  }
  on(type,fn){(this.listeners[type]=this.listeners[type]||[]).push(fn);return this}
  emit(type,data={}){const ev={type,t:+this.t.toFixed(3),...data};this.log.push(ev);
    for(const fn of(this.listeners[type]||[]))fn(ev,this);for(const fn of(this.listeners['*']||[]))fn(ev,this);return ev}
  addFielder(p){p.side='F';this.fielders.push(p);return p}
  addRunner(p,base,isBatter=false){p.side='R';p.rb={base,start:base,isBatter,out:false,scored:false,forceBase:null,forcer:null,mustRetouch:false,arr:{},judged:{}};
    const[bx,bz]=basePos(base);if(!isBatter||p.x===0&&p.z===0){p.x=bx;p.z=bz}this.runners.push(p);return p}
  get liveRunners(){return this.runners.filter(r=>!r.rb.out&&!r.rb.scored&&r.active)}
  give(k,how='catch'){
    const b=this.ball,inAir=b.state==='air'&&b.bounces===0&&!b.wall;
    b.state='held';b.holder=k;b.vx=b.vz=b.vh=0;b.x=k.x;b.z=k.z;b.h=1.1;
    this.emit(how,{who:k.id,role:k.role,fly:inAir,x:k.x,z:k.z});
    this.umpire.onTouch(k,inAir);
  }
  // ボールを手放す（送球・はじく）。src：'throw'|'bat'|'deflect'
  release(p,v,w,src){const k=this.ball.holder,b=this.ball,nb=b.bounces,wl=b.wall,wasLoose=b.state!=='held';b.launch(p,v,w,src);
    b.from=k||null;b.relT=this.t;
    if(src==='deflect'&&wasLoose){b.bounces=nb;b.wall=wl;this.umpire.onDeflect(k||{x:p[0],z:p[1]})}if(src!=='bat')this.emit(src,{who:k&&k.id,x:p[0],z:p[1]});this.emit('loose',{src})}
  // 投げた直後の本人は捕れない（手から離れたばかり）
  canCatch(f){const b=this.ball;return b.state!=='held'&&b.state!=='out'&&!(b.from===f&&this.t-b.relT<0.5)}
  throwTo(k,to,quality=1){
    const from=[k.x,k.z,1.6],aim=KE.aimThrow(from,to,PROF.armV(sk(k,'thr')));
    const tv=KE.throwVec(aim,k,this.rng,quality);this.release(from,tv.v,tv.w,'throw');return aim;
  }
  step(){
    const dt=this.dt;
    for(const p of this.fielders)p.step(dt);
    for(const p of this.runners)if(!p.rb.out)p.step(dt);
    this.ball.step(dt,(type,d)=>this.emit(type,d));
    this.t+=dt;
    this.umpire.tick();
    for(const c of this.checkers)c.tick(this);
    if(this.record&&(this.fc++%3===0))this.frames.push({t:this.t,b:[this.ball.x,this.ball.z,this.ball.h],
      f:this.fielders.map(p=>[p.x,p.z,p.role,this.ball.holder===p?1:0]),r:this.runners.map(p=>[p.x,p.z,p.rb.out?1:0,p.name])});
  }
  run(sec,each){const end=this.t+sec;while(this.t<end-1e-9){each&&each(this);this.step();if(this.umpire.ended)break}}
}
KE.World=World;

/* ---------- 審判役：どの場面でも同じ決まりを、位置と時間だけで当てはめる ---------- */
const ON_R=0.45,BASE_F=0.6,TAG_R=0.75,CLOSE=0.1;
class Umpire{
  constructor(w){this.w=w;this.reset();w.on('bounce',e=>{const p=this.play;if(p&&p.batted&&p.firstLand==null&&p.fair==null)p.firstLand=[e.x,e.z,hyp(e.x,e.z)]})}
  reset(){this.play=null;this.ended=false;this.pend=[];this.scored=[];this.lastTag=new Map()}
  // プレー開始。batted=true なら打球（フェア・ファウルを見る）
  startPlay(o={}){
    const w=this.w;this.reset();
    this.play={batted:!!o.batted,fair:o.batted?null:true,fly:o.batted,flyCaught:false,firstTouchT:null,dead:false,t0:w.t,restT:null,award:null};
    // 押し出し（フォース）の鎖：打者→一塁の走者→二塁の走者…
    const on=b=>w.liveRunners.find(r=>r.rb.base===b&&!r.rb.isBatter);
    for(const r of w.liveRunners){r.rb.start=r.rb.base;r.rb.forceBase=null;r.rb.forcer=null;r.rb.judged={};r.rb.mustRetouch=false;r.rb.arr={};r.rb.turned=false;r.rb.tagT=null;r.rb.awardTo=null;
      r.rb.near={};for(let k=0;k<4;k++){const[bx,bz]=FIELD.bases[k];r.rb.near[k]=hyp(r.x-bx,r.z-bz)<ON_R}const[sx,sz]=basePos(r.rb.base);if(hyp(r.x-sx,r.z-sz)<ON_R)r.rb.arr[r.rb.base]=-9}
    if(o.batted||o.forceAll){const bat=w.liveRunners.find(r=>r.rb.isBatter);let prev=bat;
      if(bat)bat.rb.forceBase=1;
      for(let b=1;b<=3&&prev;b++){const r=on(b);if(!r)break;r.rb.forceBase=b+1;r.rb.forcer=prev;prev=r}}
    w.emit('playStart',{batted:!!o.batted});
  }
  forced(r){const p=this.play;if(!p||!r.rb.forceBase||r.rb.out)return false;
    if(p.batted&&(p.fair!==true||p.flyCaught))return false;
    if(r.rb.base>=r.rb.forceBase)return false;
    let f=r.rb.forcer;while(f){if(f.rb.out)return false;f=f.rb.forcer}   // 後ろの走者がアウトになれば押し出しは消える
    return true}
  legalBase(r){return r.rb.mustRetouch?r.rb.start:r.rb.base}
  onBase(r){
    // 一塁の駆け抜け：打者走者が一塁を踏んでファウルグラウンドを走り抜けた／戻るあいだはタッチされない
    if(r.rb.isBatter&&r.rb.base===1&&!r.rb.mustRetouch&&r.x>=16.0&&r.z<=r.x+1.2&&!r.rb.turned)return true;
    const[bx,bz]=basePos(this.legalBase(r));if(hyp(r.x-bx,r.z-bz)>=ON_R)return false;
    if(r.rb.mustRetouch||r.rb.base===4)return!r.rb.mustRetouch;
    // 同じ塁に2人：塁は前の走者のもの（前の走者が押し出されているときは後ろの走者のもの）
    const o=this.w.liveRunners.find(q=>q!==r&&q.rb.base===r.rb.base&&hyp(q.x-bx,q.z-bz)<ON_R);
    if(!o)return true;const lead=o.rb.start>r.rb.start?o:r;
    return this.forced(lead)?r!==lead:r===lead}
  out(r,type,o={}){
    const w=this.w;if(r.rb.out||this.ended)return;
    r.rb.out=true;r.vx=r.vz=0;r.stop();w.outs++;
    const ev=w.emit('out',{who:r.id,name:r.name,outType:type,base:o.base,by:o.by,margin:o.margin!=null?+o.margin.toFixed(3):null,outs:w.outs,
      rx:r.x,rz:r.z,bx:o.bx,bz:o.bz,batterBeforeFirst:r.rb.isBatter&&r.rb.base===0});
    if(w.outs>=3)this.endHalf(ev);
  }
  // 打球に野手が触れた（捕った・はじいた）
  onTouch(k,inAir){
    const p=this.play;if(!p||p.dead)return;
    if(p.firstTouchT==null)p.firstTouchT=this.w.t;
    if(p.batted&&p.fly&&inAir){
      // フライを直接捕った：フェアでもファウルでも打者アウト。走者は元の塁に戻ってから進む
      p.flyCaught=true;p.fly=false;p.fair=p.fair==null?isFair(k.x,k.z):p.fair;
      this.w.emit('flyCatch',{who:k.id,fair:p.fair});
      const bat=this.w.liveRunners.find(r=>r.rb.isBatter);if(bat)this.out(bat,'fly',{by:k.id});
      if(!p.fair)this.w.emit('foulFlyOut',{});
      for(const r of this.w.liveRunners){if(r.rb.isBatter)continue;const[bx,bz]=basePos(r.rb.start);
        if(hyp(r.x-bx,r.z-bz)>=ON_R||r.rb.base!==r.rb.start){r.rb.mustRetouch=true;r.rb.base=r.rb.start;this.w.emit('mustRetouch',{who:r.id})}}
      return;
    }
    p.fly=false;
    if(p.batted&&p.fair==null)this.decideFair(k.x,k.z,'touch');
  }
  // はじいた：フライはまだ捕れる。フェアかどうかは触れた場所で決まる（塁より手前・塁より先どちらも）
  onDeflect(k){const p=this.play;if(!p||p.dead)return;if(p.firstTouchT==null)p.firstTouchT=this.w.t;if(p.batted&&p.fair==null&&(this.w.ball.bounces>0||hyp(k.x,k.z)>FIELD.bd||!p.fly))this.decideFair(k.x,k.z,'touch')}
  decideFair(x,z,why){const p=this.play;if(p.fair!=null)return;p.fair=isFair(x,z);
    this.w.emit(p.fair?'fair':'foul',{x,z,why});
    if(!p.fair){p.dead=true;this.endPlay('foul')}}
  touch(r,b){
    const w=this.w,rb=r.rb,t=w.t;
    if(rb.mustRetouch){if(b===rb.start){for(const pd of this.pend)if(pd.r===r&&pd.b===b&&!pd.done){pd.done=true;this.closeCall(r,b,t-pd.t,'appeal',pd.by)}
      if(r.rb.out)return;rb.mustRetouch=false;rb.base=b;rb.arr[b]=t;w.emit('retouch',{who:r.id,base:b})}return}
    if(b===rb.base+1){rb.base=b;rb.arr[b]=t;
      if(b===4){rb.scored=true;r.stop();this.scored.push({r,t});w.score[w.half]++;w.emit('home',{who:r.id,name:r.name})}
      else w.emit('reach',{who:r.id,base:b});
      for(const pd of this.pend)if(pd.r===r&&pd.b===b&&!pd.done){pd.done=true;this.closeCall(r,b,t-pd.t,pd.type,pd.by)}
    }else if(b===rb.base-1&&b>=rb.start){rb.base=b;rb.arr[b]=t}
    else if(b===rb.base)rb.arr[b]=t;   // 離れてまた戻った
  }
  // きわどい判定：m＝走者が着いた時刻−野手が着いた時刻（＋なら野手が先）。差が0.1秒より小さいときだけ五分五分に近づける
  closeCall(r,b,m,type,by){
    if(r.rb.judged[b])return;r.rb.judged[b]=true;
    const pOut=clamp(0.5+0.5*m/CLOSE,0,1);
    if(this.w.rng.chance(pOut))this.out(r,type,{base:b,by,margin:m});
    else this.w.emit('safe',{who:r.id,base:b,margin:+m.toFixed(3),close:true});
  }
  tick(){
    const w=this.w,p=this.play,t=w.t,b=w.ball;if(!p||this.ended)return;
    // フェア・ファウル（塁より先に落ちたら落ちた場所、手前なら塁を過ぎた・止まった・触れた場所）
    if(p.batted&&p.fair==null&&!p.dead){
      if(b.state==='out'&&b.over){if(b.over.fair){p.fair=true;w.emit('fair',{why:'over'});this.award(b.over.bounced?2:4,b.over.bounced?'groundRule':'hr')}else this.decideFair(b.x,b.z,'over')}
      else if(b.state!=='held'){const L=p.firstLand;
        if(b.wall)this.decideFair(b.x,b.z,'wall');
        else if(L&&L[2]>FIELD.bd)this.decideFair(L[0],L[1],'land');
        else if((L||b.state!=='air')&&b.r>FIELD.bd)this.decideFair(b.x,b.z,'pass');
        else if(b.state==='rest')this.decideFair(b.x,b.z,'stop')}
    }else if(p.batted&&p.fair===true&&b.state==='out'&&b.over&&!p.award&&!p.dead)this.award(b.over.bounced?2:4,b.over.bounced?'groundRule':'hr');
    if(p.dead&&!p.award)return;
    // 塁に触れたか（打者走者が二塁へ向かいかけたら、一塁の駆け抜けの守りはなくなる）
    for(const r of w.liveRunners)if(r.rb.isBatter&&r.rb.base===1&&r.z>r.x+1.2&&hyp(r.x-16.3,r.z-16.3)>0.6)r.rb.turned=true;
    for(const r of w.liveRunners){const nr=r.rb.near||(r.rb.near={});for(let k=0;k<4;k++){const[bx,bz]=FIELD.bases[k],n=hyp(r.x-bx,r.z-bz)<ON_R;if(n&&!nr[k]&&!r.rb.out)this.touch(r,k===0&&r.rb.base>=3?4:k);nr[k]=n}}
    if(p.award){this.finishAward();return}
    // ボールを持った野手：塁を踏む（フォース・リタッチのアピール）とタッチ
    const h=b.state==='held'?b.holder:null;
    if(h&&h.side==='F'){
      for(let k=0;k<4;k++){const[bx,bz]=FIELD.bases[k];if(hyp(h.x-bx,h.z-bz)>=BASE_F)continue;
        for(const r of w.liveRunners){
          const tb=k===0?4:k,type=this.forced(r)&&r.rb.forceBase===tb?'force':r.rb.mustRetouch&&r.rb.start===k?'appeal':null;
          if(!type||r.rb.judged[tb]||this.pend.some(q=>q.r===r&&q.b===tb&&!q.done))continue;
          const arr=type==='force'?r.rb.arr[tb]:null;
          if(arr!=null){if(t-arr<CLOSE)this.closeCall(r,tb,arr-t,type,h.id);continue}
          const eta=this.etaTo(r,k);
          if(eta>CLOSE){r.rb.judged[tb]=true;this.out(r,type,{base:tb,by:h.id,margin:eta,bx,bz})}
          else this.pend.push({r,b:tb,t,type,by:h.id});
        }}
      // タッチ：塁にいない走者に触れたらアウト。塁に着く直前・着いた直後だけ五分五分に近づける
      for(const r of w.liveRunners){
        if(hyp(r.x-h.x,r.z-h.z)>=TAG_R||(r.rb.tagT!=null&&t-r.rb.tagT<0.6))continue;
        if(this.onBase(r)){const a=r.rb.arr[this.legalBase(r)];if(a!=null&&t-a<CLOSE){r.rb.tagT=t;this.tagCall(r,a-t,h)}continue}
        const nb=this.nextBase(r),eta=nb!==this.legalBase(r)?this.etaTo(r,nb%4):9;
        r.rb.tagT=t;if(eta<CLOSE)this.tagCall(r,eta,h);else this.out(r,'tag',{by:h.id,margin:eta});
      }
    }
    for(const pd of this.pend)if(!pd.done&&t-pd.t>=CLOSE){pd.done=true;if(!pd.r.rb.out){pd.r.rb.judged[pd.b]=true;this.out(pd.r,pd.type,{base:pd.b,by:pd.by,margin:CLOSE})}}
    this.pend=this.pend.filter(q=>!q.done);
    // 区切り：内野でボールを持ち、全員が塁に止まっている
    const calm=h&&hyp(h.x,h.z)<FIELD.infieldR+6&&w.liveRunners.every(r=>this.onBase(r)&&r.speed<0.3&&r.tx==null);
    if(calm){p.restT=p.restT==null?t:p.restT;if(t-p.restT>0.8)this.endPlay('time')}else p.restT=null;
  }
  tagCall(r,m,h){if(this.w.rng.chance(clamp(0.5+0.5*m/CLOSE,0,1)))this.out(r,'tag',{by:h.id,margin:m});else this.w.emit('safe',{who:r.id,margin:+m.toFixed(3),close:true,tag:true})}
  nextBase(r){const tb=r.rb.base+1,[bx,bz]=basePos(tb),d0=hyp(r.x-bx,r.z-bz),[px,pz]=basePos(r.rb.base),d1=hyp(r.x-px,r.z-pz);
    return d0<d1?tb:r.rb.base}
  etaTo(r,k){const[bx,bz]=FIELD.bases[k],d=hyp(r.x-bx,r.z-bz);if(d<ON_R)return 0;
    const sp=(r.vx*(bx-r.x)+r.vz*(bz-r.z))/d;return sp>0.3?(d-ON_R)/sp:9}
  award(n,why){const p=this.play;p.award={n,why};p.dead=true;
    for(const r of this.w.liveRunners){r.rb.awardTo=Math.min(4,(r.rb.isBatter?0:r.rb.start)+n)}
    this.w.emit(why,{n})}
  finishAward(){if(this.w.liveRunners.every(r=>r.rb.base>=r.rb.awardTo))this.endPlay(this.play.award.why)}
  endHalf(ev){
    // 3アウト目：フォースか、打者が一塁に着く前のアウトなら、そのプレーの得点はなし。ほかは3アウト目より前のホームインだけ
    const t3=ev.t,noRun=ev.outType==='force'||ev.batterBeforeFirst;
    for(const s of this.scored){const m=t3-s.t;s.valid=!noRun&&(m>=CLOSE||(m>-CLOSE&&this.w.rng.chance(0.5+0.5*m/CLOSE)))}
    this.endPlay('threeOuts');
  }
  endPlay(why){
    if(this.ended)return;const w=this.w;this.ended=true;
    if(why==='foul'){for(const r of w.runners){if(r.rb.out&&!r.rb.isBatter)continue;r.rb.base=r.rb.start}}
    let runs=0;for(const s of this.scored){if(s.valid===undefined)s.valid=true;if(s.valid)runs++;else{w.score[w.half]--;w.emit('runVoid',{who:s.r.id})}}
    w.emit('playEnd',{why,runs,outs:w.outs});
  }
}
KE.Umpire=Umpire;KE.RULE={ON_R,BASE_F,TAG_R,CLOSE};

/* ---------- 自動チェック：審判役とは別に、位置からおかしな場面を見つける ---------- */
class Checker{
  constructor(w,o={}){this.w=w;this.ai=o.ai!==false;this.v=[];this.touch=new Map();this.free=null;this.holdT=null;this.stillT=null;this.bounced=0;
    w.checkers.push(this);
    w.on('out',e=>this.onOut(e));w.on('loose',()=>this.snapFree());w.on('playStart',()=>{this.bounced=0;this.snapFree();this.t0=w.t;this.voidRuns=0;this.homes=new Set()});
    w.on('bounce',()=>this.bounced++);w.on('wall',()=>this.bounced++);
    w.on('catch',e=>this.onPick(e));w.on('pickup',e=>this.onPick(e));
    w.on('home',e=>this.homes.add(e.who));w.on('runVoid',()=>this.voidRuns++);
    w.on('playEnd',e=>this.onEnd(e));this.score0=[...w.score];
  }
  bad(code,msg,ex={}){const e={t:+this.w.t.toFixed(2),code,msg,...ex};this.v.push(e);this.w.emit('violation',e)}
  snapFree(){this.free={t:this.w.t,pos:new Map(this.w.fielders.map(f=>[f,[f.x,f.z,f.react]]))}}
  onPick(e){
    // 遠い子が拾っていないか：ボールが離れたときの位置から、拾った場所までの時間をくらべる
    if(!this.free||!this.ai)return;const k=this.w.fielders.find(f=>f.id===e.who);if(!k)return;
    const est=f=>{const p=this.free.pos.get(f);return p?p[2]+hyp(e.x-p[0],e.z-p[1])/PROF.runV(sk(f,'run')):99};
    const me=est(k),best=this.w.fielders.filter(f=>f!==k).sort((a,b)=>est(a)-est(b))[0];
    if(best&&est(best)<me-1.2)this.bad('farPick',`遠い子が拾った（${k.role}。${best.role}の方が${(me-est(best)).toFixed(1)}秒早い）`);
  }
  onOut(e){
    const w=this.w,r=w.runners.find(q=>q.id===e.who),h=w.ball.holder;
    if(e.outType==='fly'){if(this.bounced>0)this.bad('flyBounced','地面についた打球なのにフライアウト');return}
    if(e.outType==='strike')return;
    if(!h){this.bad('noBall','ボールを持っていないのにアウト');return}
    if(e.outType==='tag'){const d=hyp(r.x-h.x,r.z-h.z);if(d>TAG_R+0.2)this.bad('farTag',`離れているのにタッチアウト（${d.toFixed(1)}m）`);
      const lb=w.umpire.legalBase(r)%4,ta=this.touch.get(r)&&this.touch.get(r)[lb],two=w.liveRunners.some(q=>q!==r&&q.rb.base===r.rb.base);
      if(ta!=null&&w.t-ta>CLOSE+0.02&&!two&&!r.rb.mustRetouch)this.bad('tagOnBase','塁の上にいるのにタッチアウト')}
    else if(e.outType==='force'||e.outType==='appeal'){
      const[bx,bz]=basePos(e.base);if(hyp(h.x-bx,h.z-bz)>BASE_F+0.2)this.bad('offBase','塁を踏まずにフォースアウト');
      const ta=this.touch.get(r)&&this.touch.get(r)[e.base%4];
      if(e.outType==='force'&&ta!=null&&w.t-ta>CLOSE+0.02)this.bad('arrived','先に塁に着いているのにアウト')}
    else this.bad('noReason','タッチもフォースもないのにアウト');
  }
  onEnd(e){
    const w=this.w,live=w.liveRunners,seen=new Set();
    if(e.why==='time')for(const r of live){if(r.rb.base===4)continue;if(seen.has(r.rb.base))this.bad('twoOnBase',`同じ塁にランナーが2人（${r.rb.base}塁）`);seen.add(r.rb.base)}
    if(e.why!=='threeOuts'&&e.why!=='foul')for(const r of live){const[bx,bz]=basePos(r.rb.base);if(r.rb.base>0&&hyp(r.x-bx,r.z-bz)>1.5&&!r.rb.awardTo)this.bad('offBaseEnd','塁を離れたままプレーが終わった')}
    const got=w.score[0]+w.score[1]-this.score0[0]-this.score0[1];
    if(e.why!=='foul'&&got!==this.homes.size-this.voidRuns)this.bad('score','得点の記録が合わない');
    this.score0=[...w.score];if(w.outs>3)this.bad('outs','アウトが3つを超えた');
  }
  tick(w){
    const t=w.t;
    for(const r of w.runners){let m=this.touch.get(r);if(!m)this.touch.set(r,m={});
      for(let k=0;k<4;k++){const[bx,bz]=FIELD.bases[k];if(hyp(r.x-bx,r.z-bz)<ON_R){if(m[k]==null)m[k]=t}else m[k]=null}}
    if(w.umpire.ended||!w.umpire.play)return;
    if(t-this.t0>90){this.bad('stall','プレーが90秒以上終わらない');this.t0=t+1e9}
    // 追い越し
    const prog=r=>{const b=r.rb.base,[ax,az]=basePos(b),[cx,cz]=basePos(b+1);return b+clamp(((r.x-ax)*(cx-ax)+(r.z-az)*(cz-az))/(FIELD.bd*FIELD.bd),0,1)};
    const live=w.liveRunners.filter(r=>!r.rb.mustRetouch).sort((a,b)=>a.rb.start-b.rb.start);
    for(let i=1;i<live.length;i++)if(prog(live[i-1])>prog(live[i])+0.15&&!this.passed){this.passed=1;this.bad('pass','ランナーが前のランナーを追い越した')}
    // 持ったまま止まる・動かないボール
    if(!this.ai)return;const b=w.ball,moving=w.liveRunners.some(r=>r.speed>0.5);
    if(b.state==='held'&&b.holder&&b.holder.speed<0.2&&moving){this.holdT=this.holdT??t;if(t-this.holdT>4){this.bad('hold','ボールを持ったまま止まっている');this.holdT=t+1e9}}else this.holdT=null;
    if(b.state==='rest'&&!w.fielders.some(f=>f.tx!=null&&hyp(f.tx-b.x,f.tz-b.z)<3)){this.stillT=this.stillT??t;if(t-this.stillT>3){this.bad('still','止まったボールに誰も向かわない');this.stillT=t+1e9}}else this.stillT=null;
  }
}
KE.Checker=Checker;

if(typeof module!=='undefined'&&module.exports)module.exports=KE;else root.KE=KE;
})(typeof window!=='undefined'?window:globalThis);
