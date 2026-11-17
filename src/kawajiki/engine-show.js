/* ============================================================
   河川敷の少年野球 新エンジン 第5段：演出（セリフ・ジェスチャー・ズーム・一球速報）
   試合の中身は「できごと」を知らせるだけ。ここはそれを聞いて「きっかけ（cue）」を並べる。
   試合の動きには口を出さない（ここで何をしても試合結果は変わらない）。
   cue = {t, k:'say'|'pose'|'zoom'|'call', who:{role}|{name}|{ump:0..3}|{bench:0|1}|{coach:1|3}, text, pose, dur, pri}
   ============================================================ */
(function(root){
'use strict';
const KE=root.KE||require('./engine.js');
const pick=(rng,a)=>a[Math.floor(rng()*a.length)];
const OUTN=['','ワンアウト!','ツーアウト!','スリーアウト!'];
class Show{
  constructor(game){
    this.g=game;const w=this.w=game.w;this.cues=[];this.sokuho=[];this.last={};this.rng=KE.makeRng((game.o.seed||1)*31+5);
    this.pa=null;const st=w.step.bind(w);w.step=(...a)=>{const r=st(...a);if(this._later&&this._later.length)this.flush();return r};const on=(e,f)=>w.on(e,x=>{try{f(x||{})}catch(err){}});
    const R=()=>this.rng();
    const fielder=id=>w.fielders.find(f=>f.id===id),runner=id=>w.runners.find(r=>r.id===id);
    const roleOf=id=>{const f=fielder(id);return f?{role:f.role}:null};
    const off=()=>w.half,def=()=>1-w.half;
    // ---- 投球 ----
    on('pitchOut',e=>{this.pose({role:'P'},'pitch',0.6);
      if(e.steal){this.later(0.35,()=>this.say({role:'C'},'走った!',2));this.later(0.2,()=>this.say({bench:off()},'ゴー!',1))}
      if(e.bunt)this.later(0.05,()=>this.say({role:'3B'},'バント!',1))});
    on('pitchResult',e=>{
      const s=this.pa;if(s)s.pitches.push(e.r);
      if(e.r==='strike')this.call(0,'ストライク!','strike',1.0);
      else if(e.r==='ball')this.call(0,'ボール','ball',0.8,0);
      else if(e.r==='swing'){this.call(0,'ストライク!','strike',0.9);if(this.rng()<0.3)this.say({bench:def()},'ナイスボール!',0)}
      else if(e.r==='foul')this.call(0,'ファウル!','foul',0.9);
      if(e.r==='strike'&&e.s===2&&e.b<3&&this.rng()<0.5)this.say({bench:def()},'あと一球!',0)});
    // ---- 打った ----
    on('contact',e=>{this.lastContact=e;
      // 捕れそうなフライなら、捕る子が「オーライ!」
      this.later(0.55,()=>{const c=game.def&&game.def.cur;if(c&&c.air&&w.ball.state==='air'&&w.ball.bounces===0)this.say({role:c.f.role},pick(this.rng,['オーライ!','オーライ、オーライ!','まかせて!']),2)});
      if(e.v>95&&e.va>15&&e.va<40)this.later(0.4,()=>this.say({bench:off()},'いったー!',1))});
    on('overFence',()=>{this.zoom(null,3,false);this.say({bench:off()},'ホームラン!',3,2.2);this.later(0.6,()=>this.say({bench:def()},'ドンマイ、ドンマイ!',0))});
    on('wall',()=>{this.zoom(null,1.6,false)});
    on('flyCatch',e=>{const k=roleOf(e.who||w.ball.holder&&w.ball.holder.id);});
    // 外野が拾ったら、中継・送球先の子が声で呼ぶ（「カット!」「一本!」）
    on('pickup',e=>{const d=game.def;if(!d)return;const OF=['LF','CF','RF'];if(!OF.includes(e.role))return;
      this.later(0.15,()=>{if(d.relay){this.say({role:d.relay.role},'こっち!',2);const tb=d.relayTarget?d.relayTarget():2,c=d.cover&&d.cover[tb];
          if(c&&c!==d.relay)this.say({role:c.role},tb===4?'バックホーム!':'カット!',2)}
        else{const c=d.cover&&d.cover[2];if(c)this.say({role:c.role},'一本!',1)}})});
    on('throwTarget',e=>{if(e.rundown)return;const to=fielder(e.to);if(!to)return;
      if(e.base===4)this.say({role:to.role},'バックホーム!',2);
      if(e.base==null&&to)this.say({role:to.role},'オッケー!',0,0.8)});
    on('dive',e=>{const k=roleOf(e.who);if(k)this.pose(k,'dive',0.9)});
    on('diveCatch',e=>{this.zoom(null,1.8,true);this.later(0.4,()=>this.say({bench:def()},'ナイスキャッチ!',3))});
    on('diveMiss',e=>{this.later(0.8,()=>this.say({role:'P'},'ドンマイ!',0))});
    on('error',e=>{const k=roleOf(e.who);this.later(1.0,()=>this.say(k&&k.role==='P'?{role:'C'}:{role:'P'},'ドンマイ、切りかえ!',1));
      this.later(0.6,()=>this.say({bench:def()},pick(this.rng,['あー!','おしい!','ドンマイ!']),0))});
    on('rundown',e=>{this.say({bench:def()},'はさめ、はさめ!',1);this.zoom(null,2.4,false)});
    // ---- 審判のコール ----
    on('out',e=>{
      if(e.margin!=null&&Math.abs(e.margin)<0.25)this.zoom(null,1.6,true);   // きわどいアウトはスローで寄る
      if(e.outType==='strike'){this.call(0,e.looking===false?'バッターアウト!':'ストライク、バッターアウト!','outCall',1.4)}
      else{const b=e.base!=null?e.base:this.baseNear(e.x,e.z);this.call(b===4?0:Math.max(1,Math.min(3,b||1)),'アウト!','outCall',1.3,2)}
      const n=e.outs!=null?e.outs:w.outs;if(n>=1&&n<=3)this.later(0.9,()=>this.say({role:'C'},OUTN[n],1));
      if(w.outs===3)this.later(1.2,()=>this.say({bench:def()},'ナイス守備!',0))});
    on('safe',e=>{const b=e.base!=null?e.base:1;this.call(b===4?0:Math.max(1,Math.min(3,b)),'セーフ!','safe',1.2,2);if(e.close)this.zoom(null,1.4,true)});
    on('home',e=>{if(e.walk)return;this.say({bench:off()},pick(this.rng,['ナイスラン!','よっしゃー!','ナイスバッティング!']),2);
      const r=runner(e.who);if(r)this.say({name:r.name},'ただいま!',0,0.8)});
    on('walk',()=>{this.call(0,'フォアボール','ball',1.2,1);this.later(0.5,()=>this.say({bench:off()},'ナイスセン!',0))});
    on('wildPitch',()=>{this.say({bench:off()},'ゴー、ゴー!',2);this.later(0.2,()=>this.say({role:'P'},'カバー!',1))});
    on('dropThird',()=>{this.say({bench:off()},'走れ!',3);this.later(0.2,()=>this.say({role:'C'},'ファースト!',1))});
    on('pickoff',e=>{this.pose({role:'P'},'throw',0.5);this.later(0.15,()=>this.say({coach:1},'バック!',2))});
    on('retouch',()=>{});
    // 三塁コーチャー：本塁へ回すか止めるか（走者が三塁を回ったとき）
    on('reach',e=>{if(e.base!==3)return;const r=runner(e.who);if(!r||r.rb.isBatter&&w.liveRunners.length>1&&false)return;
      this.later(0.05,()=>{if(r.rb.out)return;if(r.plan===4)this.say({coach:3},'回れ回れ!',2);else if(r.speed>3)this.say({coach:3},'ストップ!',2)})});
    on('playEnd',()=>{});
    // ---- 一球速報 ----
    on('paStart',e=>{this.pa={inn:e.inn,half:e.half,who:e.who,outs:w.outs,score:[...w.score],pitches:[],txt:''};});
    on('paEnd',e=>{if(!this.pa)return;this.pa.txt=e.txt;this.pa.after={outs:w.outs,score:[...w.score]};this.sokuho.push(this.pa);this.pa=null});
  }
  // 同じ子が立て続けにしゃべらない・大事なセリフを優先
  say(who,text,pri=1,dur=1.3){const w=this.w,key=JSON.stringify(who),t=w.t,l=this.last[key];
    if(l&&t<l.until&&pri<=l.pri)return;this.last[key]={until:t+dur,pri};this.cues.push({t,k:'say',who,text,pri,dur})}
  pose(who,pose,dur=0.8,face){this.cues.push({t:this.w.t,k:'pose',who,pose,dur,face})}
  call(ump,text,pose,dur=1.2,pri=1){this.pose({ump},pose,dur);this.say({ump},text,pri,dur)}
  zoom(at,dur=1.5,slow=false){const b=this.w.ball;this.cues.push({t:this.w.t,k:'zoom',at:at||[b.x,b.z],dur,slow})}
  later(s,f){(this._later=this._later||[]).push({t:this.w.t+s,f})}
  flush(){const w=this.w;if(!this._later)return;const due=this._later.filter(q=>w.t>=q.t);this._later=this._later.filter(q=>w.t<q.t);for(const q of due){try{q.f()}catch(e){}}}
  baseNear(x,z){if(x==null)return 1;let b=1,bd=1e9;KE.FIELD.bases.forEach(([bx,bz],i)=>{const d=Math.hypot(x-bx,z-bz);if(d<bd){bd=d;b=i===0?4:i}});return b}
}
KE.Show=Show;
if(typeof module!=='undefined'&&module.exports)module.exports=KE;
})(typeof window!=='undefined'?window:globalThis);
