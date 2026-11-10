import {ghibliScene} from './ghibliScene.js';
import {createGhibli} from './ghibli.js';
export const scenes=[{...ghibliScene,create:()=>createGhibli({entrance:true})}];
