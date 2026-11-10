/** StopThePop-inspired tile-center ordering + per-pixel maximum-contribution
 * depths. A 16-entry queue is the fast path. A detected late inversion reruns
 * that pixel with exact selection sorting: no overflow truncation, stale order
 * or missing layers. This is not the paper's CUDA 4x4/2x2 hierarchy. */
export const stopThePopShader=`
struct Splat { center:vec4f, conic:vec4f, color:vec4f }
struct RayData { a:vec4f, b:vec4f, c:vec4f }
struct Surface { normal:vec4f, response:vec4f }
struct Settings { size:vec4u, background:vec4f, ray:vec4f, light:vec4f, controls:vec4u }
struct Hit { depth:f32, id:u32, alpha:f32 }
@group(0) @binding(0) var<storage,read> splats:array<Splat>;
@group(0) @binding(1) var<storage,read> offsets:array<u32>;
@group(0) @binding(2) var<storage,read> indices:array<u32>;
@group(0) @binding(3) var<uniform> settings:Settings;
@group(0) @binding(4) var output:texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(5) var<storage,read> rays:array<RayData>;
@group(0) @binding(6) var<storage,read> surfaces:array<Surface>;
@group(0) @binding(7) var<storage,read_write> diagnostics:array<atomic<u32>>;
var<workgroup> batch:array<Splat,64>;
var<workgroup> batchIds:array<u32,64>;
var<workgroup> first:u32;
var<workgroup> last:u32;
var<private> queue:array<Hit,16>;
var<private> queued:u32;
var<private> color:vec3f;
var<private> transmittance:f32;
var<private> previous:Hit;
var<private> inversion:bool;
var<private> direction:vec3f;
fn before(a:Hit,b:Hit)->bool{return a.depth<b.depth||(a.depth==b.depth&&a.id>b.id);}
fn depth(id:u32)->f32{
  let q=rays[id];let r=vec3f(dot(q.a.xyz,direction),dot(q.b.xyz,direction),dot(q.c.xyz,direction));
  return max(0.,dot(r,vec3f(q.a.w,q.b.w,q.c.w))/max(dot(r,r),1e-30));
}
fn pigment(id:u32)->vec3f{
  let base=splats[id].color.rgb;
  if(settings.controls.y==0u){return base;}
  let s=surfaces[id];if(s.response.y<=0.){return base;}
  let v=normalize(-direction);let l=normalize(settings.light.xyz);
  var normal=normalize(s.normal.xyz);if(dot(normal,v)<0.){normal=-normal;}
  let sum=v+l;let h=sum/max(length(sum),1e-12);
  let rough=s.normal.w;let power=clamp(2./(rough*rough)-2.,2.,2048.);
  let highlight=s.response.y*(1.-rough)*(1.-rough)*max(0.,dot(normal,l))*pow(max(0.,dot(normal,h)),power)*settings.light.w;
  let tint=mix(vec3f(.04),vec3f(.35)+.65*base,s.response.x);
  return clamp(base+(vec3f(1.)-base)*tint*highlight,vec3f(0.),vec3f(1.));
}
fn emit(hit:Hit){
  if(before(hit,previous)){inversion=true;}
  // After convergence only a hit before the last visible contributor can
  // affect the image. Farther inversions need no expensive exact fallback.
  if(transmittance>settings.background.w){previous=hit;color+=transmittance*hit.alpha*pigment(hit.id);transmittance*=1.-hit.alpha;}
}
fn insert(hit:Hit){
  // Merge the incoming hit with the queue before emitting its nearest entry.
  // This also handles a single very near Gaussian arriving after a full queue.
  if(queued==16u){
    if(before(hit,queue[0])){emit(hit);return;}
    emit(queue[0]);for(var i=1u;i<16u;i++){queue[i-1u]=queue[i];}queued=15u;
  }
  var position=queued;
  while(position>0u){if(!before(hit,queue[position-1u])){break;}queue[position]=queue[position-1u];position--;}
  queue[position]=hit;queued++;
}
fn alphaAt(s:Splat,point:vec2f)->f32{
  let d=point-s.center.xy;let r2=s.conic.x*d.x*d.x+2.*s.conic.y*d.x*d.y+s.conic.z*d.y*d.y;
  if(r2>9.){return 0.;}let alpha=min(.995,s.center.z*exp(-.5*r2));return select(0.,alpha,alpha>=.004);
}
@compute @workgroup_size(4,4)
fn main(@builtin(global_invocation_id) pixel:vec3u,@builtin(workgroup_id) tile:vec3u,@builtin(local_invocation_index) lane:u32){
  let inside=pixel.x<settings.size.x&&pixel.y<settings.size.y;
  if(lane==0u){let stride=select(4u,1u,settings.controls.x!=0u);let t=(tile.y/stride)*settings.size.z+tile.x/stride;first=offsets[t];last=offsets[t+1u];}
  let begin=workgroupUniformLoad(&first);let end=workgroupUniformLoad(&last);
  let point=vec2f(f32(pixel.x)+.5,f32(settings.size.y)-f32(pixel.y)-.5);
  direction=vec3f((point-settings.ray.xy)/settings.ray.zw,-1.);
  color=vec3f(0.);transmittance=1.;queued=0u;inversion=false;previous=Hit(-1.,0u,0.);
  for(var base=begin;base<end;base+=64u){
    let n=min(64u,end-base);
    for(var i=lane;i<n;i+=16u){let id=indices[base+i];batch[i]=splats[id];batchIds[i]=id;}
    workgroupBarrier();
    if(inside){for(var j=0u;j<n;j++){
      let alpha=alphaAt(batch[j],point);if(alpha==0.){continue;}
      let id=batchIds[j];
      if(settings.controls.x==0u){emit(Hit(f32(base+j),id,alpha));}
      else{insert(Hit(depth(id),id,alpha));}
    }}
    // All candidates are checked even after opacity convergence. Otherwise a
    // late foreground hit could hide behind premature early termination.
    workgroupBarrier();
  }
  if(inside){
    for(var j=0u;j<queued;j++){emit(queue[j]);}
    if(inversion&&settings.controls.x!=0u){
      atomicAdd(&diagnostics[0],1u);color=vec3f(0.);transmittance=1.;previous=Hit(-1.,0u,0.);
      // Rare pathological tile/order: exact full-list selection, bounded by
      // its candidate count. All contributors remain available for this pass.
      for(var step=begin;step<end;step++){
        var nearest=Hit(3.402823e38,0u,0.);
        for(var i=begin;i<end;i++){
          let id=indices[i];let alpha=alphaAt(splats[id],point);if(alpha==0.){continue;}
          let hit=Hit(depth(id),id,alpha);
          if(before(previous,hit)&&before(hit,nearest)){nearest=hit;}
        }
        if(nearest.alpha==0.){break;}emit(nearest);
        if(transmittance<=settings.background.w){break;}
      }
    }
    textureStore(output,pixel.xy,vec4f(color+transmittance*settings.background.rgb,1.));
  }
}`;
