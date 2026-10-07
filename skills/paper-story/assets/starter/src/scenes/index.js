import { TIMELINE } from '../timeline.js';
import { PAL, rr, cut, blob, glow } from '../core/paper.js';
import { paperGlyph } from '../ui/type.js';
export default [{id:'opening',start:0,end:TIMELINE.duration,draw(g,T,lt,ctx){
  g.fillStyle=PAL.kraft;g.fillRect(0,0,1920,1080);
  ctx.layer(g,{shadow:12,texture:0.35},lg=>{
    cut(lg,rr(270,120,1380,800,36),PAL.redDeep,{rim:PAL.goldLight,rimW:5});
    cut(lg,rr(310,160,1300,720,20),PAL.paper,{rim:PAL.white,rimW:3});
    [...'纸艺故事'].forEach((ch,i)=>paperGlyph(lg,ch,600+i*240,400,170,{style:'title',fill:PAL.red}));
    const y=650+Math.sin(T*2)*12;cut(lg,blob(960,y,90,70,{seed:3}),PAL.gold,{rim:PAL.goldLight});
    glow(lg,960,y,160,PAL.goldLight,0.15);
  });
  ctx.fx.fade=Math.max(0,1-T/0.5,(T-(TIMELINE.duration-0.5))/0.5);
}}];
