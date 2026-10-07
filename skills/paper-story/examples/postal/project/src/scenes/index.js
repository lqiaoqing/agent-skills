import {SCENE,TIMELINE} from '../timeline.js';
import {PROJECT} from '../project.js';
import {PAL,rr,cut,poly,blob,lin,shade,glow,rays} from '../core/paper.js';
import {seg,lerp,clamp,TAU,hash2,smoothstep,mixHex} from '../core/util.js';
import {inOutCubic,outBack,outCubic} from '../core/ease.js';
import {applyCam,drift} from '../core/camera.js';
import {shapeReveal,coverSize} from '../fx/transitions.js';
import {paperGlyph} from '../ui/type.js';
import {burst} from '../core/particles.js';
import {world,foreground} from '../world.js';
import {postman,star,envelope,boat} from '../cast.js';
const progress=(T,id)=>{const s=SCENE(id);return clamp((T-s.start)/(s.end-s.start));};
function book(g,T,ctx,ending=false){
  g.fillStyle=lin(g,0,0,1920,1080,[PAL.wood,PAL.woodDark]);g.fillRect(0,0,1920,1080);
  for(let i=0;i<12;i++){g.strokeStyle='rgba(255,235,190,0.055)';g.lineWidth=3;g.beginPath();g.moveTo(0,i*95+20);g.bezierCurveTo(500,i*95-5,1300,i*95+45,1920,i*95+12);g.stroke();}
  glow(g,550,250,850,PAL.goldLight,0.16);
  const d=drift(T,{amp:3});ctx.layer(g,{shadow:20,texture:0.35},lg=>{lg.translate(d[0],d[1]);
    for(let i=0;i<5;i++)cut(lg,rr(450+i*3,166+i*5,1020,730,12),i%2?PAL.paper:PAL.paper2);
    cut(lg,rr(450,150,1020,730,13),PAL.redDeep,{rim:PAL.goldLight,rimW:3});
    cut(lg,rr(450,150,50,730,8),PAL.redDark,{rim:PAL.scarf,rimW:2});
    lg.strokeStyle=PAL.gold;lg.lineWidth=3;lg.stroke(rr(535,195,880,640,10));lg.lineWidth=1;lg.stroke(rr(548,208,854,614,8));
    for(const [x,y] of [[560,220],[1390,220],[560,815],[1390,815]]){lg.fillStyle=PAL.gold;lg.beginPath();lg.arc(x,y,15,0,TAU);lg.fill();}
    star(lg,{x:975,y:338,s:0.8,t:T,light:1});
    [...PROJECT.title].forEach((ch,i)=>paperGlyph(lg,ch,710+i*133,505,110,{style:'title',fill:PAL.gold,rim:PAL.goldLight}));
    lg.textAlign='center';lg.font='30px "XiaoWei"';lg.fillStyle=PAL.paper;lg.fillText(ending?'一封信，一点光，一段回家的路':'纸艺立体绘本 · 一个温暖的小故事',975,675);
    cut(lg,poly([[1180,880],[1230,880],[1228,992],[1204,976],[1180,992]],{seed:202,amp:0.5,round:0}),PAL.scarf,{rim:PAL.paper,rimW:2});
  });
  if(!ending)ctx.fx.fade=1-smoothstep(SCENE('cover').start,SCENE('cover').start+0.6,T);
  else ctx.fx.fade=smoothstep(TIMELINE.duration-0.6,TIMELINE.duration,T);
}
function mail(g,T,ctx){const u=progress(T,'mail'),c=world(g,T,ctx,{kind:'village'});
  ctx.layer(g,{shadow:11,texture:0.3},lg=>{applyCam(lg,c,1);
    const a=postman(lg,{x:1020,y:890,t:T,expr:u<0.5?'think':'shock',pose:u<0.48?'think':'present'});
    const open=seg(u,0.32,0.48);envelope(lg,800,700,1.05,open);
    const appear=outBack(seg(u,0.46,0.65));if(appear>0)star(lg,{x:805,y:lerp(700,565,clamp(appear)),s:Math.max(0,appear)*0.9,t:T,mood:'worried',light:0.2});
    if(u>0.45)glow(lg,805,600,200,PAL.goldLight,0.12);
  });foreground(g,T,ctx);
}
function forest(g,T,ctx){const u=progress(T,'forest'),pan=lerp(0,650,u),c=world(g,T,ctx,{kind:'forest',pan,night:u*0.5});
  ctx.layer(g,{shadow:10,texture:0.3},lg=>{applyCam(lg,c,1);
    const x=720+pan,phase=(T-SCENE('forest').start)*3.6;const a=postman(lg,{x,y:905,t:T,pose:'walk',phase,expr:u<0.45?'determined':'grin'});envelope(lg,a.handR[0]+35,a.handR[1],0.48);
    star(lg,{x:x+225,y:660+Math.sin(T*2)*16,s:0.78,t:T,mood:u<0.4?'worried':'happy',light:0.4+u*0.4});
    for(let i=0;i<9;i++){const xx=x+110+Math.sin(T*1.5+i)*180,yy=380+((T*25+i*61)%400);const p=poly([[-9,0],[0,-15],[13,0],[0,9]],{seed:500+i,amp:0.3,round:0.2});lg.save();lg.translate(xx,yy);lg.rotate(T+i);cut(lg,p,i%2?PAL.gold:PAL.leafLight);lg.restore();}
  });foreground(g,T,ctx,{night:u*0.5});
}
function bridge(g,T,ctx){const u=progress(T,'bridge'),c=world(g,T,ctx,{kind:'bridge',night:0.95,moon:1});
  ctx.layer(g,{shadow:10,texture:0.28},lg=>{applyCam(lg,c,1);
    postman(lg,{x:790,y:807,t:T,pose:u<0.4?'present':'cheer',expr:u<0.4?'determined':'grin'});
    const flight=inOutCubic(seg(u,0.35,0.86)),x=lerp(1060,1480,flight),y=lerp(752,220,flight),s=lerp(0.9,0.38,flight);
    if(u<0.26)envelope(lg,1060,735,0.8,0);
    else boat(lg,x,y,s,T);
    star(lg,{x,y:y-86*s,s:s*0.72,t:T,light:1});
    if(flight>0){glow(lg,x,y,240*s,PAL.goldLight,0.3);for(let i=0;i<14;i++){const q=flight-i*0.022;if(q<=0)continue;lg.globalAlpha=Math.max(0,1-i/14)*0.6;const xx=lerp(1060,1480,q),yy=lerp(752,220,q);cut(lg,blob(xx,yy+35,3,3,{seed:630+i}),PAL.goldLight);}lg.globalAlpha=1;}
  });foreground(g,T,ctx,{night:1});
}
function home(g,T,ctx){const u=progress(T,'home'),c=world(g,T,ctx,{kind:'village',night:0});
  ctx.layer(g,{shadow:11,texture:0.3},lg=>{applyCam(lg,c,1);
    postman(lg,{x:1040,y:890,t:T,expr:u<0.4?'shock':'grin',pose:u<0.4?'cupEar':'present'});
    const a=inOutCubic(seg(u,0.05,0.46));const x=lerp(1500,860,a),y=lerp(170,640,a);lg.save();lg.translate(x,y);lg.rotate(lerp(-0.5,0.04,a));envelope(lg,0,0,lerp(0.5,1,a),a>0.95?1:0);lg.restore();
    glow(lg,x,y,200,PAL.goldLight,0.18);
    if(u>0.48){const reveal=outBack(seg(u,0.48,0.64));lg.save();lg.translate(820,460);lg.scale(Math.max(0,reveal),Math.max(0,reveal));cut(lg,rr(-175,-90,350,155,14),PAL.paper,{rim:PAL.goldLight,rimW:3});paperGlyph(lg,'谢',-65,-12,83,{fill:PAL.scarf});paperGlyph(lg,'谢',65,-12,83,{fill:PAL.scarf});lg.restore();}
    star(lg,{x:1450,y:280,s:0.5,t:T,light:1});
  });
  burst(g,T,{at:SCENE('home').start+(SCENE('home').end-SCENE('home').start)*0.6,seed:42,count:25,x:900,y:460,speed:[80,170],gravity:120,life:[1,2],size:[4,8]},(lg,x,y,p)=>{lg.fillStyle=p.r<0.5?PAL.gold:PAL.scarf;lg.fillRect(x,y,p.size,p.size);});foreground(g,T,ctx);
}
const frames={cover:(g,T,ctx)=>book(g,T,ctx,false),mail,forest,bridge,home,ending:(g,T,ctx)=>book(g,T,ctx,true)};
export default TIMELINE.scenes.map((scene,i)=>({id:scene.id,start:i?scene.start-0.55:scene.start,end:scene.end,z:0,draw(g,T,lt,ctx){
  const draw=gg=>frames[scene.id](gg,Math.max(T,scene.start),ctx);
  if(i && T<scene.start)shapeReveal(ctx,g,'circle',{cx:960,cy:540,size:coverSize('circle')*inOutCubic(seg(T,scene.start-0.55,scene.start))},draw);
  else draw(g);
}}));
