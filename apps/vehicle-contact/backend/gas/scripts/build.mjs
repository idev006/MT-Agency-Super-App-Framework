import {mkdirSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..'),out=join(root,'dist');
mkdirSync(out,{recursive:true});
await build({
  entryPoints:[join(root,'src/entrypoints/WebApp.js')],
  bundle:true,platform:'browser',target:'es2020',format:'iife',globalName:'P6VC',
  outfile:join(out,'Code.gs'),legalComments:'none',
  footer:{js:[
    'function doGet(e) { return P6VC.doGet(e); }',
    'function doPost(e) { return P6VC.doPost(e); }',
    'function verifyVehicleSchemaFromEditor() { return P6VC.verifyVehicleSchemaFromEditor(); }',
    'function inspectVehicleSchemaDriftFromEditor() { return P6VC.inspectVehicleSchemaDriftFromEditor(); }',
    'function proposeVehicleSchemaChangeFromEditor() { return P6VC.proposeVehicleSchemaChangeFromEditor(); }'
  ].join('\n')}
});
copyFileSync(join(root,'appsscript.json'),join(out,'appsscript.json'));
console.log('Canonical schema bundled in GAS artifact; detect/propose only, no migration/deployment');
