// Isolated browser QA only. Never use this config for a production build.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 resolve:{alias:[{find:/^\.\/onboarding\.js$/,replacement:fileURLToPath(new URL('./preview-client.js',import.meta.url))}]},
 server:{host:'127.0.0.1',port:4173,strictPort:true}
});
