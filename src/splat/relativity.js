import * as T from 'three';

// Screen-space measurements from NGA's 1974.28.51 reproduction. Depth is an
// authored interpretation: the print itself supplies incompatible viewpoints.
export const RELATIVITY_REFERENCE = 'https://www.nga.gov/artworks/54256-relativity';
export const RELATIVITY_CAMERA = {position: [0, 0, 38], target: [0, 0, 0], fov: 23.8};
const UNIT = .021, EYE = 38;
const P = (x, y, z = 0) => new T.Vector3((x - 400) * UNIT * (EYE - z) / EYE, (400 - y) * UNIT * (EYE - z) / EYE, z);
const V = (x, y, z = 0) => new T.Vector3(x * UNIT, -y * UNIT, z);

function inkMaterial(color, roughness = 1) {
  const m = new T.MeshStandardMaterial({color, roughness, metalness: 0, side: T.DoubleSide});
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      float value=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
      vec2 ink=gl_FragCoord.xy;
      float line=1.-smoothstep(.13,.24,abs(fract((ink.x+ink.y)*.215)-.5));
      float crossline=1.-smoothstep(.10,.19,abs(fract((ink.x-ink.y)*.19)-.5));
      float amount=smoothstep(.82,.29,value);
      value*=1.-line*amount*.37-crossline*amount*amount*.27;
      gl_FragColor.rgb=vec3(value)*vec3(1.,.987,.947);
    `);
  };
  return m;
}

export function createRelativity() {
  const scene = new T.Scene(); scene.background = new T.Color('#d7d0bd');
  const paper = inkMaterial('#e2dbc5'), limestone = inkMaterial('#c5bfae'), shadow = inkMaterial('#6a665e');
  const charcoal = inkMaterial('#393833'), pale = inkMaterial('#f1ead8');
  const materials = [paper, limestone, shadow, charcoal, pale];
  let stairCount = 0, figureCount = 0;
  function solid(points, depth, material = paper, thickness = .28) {
    const shape = new T.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo((x - 400) * UNIT, (400 - y) * UNIT) : shape.moveTo((x - 400) * UNIT, (400 - y) * UNIT)); shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, {depth: thickness, bevelEnabled: false, curveSegments: 16});
    geometry.translate(0, 0, depth - thickness);
    // Anamorphic placement keeps the measured outline at the opening camera.
    const a = geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { const s = (EYE - a.getZ(i)) / EYE; a.setXY(i, a.getX(i) * s, a.getY(i) * s); }
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  function line(points, radius = .023, material = charcoal) {
    const path = new T.CatmullRomCurve3(points.map(p => P(...p)), false, 'centripetal');
    const mesh = new T.Mesh(new T.TubeGeometry(path, Math.max(2, points.length * 7), radius, 5, false), material);
    mesh.castShadow = true; scene.add(mesh); return mesh;
  }
  function rod(a, b, radius = .025, material = charcoal) { return line([a, b], radius, material); }
  function masonry(points, depth, dark = false) {
    solid(points, depth, dark ? shadow : limestone, .45);
    // Fine brick courses follow their architectural surface rather than an image.
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    function inside(x, y) {
      let result = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [a, b] = points[i], [c, d] = points[j];
        if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) result = !result;
      }
      return result;
    }
    const marks = [];
    const add = (x1, y1, x2, y2) => { if (inside(x1, y1) && inside(x2, y2)) marks.push(...P(x1, y1, depth + .006).toArray(), ...P(x2, y2, depth + .006).toArray()); };
    for (let y = minY + 7; y < maxY; y += 7) for (let x = minX; x < maxX; x += 6) add(x, y, x + 6, y);
    for (let y = minY; y < maxY; y += 7) for (let x = minX + (Math.floor(y / 7) % 2) * 6; x < maxX; x += 12) add(x, y + 1, x, y + 6);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(marks, 3));
    scene.add(new T.LineSegments(geometry, new T.LineBasicMaterial({color: dark ? '#383630' : '#837d70', transparent: true, opacity: .35})));
  }
  function archOpening(x, y, width, height, depth, angle = 0, garden = false) {
    const center = P(x, y, depth), q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), angle);
    const w = width * UNIT * (EYE - depth) / EYE, h = height * UNIT * (EYE - depth) / EYE;
    const shape = new T.Shape(); shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2); shape.lineTo(w / 2, h / 2 - w / 2);
    shape.absarc(0, h / 2 - w / 2, w / 2, 0, Math.PI, false); shape.lineTo(-w / 2, -h / 2);
    const mesh = new T.Mesh(new T.ShapeGeometry(shape, 32), garden ? pale : charcoal);
    mesh.position.copy(center); mesh.quaternion.copy(q); scene.add(mesh);
    const outline = [];
    for (let i = 0; i <= 28; i++) { const a = Math.PI * i / 28; outline.push(new T.Vector3(Math.cos(a) * w / 2, h / 2 - w / 2 + Math.sin(a) * w / 2, .017).applyQuaternion(q).add(center)); }
    const curve = new T.CatmullRomCurve3(outline);
    const rim = new T.Mesh(new T.TubeGeometry(curve, 40, .045, 5, false), limestone); scene.add(rim);
    if (garden) {
      const tree = new T.Group(); tree.position.copy(center); tree.quaternion.copy(q);
      for (let i = 0; i < 7; i++) {
        const geometry = new T.CylinderGeometry(.012, .025, h * .55, 5);
        const trunk = new T.Mesh(geometry, shadow); trunk.position.set((i % 3 - 1) * w * .20, -h * .12, .035); trunk.rotation.z = Math.sin(i * 2) * .26; tree.add(trunk);
        for (let j = 0; j < 4; j++) {
          const leaf = new T.Mesh(new T.IcosahedronGeometry(w * (.07 + j * .016), 0), j % 2 ? paper : limestone);
          leaf.position.set(trunk.position.x + Math.sin(j * 2.4 + i) * w * .13, trunk.position.y + h * (.12 + j * .07), .05);
          leaf.scale.set(1, .55, .15); tree.add(leaf);
        }
      }
      scene.add(tree);
    }
    return mesh;
  }
  function stairs(from, to, width, count, depth, widthVector, up) {
    stairCount++;
    const delta = [(to[0] - from[0]) / count, (to[1] - from[1]) / count];
    const w = V(widthVector[0], widthVector[1]);
    const rise = V(up[0] * 5.2, up[1] * 5.2, .14);
    const run = V(delta[0] - up[0] * 5.2, delta[1] - up[1] * 5.2, .01);
    const along = V(delta[0], delta[1], .15);
    const origin = P(...from, depth);
    for (let i = 0; i < count; i++) {
      const center = origin.clone().addScaledVector(along, i + .5);
      const matrix = new T.Matrix4().makeBasis(w, rise, run).setPosition(center);
      const mesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), i % 2 ? paper : limestone);
      mesh.applyMatrix4(matrix); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    }
    // Both handrails are measured in the drawing, with the same vertical rhythm.
    for (const side of [-.5, .5]) {
      const points = [];
      for (let i = 0; i <= count; i++) {
        const x = from[0] + delta[0] * i + widthVector[0] * side, y = from[1] + delta[1] * i + widthVector[1] * side;
        const top = [x - up[0] * 32, y - up[1] * 32, depth + i * .15 + .08]; points.push(top);
        if (i % 2 === 0) rod([x, y, depth + i * .15], top, .026, shadow);
      }
      line(points, .048, limestone); line(points.map(([x, y, z]) => [x, y + 2, z + .03]), .014, charcoal);
    }
  }
  function figure(x, y, depth, angle = 0, scale = 1, pose = 0) {
    figureCount++;
    const group = new T.Group(); group.position.copy(P(x, y, depth)); group.rotation.z = angle; group.scale.setScalar(scale);
    const material = limestone;
    const head = new T.Mesh(new T.SphereGeometry(.12, 10, 8), material); head.position.y = .76; head.scale.set(.83, 1.05, .8); group.add(head);
    const torso = new T.Mesh(new T.CylinderGeometry(.135, .095, .4, 7), material); torso.position.y = .43; torso.rotation.z = .12; group.add(torso);
    const limb = (a, b, radius) => {
      const av = new T.Vector3(...a), bv = new T.Vector3(...b), d = bv.clone().sub(av);
      const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius * .9, d.length(), 6), material);
      mesh.position.copy(av.add(bv).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); mesh.castShadow = true; group.add(mesh);
    };
    limb([-.06, .25, 0], [-.15, .06, .06 + pose * .08], .044); limb([.06, .25, 0], [.19, .02, -.07], .044);
    limb([-.13, .56, 0], [-.23, .30, .06], .035); limb([.12, .55, 0], [.24, .4 + pose * .11, .05], .035);
    group.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(group);
  }

  // Full-frame room volumes follow the triangular negative space in the print.
  solid([[10, 10], [790, 10], [790, 790], [10, 790]], -6, shadow, .5);
  masonry([[16, 305], [173, 368], [277, 626], [199, 787], [16, 787]], -1.7);
  masonry([[185, 245], [301, 225], [385, 262], [391, 434], [290, 558], [188, 413]], -1.4);
  masonry([[276, 263], [412, 239], [537, 302], [533, 438], [459, 517], [331, 544], [263, 438]], -.7);
  masonry([[538, 252], [785, 158], [788, 479], [669, 432], [585, 391]], -2.1, true);
  masonry([[419, 572], [590, 408], [790, 460], [790, 787], [419, 787]], -1.3);
  solid([[180, 15], [429, 15], [573, 128], [466, 207], [340, 168]], -1.1, shadow, .8);
  masonry([[449, 16], [789, 16], [788, 169], [629, 232], [490, 173]], -1.8);
  masonry([[18, 369], [104, 398], [170, 548], [113, 706], [17, 742]], .8);
  solid([[300, 658], [416, 559], [462, 588], [456, 701], [369, 788], [258, 788]], -.6, charcoal, .6);

  archOpening(169, 86, 156, 160, .2, -.31, true);
  archOpening(80, 231, 128, 180, .4, .48, true);
  archOpening(292, 526, 100, 176, .1, .26, true);
  archOpening(703, 533, 177, 234, .4, -Math.PI / 2, true);
  archOpening(744, 113, 60, 94, .8, -.2, false);
  archOpening(432, 316, 55, 118, .35, -Math.PI / 2, false);
  archOpening(109, 724, 78, 112, 1.25, .25, false);
  archOpening(489, 687, 75, 134, .65, Math.PI / 2, false);
  archOpening(72, 488, 72, 126, 1.5, 0, false);

  // Seven flights, including the two inhabitants using opposite faces of one run.
  stairs([286, 658], [143, 387], 61, 16, 1.7, [58, -27], [0, 1]);
  stairs([432, 541], [645, 267], 59, 17, 1.5, [58, 28], [-.15, 1]);
  stairs([312, 221], [649, 207], 48, 17, 1.4, [-9, -47], [0, 1]);
  stairs([304, 264], [274, 143], 66, 8, 2.0, [-59, 26], [-1, 0]);
  stairs([295, 779], [425, 650], 55, 9, 2.2, [44, 24], [0, 1]);
  stairs([470, 141], [647, 27], 54, 10, 1.0, [40, 35], [-.6, .8]);
  stairs([211, 432], [278, 316], 43, 7, 2.7, [-37, -18], [.7, .7]);

  // Balconies, closed doors and outdoor tables are placed in the same orientations.
  for (const [a, b, up] of [
    [[30, 352], [108, 378], [-.1, 1]], [[620, 244], [775, 140], [0, 1]],
    [[541, 611], [747, 681], [1, 0]], [[442, 646], [739, 764], [1, 0]],
    [[17, 588], [61, 517], [1, 0]],
  ]) {
    line([[a[0] - up[0] * 42, a[1] - up[1] * 42, 3], [b[0] - up[0] * 42, b[1] - up[1] * 42, 3]], .047, limestone);
    for (let i = 0; i <= 12; i++) {
      const x = T.MathUtils.lerp(a[0], b[0], i / 12), y = T.MathUtils.lerp(a[1], b[1], i / 12);
      rod([x, y, 2.7], [x - up[0] * 42, y - up[1] * 42, 3], .024, charcoal);
    }
  }
  const figures = [
    [137, 106, 2, 1.1, .9], [115, 134, 2, 1.1, .9], [121, 244, 2, 1.4, 1],
    [295, 140, 4, 1.35, 1.05], [367, 189, 4.6, -.3, 1.02], [625, 209, 4.3, -.85, 1],
    [244, 340, 4, -.5, 1], [371, 377, 1.4, .9, 1.02], [485, 362, 3.9, -.8, .93],
    [207, 431, 4.6, -.5, 1], [232, 635, 4.8, Math.PI / 2, 1.05], [452, 704, 4.1, 0, 1.08],
    [526, 551, 4.6, -Math.PI / 2, 1.08], [648, 526, 1.4, -Math.PI / 2, .83], [665, 563, 1.4, -Math.PI / 2, .83],
  ];
  figures.forEach((f, i) => figure(...f, i % 2));

  const ambient = new T.HemisphereLight('#fff7de', '#777366', 1.5); scene.add(ambient);
  const key = new T.DirectionalLight('#fff6df', 2.9); key.position.set(-9, 12, 24); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0003; key.shadow.normalBias = .025;
  Object.assign(key.shadow.camera, {left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 65}); scene.add(key);
  // Invisible apertures are the tour's gravity transitions, not colored effects.
  const portalSpecs = [[[-3.4, 3.5, 2.3], [0, 0, 0]], [[4.6, -.3, 2], [0, -.6, Math.PI / 2]], [[0, 4.8, 1], [.4, 0, Math.PI]]];
  const portals = portalSpecs.map(([position, rotation], i) => {
    const frame = new T.Object3D(); frame.position.fromArray(position); frame.rotation.set(...rotation); frame.updateMatrixWorld(true);
    const material = new T.ShaderMaterial({uniforms: {view: {value: null}, viewport: {value: new T.Vector2(1, 1)}, portalEnabled: {value: true}},
      vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform sampler2D view;uniform vec2 viewport;void main(){gl_FragColor=texture2D(view,gl_FragCoord.xy/viewport);}', side: T.DoubleSide});
    const mesh = new T.Mesh(new T.PlaneGeometry(1.15, 1.9), material); mesh.position.copy(frame.position); mesh.quaternion.copy(frame.quaternion);
    mesh.visible = false; // Only revealed for navigation, so the print view stays monochrome.
    scene.add(mesh); return {frame, mesh, material, exit: (i + 1) % 3};
  });
  return {scene, portals, materials, camera: RELATIVITY_CAMERA, reference: RELATIVITY_REFERENCE,
    facts: {staircases: stairCount, figures: figureCount, gravityFrames: 3, portals: 3, reference: RELATIVITY_REFERENCE}};
}
