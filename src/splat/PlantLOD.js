import {Frustum,Matrix4,Sphere,Vector3} from 'three';
import {packSplats} from './math.js';
import {prepareColorResponse} from './colorResponse.js';
import {foregroundDefocus} from './ForegroundDOF.js';

export function organicDetailWeight(progress,phase=0,seed=0){
  const delay=phase+(seed*17.13%1)*.04;
  const t=Math.max(0,Math.min(1,(progress-delay)/.84));
  return t*t*(3-2*t);
}

export function plantDetailLevel(pixels,previous=0,maxLevel=2){
  let level=previous;
  while(level<maxLevel&&pixels>(level===0?10:22))level++;
  while(level>0&&pixels<(level===1?7.5:17))level--;
  return Math.min(level,maxLevel);
}

/** Visible screen-space error, hysteresis, and a strict active-splat budget. */
export function selectPlantLevels(groups,camera,{height,brushScale=1,quality='studio',mode='paint',enabled=true,baseCount,maxActiveSplats,draftMaxActiveSplats,focusDistance,foregroundDOF=false,dofStrength,dofRange},previous=new Map()){
  const levels=new Map(),metrics=new Map();
  if(!enabled)return {levels,metrics,count:baseCount};
  camera.updateMatrixWorld(true);
  const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const focal=height*.5*camera.projectionMatrix.elements[5],center=new Vector3(),sphere=new Sphere(),candidates=[];
  for(const group of groups){
    sphere.center.fromArray(group.center);sphere.radius=group.radius;
    if(!frustum.intersectsSphere(sphere))continue;
    center.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse);
    if(-center.z+group.radius<=camera.near)continue;
    const depth=Math.max(.4,-center.z-group.radius*.35);
    const blur=foregroundDefocus(depth,focusDistance,{foregroundDOF,dofStrength,dofRange});
    // Gouache needs fine botanical edges inside broad color masses. Request
    // smaller source samples sooner, within the same streaming/GPU budgets.
    const pixels=Math.max(0,group.spacing*focal*brushScale/depth-height*.024*blur*.8)*(mode==='ghibli'?2.2:1);
    const level=plantDetailLevel(pixels,previous.get(group.id)||0,quality==='draft'?1:2);
    metrics.set(group.id,pixels);
    if(level)candidates.push({group,level,pixels});
  }
  candidates.sort((a,b)=>b.pixels-a.pixels||a.group.start-b.group.start);
  const budget=quality==='draft'?draftMaxActiveSplats:maxActiveSplats;
  let count=baseCount;
  for(const candidate of candidates){
    let level=candidate.level;
    while(level&&count+candidate.group.levels[level-1].count-candidate.group.count>budget)level--;
    if(level){levels.set(candidate.group.id,level);count+=candidate.group.levels[level-1].count-candidate.group.count;}
  }
  return {levels,metrics,count};
}

/** Stream real mesh samples per plant; the coarse scene is always available. */
export class PlantLOD {
  constructor(definition,packed,onInvalidate){
    this.definition=definition;this.config=definition.lod;this.groups=this.config.groups;
    this.basePacked=packed;this.onInvalidate=onInvalidate;
    this.cache=new Map();this.inflight=new Map();this.failures=new Map();
    this.previous=new Map();this.applied=new Map();this.signature='';this.disposed=false;
    this.transition=null;this.progress=1;this.queued=false;
    this.stats={refinedPlants:0,medium:0,fine:0,loading:0,cachedSplats:0};
  }
  get capacity(){return this.config.maxActiveSplats;}
  get animating(){return Boolean(this.transition)||this.queued;}
  wake(){if(!this.disposed)this.onInvalidate?.();}
  request(group,level){
    const key=`${group.id}:${level}`,controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000),task={controller};
    this.inflight.set(key,task);
    task.promise=(async()=>{
      try{
        const {splats,parents}=await this.config.load(group,level,controller.signal);
        if(this.disposed||controller.signal.aborted)return;
        const count=splats.length;
        if(count!==group.levels[level-1].count||parents?.length!==count)throw new Error('Plant detail count mismatch.');
        const lighting={irradiance:new Float32Array(count*3),shadow:new Float32Array(count)},original=this.definition.lighting;
        for(let i=0;i<count;i++){
          const parent=parents[i];
          if(parent<group.start||parent>=group.start+group.count)throw new Error('Plant lighting parent is outside its source object.');
          lighting.irradiance.set(original.irradiance.subarray(parent*3,parent*3+3),i*3);
          lighting.shadow[i]=original.shadow?.[parent]??0;
        }
        this.cache.set(key,{splats,packed:packSplats(splats,4096,lighting.irradiance),response:prepareColorResponse(splats,lighting),used:performance.now()});
        this.failures.delete(key);
      }catch(error){
        if(!this.disposed&&!task.cancelled)this.failures.set(key,{at:performance.now(),message:error.message});
      }finally{
        clearTimeout(timeout);this.inflight.delete(key);this.wake();
      }
    })();
  }
  update(camera,options,now=performance.now()){
    if(this.disposed)return null;
    // A style's screen-space tolerance must not inherit another style's wider
    // hysteresis band. Keep the current draw intact and crossfade to its choice.
    if(this.mode!==options.mode){this.previous.clear();this.mode=options.mode;}
    // Leave room for at least one complete incoming plant. Both versions can
    // coexist without exceeding the GPU allocation during their crossfade.
    const reserve=Math.max(...this.groups.map(g=>g.levels[options.quality==='draft'?0:1].count));
    const selected=selectPlantLevels(this.groups,camera,{...this.config,...options,
      maxActiveSplats:Math.max(this.config.baseCount,this.capacity-reserve),
      draftMaxActiveSplats:Math.max(this.config.baseCount,this.config.draftMaxActiveSplats-reserve)},this.previous);
    this.previous=selected.levels;this.metrics=selected.metrics;
    const desired=new Map();
    for(const group of this.groups){const level=selected.levels.get(group.id);if(level)desired.set(`${group.id}:${level}`,{group,level});}
    for(const [key,task] of this.inflight)if(!desired.has(key)){task.cancelled=true;task.controller.abort();}
    const requests=[...desired].sort((a,b)=>(selected.metrics.get(b[1].group.id)||0)-(selected.metrics.get(a[1].group.id)||0));
    for(const [key,{group,level}] of requests){
      if(this.inflight.size>=2)break;
      if(!this.cache.has(key)&&!this.inflight.has(key)&&(!this.failures.has(key)||now-this.failures.get(key).at>15000))this.request(group,level);
    }
    const ready=new Map();
    for(const [id,level] of selected.levels){
      if(this.applied.has(id))ready.set(id,this.applied.get(id));
      for(let available=level;available>0;available--)if(this.cache.has(`${id}:${available}`)){
        ready.set(id,available);this.cache.get(`${id}:${available}`).used=now;break;
      }
    }
    this.stats.loading=this.inflight.size;
    this.stats.failures=[...desired.keys()].filter(key=>this.failures.has(key)).length;
    if(this.transition){
      this.progress=Math.min(1,Math.max(0,(now-this.transition.started)/700));
      this.stats.progress=this.progress;
      if(this.progress<1){this.trim(ready);return null;}
      this.applied=this.transition.target;this.transition=null;this.queued=true;
      this.stats.transitioning=false;this.updateStats();
      return this.compose();
    }
    this.queued=false;
    const changes=this.groups.filter(g=>(ready.get(g.id)||0)!==(this.applied.get(g.id)||0));
    if(!changes.length){this.trim(ready);return null;}
    const countFor=(g,l)=>l?g.levels[l-1].count:g.count;
    changes.sort((a,b)=>{
      const da=countFor(a,ready.get(a.id)||0)-countFor(a,this.applied.get(a.id)||0);
      const db=countFor(b,ready.get(b.id)||0)-countFor(b,this.applied.get(b.id)||0);
      return Math.sign(da)-Math.sign(db)||(selected.metrics.get(b.id)||0)-(selected.metrics.get(a.id)||0);
    });
    let count=this.config.baseCount;
    for(const g of this.groups)count+=countFor(g,this.applied.get(g.id)||0)-g.count;
    // A switch from Studio may still contain its old detail while fading out.
    const batchBudget=options.quality==='draft'&&count<=this.config.draftMaxActiveSplats?this.config.draftMaxActiveSplats:this.capacity;
    const batch=new Map(),target=new Map(this.applied);
    for(const g of changes){
      const from=this.applied.get(g.id)||0,to=ready.get(g.id)||0;
      const incoming=countFor(g,to);
      if(count+incoming>batchBudget)continue;
      batch.set(g.id,{from,to,phase:(Number(g.id)*.61803398875%1)*.12});
      if(to)target.set(g.id,to);else target.delete(g.id);
      count+=incoming;
    }
    if(!batch.size){this.trim(ready);return null;}
    this.transition={batch,target,started:now};this.progress=0;
    this.stats.transitioning=true;this.stats.progress=0;this.trim(ready);
    return this.compose();
  }
  updateStats(){
    this.signature=[...this.applied].sort((a,b)=>Number(a[0])-Number(b[0])).map(([id,l])=>`${id}:${l}`).join(',');
    this.stats.refinedPlants=this.applied.size;
    this.stats.medium=[...this.applied.values()].filter(l=>l===1).length;
    this.stats.fine=[...this.applied.values()].filter(l=>l===2).length;
  }
  compose(){
    const chunks=[];let cursor=0;
    const chunk=(group,level,role=0,phase=0)=>level?
      {detail:this.cache.get(`${group.id}:${level}`),count:group.levels[level-1].count,role,phase}:
      {start:group.start,count:group.count,role,phase};
    for(const group of this.groups){
      if(group.start>cursor)chunks.push({start:cursor,count:group.start-cursor});
      const blend=this.transition?.batch.get(group.id);
      if(blend){chunks.push(chunk(group,blend.from,-1,blend.phase),chunk(group,blend.to,1,blend.phase));}
      else chunks.push(chunk(group,this.applied.get(group.id)||0));
      cursor=group.start+group.count;
    }
    if(cursor<this.definition.splats.length)chunks.push({start:cursor,count:this.definition.splats.length-cursor});
    return {chunks,count:chunks.reduce((sum,c)=>sum+c.count,0)};
  }
  /** Copy cached data into fixed GPU storage; never rebake lighting on orbit. */
  write({chunks,count},data,centers){
    const splats=[],response={count};
    for(const field of ['original','linear','bounce'])response[field]=new Float32Array(count*3);
    response.shadow=new Float32Array(count);
    let offset=0;
    for(const chunk of chunks){
      const start=chunk.start??0,source=chunk.detail?.packed??this.basePacked;
      const colors=chunk.detail?.response??this.definition.colorResponse,objects=chunk.detail?.splats??this.definition.splats;
      data.set(source.data.subarray(start*20,(start+chunk.count)*20),offset*20);
      // Lighting is already applied on the CPU. Its reserved GPU channels
      // carry stable transition metadata while the two levels coexist.
      for(let i=0;i<chunk.count;i++){data[(offset+i)*20+7]=chunk.role||0;data[(offset+i)*20+11]=chunk.phase||0;}
      centers.set(source.centers.subarray(start*3,(start+chunk.count)*3),offset*3);
      for(const field of ['original','linear','bounce'])response[field].set(colors[field].subarray(start*3,(start+chunk.count)*3),offset*3);
      response.shadow.set(colors.shadow.subarray(start,start+chunk.count),offset);
      for(let i=start;i<start+chunk.count;i++)splats.push(objects[i]);
      offset+=chunk.count;
    }
    return {splats,response};
  }
  trim(ready){
    let count=[...this.cache.values()].reduce((sum,e)=>sum+e.splats.length,0);
    const protectedKeys=new Set([...ready].map(([id,level])=>`${id}:${level}`));
    for(const key of this.signature.split(','))protectedKeys.add(key);
    if(this.transition)for(const [id,blend] of this.transition.batch){if(blend.from)protectedKeys.add(`${id}:${blend.from}`);if(blend.to)protectedKeys.add(`${id}:${blend.to}`);}
    const oldest=[...this.cache].filter(([key])=>!protectedKeys.has(key)).sort((a,b)=>a[1].used-b[1].used);
    for(const [key,entry] of oldest){if(count<=300000)break;this.cache.delete(key);count-=entry.splats.length;}
    this.stats.cachedSplats=count;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.transition=null;this.queued=false;
    for(const task of this.inflight.values())task.controller.abort();
    this.cache.clear();this.inflight.clear();
  }
}
