import {createSortScene,runSort} from './SplatSortJob.js';

// One scene at a time. A job for a scene that has since been replaced is
// answered without a result, so its buffers still travel back.
let scene=null,generation=-1;
self.onmessage=({data:message})=>{
  if(message.type==='scene'){scene=createSortScene(message);generation=message.generation;return;}
  if(message.type!=='sort')return;
  const {centers,foreground,background,shown}=message;
  const result=scene&&message.generation===generation&&centers.length===scene.count*3?runSort(scene,message):null;
  const transfer=[centers.buffer,foreground.buffer];if(background)transfer.push(background.buffer);
  self.postMessage({type:'sorted',id:message.id,generation:message.generation,ok:Boolean(result),counts:result?.counts??null,clusterShown:result?.clusterShown??null,
    shown,centers,foreground,background},transfer);
};
