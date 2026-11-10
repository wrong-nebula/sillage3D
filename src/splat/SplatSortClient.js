/** The main thread's side of SplatSortWorker.js: one job in flight at a time.
 *
 * The mark centers are copied into a buffer that travels to the worker and
 * back with each job, as do the lists it fills, so a job allocates nothing
 * and the worker always orders the centers as they are now, whatever moved
 * them. */
export class SplatSortClient {
  constructor(onResult,onError){
    this.worker=new Worker(new URL('./SplatSortWorker.js',import.meta.url),{type:'module'});
    this.busy=false;this.failed=false;this.generation=0;this.signature=null;this.buffers=null;this.sent=0;
    this.worker.onmessage=({data})=>{
      if(data.type!=='sorted')return;
      this.busy=false;
      // Buffers of a replaced scene are the wrong size; let them go.
      this.buffers=data.generation===this.generation?{centers:data.centers,foreground:data.foreground,background:data.background}:null;
      onResult(data);
    };
    this.worker.onerror=event=>{this.failed=true;this.busy=false;event.preventDefault?.();onError?.(event);};
  }
  static supported(){return typeof Worker==='function';}
  /** Sends the scene's tables when any entry of `signature` has changed.
   * `build` returns them: {count, actorStart, sigma, wind, flags, clusters}. */
  setScene(signature,build){
    const old=this.signature;
    if(old&&old.length===signature.length&&signature.every((value,index)=>value===old[index]))return;
    this.signature=signature;this.generation++;this.buffers=null;
    this.worker.postMessage({type:'scene',generation:this.generation,...build()});
  }
  /** Starts a job and returns its id, or 0 while another is in flight.
   * `job.centers` is copied; the lists are sized by the two capacities. */
  request({centers,foregroundCapacity,backgroundCapacity=0,...job}){
    if(this.busy||this.failed)return 0;
    let buffers=this.buffers;this.buffers=null;
    if(!buffers||buffers.centers.length!==centers.length||buffers.foreground.length!==foregroundCapacity||(buffers.background?.length??0)!==backgroundCapacity){
      buffers={centers:new Float32Array(centers.length),foreground:new Float32Array(foregroundCapacity),background:backgroundCapacity?new Float32Array(backgroundCapacity):null};
    }
    buffers.centers.set(centers);
    const transfer=[buffers.centers.buffer,buffers.foreground.buffer];if(buffers.background)transfer.push(buffers.background.buffer);
    this.busy=true;
    this.worker.postMessage({type:'sort',id:++this.sent,generation:this.generation,...job,...buffers},transfer);
    return this.sent;
  }
  dispose(){this.worker.terminate();this.busy=false;this.buffers=null;}
}
