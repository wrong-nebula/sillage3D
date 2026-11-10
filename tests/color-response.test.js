import test from 'node:test';
import assert from 'node:assert/strict';
import {COLOR_DEFAULTS,respondLinear,shadowTintAttenuation,tintToLinear,prepareColorResponse,applyColorResponse} from '../src/splat/colorResponse.js';
import {packSplats} from '../src/splat/math.js';
const Y=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);

test('bright grass bounce has a bounded luminance lift and retains its hue',()=>{
 const base=[.18,.42,.08],y=Y(base);
 let previous=y;
 for(const scale of [0,.1,.5,1,5,100]){
  const out=respondLinear(base,base.map(v=>v*scale),0,{tonePreservation:1,tintedShadows:false});
  assert.ok(Y(out)<=y*1.10+.002+1e-7);
  assert.ok(Y(out)>=previous-1e-7);previous=Y(out);
  close(out[0]/out[1],base[0]/base[1]);close(out[2]/out[1],base[2]/base[1]);
 }
});

test('neutral stone still receives green color without the previous additive exposure',()=>{
 const base=[.3,.3,.3],bounce=[.035,.12,.018];
 const out=respondLinear(base,bounce,0,{tonePreservation:1,tintedShadows:false});
 assert.ok(out[1]>out[0]&&out[1]>out[2]);
 assert.ok(Y(out)<Y(base)+Y(bounce)*.35);
});

test('shadow tint preserves luminance, leaves lit areas alone, and neutral tint is neutral',()=>{
 const base=[.12,.23,.065],tint=tintToLinear('#66759b');
 const options={tonePreservation:1,tintedShadows:true,shadowTintStrength:.8};
 const lit=respondLinear(base,[0,0,0],0,options,tint);
 const shaded=respondLinear(base,[0,0,0],1,options,tint);
 base.forEach((v,i)=>close(lit[i],v));close(Y(shaded),Y(base));
 assert.ok(shaded[2]/shaded[1]>base[2]/base[1]);
 const neutral=respondLinear(base,[0,0,0],1,options,tintToLinear('#ffffff'));
 base.forEach((v,i)=>close(neutral[i],v));
});

test('strong tint and highlights stay finite and in gamut without channel clipping',()=>{
 for(const color of [[.95,.95,.95],[0,.9,.01],[.9,.01,0],[0,0,0]])for(const hex of ['#0000ff','#ff0000','#000000','#ffffff']){
  const out=respondLinear(color,[.3,2,.1],1,{tonePreservation:1,tintedShadows:true,shadowTintStrength:1},tintToLinear(hex));
  assert.ok(out.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
});

test('disabling bounce and tint restores original GPU pigment without changing geometry or source data',()=>{
 const splats=[{center:[1,2,3],axes:[[1,0,0],[0,.2,0],[0,0,.1]],color:[.4,.7,.2],seed:.37,opacity:.9}];
 const before=JSON.stringify(splats),lighting={irradiance:new Float32Array([.1,.2,.04]),shadow:new Float32Array([.8])};
 const prepared=prepareColorResponse(splats,lighting),packed=packSplats(splats).data,original=packed.slice();
 const options={...COLOR_DEFAULTS,indirect:true,bounceStrength:1};
 applyColorResponse(prepared,options,packed);
 assert.notDeepEqual(packed.slice(16,19),original.slice(16,19));
 for(let i=0;i<20;i++)if(i<16||i>18)assert.equal(packed[i],original[i]);
 applyColorResponse(prepared,{...options,indirect:false,tintedShadows:false},packed);
 assert.deepEqual(packed,original);assert.equal(JSON.stringify(splats),before);
});

test('complementary shadow tint weakens locally and increases protection with bounce',()=>{
 const base=[.3,.3,.3],bounce=[.05,.09,.025],purple=tintToLinear('#8060a0');
 const weak=shadowTintAttenuation(base,bounce.map(v=>v*.1),purple);
 const strong=shadowTintAttenuation(base,bounce,purple);
 assert.ok(strong<weak&&weak<1);
 assert.ok(strong>=.35&&strong<.8);
 assert.ok(shadowTintAttenuation(base,bounce,tintToLinear('#66759b'))<.85);
});

test('neutral, absent, and matching bounce colors leave the shadow tint alone',()=>{
 const base=[.3,.3,.3],bounce=[.05,.09,.025],purple=tintToLinear('#8060a0');
 assert.equal(shadowTintAttenuation(base,[0,0,0],purple),1);
 assert.equal(shadowTintAttenuation(base,[.1,.1,.1],purple),1);
 assert.equal(shadowTintAttenuation(base,bounce,[.2,.2,.2]),1);
 assert.equal(shadowTintAttenuation(base,bounce,bounce),1);
});

test('protecting reflected green retains more green than the unattenuated tint at equal luminance',()=>{
 const base=[.3,.3,.3],bounce=[.05,.09,.025],tint=tintToLinear('#66759b');
 const options={...COLOR_DEFAULTS,shadowTintStrength:.35};
 const lit=respondLinear(base,bounce,0,options,tint),protectedColor=respondLinear(base,bounce,1,options,tint);
 const filtered=lit.map((v,i)=>v*tint[i]),normalize=Y(lit)/Y(filtered);
 const unprotected=lit.map((v,i)=>v*.65+filtered[i]*normalize*.35);
 const green=c=>c[1]-(c[0]+c[2])*.5;
 assert.ok(green(protectedColor)>green(unprotected)+.005);
 close(Y(protectedColor),Y(lit));
});
