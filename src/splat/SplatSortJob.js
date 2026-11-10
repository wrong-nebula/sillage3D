import {depthOrder} from './math.js';
import {SplatVisibility} from './SplatVisibility.js';
import {selectMarkClusters} from './MarkClusters.js';

/** The list of marks to draw for a view, built away from the main thread.
 *
 * A frame is prepared on the main thread only once the GPU has finished the
 * previous one, so the time spent ordering and culling marks adds to every
 * frame of a camera move. This module is that work as a plain function, so a
 * worker can run it while the GPU draws: the depth order of every mark, the
 * frustum test, and the choice between merged stand-ins and their members.
 * It calls the same code as the main thread and returns the same list.
 *
 * The result reaches the renderer a frame or so after the view it was asked
 * for. Two things keep that from showing. The frustum is widened by `slack`,
 * so marks about to swing into view are already in the list. And the worker
 * is used only while the view is being dragged or orbited: the first frame at
 * rest is built on the main thread exactly as before, so a still view, an
 * export and every programmatic camera change are untouched.
 */
export const SORT_WORKER_DEFAULTS=Object.freeze({sortWorker:true});
/** Smaller scenes order and cull in a millisecond or two; not worth a frame of lag. */
export const SORT_WORKER_MIN_SPLATS=60_000;
/** Extra frustum on each side, as a share of the half field of view. */
export const SORT_WORKER_SLACK=.2;
/** The view counts as dragged for this long after the last pointer or wheel event, in ms. */
export const SORT_WORKER_LINGER=250;

/** The packed rows of a cluster table's stand-ins, in group order: all the
 * selection reads of the splat texture once the groups at rest are known. */
export function standInRows(clusters,data){
  const rows=new Float32Array(clusters.merged.length*20);
  clusters.merged.forEach((index,c)=>rows.set(data.subarray(index*20,index*20+20),c*20));
  return rows;
}

/** The tables of a scene that do not change from frame to frame. `sigma` is
 * the largest axis length per mark, `wind` the per-mark wind texture (or
 * null), `flags` marks the background batch, `clusters` is the stand-in table
 * with its `standIns` rows (or null). */
export function createSortScene({count,actorStart=Infinity,sigma,wind=null,flags=null,clusters=null}){
  return {count,actorStart,wind,flags,clusters,visibility:SplatVisibility.fromSigma(sigma,count),order:new Uint32Array(count),hidden:clusters?new Uint8Array(count):null};
}

/** Orders and culls `job.centers` for `job.view` and writes the marks to
 * draw, back to front, into `job.foreground` (and `job.background`).
 * `job.shown` carries the stand-in choice of the previous view and is
 * updated in place. Returns the counts. */
export function runSort(scene,job){
  const {centers,view,projection,width,height,foreground,background=null}=job;
  depthOrder(centers,view,scene.order);
  const camera={matrixWorldInverse:{elements:view},projectionMatrix:{elements:projection},near:job.near,far:job.far,updateMatrixWorld(){}};
  const counts=scene.visibility.write(scene.order,centers,camera,job.options,foreground,background,scene.flags,
    {width,height,wind:scene.wind,actorStart:scene.actorStart,transition:Boolean(job.transition),opticalPixels:job.opticalPixels??0,reach:job.reach??1,slack:job.slack??0});
  let clusterShown=null;
  if(scene.clusters){
    const hidden=scene.hidden;
    clusterShown=selectMarkClusters(scene.clusters,job.shown,hidden,null,
      {view,projection,width,height,footprint:job.footprint??1,enabled:job.clusterEnabled!==false,still:job.still,verify:false,standIns:scene.clusters.standIns});
    let kept=0;
    for(let i=0;i<counts.foreground;i++){const index=foreground[i];if(!hidden[index])foreground[kept++]=index;}
    counts.submitted-=counts.foreground-kept;counts.foreground=kept;
  }
  return {counts,clusterShown};
}
