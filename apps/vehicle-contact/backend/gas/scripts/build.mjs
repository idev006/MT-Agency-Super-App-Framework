import {mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');
const out=join(root,'dist');
mkdirSync(out,{recursive:true});
await build({
  entryPoints:[join(root,'src/entrypoints/WebApp.js')],
  bundle:true,
  platform:'browser',
  target:'es2020',
  format:'iife',
  globalName:'P6VC',
  outfile:join(out,'Code.gs'),
  legalComments:'none',
  footer:{js:[
    'function doGet(e) { return P6VC.doGet(e); }',
    'function doPost(e) { return P6VC.doPost(e); }',
    'function verifyVehicleSchemaFromEditor() { return P6VC.verifyVehicleSchemaFromEditor(); }'
  ].join('\n')}
});
copyFileSync(join(root,'appsscript.json'),join(out,'appsscript.json'));
console.log('Bundled ES modules -> GAS-compatible dist/Code.gs; no deployment performed');
