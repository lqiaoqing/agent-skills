import {PAL,cut,blob,poly,rr,lin,rad,shade,glow} from './core/paper.js';
import {cam,applyCam} from './core/camera.js';
import {hash2,TAU,mixHex} from './core/util.js';
function tree(g,x,y,s,t,seed){g.save();g.translate(x,y);g.scale(s,s);const tilt=Math.sin(t*0.8+seed)*0.025;g.rotate(tilt);
  cut(g,poly([[-18,0],[-12,-225],[13,-220],[24,0]],{seed,amp:1.2,round:0.1}),PAL.wood,{rim:PAL.kraft,rimW:2});
  const colors=[PAL.forest,PAL.grassDark,PAL.leafLight];for(let j=0;j<3;j++)cut(g,blob((j-1)*45,-260-j%2*55,85,110,{seed:seed+j*7,amp:0.035}),colors[j],{rim:mixHex(colors[j],PAL.white,0.25),rimW:2});
  for(let i=0;i<7;i++){const px=(hash2(seed,i)-0.5)*130,py=-200-hash2(seed+3,i)*110;g.strokeStyle=mixHex(PAL.forest,PAL.leafLight,0.4);g.lineWidth=2;g.beginPath();g.moveTo(px,py);g.lineTo(px+14,py-8);g.stroke();}g.restore();}
export function house(g,x,y,s=1){g.save();g.translate(x,y);g.scale(s,s);cut(g,rr(-140,-220,280,220,5),PAL.paper2,{rim:PAL.white,rimW:3});
  cut(g,poly([[-170,-220],[0,-355],[175,-220]],{seed:30,amp:1,round:0}),PAL.roofRed,{rim:PAL.paper,rimW:4});
  g.strokeStyle=PAL.wood;g.lineWidth=13;for(const xx of [-130,0,130]){g.beginPath();g.moveTo(xx,-215);g.lineTo(xx,0);g.stroke();}g.beginPath();g.moveTo(-135,-95);g.lineTo(135,-95);g.stroke();
  cut(g,rr(-35,-130,70,130,20),PAL.wood,{rim:PAL.kraft,rimW:2});for(const xx of [-84,84]){cut(g,rr(xx-27,-170,54,64,5),PAL.skyDay,{stroke:PAL.wood,lw:7});g.strokeStyle=PAL.paper;g.lineWidth=3;g.beginPath();g.moveTo(xx,-170);g.lineTo(xx,-110);g.moveTo(xx-25,-140);g.lineTo(xx+25,-140);g.stroke();}g.restore();}
export function mailbox(g,x,y,t=0){g.save();g.translate(x,y);cut(g,rr(-14,-20,28,170,3),PAL.wood,{rim:PAL.kraft,rimW:2});cut(g,rr(-95,-95,190,105,20),PAL.heroBlue,{rim:PAL.white,rimW:3});cut(g,rr(-55,-57,110,16,4),PAL.ink);cut(g,rr(53,-158,10,99,2),PAL.gold);cut(g,poly([[63,-155],[111,-149],[106,-117],[63,-126]],{seed:84,amp:0.5,round:0.1}),PAL.scarf,{rim:PAL.paper,rimW:1.5});g.restore();}
export function world(g,T,ctx,{kind='village',night=0,pan=0,moon=0}={}){
  const c=cam(960+pan,540,1);const skyTop=mixHex(PAL.skyDay,PAL.skyNightHigh,night),skyLow=mixHex(PAL.skyDayLow,PAL.skyNight,night);
  g.fillStyle=lin(g,0,0,0,800,[skyTop,skyLow]);g.fillRect(0,0,1920,1080);
  ctx.layer(g,{texture:0.12},lg=>{applyCam(lg,c,0.12);for(let i=0;i<5;i++){const x=170+i*390+Math.sin(T*0.08+i)*20,y=140+(i%3)*67;cut(lg,blob(x,y,110,30,{seed:40+i}),mixHex(PAL.white,PAL.skyNight,night*0.6));}
    if(moon){glow(lg,1510,240,250,PAL.moonGlow,0.15*moon);cut(lg,blob(1510,240,100,100,{seed:48}),PAL.moon,{rim:PAL.white,rimW:3});}
    for(let i=0;i<24;i++){if(night<0.1)break;const x=hash2(92,i)*1900,y=hash2(93,i)*480;lg.fillStyle=PAL.goldLight;lg.globalAlpha=night*(0.35+0.3*Math.sin(T*2+i));lg.beginPath();lg.arc(x,y,1.5+hash2(94,i)*2,0,TAU);lg.fill();}lg.globalAlpha=1;
  });
  ctx.layer(g,{shadow:4,texture:0.2},lg=>{applyCam(lg,c,0.35);cut(lg,poly([[-500,740],[100,460],[460,700],[760,500],[1200,740],[1560,490],[2450,800],[2500,1200],[-500,1200]],{seed:61,amp:1.1,round:0.2}),mixHex(PAL.mountainFar,PAL.skyNight,night*0.55),{rim:PAL.paper,rimW:2});
    for(let i=0;i<12;i++)tree(lg,-150+i*200,790,0.6,T,60+i);
  });
  ctx.layer(g,{shadow:6,texture:0.22},lg=>{applyCam(lg,c,0.75);cut(lg,blob(900,1330,1500,660,{seed:16,amp:0.02}),mixHex(PAL.meadow,PAL.forestDeep,night*0.5),{rim:PAL.leafLight,rimW:3});
    if(kind==='village'){house(lg,380,845,0.75);house(lg,1590,790,0.58);}
    else if(kind==='forest')for(let i=0;i<8;i++)tree(lg,-100+i*310,900,1.07,T,20+i);
    else{lg.fillStyle=lin(lg,0,800,0,1050,[PAL.water,PAL.waterDeep]);lg.fillRect(-400,800,3000,400);for(let i=0;i<13;i++){lg.strokeStyle=mixHex(PAL.water,PAL.moon,0.4);lg.lineWidth=2;const y=830+i*17;lg.beginPath();lg.moveTo(100+Math.sin(T+i)*35,y);lg.lineTo(1800+Math.sin(T+i)*35,y);lg.stroke();}
      cut(lg,poly([[310,860],[510,745],[1510,745],[1710,860],[1580,900],[1430,820],[560,820],[440,900]],{seed:18,amp:1,round:0.1}),PAL.wood,{rim:PAL.kraft,rimW:4});
      for(let i=0;i<12;i++){lg.strokeStyle=PAL.kraftDark;lg.lineWidth=3;const x=500+i*85;lg.beginPath();lg.moveTo(x,746);lg.lineTo(x-25,820);lg.stroke();}
    }
  });
  ctx.layer(g,{texture:0.23},lg=>{applyCam(lg,c,1);if(kind!=='bridge'){cut(lg,poly([[-500,1020],[300,870],[780,845],[1280,870],[2500,1020],[2500,1200],[-500,1200]],{seed:79,amp:1,round:0.25}),PAL.path,{rim:PAL.paper,rimW:3});for(let i=0;i<65;i++){const x=hash2(81,i)*2300-150,y=920+hash2(83,i)*150;lg.fillStyle=PAL.sand;lg.beginPath();lg.ellipse(x,y,3+hash2(85,i)*4,1.5,0,0,TAU);lg.fill();}}
    if(kind==='village')mailbox(lg,470,730,T);
  });
  return c;
}
export function foreground(g,T,ctx,{night=0}={}){ctx.layer(g,{shadow:5,texture:0.25},lg=>{
  for(const side of [-1,1]){const x=side===-1?60:1850;tree(lg,x,1190,1.15,T,side===-1?123:128);}
  for(let i=0;i<16;i++){const x=70+i*115,y=1060+Math.sin(i)*13;cut(lg,blob(x,y,6,8,{seed:100+i}),i%3===0?PAL.princessLight:PAL.gold,{rim:PAL.paper,rimW:1});}
});}
