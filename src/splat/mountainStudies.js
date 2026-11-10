import {createHeightfieldScene} from './heightfield.js';

const reliefStyle = {
  mode: 'ghibli', quality: 'studio', brushScale: 1, coverage: 1.18, softness: .27,
  gouacheTexture: .28, gouacheBlend: .26, gouacheTone: .28,
  indirect: false, tintedShadows: false, sun: false, lensDirt: false,
  lensFlare: false, painterlyVignette: false, foregroundDOF: false,
};
const furkaCamera = {position: [97, 75, 102], target: [-4, 6, -4], fov: 42};

const reliefStudies = [
  {
    id: 'furka-pass',
    label: 'Furka Pass',
    title: 'Furka Pass terrain study',
    description: 'A 1,050 × 945 m crop of the Swiss Alps from the swissALTI3D 0.5 m elevation grid. ©swisstopo',
    caption: 'Surveyed alpine relief',
    camera: furkaCamera,
    styleOnVisit: true,
    initialStyle: reliefStyle,
  },
  {
    id: 'furka-lidar',
    label: 'Furka LiDAR',
    title: 'Furka Pass ground returns',
    description: 'The same Furka Pass crop reconstructed from classified 2021 swissSURFACE3D LiDAR ground returns. ©swisstopo',
    caption: 'LiDAR comparison',
    // These three studies carry one mark per sampled terrain cell.
    splatBudget: 225_000,
    swatch: 'furka-pass',
    camera: furkaCamera,
    styleOnVisit: true,
    initialStyle: reliefStyle,
  },
  {
    id: 'tsarmine',
    label: 'Tsarmine',
    title: 'Tsarmine rock glacier',
    description: 'A 216 × 144 m crop of the rock glacier terminus from the 6 cm October 2025 UAV survey. Vivero et al., CC BY 4.0.',
    caption: 'Drone-surveyed boulder field',
    splatBudget: 135_000,
    swatch: 'furka-pass',
    camera: {position: [-35, 45, 44], target: [0, -4, 0], fov: 42},
    heightfield: {metresPerUnit: 5, datum: 2500, background: '#98a7b0',
      grass: [.51, .48, .43], scree: [.71, .66, .58], slate: [.48, .47, .48], altitudeBand: [2440, 2650]},
    styleOnVisit: true,
    initialStyle: {...reliefStyle, mode: 'gaussian', brushScale: 1.07, coverage: 1.21},
  },
  {
    id: 'libreterrain-alpine',
    label: 'Alpine saddle',
    title: 'Procedural alpine saddle',
    description: 'A 500 × 500 m LibreTerrain build with hydraulic erosion, scree and patchy snow. Generated terrain.',
    caption: 'LibreTerrain · 4,033² build',
    splatBudget: 160_000,
    swatch: 'furka-pass',
    camera: {position: [102, 91, 128], target: [0, 10, 0], fov: 41},
    heightfield: {metresPerUnit: 5, datum: 0, background: '#aabdc9',
      grass: [.47, .49, .39], scree: [.66, .60, .53], slate: [.46, .48, .52], altitudeBand: [75, 270]},
    mask: true,
    styleOnVisit: true,
    initialStyle: {...reliefStyle, gouacheBlend: .22},
  },
];

const paintedTextureStyle = {...reliefStyle, brushScale: 1.10, coverage: 1.24, softness: .37,
  gouacheTexture: .60, gouacheBlend: .39, gouacheTone: .19};
const orthophoto = {kind: 'aerial', files: {terrainPhoto: 'ortho.jpg'}};

export const mountainStudies = [
  ...reliefStudies.map(createHeightfieldScene),
  createHeightfieldScene({
    ...reliefStudies[1],
    id: 'furka-lidar-photo',
    terrainSource: 'furka-lidar',
    label: 'Furka aerial',
    title: 'Furka Pass with aerial imagery',
    description: '2021 SWISSIMAGE orthophotos on the same 2021 LiDAR relief. ©swisstopo',
    caption: 'Painted aerial terrain',
    heightfield: {background: '#a5c5d8'},
    initialStyle: paintedTextureStyle,
    textures: {...orthophoto, washMetres: 3.6},
  }),
  createHeightfieldScene({
    ...reliefStudies[2],
    id: 'tsarmine-photo',
    terrainSource: 'tsarmine',
    label: 'Tsarmine aerial',
    title: 'Tsarmine rock glacier with aerial imagery',
    description: 'Drone imagery and elevation from the same October 3, 2025 survey. Vivero et al., CC BY 4.0.',
    caption: 'Painted boulder field',
    heightfield: {...reliefStudies[2].heightfield, background: '#a6bfd1'},
    initialStyle: paintedTextureStyle,
    textures: {...orthophoto, washMetres: 1.05},
  }),
  createHeightfieldScene({
    ...reliefStudies[3],
    id: 'libreterrain-alpine-photo',
    terrainSource: 'libreterrain-alpine',
    label: 'Alpine materials',
    title: 'LibreTerrain alpine saddle with scanned materials',
    description: 'LibreTerrain relief with Poly Haven cliff, scree, grass and snow scans. Materials CC0.',
    caption: 'Painted alpine materials',
    heightfield: {...reliefStudies[3].heightfield, background: '#aecad8'},
    initialStyle: paintedTextureStyle,
    textures: {kind: 'material', washMetres: 3.3, files: {
      terrainGrass: 'grass.jpg', terrainScree: 'scree.jpg', terrainRock: 'cliff.jpg',
      terrainRockNormal: 'cliff-normal.jpg', terrainSnow: 'snow.jpg',
    }},
  }),
];
