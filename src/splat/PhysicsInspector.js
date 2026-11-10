import {BufferGeometry,BufferAttribute,DynamicDrawUsage,LineBasicMaterial,LineSegments,Vector3} from 'three';
import {PhysicsInspection} from './physics/PhysicsInspection.js';

/** Non-modal, keyboard-accessible inspection UI and one optional debug draw. */
export class PhysicsInspector{
 constructor(engine,{getPaused,setPaused,step}={}){
  this.engine=engine;this.physics=engine.actor.physics;this.model=new PhysicsInspection(this.physics);this.getPaused=getPaused;this.setPaused=setPaused;this.stepFrame=step;
  this.panel=document.querySelector('#physics-inspector');this.toggleButton=document.querySelector('#physics-inspect-toggle');this.canvas=engine.renderer.domElement;
  this.selection=document.querySelector('#inspect-body');this.details=document.querySelector('#inspect-details');this.status=document.querySelector('#inspect-selection-status');this.metrics=document.querySelector('#inspect-metrics');this.events=document.querySelector('#inspect-events');
  this.pauseButton=document.querySelector('#inspect-pause');this.stepButton=document.querySelector('#inspect-step');this.point=new Vector3();this.direction=new Vector3();this.uiAt=-Infinity;this.optionKey='';this.rows=new Map();this.listeners=[];this.busy=false;
  const on=(target,type,fn,options)=>{target?.addEventListener(type,fn,options);this.listeners.push(()=>target?.removeEventListener(type,fn,options));};
  on(this.toggleButton,'click',()=>this.toggle());on(document.querySelector('#inspect-close'),'click',()=>this.setEnabled(false));
  on(this.pauseButton,'click',()=>{this.setPaused(!this.getPaused());this.refresh(true);});on(this.stepButton,'click',()=>this.step());
  on(document.querySelector('#inspect-previous'),'click',()=>{this.model.cycle(-1);this.changed();});on(document.querySelector('#inspect-next'),'click',()=>{this.model.cycle(1);this.changed();});
  on(this.selection,'change',()=>{
   const value=this.selection.value;
   if(value.startsWith('flex:')){
    const g=this.physics.flexibles?.groups[Number(value.slice(5))];
    if(g){const node=g.kind==='cloth'?g.start+Math.floor(g.rows/2)*g.cols+Math.floor(g.cols/2):g.start+Math.floor(g.count*.6);this.model.select({kind:'flex',indices:[node],weights:[1],label:g.label});}
   }else{const b=value===''?null:this.physics.world.bodies[Number(value)];this.model.select(b?{body:b}:null);}
   this.changed();
  });
  on(document.querySelector('#inspect-focus'),'click',()=>this.focus());on(document.querySelector('#inspect-export'),'click',()=>this.download());
  for(const input of this.panel.querySelectorAll('[data-inspect-layer]'))on(input,'change',()=>{this.model.layers[input.dataset.inspectLayer]=input.checked;this.invalidate();});
  on(this.canvas,'pointerdown',e=>{if(this.enabled&&e.button===0&&e.isPrimary!==false&&!e.altKey&&!e.ctrlKey&&!e.metaKey)this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};},true);
  on(this.canvas,'pointermove',e=>{if(this.gesture&&e.pointerId===this.gesture.id&&Math.hypot(e.clientX-this.gesture.x,e.clientY-this.gesture.y)>5)this.gesture.moved=true;},true);
  on(this.canvas,'pointerup',e=>{const g=this.gesture;this.gesture=null;if(!this.enabled||!g||g.id!==e.pointerId||g.moved)return;this.model.select(this.physics.pickInteraction(this.physics.mouse.ray(e.clientX,e.clientY)));this.changed();},true);
  on(this.canvas,'pointercancel',()=>{this.gesture=null;},true);on(window,'blur',()=>{this.gesture=null;});
  on(window,'keydown',e=>{
   if(e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
   if(e.code==='Escape'&&this.enabled){e.preventDefault();e.stopImmediatePropagation();this.setEnabled(false);return;}
   if(e.target.closest?.('input,select,textarea,[contenteditable="true"]'))return;
   if(e.code==='KeyI'){e.preventDefault();e.stopImmediatePropagation();this.toggle();}
   else if(this.enabled&&e.code==='Period'){e.preventDefault();e.stopImmediatePropagation();this.step();}
   else if(this.enabled&&(e.code==='BracketLeft'||e.code==='BracketRight')){e.preventDefault();this.model.cycle(e.code==='BracketLeft'?-1:1);this.changed();}
  },true);
  this.toggleButton.disabled=false;this.physics.inspector=this;
 }
 get enabled(){return this.model.enabled;}
 toggle(){this.setEnabled(!this.enabled);}
 invalidate(){this.engine.dirty=true;this.engine.onInvalidate?.();}
 setEnabled(value){
  if(Boolean(value)===this.enabled)return;
  this.physics.mouse?.cancel();this.physics.flexibles?.grab.end(performance.now(),false,'inspection');this.gesture=null;
  this.model.setEnabled(value);this.panel.hidden=!this.enabled;this.toggleButton.setAttribute('aria-pressed',String(this.enabled));
  this.canvas.style.cursor=this.enabled?'crosshair':'';
  if(this.enabled){
   if(!this.lines){const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(this.model.positions,3).setUsage(DynamicDrawUsage));g.setAttribute('color',new BufferAttribute(this.model.colors,3).setUsage(DynamicDrawUsage));
    const material=new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.88,depthTest:false,depthWrite:false,toneMapped:false});this.lines=new LineSegments(g,material);this.lines.frustumCulled=false;this.lines.renderOrder=100;this.engine.scene.add(this.lines);
   }
   this.lines.visible=true;this.panel.scrollTop=0;const controls=document.querySelector('#physics-controls');this.controlsWereOpen=controls.open;controls.open=false;
   this.panel.querySelector('h2').focus({preventScroll:true});const selection=this.model.describe();this.status.textContent=selection?`${selection.label} selected. Click another object or use [ and ].`:'Click a body or flexible surface. Drag to orbit; [ and ] select bodies.';
  }else{
   if(this.lines)this.lines.visible=false;document.querySelector('#physics-controls').open=this.controlsWereOpen;
   (this.toggleButton.getClientRects().length?this.toggleButton:this.canvas).focus({preventScroll:true});this.physics.mouse?.feedback(null);
  }
  this.refresh(true);this.invalidate();
 }
 changed(){
  const s=this.model.describe();this.status.textContent=s?`${s.label}${s.id!==undefined?' · body '+s.id:''} selected.`:'No selection. Click a body or choose one from the list.';
  this.refresh(true);this.invalidate();
 }
 async step(){
  if(this.busy||!this.enabled)return;this.busy=true;this.stepButton.disabled=true;this.setPaused(true);
  try{await this.stepFrame();this.refresh(true);}catch(error){this.status.textContent=`Step failed: ${error.message}`;}
  finally{this.busy=false;this.stepButton.disabled=false;this.invalidate();}
 }
 focus(){
  const p=this.model.focus(this.point);if(!p)return;
  const body=this.model.selected?.kind==='body'?this.physics.world.bodies[this.model.selected.id]:null;
  this.direction.subVectors(this.engine.camera.position,this.engine.controls.target).normalize().multiplyScalar(Math.max(4,(body?.radius??1)*4)*Math.max(1,1/this.engine.camera.aspect));
  this.engine.controls.target.copy(p);this.engine.camera.position.copy(p).add(this.direction);this.engine.controls.update();this.invalidate();
 }
 captureTick(){this.model.captureTick();}
 update(){
  if(!this.enabled)return;this.model.build();
  const g=this.lines.geometry;g.setDrawRange(0,this.model.count*2);
  for(const name of ['position','color']){const a=g.getAttribute(name);a.clearUpdateRanges();a.addUpdateRange(0,this.model.count*6);a.needsUpdate=true;}
  this.refresh();
 }
 refresh(force=false){
  if(!this.enabled)return;const now=performance.now();if(!force&&now-this.uiAt<120)return;this.uiAt=now;
  const p=this.physics,w=p.world,bodyList=w.bodies.filter(b=>b.enabled||b.id===this.model.selected?.id),key=bodyList.map(b=>`${b.id}:${b.enabled}:${b.type}`).join(',');
  if(key!==this.optionKey){
    this.optionKey=key;this.selection.replaceChildren(new Option('Choose a body or rig',''));
   for(const b of bodyList)this.selection.add(new Option(`${b.id} · ${this.model.label(b)} · ${!b.enabled?'disabled':b.type}`,String(b.id)));
    if(p.flexibles)for(const g of p.flexibles.groups)this.selection.add(new Option(`Rig ${g.id} · ${g.label}`,`flex:${g.id}`));
  }
  this.selection.value=this.model.selected?.kind==='body'?String(this.model.selected.id):this.model.selected?.kind==='flex'?`flex:${p.flexibles.solver.group[this.model.selected.nodes[0]]}`:'';
  const s=this.model.describe(),fields=s?Object.entries(s).filter(([k])=>!['label','damage'].includes(k)):[];
  if(s?.damage){fields.push(['damage',s.damage.damage.map(v=>Math.round(v*100)+'%').join(' / ')],['detached cells',s.damage.detached],['broken bonds',s.damage.brokenBonds]);}
  const fieldsKey=fields.map(([k])=>k).join('|');
  if(fieldsKey!==this.fieldsKey){this.fieldsKey=fieldsKey;this.details.replaceChildren();this.rows.clear();for(const [k]of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k.replace(/([A-Z])/g,' $1').toLowerCase();this.details.append(dt,dd);this.rows.set(k,dd);}}
  for(const [k,value]of fields){const text=Array.isArray(value)?value.map(x=>typeof x==='number'?(k==='nodes'?String(x):x.toFixed(2)):x).join(', '):typeof value==='number'?Number.isInteger(value)?String(value):value.toFixed(3):String(value);const dd=this.rows.get(k);if(dd.textContent!==text)dd.textContent=text;}
  this.pauseButton.textContent=this.getPaused()?'Resume':'Pause';
  this.metrics.textContent=`Tick ${w.stats.ticks} · ${(w.fixedDt*1000).toFixed(2)} ms/tick\n${w.stats.active} active / ${p.activeDebrisBudget} budget · ${w.stats.sleeping} sleeping\n${w.stats.contacts} contacts · ${w.stats.candidates} candidates\n${this.model.contacts.length}/${this.model.maxContacts} contact records · ${this.model.droppedContacts} omitted this tick\nCCD: ${w.stats.ccdBodies} active · ${w.stats.ccdTests} tests · ${w.stats.ccdBudgetHits} cap hits\n${this.model.count.toLocaleString()} / ${this.model.maxSegments.toLocaleString()} overlay segments${this.model.capped?' · overlay capped':''}\n${(p.lastFrameMs??0).toFixed(2)} ms physics · ${p.splats.length.toLocaleString()} physics/effect slots`;
  const particles=p.particles.snapshot(),sand=p.sand,water=p.water,flex=p.flexibles?.solver,materials=p.materials?.snapshot(),surfaceSnow=p.surfaceSnow?.snapshot();
  document.querySelector('#inspect-subsystems').textContent=`${this.engine.stats.count.toLocaleString()} scene splats\n${particles.active}/${particles.capacity} active particles · ${particles.recycled} recycled${sand?`\n${sand.visible}/${sand.records.length} recent impressions\n${sand.atlas.occupied.toLocaleString()}/${(sand.atlas.size**2).toLocaleString()} persistent paint texels`:''}${water?`\n${water.n**2} water cells · ${water.snapshot().peakWave.toFixed(3)} m peak wave`:''}${materials?`\n${materials.resolution.join(' × ')} material cells · ${materials.cellsPerTick}/tick\n${materials.peakDepth.toFixed(3)} m peak deposit · ${materials.textureBytes.toLocaleString()} texture bytes`:''}${surfaceSnow?`\nSnow: ${surfaceSnow.loadedRocks} loaded rocks · ${surfaceSnow.clothVolume.toFixed(3)} m³ on cloth\n${surfaceSnow.airborne.toFixed(3)} m³ falling · ${surfaceSnow.landed.toFixed(3)} m³ settled`:''}${flex?`\n${flex.count} flexible nodes · ${flex.distances-flex.stats.cutConstraints} intact links`:''}`;
  const eventText=this.model.events.slice(0,5).map(e=>`Tick ${e.tick} · body ${e.body} · ${e.energy.toFixed(1)} impact energy`).join('\n');this.events.textContent=eventText||'No recorded impacts. Drop a rock or trigger an explosion while inspection is on.';
  document.querySelector('#inspect-focus').disabled=!s;
 }
 download(){
  const url=URL.createObjectURL(new Blob([JSON.stringify(this.model.export(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`physics-inspection-tick-${this.physics.world.stats.ticks}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 snapshot(){return this.model.snapshot();}
 dispose(){
  for(const off of this.listeners)off();this.panel.hidden=true;this.toggleButton.setAttribute('aria-pressed','false');this.model.dispose();
  if(this.lines){this.engine.scene.remove(this.lines);this.lines.geometry.dispose();this.lines.material.dispose();}
  if(this.physics.inspector===this)this.physics.inspector=null;this.canvas.style.cursor='';
 }
}
