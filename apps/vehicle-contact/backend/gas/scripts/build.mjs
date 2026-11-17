import {mkdirSync,rmSync,writeFileSync,copyFileSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';

// MT-GAS-CODE-002: independent, tree-shaken IIFE per externally callable GAS entrypoint.
// Each file is self-contained and namespace-isolated: it NEVER depends on Apps Script
// choosing any particular .gs file evaluation order.
const root=resolve(import.meta.dirname,'..');
const out=join(root,'dist');
const maxLines=800;
const entrypoints=[
  {file:'ENTRY$WebGet.gs',global:'P6VC_WebGet',exportName:'doGet'},
  {file:'ENTRY$WebPost.gs',global:'P6VC_WebPost',exportName:'doPost'},
  {file:'ADMIN$VerifySchema.gs',global:'P6VC_VerifySchema',exportName:'verifyVehicleSchemaFromEditor'},
  {file:'ADMIN$InspectSchema.gs',global:'P6VC_InspectSchema',exportName:'inspectVehicleSchemaDriftFromEditor'},
  {file:'ADMIN$ProposeSchema.gs',global:'P6VC_ProposeSchema',exportName:'proposeVehicleSchemaChangeFromEditor'}
];
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
for(const item of entrypoints) {
  await build({
    stdin:{
      contents:`export { ${item.exportName} } from "./src/entrypoints/WebApp.js";`,
      resolveDir:root,
      sourcefile:`generated/${item.exportName}.js`,
      loader:'js'
    },
    outfile:join(out,item.file),
    bundle:true,
    treeShaking:true,
    platform:'browser',
    target:'es2020',
    format:'iife',
    globalName:item.global,
    legalComments:'none',
    minifySyntax:true,
    footer:{js:`function ${item.exportName}(e) { return ${item.global}.${item.exportName}(e); }`}
  });
  const code=readFileSync(join(out,item.file),'utf8');
  const lines=code.split(/\r?\n/).length;
  if(lines>maxLines) throw new Error(`Generated GAS file ${item.file} has ${lines} lines (max ${maxLines})`);
  if(!code.includes(`function ${item.exportName}(`)) throw new Error(`Missing GAS global for ${item.exportName}`);
  console.log(`${item.file}: ${lines} lines`);
}
copyFileSync(join(root,'appsscript.json'),join(out,'appsscript.json'));
const files=readdirSync(out).sort();
const expected=[...entrypoints.map(x=>x.file),'appsscript.json'].sort();
if(JSON.stringify(files)!==JSON.stringify(expected)) throw new Error('Unexpected GAS deployment artifacts');
console.log('Multi-file GAS deployment built (5 independent namespaced bundles + manifest), no deployment performed');
