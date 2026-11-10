import {defineConfig} from 'vite';
import {dirname,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
// Pages kept only on some machines are skipped when their file is absent.
const present=pages=>Object.fromEntries(Object.entries(pages).filter(([,path])=>existsSync(path)));
const fontDirectory=dirname(createRequire(import.meta.url).resolve('@fontsource/dm-sans/package.json'));
export default defineConfig({
 server:{host:'127.0.0.1',port:5180,strictPort:true,fs:{allow:[import.meta.dirname,fontDirectory]}},
 build:{rollupOptions:{input:present({trees:resolve(import.meta.dirname,'trees.html'),studio:resolve(import.meta.dirname,'index.html'),world:resolve(import.meta.dirname,'three.html'),splats:resolve(import.meta.dirname,'splat.html'),demo:resolve(import.meta.dirname,'tech-demo.html'),tiled:resolve(import.meta.dirname,'tiled-gaussian.html'),crow:resolve(import.meta.dirname,'crow.html'),desert:resolve(import.meta.dirname,'desert.html'),cliff:resolve(import.meta.dirname,'cliff.html'),physics:resolve(import.meta.dirname,'physics.html'),physicsDemo:resolve(import.meta.dirname,'physics-demo.html'),moka:resolve(import.meta.dirname,'moka.html'),atelier:resolve(import.meta.dirname,'atelier.html'),sillage:resolve(import.meta.dirname,'sillage.html')})}}
});
