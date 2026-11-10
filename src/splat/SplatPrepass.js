import * as THREE from 'three';

/** Per-mark vertex work done once instead of once per quad corner.
 *
 * Every mark is drawn as a quad, so its vertex shader runs four times, and
 * nearly all of that work (wind, seasons, projection, covariance, fog, light)
 * gives the same result at each corner. On the GPUs measured, leaving that
 * work early for some corners saves almost nothing, so it is moved out:
 *
 *   1. a pre-pass runs the splat shader's own main once per submitted mark,
 *      as points with rasterization off, and records with transform feedback
 *      every value the fragment shader is handed, plus the clip position and
 *      the 2x2 screen transform;
 *   2. the quads are then drawn with a thin vertex shader that reads those
 *      values as per-instance attributes and only places the corner.
 *
 * Both shaders are derived from the text of the ordinary vertex shader, so
 * every scene variant and style keeps a single source. The derivation checks
 * that the corner enters only through the statements it knows; when it cannot
 * show that (refracted water, an unknown rewrite), it declines and the mark
 * is drawn by the ordinary shader. Fragment shader, blending, order and
 * uniforms are untouched.
 *
 * Two other forms of the pre-pass were measured on an Apple M1 and cost
 * several times what the thin shader saves: one point per mark rasterized
 * into float color targets, and transform feedback over instanced points.
 * Plain points, one vertex per mark, are the form that pays.
 *
 * Even so the recording costs about as much per mark as a light vertex
 * shader saves, so this is a scene opt-in (`vertexPrepass: true` in the scene
 * entry) for scenes whose shader is heavy. The cliff's seasons are; the
 * terrain studies and the meadow measured slightly slower with it.
 *
 * three.js has no transform feedback, so two calls of the WebGL context are
 * wrapped: linking declares the recorded outputs for the pre-pass program,
 * and the pre-pass draw is bracketed by begin and end. Uniforms, textures and
 * vertex arrays stay three's. The marks' index list is mirrored into a plain
 * per-vertex attribute, since three keeps its buffer objects to itself.
 */
export const PREPASS_DEFAULTS=Object.freeze({vertexPrepass:true});
/** Layers of four floats per mark; the context's own limits may be lower. */
const MAX_LAYERS=12;
const SIZES={float:1,vec2:2,vec3:3,vec4:4};
const CULLED='vec4(2.,2.,2.,1.)';
const POSITION_ANCHOR='gl_Position=clip;gl_Position.xy+=(delta*2./viewport+frameJitter)*clip.w;';
const SURFACE_ANCHOR='paintSurface=readSplat(0).xyz+(readSplat(1).xyz*dot(localU,localCoord)+readSplat(2).xyz*dot(localV,localCoord))*brushScale*footprintScale;';
const DELTA_ANCHOR='vec2 delta=transform*localCoord;';
const READ_SPLAT=/vec4 readSplat\(int offset\)\s*\{\s*int address=int\(splatIndex\)\*5\+offset;\s*return texelFetch\(splatData,ivec2\(address%dataWidth,address\/dataWidth\),0\);\s*\}/;
const MAIN=/void\s+main\s*\(\s*\)\s*\{/g;
const count=(text,pattern)=>(text.match(pattern)??[]).length;
const occurrences=(text,literal)=>text.split(literal).length-1;

const stripComments=source=>source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');

/** Resolves #ifdef / #ifndef / #else / #endif against `defines`, so the
 * outputs that are actually compiled can be listed. Returns null for any
 * conditional it does not evaluate. */
export function resolveConditionals(source,defines={}){
  const defined=new Set(Object.keys(defines??{})),stack=[],lines=[];let active=true;
  for(const line of source.split('\n')){
    const directive=line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if(!directive){if(active)lines.push(line);continue;}
    const [,kind,rest]=directive,name=rest.trim().split(/[\s(]/)[0];
    if(kind==='ifdef'||kind==='ifndef'){const met=defined.has(name)===(kind==='ifdef');stack.push({parent:active,met});active=active&&met;}
    else if(kind==='else'){const top=stack.at(-1);if(!top)return null;top.met=!top.met;active=top.parent&&top.met;}
    else if(kind==='endif'){const top=stack.pop();if(!top)return null;active=top.parent;}
    else if(kind==='if'||kind==='elif'||kind==='undef')return null;
    else if(active){if(kind==='define')defined.add(name);lines.push(line);}
  }
  return stack.length?null:lines.join('\n');
}

/** First-fit packing of float, vec2, vec3 and vec4 fields into RGBA texels. */
export function packFields(fields){
  const layers=[];
  for(const field of [...fields].sort((a,b)=>b.size-a.size)){
    let layer=layers.find(candidate=>candidate.used+field.size<=4);
    if(!layer){layer={used:0,fields:[]};layers.push(layer);}
    layer.fields.push({...field,offset:layer.used});layer.used+=field.size;
  }
  return layers;
}

/** `source` without the bodies of functions that take a parameter named
 * `position`: there the name is the parameter, not the quad corner. */
function withoutShadowedCorner(source){
  let result='',from=0;
  for(const match of source.matchAll(/\w+\s+\w+\s*\([^)]*\bposition\b[^)]*\)\s*\{/g)){
    if(match.index<from)continue;
    let depth=1,at=match.index+match[0].length;
    while(depth&&at<source.length){const c=source[at++];if(c==='{')depth++;else if(c==='}')depth--;}
    result+=source.slice(from,match.index);from=at;
  }
  return result+source.slice(from);
}

const decline=reason=>({ok:false,reason});
const OUTPUT=/(?<=^|[;{}\n])[ \t]*(flat[ \t]+)?out[ \t]+(\w+)[ \t]+(\w+)[ \t]*(\[[^\]]*\])?[ \t]*;/g;
const layerNames=layers=>Array.from({length:layers},(_,index)=>`prepassLayer${index}`);

/** Derives the pre-pass and the thin draw shader from a splat vertex shader.
 * Returns {ok:true, prepassVertex, prepassFragment, drawVertex, layers} or
 * {ok:false, reason}. */
export function prepassShaders(vertexShader,defines={},maxLayers=MAX_LAYERS){
  const resolved=resolveConditionals(stripComments(vertexShader),defines);
  if(resolved===null)return decline('conditional compilation it cannot evaluate');
  if(!READ_SPLAT.test(resolved))return decline('a changed splat reader');
  if(count(resolved,MAIN)!==1)return decline('no single main');
  if(occurrences(resolved,POSITION_ANCHOR)!==1)return decline('a changed corner placement');
  if(occurrences(resolved,SURFACE_ANCHOR)!==1)return decline('a changed paint surface');
  if(occurrences(resolved,DELTA_ANCHOR)!==1)return decline('a changed corner offset');
  if(/\bgl_VertexID\b/.test(resolved))return decline('a use of the vertex index');
  // The corner may enter only as localCoord=position.xy*scale, and localCoord
  // may feed only the corner offset and the paint surface.
  const mainAt=resolved.search(MAIN),anchorAt=resolved.indexOf(POSITION_ANCHOR),head=resolved.slice(0,mainAt),body=resolved.slice(mainAt);
  const corners=count(body,/\blocalCoord=position\.xy\*/g);
  if(!corners||count(body,/\bposition\b/g)!==corners||/\bposition\b/.test(withoutShadowedCorner(head)))return decline('another use of the quad corner');
  if(count(resolved,/\blocalCoord\b/g)!==corners+4)return decline('another use of the local coordinate');
  if(count(body,/\bdelta\b/g)!==2)return decline('another use of the corner offset');
  if(resolved.lastIndexOf('localCoord=position.xy*')>anchorAt||resolved.indexOf(DELTA_ANCHOR)>anchorAt)return decline('a corner set after it is placed');

  const outputs=[];
  for(const [,flat,type,name,array] of resolved.matchAll(OUTPUT)){
    if(array||!SIZES[type])return decline(`an output of type ${type}${array??''}`);
    outputs.push({name,type,size:SIZES[type],flat:Boolean(flat)});
  }
  const find=name=>outputs.find(output=>output.name===name);
  if(find('localCoord')?.type!=='vec2'||find('paintSurface')?.type!=='vec3')return decline('missing corner outputs');
  const carried=outputs.filter(output=>output.name!=='localCoord'&&output.name!=='paintSurface');
  const extras=[{name:'prepassClip',type:'vec4',size:4},{name:'prepassTransform',type:'vec4',size:4},{name:'prepassScale',type:'vec2',size:2}];
  const layers=packFields([...extras,...carried]);
  if(layers.length>maxLayers)return decline(`${layers.length} data layers, more than the ${maxLayers} available`);

  // The splat shader's main becomes a function that places the mark's center
  // and leaves its outputs in globals, which are then packed four to a layer.
  const prepassVertex=`vec4 splatPosition;vec4 splatTransform;vec2 splatScale;const vec2 splatCorner=vec2(1.);
${layerNames(layers.length).map(name=>`out vec4 ${name};`).join('')}
${(head+body.replace(/\bposition\.xy\b/g,'splatCorner')).replace(OUTPUT,(match,flat,type,name)=>`${type} ${name};`).replace(MAIN,'void splatMain(){')
    .replace(POSITION_ANCHOR,'gl_Position=clip;gl_Position.xy+=frameJitter*clip.w;splatTransform=vec4(transform[0],transform[1]);splatScale=vec2(brushScale*footprintScale,localCoord.x);')
    .replace(/\bgl_Position\b/g,'splatPosition').replace(/\bgl_InstanceID\b/g,'gl_VertexID')}
void main(){
  splatPosition=${CULLED};splatTransform=vec4(0.);splatScale=vec2(0.);
  splatMain();
  vec4 prepassClip=splatPosition,prepassTransform=splatTransform;vec2 prepassScale=splatScale;
${layers.map((layer,index)=>`  prepassLayer${index}=vec4(${[...layer.fields.map(field=>field.name),...Array(4-layer.used).fill('0.')].join(',')});`).join('\n')}
  gl_Position=vec4(0.,0.,0.,1.);
}`;
  const prepassFragment=`out vec4 prepassColor;void main(){prepassColor=vec4(0.);}`;
  // The extras are locals of the thin shader; everything else is an output.
  const local=new Set(extras.map(extra=>extra.name));
  const unpacked=(layer,index)=>layer.fields.map(field=>`  ${local.has(field.name)?`${field.type} `:''}${field.name}=prepassLayer${index}.${'xyzw'.slice(field.offset,field.offset+field.size)};`).join('\n');
  const drawVertex=`uniform sampler2D splatData;uniform int dataWidth;uniform vec2 viewport;
in float splatIndex;
${layerNames(layers.length).map(name=>`in vec4 ${name};`).join('')}
${outputs.map(output=>`${output.flat?'flat ':''}out ${output.type} ${output.name};`).join('\n')}
vec4 readSplat(int offset){int address=int(splatIndex)*5+offset;return texelFetch(splatData,ivec2(address%dataWidth,address/dataWidth),0);}
void main(){
${layers.map(unpacked).join('\n')}
  if(prepassClip.xyz==vec3(2.)){gl_Position=${CULLED};return;}
  localCoord=position.xy*prepassScale.y;
  gl_Position=prepassClip;gl_Position.xy+=mat2(prepassTransform.xy,prepassTransform.zw)*localCoord*2./viewport*prepassClip.w;
  paintSurface=readSplat(0).xyz+(readSplat(1).xyz*dot(localU,localCoord)+readSplat(2).xyz*dot(localV,localCoord))*prepassScale.x;
}`;
  return {ok:true,prepassVertex,prepassFragment,drawVertex,layers:layers.length,floats:layers.reduce((sum,layer)=>sum+layer.used,0)};
}

const HOOKS=new WeakMap();
/** Wraps the two context calls transform feedback needs; see the header. */
function feedbackHooks(gl){
  let hooks=HOOKS.get(gl);
  if(hooks)return hooks;
  hooks={recording:false};HOOKS.set(gl,hooks);
  const link=gl.linkProgram,draw=gl.drawArrays;
  gl.linkProgram=function(program){
    const vertex=(this.getAttachedShaders(program)??[]).find(shader=>this.getShaderParameter(shader,this.SHADER_TYPE)===this.VERTEX_SHADER);
    const source=vertex?this.getShaderSource(vertex)??'':'';
    if(source.includes('void splatMain(){')){
      const layers=count(source,/\bout vec4 prepassLayer\d+;/g);
      if(layers)this.transformFeedbackVaryings(program,layerNames(layers),this.INTERLEAVED_ATTRIBS);
    }
    return link.call(this,program);
  };
  gl.drawArrays=function(mode,first,vertices){
    if(!hooks.recording)return draw.call(this,mode,first,vertices);
    this.beginTransformFeedback(this.POINTS);
    try{draw.call(this,mode,first,vertices);}finally{this.endTransformFeedback();}
  };
  return hooks;
}

export class SplatPrepass {
  constructor(){
    this.source=null;this.vertexSource=null;this.fragmentSource=null;
    this.material=null;this.draw=null;this.reason=null;this.layers=0;
    this.gl=null;this.buffer=null;this.feedback=null;this.geometry=null;this.indices=null;this.mirror=null;this.drawGeometry=null;this.scratch=null;this.capturing=false;
    this.scene=new THREE.Scene();this.scene.matrixWorldAutoUpdate=false;
    this.points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial());this.points.frustumCulled=false;this.points.matrixAutoUpdate=false;
    // Rasterization is off for exactly this draw, and its outputs are recorded.
    this.points.onBeforeRender=()=>{
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);
      gl.enable(gl.RASTERIZER_DISCARD);feedbackHooks(gl).recording=true;
    };
    this.points.onAfterRender=()=>{
      const gl=this.gl;feedbackHooks(gl).recording=false;gl.disable(gl.RASTERIZER_DISCARD);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
    };
    this.scene.add(this.points);
  }
  /** Layers of four floats the context can record and feed back as attributes. */
  static capacity(renderer){
    const gl=renderer.getContext();
    if(typeof gl.transformFeedbackVaryings!=='function')return 0;
    return Math.min(MAX_LAYERS,Math.floor(gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS)/4),gl.getParameter(gl.MAX_VERTEX_ATTRIBS)-2);
  }
  static supported(renderer){return SplatPrepass.capacity(renderer)>=4;}
  /** The thin material that draws `source`'s marks, or null when this shader
   * cannot be split; `reason` then says why. */
  sync(renderer,source){
    if(this.source===source&&this.vertexSource===source.vertexShader&&this.fragmentSource===source.fragmentShader)return this.draw;
    this.releaseMaterials();
    this.source=source;this.vertexSource=source.vertexShader;this.fragmentSource=source.fragmentShader;
    const shaders=prepassShaders(source.vertexShader,source.defines,SplatPrepass.capacity(renderer));
    if(!shaders.ok){this.reason=shaders.reason;return null;}
    this.reason=null;
    if(this.layers!==shaders.layers){this.releaseBuffer();this.layers=shaders.layers;}
    this.gl=renderer.getContext();feedbackHooks(this.gl);
    // The same uniform objects, so wind, seasons, style and camera stay in step.
    const common={glslVersion:THREE.GLSL3,defines:{...source.defines},uniforms:source.uniforms,depthTest:false,depthWrite:false,toneMapped:false};
    this.material=new THREE.ShaderMaterial({...common,vertexShader:shaders.prepassVertex,fragmentShader:shaders.prepassFragment,blending:THREE.NoBlending});
    this.draw=new THREE.ShaderMaterial({...common,vertexShader:shaders.drawVertex,fragmentShader:source.fragmentShader,transparent:source.transparent,side:source.side,
      blending:source.blending,blendEquation:source.blendEquation,blendSrc:source.blendSrc,blendDst:source.blendDst,
      blendEquationAlpha:source.blendEquationAlpha,blendSrcAlpha:source.blendSrcAlpha,blendDstAlpha:source.blendDstAlpha,premultipliedAlpha:source.premultipliedAlpha});
    return this.draw;
  }
  /** One record per instance of `geometry`, and the attributes that read it. */
  prepare(geometry){
    const gl=this.gl,index=geometry.getAttribute('splatIndex'),stride=this.layers*4;
    if(this.buffer&&this.indices===index&&this.drawGeometry===geometry)return;
    this.releaseBuffer();
    this.indices=index;this.drawGeometry=geometry;
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,index.count*stride*4,gl.DYNAMIC_COPY);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    this.feedback=gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.buffer);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
    // three draws from our buffer when the attribute data says it wraps one.
    const records=new THREE.InstancedInterleavedBuffer(new Float32Array(stride),stride,1);
    Object.assign(records,{count:index.count,isGLBufferAttribute:true,buffer:this.buffer,type:gl.FLOAT,elementSize:4});
    for(let layer=0;layer<MAX_LAYERS;layer++){
      if(layer<this.layers)geometry.setAttribute(`prepassLayer${layer}`,new THREE.InterleavedBufferAttribute(records,4,layer*4));
      else if(geometry.hasAttribute(`prepassLayer${layer}`))geometry.deleteAttribute(`prepassLayer${layer}`);
    }
    // One vertex per mark: the same index list, read per vertex.
    this.mirror=new THREE.BufferAttribute(index.array,1).setUsage(THREE.DynamicDrawUsage);this.mirror.sourceVersion=index.version;
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('splatIndex',this.mirror);
  }
  /** Runs the pre-pass for the marks `mesh` is about to draw with `camera`.
   * Called from the scene's onBeforeRender, before the frame's pass opens. */
  capture(renderer,camera,mesh){
    if(!this.material||this.capturing)return;
    this.prepare(mesh.geometry);
    if(this.mirror.sourceVersion!==this.indices.version){this.mirror.sourceVersion=this.indices.version;this.mirror.needsUpdate=true;}
    this.geometry.setDrawRange(0,mesh.geometry.instanceCount);
    this.points.geometry=this.geometry;this.points.material=this.material;this.points.matrixWorld.copy(mesh.matrixWorld);
    // What the mesh's own onBeforeRender will set for the draw that follows.
    const uniforms=this.source.uniforms;
    if(uniforms.occlusionCount)uniforms.occlusionCount.value=mesh.geometry.instanceCount;
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),autoClear=renderer.autoClear;
    this.capturing=true;
    // Nothing is rasterized. A one-pixel target is bound meanwhile so the
    // frame's own target is not loaded and stored around the recording.
    try{renderer.autoClear=false;renderer.setRenderTarget(this.scratch??=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false}));renderer.render(this.scene,camera);}
    finally{this.capturing=false;renderer.autoClear=autoClear;renderer.setRenderTarget(previous,face,mip);}
  }
  releaseMaterials(){this.material?.dispose();this.draw?.dispose();this.material=null;this.draw=null;this.source=null;this.vertexSource=null;this.fragmentSource=null;}
  /** Frees the records and takes their attributes off the mesh's geometry. */
  releaseBuffer(){
    if(this.drawGeometry)for(let layer=0;layer<MAX_LAYERS;layer++)if(this.drawGeometry.hasAttribute(`prepassLayer${layer}`))this.drawGeometry.deleteAttribute(`prepassLayer${layer}`);
    this.geometry?.dispose();
    if(this.gl){if(this.feedback)this.gl.deleteTransformFeedback(this.feedback);if(this.buffer)this.gl.deleteBuffer(this.buffer);}
    this.geometry=null;this.indices=null;this.mirror=null;this.drawGeometry=null;this.buffer=null;this.feedback=null;
  }
  dispose(){this.releaseMaterials();this.releaseBuffer();this.scratch?.dispose();this.scratch=null;}
}
