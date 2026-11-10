/** The studio's scene list: the scenes that ship (scenes.js), plus any kept
 * only on this machine in scenes.local.js, which git ignores. Without that
 * file this is exactly the shipped list.
 *
 * For pages built by Vite only: `import.meta.glob` finds the optional file
 * without failing when it is absent. Node code imports scenes.js. */
import {scenes as shipped} from './scenes.js';

const found=Object.values(import.meta.glob('./scenes.local.js',{eager:true})).flatMap(module=>module.localScenes??[]);
// Their swatches, likewise optional.
import.meta.glob('./style.local.css',{eager:true});

/** Place each local scene beside the shipped scene it names with `before` or `after`; unplaced ones go last. */
export function mergeScenes(base,extra){
  const list=[...base];
  for(const {before,after,...scene} of extra){
    const anchor=list.findIndex(candidate=>candidate.id===(before??after));
    if(anchor<0)list.push(scene);else list.splice(before?anchor:anchor+1,0,scene);
  }
  return list;
}
export const scenes=mergeScenes(shipped,found);
