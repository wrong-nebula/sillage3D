/** A reference-led pigment treatment of live planar reflections.
 * Only scenes opting into reflection.paint compile these branches. */
export const PAINTED_WATER_OVERSCAN=1.85;
export const PAINTED_WATER_UV_GLSL=`
    float waterAngle=abs(normalize(cameraPosition-center.xyz).y);
    float nearWater=smoothstep(.006,.045,waterAngle);
    // The horizon comes from the reflected camera, so the wash follows orbit
    // and lens changes instead of a fixed screen-space band.
    vec3 horizontalRay=normalize(vec3(center.x-cameraPosition.x,0.,center.z-cameraPosition.z));
    vec4 horizonRay=reflectionMatrix*vec4(horizontalRay,0.);
    float horizonY=horizonRay.y/(abs(horizonRay.w)>.0001?horizonRay.w:.0001);
    float horizonStrength=smoothstep(.05,.25,abs(horizonRay.w));
    uv.y=mix(uv.y,horizonY+(uv.y-horizonY)*mix(1.35,1.65,nearWater),horizonStrength);
    float row=center.z*reflectionRippleScale.x+windTime*.19;
    float ripple=sin(row+.24*sin(center.x*.23))*.58+sin(row*2.31-windTime*.13)*.27+sin(row*4.73+center.x*.08)*.15;
    uv.x+=ripple*reflectionSettings.z*mix(.12,1.,nearWater);
    uv.y+=sin(row*.71+center.x*.12)*reflectionSettings.w;
`;
export const PAINTED_WATER_COLOR_GLSL=`
      // Vertical pigment trails keep the window bars but dissolve the complete
      // upside-down carriage and cloud outlines. Samples remain live scene data.
      float smear=reflectionBlurY*mix(.45,2.4,nearWater);
      vec3 samples[7];
      samples[0]=texture(waterReflection,uv).rgb;
      samples[1]=texture(waterReflection,clamp(uv+vec2(0.,smear*.33),.001,.999)).rgb;
      samples[2]=texture(waterReflection,clamp(uv-vec2(0.,smear*.33),.001,.999)).rgb;
      samples[3]=texture(waterReflection,clamp(uv+vec2(0.,smear*.67),.001,.999)).rgb;
      samples[4]=texture(waterReflection,clamp(uv-vec2(0.,smear*.67),.001,.999)).rgb;
      samples[5]=texture(waterReflection,clamp(uv+vec2(0.,smear),.001,.999)).rgb;
      samples[6]=texture(waterReflection,clamp(uv-vec2(0.,smear),.001,.999)).rgb;
      vec3 reflectedColor=samples[0]*.24+(samples[1]+samples[2])*.20+(samples[3]+samples[4])*.12+(samples[5]+samples[6])*.06;
      float value=dot(reflectedColor,vec3(.24,.64,.12));
      vec3 violetWash=mix(vec3(.23,.16,.24),vec3(.73,.73,.89),smoothstep(.17,.83,value));
      reflectedColor=mix(reflectedColor*reflectionTint,violetWash,.04+smoothstep(.18,.75,nearWater)*.86);
      // Transparent foreground glaze: the live image remains underneath the
      // broad authored water pigments instead of looking like a second sky.
      fresnel*=mix(1.,.35,nearWater);
`;
