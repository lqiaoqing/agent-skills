import {drawHero} from './rigs/hero.js';
import {PAL,cut,poly,blob,rr,glow,shade} from './core/paper.js';
import {TAU,mixHex} from './core/util.js';
export function envelope(g,x,y,s=1,open=0){
  g.save();g.translate(x,y);g.scale(s,s);
  const shape=rr(-70,-42,140,84,5);cut(g,shape,PAL.paper,{rim:PAL.white,rimW:2});
  shade(g,shape,PAL.kraftDark,-70,-42,70,42,0,0.2);
  const flap=poly([[-70,-42],[0,open?-112:6],[70,-42]],{seed:31,amp:0.6,round:0});cut(g,flap,PAL.paper2,{rim:PAL.white,rimW:1.5});
  g.strokeStyle=PAL.kraftDark;g.lineWidth=1.7;g.beginPath();g.moveTo(-70,42);g.lineTo(0,-4);g.lineTo(70,42);g.stroke();
  cut(g,blob(0,7,12,11,{seed:52}),PAL.scarf,{rim:PAL.goldLight,rimW:1});g.restore();
}
export function boat(g,x,y,s=1,T=0){
  g.save();g.translate(x,y);g.rotate(Math.sin(T*2)*0.04);g.scale(s,s);
  cut(g,poly([[-95,-9],[95,-9],[50,38],[-40,38]],{seed:9,amp:0.5,round:0}),PAL.paper2,{rim:PAL.white,rimW:3});
  cut(g,poly([[-95,-9],[0,-58],[95,-9],[5,5]],{seed:10,amp:0.4,round:0}),PAL.paper,{rim:PAL.white,rimW:2});
  cut(g,poly([[-6,-58],[3,-99],[72,-8],[4,-8]],{seed:11,amp:0.4,round:0}),PAL.white,{rim:PAL.goldLight,rimW:1.5});g.restore();
}
export function star(g,{x,y,s=1,t=0,mood='happy',light=1}){
  const points=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?30:67;return [Math.cos(a)*r,Math.sin(a)*r];});
  g.save();g.translate(x,y+Math.sin(t*3)*5);g.rotate(Math.sin(t*1.7)*0.045);g.scale(s,s);
  glow(g,0,0,155,PAL.goldLight,0.08+light*0.17);
  const p=poly(points,{seed:71,amp:0.65,round:0.15});cut(g,p,mixHex(PAL.kraft,PAL.gold,light),{rim:PAL.goldLight,rimW:3});shade(g,p,PAL.goldDark,-40,-50,50,65,0,0.23);
  const blink=Math.pow(Math.max(0,Math.sin(t*0.73+0.8)),28);g.fillStyle=PAL.ink;
  for(const x of [-18,18]){g.beginPath();g.ellipse(x,-4,5,Math.max(0.8,8*(1-blink)),0,0,TAU);g.fill();}
  g.strokeStyle=PAL.ink;g.lineWidth=3;g.lineCap='round';g.beginPath();g.moveTo(-9,15);g.quadraticCurveTo(0,mood==='worried'?5:27,9,15);g.stroke();
  g.fillStyle=PAL.blush;for(const x of [-31,31]){g.beginPath();g.ellipse(x,9,9,4,0,0,TAU);g.fill();}g.restore();
}
export function postman(g,{x,y,s=1.35,t=0,face=1,pose='idle',expr='normal',phase=0,act=0}){
  const a=drawHero(g,{x,y,s,t,face,pose,expr,phase,act,sword:'none',scarf:{len:220,vel:[pose==='walk'?80:0,0]},detail:1});
  // Shared anchors keep the new cap attached during every pose.
  g.save();g.translate(a.head[0],a.head[1]-38*s);g.scale(face*s,s);
  cut(g,blob(0,-12,54,24,{seed:79,amp:0.025}),PAL.heroBlue,{rim:PAL.white,rimW:2});
  cut(g,poly([[-50,4],[37,4],[61,13],[39,18],[-47,14]],{seed:80,amp:0.5,round:0.2}),PAL.heroBlueDark,{rim:PAL.white,rimW:1});
  cut(g,rr(-13,-21,26,18,4),PAL.gold,{rim:PAL.goldLight,rimW:1});g.restore();
  g.save();g.translate(x-42*face*s,y-108*s);g.rotate(-0.1*face);g.scale(s,s);
  cut(g,rr(-35,-30,70,55,8),PAL.leather,{rim:PAL.kraft,rimW:2});cut(g,rr(-35,-31,70,20,5),PAL.wood,{rim:PAL.kraft,rimW:1.5});cut(g,rr(-6,-12,12,12,2),PAL.gold);g.restore();
  return a;
}
