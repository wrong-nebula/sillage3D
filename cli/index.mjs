/** Sillage for Node: drive the real renderer headlessly, and the pure scene
 * and style modules that need no browser.
 *
 *   import {openSession, inspectScene, starterScene} from './cli/index.mjs';
 *   const session = await openSession({width: 1024, height: 768});
 *   await session.load(starterScene('tree'));
 *   const {png} = await session.capture();
 *   await session.close();
 */
export {Session, SESSION_STATES, openSession, resolveScene, ROOT} from './lib/session.mjs';
export {TOOLS, runTool, toolByName, toolDefinitions, createContext} from './lib/tools.mjs';
export {serveMCP} from './lib/mcp.mjs';
export {SillageError, errorJSON} from '../src/sillage/errors.js';
export {STYLE_OPTIONS, STYLE_GROUPS, styleDefaults, validateStyle, styleSchema} from '../src/sillage/styles.js';
export {validateScene, compileScene, inspectScene, sceneDefinition, sceneSchema, starterScene, splatStats, frameCamera, CONTENT_TYPES, TEMPLATE_NAMES} from '../src/sillage/scene.js';
export {createBrush, parseColor} from '../src/sillage/brush.js';
export {listScenes, findScene} from '../src/sillage/catalog.js';
export {createMachine, SILLAGE_STATES, HOST_STATES} from '../src/sillage/machine.js';
