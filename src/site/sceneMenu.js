import './sceneMenu.css';
import {SITE_SCENES} from './siteScenes.js';

// Packaged demos only link to scenes included in that deployment.
const scenes=SITE_SCENES.filter(scene=>!import.meta.env.SILLAGE_SCENE_PATHS||import.meta.env.SILLAGE_SCENE_PATHS.includes(scene.path));
const currentPath=location.pathname.replace(/\/index\.html$/,'').replace(/\/+$/,'')||'/';
const trigger=document.createElement('button');
trigger.className='sillage-menu-trigger';trigger.type='button';trigger.textContent='Menu';
trigger.setAttribute('aria-label','Open scene menu');trigger.setAttribute('aria-haspopup','dialog');
trigger.setAttribute('aria-controls','sillage-menu');trigger.setAttribute('aria-expanded','false');
const dialog=document.createElement('dialog');
dialog.id='sillage-menu';dialog.className='sillage-menu';dialog.setAttribute('aria-labelledby','sillage-menu-title');
dialog.innerHTML=`<div class="sillage-menu-content">
  <header class="sillage-menu-header">
    <h2 id="sillage-menu-title">Sillage engine</h2>
    <button type="button" class="sillage-menu-close" autofocus aria-label="Close scene menu">Close <kbd>Esc</kbd></button>
  </header>
  <nav aria-label="Scenes">${scenes.map(scene=>`<a href="${scene.path}"${scene.path===currentPath?' aria-current="page"':''}>
    <span>${scene.label}</span>${scene.path===currentPath?'<span class="sillage-menu-current">Now viewing</span>':''}</a>`).join('')}
  </nav>
  <p class="sillage-menu-footer">Choose a scene to explore.</p>
</div>`;
document.body.append(trigger,dialog);
const closeButton=dialog.querySelector('.sillage-menu-close');
const links=[...dialog.querySelectorAll('nav a')];
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
const pressed=new Set();
let previousFocus;

function openMenu(){
  if(dialog.open)return;
  // Release scene controls before the modal starts intercepting keyboard input.
  for(const code of pressed)window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
  pressed.clear();previousFocus=document.activeElement;
  dialog.showModal();closeButton.focus({preventScroll:true});trigger.setAttribute('aria-expanded','true');
}
function closeMenu(){if(dialog.open)dialog.close();}
trigger.addEventListener('click',openMenu);closeButton.addEventListener('click',closeMenu);
dialog.addEventListener('close',()=>{
  // A queued close event must not steal focus from a menu already reopened.
  if(dialog.open)return;
  trigger.setAttribute('aria-expanded','false');
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeMenu();});
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const box=dialog.getBoundingClientRect();
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeMenu();
});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.repeat){
    event.preventDefault();event.stopImmediatePropagation();
    dialog.open?closeMenu():openMenu();return;
  }
  if(dialog.open){
    event.stopImmediatePropagation();
    if(event.key==='Tab'){
      event.preventDefault();
      const controls=[closeButton,...links],index=controls.indexOf(document.activeElement);
      controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();
      return;
    }
    const index=links.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?links.length-1
        :event.key==='ArrowDown'?(index+1)%links.length:(index<=0?links.length:index)-1;
      links[next].focus();
    }
  }else if(movementKeys.has(event.code))pressed.add(event.code);
},true);
window.addEventListener('keyup',event=>{
  pressed.delete(event.code);
  if(dialog.open)event.stopImmediatePropagation();
},true);
window.addEventListener('blur',()=>pressed.clear());
