import {srgbToLinear,linearToSrgb} from './irradiance.js';

const Y=[.2126,.7152,.0722],EPS=1e-8;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const luminance=c=>c[0]*Y[0]+c[1]*Y[1]+c[2]*Y[2];
export const COLOR_DEFAULTS=Object.freeze({tonePreservation:.8,tintedShadows:true,shadowTint:'#66759b',shadowTintStrength:.35});

export function tintToLinear(hex){
  if(!/^#[\da-f]{6}$/i.test(hex))throw new Error('Shadow tint must be a six-digit hex color.');
  return [1,3,5].map(i=>Math.max(.0001,srgbToLinear(parseInt(hex.slice(i,i+2),16)/255)));
}

/** Reduce opposing tint only where a visible colored bounce is present.
 * The weighted chroma vectors remove luminance, so exposure cannot change hue
 * opposition. A gentle shoulder makes low-energy but visible bounce count;
 * protection is capped at 65%, retaining some shadow color even at full opposition.
 */
export function shadowTintAttenuation(base,bounce,tint){
  const baseY=luminance(base),bounceY=luminance(bounce),tintY=luminance(tint);
  if(bounceY<EPS||tintY<EPS)return 1;
  let dot=0,bounceNorm=0,tintNorm=0;
  for(let c=0;c<3;c++){
    const b=bounce[c]-bounceY,t=tint[c]-tintY;
    dot+=Y[c]*b*t;bounceNorm+=Y[c]*b*b;tintNorm+=Y[c]*t*t;
  }
  const bc=Math.sqrt(bounceNorm),tc=Math.sqrt(tintNorm);
  if(bc<1e-4*bounceY||tc<1e-4*tintY||dot>=0)return 1;
  const opposition=clamp(-dot/(bc*tc));
  const colorConfidence=clamp(bc/(bounceY*.25))*clamp(tc/(tintY*.25));
  const presence=bounceY/(bounceY+.12*baseY+.002);
  return 1-.65*Math.sqrt(opposition)*presence*colorConfidence;
}

/** Linear-light response anchored to the original painted values.
 * Bounce chroma is kept separate from its energy: a rational shoulder limits
 * the brightness lift to 10% + .002 linear units, with highlight headroom.
 * Shadow tint changes chroma at the existing luminance, never adds exposure.
 */
export function respondLinear(base,bounce,shadow,{tonePreservation=COLOR_DEFAULTS.tonePreservation,tintedShadows=true,shadowTintStrength=.35}={},tint=tintToLinear(COLOR_DEFAULTS.shadowTint),out=[0,0,0]){
  const baseY=luminance(base),bounceY=luminance(bounce),preserve=clamp(tonePreservation);
  const budget=.10*baseY+.002;
  const lift=Math.min(budget*bounceY/(budget+bounceY+EPS),Math.max(0,1-baseY)*.6);
  const chromaNormalization=baseY/Math.max(EPS,baseY+bounceY);
  const luminanceGain=(baseY+lift)/Math.max(baseY,EPS);
  for(let c=0;c<3;c++){
    const additive=base[c]+bounce[c];
    const preserved=(base[c]*.35+additive*chromaNormalization*.65)*luminanceGain;
    out[c]=additive*(1-preserve)+preserved*preserve;
  }
  let currentY=luminance(out);
  const amount=tintedShadows?clamp(shadow)*clamp(shadowTintStrength)*shadowTintAttenuation(base,bounce,tint):0;
  if(amount>0&&currentY>EPS){
    const tintedY=out[0]*tint[0]*Y[0]+out[1]*tint[1]*Y[1]+out[2]*tint[2]*Y[2];
    const normalize=currentY/Math.max(tintedY,EPS);
    for(let c=0;c<3;c++)out[c]*=1-amount+amount*tint[c]*normalize;
  }
  // Compress chroma toward neutral luminance to fit the display gamut. No
  // independent channel clipping, which would shift green/yellow highlights.
  currentY=luminance(out);
  if(currentY>=1){out[0]=out[1]=out[2]=1;return out;}
  let gamutScale=1;
  for(let c=0;c<3;c++){
    const delta=out[c]-currentY;
    if(delta>EPS)gamutScale=Math.min(gamutScale,(1-currentY)/delta);
    if(delta<-EPS)gamutScale=Math.min(gamutScale,-currentY/delta);
  }
  for(let c=0;c<3;c++)out[c]=clamp(currentY+(out[c]-currentY)*gamutScale);
  return out;
}

/** Immutable authoring colors are retained; only the packed GPU colors change. */
export function prepareColorResponse(splats,lighting){
  const count=splats.length,original=new Float32Array(count*3),linear=new Float32Array(count*3),bounce=new Float32Array(count*3);
  for(let i=0;i<count;i++)for(let c=0;c<3;c++){
    const index=i*3+c,color=splats[i].color[c];
    original[index]=color;linear[index]=srgbToLinear(color);
    bounce[index]=Math.sqrt(linear[index])*lighting.irradiance[index]*1.5;
  }
  return {original,linear,bounce,shadow:lighting.shadow||new Float32Array(count),count};
}

/** Uniform control changes update pigment texels once; orbit has no color pass. */
export function applyColorResponse(prepared,options,packed){
  const strength=options.indirect?Math.max(0,options.bounceStrength??1):0;
  const tint=tintToLinear(options.shadowTint??COLOR_DEFAULTS.shadowTint);
  const base=[0,0,0],bounce=[0,0,0],result=[0,0,0];
  for(let i=0;i<prepared.count;i++){
    const index=i*3,destination=i*20+16;
    const hasBounce=strength>0&&(prepared.bounce[index]+prepared.bounce[index+1]+prepared.bounce[index+2])>0;
    const hasTint=options.tintedShadows&&options.shadowTintStrength>0&&prepared.shadow[i]>0;
    if(!hasBounce&&!hasTint){packed.set(prepared.original.subarray(index,index+3),destination);continue;}
    for(let c=0;c<3;c++){base[c]=prepared.linear[index+c];bounce[c]=prepared.bounce[index+c]*strength;}
    respondLinear(base,bounce,prepared.shadow[i],options,tint,result);
    for(let c=0;c<3;c++)packed[destination+c]=linearToSrgb(result[c]);
  }
}
