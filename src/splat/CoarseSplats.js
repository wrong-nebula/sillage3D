// Gaussian hierarchy initialization follows Kerbl et al., 2024, equations 3–9:
// https://arxiv.org/abs/2406.12080 . Opacity is subsequently fitted to the
// composited children, not obtained by dropping samples or averaging opacity.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const covariance=s=>Array.from({length:9},(_,i)=>s.axes.reduce((v,a)=>v+a[Math.floor(i/3)]*a[i%3],0));
const area=s=>{const [a,b,c]=s.axes.map(v=>Math.hypot(...v)),p=1.6075;return ((Math.pow(a*b,p)+Math.pow(a*c,p)+Math.pow(b*c,p))/3)**(1/p);};

/** Symmetric eigendecomposition, retaining a stable brush-frame orientation. */
export function covarianceAxes(matrix,frame){
  const a=matrix.slice(),v=[1,0,0,0,1,0,0,0,1];
  for(let sweep=0;sweep<16;sweep++){
    let p=0,q=1;
    for(const [i,j] of [[0,2],[1,2]])if(Math.abs(a[i*3+j])>Math.abs(a[p*3+q])){p=i;q=j;}
    if(Math.abs(a[p*3+q])<1e-12*Math.max(a[0]+a[4]+a[8],1e-12))break;
    const angle=.5*Math.atan2(2*a[p*3+q],a[q*3+q]-a[p*3+p]),c=Math.cos(angle),s=Math.sin(angle);
    for(let k=0;k<3;k++){const x=a[k*3+p],y=a[k*3+q];a[k*3+p]=c*x-s*y;a[k*3+q]=s*x+c*y;}
    for(let k=0;k<3;k++){const x=a[p*3+k],y=a[q*3+k];a[p*3+k]=c*x-s*y;a[q*3+k]=s*x+c*y;}
    for(let k=0;k<3;k++){const x=v[k*3+p],y=v[k*3+q];v[k*3+p]=c*x-s*y;v[k*3+q]=s*x+c*y;}
  }
  const axes=[0,1,2].map(i=>[v[i],v[3+i],v[6+i]].map(x=>x*Math.sqrt(Math.max(a[i*3+i],1e-14))));
  const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const directions=frame.map(unit);let best=permutations[0],score=-Infinity;
  for(const order of permutations){const value=order.reduce((sum,index,i)=>sum+Math.abs(dot(unit(axes[index]),directions[i])),0);if(value>score){score=value;best=order;}}
  return best.map((index,i)=>axes[index].map(x=>x*(dot(axes[index],directions[i])<0?-1:1)));
}

function projected(s,x,y,filter){
  let xx=filter,xy=0,yy=filter;
  for(const axis of s.axes){const a=dot(axis,x),b=dot(axis,y);xx+=a*a;xy+=a*b;yy+=b*b;}
  const det=xx*yy-xy*xy;
  return {xx,xy,yy,inv:[yy/det,-xy/det,xx/det],center:[dot(s.center,x),dot(s.center,y)]};
}
const kernel=(p,x,y)=>{const dx=x-p.center[0],dy=y-p.center[1],r2=p.inv[0]*dx*dx+2*p.inv[1]*dx*dy+p.inv[2]*dy*dy;return r2<=9?Math.exp(-.5*r2):0;};

/** Fit a single opacity against front-to-back child coverage from several
 * orientations and sampling rates. Color matching is constrained separately.
 * The fit score is only an asset-generation diagnostic; GPU image tests decide
 * whether a level is suitable for activation. */
export function mergeGaussianPair(a,b,spacing){
  const wa=a.opacity*area(a),wb=b.opacity*area(b),weight=wa/(wa+wb),weights=[weight,1-weight];
  const center=a.center.map((v,i)=>v*weight+b.center[i]*(1-weight)),ca=covariance(a),cb=covariance(b);
  const matrix=ca.map((v,k)=>{
    const i=Math.floor(k/3),j=k%3;
    return weight*(v+(a.center[i]-center[i])*(a.center[j]-center[j]))+(1-weight)*(cb[k]+(b.center[i]-center[i])*(b.center[j]-center[j]));
  });
  const merged={...a,center,axes:covarianceAxes(matrix,a.axes),color:a.color.map((v,i)=>v*weight+b.color[i]*(1-weight))};
  const normal=unit(a.axes[2]),tangent=unit(a.axes[0]),bitangent=unit(cross(normal,tangent));
  const views=[normal,unit(normal.map((v,i)=>v+tangent[i])),unit(normal.map((v,i)=>v+bitangent[i]))];
  const samples=[];
  for(const direction of views)for(const pixels of [.65,1.3]){
    const x=unit(cross(direction,Math.abs(direction[1])<.9?[0,1,0]:[1,0,0])),y=cross(direction,x),filter=.3*(spacing/pixels)**2;
    const pa=projected(a,x,y,filter),pb=projected(b,x,y,filter),pm=projected(merged,x,y,filter);
    const sx=Math.sqrt(pm.xx),sy=Math.sqrt(pm.yy-pm.xy*pm.xy/pm.xx),shear=pm.xy/sx;
    for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++){
      const qx=i*.8,qy=j*.8,px=pm.center[0]+sx*qx,py=pm.center[1]+shear*qx+sy*qy;
      const aa=Math.min(.995,a.opacity*kernel(pa,px,py)),ab=Math.min(.995,b.opacity*kernel(pb,px,py));
      samples.push([kernel(pm,px,py),aa+ab-aa*ab]);
    }
  }
  const error=opacity=>samples.reduce((sum,[g,target])=>sum+(Math.min(.995,opacity*g)-target)**2,0);
  let low=.001,high=3;
  for(let i=0;i<14;i++){
    const left=(2*low+high)/3,right=(low+2*high)/3;
    if(error(left)<error(right))high=right;else low=left;
  }
  merged.opacity=(low+high)*.5;
  return {splat:merged,weights,fitError:Math.sqrt(error(merged.opacity)/Math.max(1e-12,samples.reduce((sum,[,alpha])=>sum+alpha*alpha,0)))};
}

/** Deterministic, per-object pairing. Moving particles, water, cel paint and
 * material boundaries retain their exact leaf records. */
export function coarsenPlant(splats,{start=0,count=splats.length,spacing,maxColorError=.055,maxFitError=.14}={}){
  if(!Number.isFinite(spacing)||spacing<=0||!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<0||start+count>splats.length)throw new RangeError('Invalid coarse plant range.');
  const cell=spacing*1.6,buckets=new Map(),used=new Uint8Array(count),result=[],sources=[],fits=[];
  const eligible=s=>!s.sporeMotion&&!s.softParticle&&!s.noFog&&!s.celPaint&&!s.wind&&s.material==='foliage';
  const key=(x,y,z)=>`${x},${y},${z}`;
  const cells=Array.from({length:count},(_,i)=>splats[start+i].center.map(v=>Math.floor(v/cell)));
  for(let i=0;i<count;i++)if(eligible(splats[start+i])){const k=key(...cells[i]);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);}
  for(let i=0;i<count;i++){
    if(used[i])continue;used[i]=1;const a=splats[start+i],cellPosition=cells[i];let nearest=-1,best=cell*cell;
    if(eligible(a))for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of buckets.get(key(cellPosition[0]+dx,cellPosition[1]+dy,cellPosition[2]+dz))??[]){
      if(used[j])continue;const b=splats[start+j],distance=a.center.reduce((sum,v,k)=>sum+(v-b.center[k])**2,0);
      if(distance>=best||a.material!==b.material||a.color.some((v,k)=>Math.abs(v-b.color[k])>maxColorError)||dot(unit(a.axes[2]),unit(b.axes[2]))<.9)continue;
      nearest=j;best=distance;
    }
    if(nearest>=0){
      const fit=mergeGaussianPair(a,splats[start+nearest],spacing);
      if(fit.fitError<=maxFitError){used[nearest]=1;result.push(fit.splat);sources.push([[start+i,fit.weights[0]],[start+nearest,fit.weights[1]]]);fits.push(fit.fitError);continue;}
    }
    result.push(a);sources.push([[start+i,1]]);
  }
  return {splats:result,sources,merged:count-result.length,maxFitError:fits.length?Math.max(...fits):0};
}

/** Prepare a fitted level with the same baked lighting response as its leaves. */
export function prepareCoarseLevel(definition,group,candidate){
  const replacements=new Map(),removed=new Set();
  for(const merge of candidate.merges){
    const indices=merge.sources.map(([index])=>index);
    if(indices.length!==2||indices[0]===indices[1]||indices.some(i=>i<group.start||i>=group.start+group.count||!Number.isInteger(i))||removed.has(indices[0])||removed.has(indices[1]))throw new Error('Invalid coarse source membership.');
    if(merge.sources.some(([,w])=>!Number.isFinite(w)||w<=0)||Math.abs(merge.sources.reduce((sum,[,w])=>sum+w,0)-1)>1e-6)throw new Error('Invalid coarse source weights.');
    replacements.set(indices[0],merge);for(const index of indices)removed.add(index);
  }
  const splats=[],sources=[];
  for(let i=group.start;i<group.start+group.count;i++){
    const merge=replacements.get(i);
    if(merge){splats.push(merge.splat);sources.push(merge.sources);}
    else if(!removed.has(i)){splats.push(definition.splats[i]);sources.push([[i,1]]);}
  }
  if(splats.length!==candidate.count)throw new Error('Coarse count mismatch.');
  const count=splats.length,response={count,original:new Float32Array(count*3),linear:new Float32Array(count*3),bounce:new Float32Array(count*3),shadow:new Float32Array(count)};
  for(let i=0;i<count;i++)for(const [source,weight] of sources[i]){
    for(const field of ['original','linear','bounce'])for(let c=0;c<3;c++)response[field][i*3+c]+=definition.colorResponse[field][source*3+c]*weight;
    response.shadow[i]+=definition.colorResponse.shadow[source]*weight;
  }
  return {splats,response,sources};
}
