/** The built-in scenes, addressable by id. */
import {scenes} from '../splat/scenes.js';
import {SillageError, didYouMean} from './errors.js';

const summary = scene => ({
  id: scene.id,
  title: scene.label ?? scene.title ?? scene.id,
  description: scene.description ?? scene.subtitle ?? scene.caption ?? '',
  camera: {...scene.camera},
  ...(scene.aspect ? {aspect: scene.aspect} : {}),
  // Scenes that fetch models, terrain or textures before they can be built.
  loadsAssets: Boolean(scene.prepare),
});

/** [{id, title, description, camera, aspect?, loadsAssets}] */
export function listScenes() { return scenes.map(summary); }
export const sceneIds = () => scenes.map(scene => scene.id);

/** Ids a scene used to have. They still load; nothing lists them. */
const FORMER_IDS = {ghibli: 'summer-hillside'};
export const currentSceneId = id => FORMER_IDS[id] ?? id;

/** The engine's scene definition for an id. Throws UNKNOWN_SCENE with suggestions. */
export function findScene(id) {
  const scene = scenes.find(candidate => candidate.id === currentSceneId(id));
  if (!scene) throw new SillageError('UNKNOWN_SCENE', `No built-in scene is called "${id}".`, {hint: `${didYouMean(id, sceneIds())} "sillage scenes" lists them all.`});
  return scene;
}
export const describeScene = id => summary(findScene(id));
