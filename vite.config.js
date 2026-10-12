import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const require=createRequire(import.meta.url);

function scannerOcrAssets(){
  const packageRoot=path.resolve(path.dirname(require.resolve('tesseract.js')),'..');
  const coreRoot=path.dirname(require.resolve('tesseract.js-core'));
  const languageRoot=path.dirname(require.resolve('@tesseract.js-data/eng'));
  const assets=new Map([
    ['/ocr/worker.min.js',path.join(packageRoot,'dist','worker.min.js')],
    ...['tesseract-core-simd-lstm','tesseract-core-lstm'].flatMap(name=>[
      [`/ocr/core/${name}.wasm.js`,path.join(coreRoot,`${name}.wasm.js`)],
      [`/ocr/core/${name}.wasm`,path.join(coreRoot,`${name}.wasm`)]
    ]),
    ['/ocr/lang/4.0.0_best_int/eng.traineddata.gz',path.join(languageRoot,'4.0.0_best_int','eng.traineddata.gz')]
  ]);
  const contentType=pathname=>pathname.endsWith('.wasm')?'application/wasm':
    pathname.endsWith('.gz')?'application/gzip':'text/javascript; charset=utf-8';
  return {
    name:'self-host-scanner-ocr-assets',
    configureServer(server){
      server.middlewares.use((request,response,next)=>{
        const pathname=new URL(request.url||'','http://localhost').pathname;
        const file=assets.get(pathname);
        if(!file) return next();
        try{
          response.setHeader('Content-Type',contentType(pathname));
          response.end(readFileSync(file));
        }catch(error){next(error)}
      });
    },
    generateBundle(){
      for(const [url,file] of assets){
        this.emitFile({type:'asset',fileName:url.slice(1),source:readFileSync(file)});
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const keyPath = env.HTTPS_KEY_PATH;
  const certPath = env.HTTPS_CERT_PATH;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('Set both HTTPS_KEY_PATH and HTTPS_CERT_PATH to enable HTTPS.');
  }
  const https = keyPath ? {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  } : undefined;
  const apiTarget = `${https ? 'https' : 'http'}://localhost:${env.PORT || 8080}`;

  return {
    plugins: [react(),scannerOcrAssets(),VitePWA({
      registerType:'autoUpdate',
      manifest:{name:'Riftbound Local Collection Manager',short_name:'Riftbound',start_url:'/',display:'standalone',background_color:'#d4dde2',theme_color:'#d4dde2',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]},
      workbox:{
        globPatterns:['**/*.{js,css,html,ico,png,svg,webmanifest,wasm,gz}'],
        maximumFileSizeToCacheInBytes:20*1024*1024,
        runtimeCaching:[{
          urlPattern:({request,url})=>request.destination==='image'&&!url.pathname.startsWith('/api/'),
          handler:'CacheFirst',
          options:{
            cacheName:'card-artwork',
            expiration:{maxEntries:500,maxAgeSeconds:30*24*60*60},
            cacheableResponse:{statuses:[0,200]}
          }
        }]
      }
    })],
    server: { host: '0.0.0.0', port: 5173, https, proxy: { '/api': { target: apiTarget, ...(https ? { secure: false } : {}) } } },
    build: { outDir: 'dist' }
  };
});
