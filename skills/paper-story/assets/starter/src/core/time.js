/** Ordered piecewise-linear mapping; no story names or fixed song duration. */
export function makeWarp(anchors = {}, cues = {}, duration = 0) {
  const points = Array.isArray(anchors) ? anchors.map(p => [Number(p.real), Number(p.default)]) : Object.entries(anchors).map(([id,real]) => {
    if (!(id in cues)) throw new Error(`Unknown warp cue ${id}`);
    return [Number(real), Number(cues[id])];
  });
  points.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<points.length;i++){
    const p=points[i];
    if(!p.every(Number.isFinite)||p.some(v=>v<0))throw new Error('Warp anchors must be finite nonnegative times');
    if(i && (p[0]<=points[i-1][0] || p[1]<=points[i-1][1]))throw new Error('Warp real and default times must both increase strictly');
  }
  const map=(x,from,to)=>{
    if(!Number.isFinite(x))throw new Error('Time must be finite');
    if(!points.length)return x;
    if(x<=points[0][from])return points[0][to]+x-points[0][from];
    for(let i=1;i<points.length;i++)if(x<=points[i][from]){
      const a=points[i-1],b=points[i];return a[to]+(x-a[from])/(b[from]-a[from])*(b[to]-a[to]);
    }
    const p=points.at(-1);return p[to]+x-p[from];
  };
  const toDefault=t=>map(t,0,1),toReal=t=>map(t,1,0);
  return {toDefault,toReal,duration:toReal(duration)};
}
