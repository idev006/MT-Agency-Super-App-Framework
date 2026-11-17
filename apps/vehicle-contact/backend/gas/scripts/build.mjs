import { mkdirSync, rmSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, dirname, extname, sep, basename } from 'node:path';
import { transform } from 'esbuild';

// GitHub ES modules mirror GAS .gs files ONE-TO-ONE by logical layer and path.
// GAS has a flat project file list, so path segments are encoded with "$".
// All runtime modules register lazily; no dependency on GAS file evaluation order.
const root=resolve(import.meta.dirname,'..');
const appRoot=resolve(root,'../..');
const out=join(root,'dist');
const maxLines=800;
const entryFile='backend/gas/src/entrypoints/WebApp.js';
const allowedFolders=['entrypoints','api','application','domain','infrastructure','composition'];
const entrypoints=['doGet','doPost','verifyVehicleSchemaFromEditor','inspectVehicleSchemaDriftFromEditor','proposeVehicleSchemaChangeFromEditor','migrateVehicleSchemaFromEditor','applyVehicleSchemaFromEditor','bootstrapVehicleAdminFromEditor','benchmarkVehiclePasswordHashFromEditor'];

function scan(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(d=>{
    const full=join(dir,d.name);
    return d.isDirectory()?scan(full):d.isFile() && d.name.endsWith('.js')?[full]:[];
  });
}
const sources=scan(join(root,'src')).sort();
const schemaFile=join(appRoot,'schema','database.schema.json');
if(!sources.length) throw new Error('No GAS modules found');
const logical=full=>relative(appRoot,full).split(sep).join('/');
function outputName(file) {
  const parts=relative(join(root,'src'),file).split(sep);
  if(!allowedFolders.includes(parts[0])) throw new Error('Unsupported GAS source layer');
  const [layer,...rest]=parts;
  return layer.toUpperCase()+'$'+rest.join('$').replace(/\.js$/,'.gs');
}
const registryBootstrap=`var P6VC_Runtime = P6VC_Runtime || (function () {
  var factories = Object.create(null);
  var cache = Object.create(null);
  function normalize(specifier,from) {
    var input = specifier.charAt(0)==='.' ? from.split('/').slice(0,-1).concat(specifier.split('/')) : specifier.split('/');
    var parts=[];
    for(var i=0;i<input.length;i++){
      var token=input[i];
      if(!token || token==='.') continue;
      if(token==='..'){if(!parts.length) throw new Error('Module path escapes root');parts.pop();}
      else parts.push(token);
    }
    return parts.join('/');
  }
  function load(specifier,from) {
    var id=normalize(specifier,from||'');
    if(Object.prototype.hasOwnProperty.call(cache,id)) return cache[id].exports;
    if(!Object.prototype.hasOwnProperty.call(factories,id)) throw new Error('Missing GAS module: '+id);
    var module={exports:{}};
    cache[id]=module;
    try {
      factories[id](function(request){return load(request,id);},module,module.exports);
      return module.exports;
    } catch(error) {delete cache[id];throw error;}
  }
  return Object.freeze({register:function(id,factory){
    if(Object.prototype.hasOwnProperty.call(factories,id)) throw new Error('Duplicate GAS module: '+id);
    factories[id]=factory;
  },load:load});
}());`;
function assertBounded(name,source) {
  const count=source.split(/\r?\n/).length;
  if(count>maxLines) throw new Error(name+' exceeds '+maxLines+' lines: '+count);
  if(/^(?:\s*)import\s|^(?:\s*)export\s/m.test(source) && name.endsWith('.gs'))
    throw new Error('Untransformed ESM in GAS output: '+name);
  console.log(name+': '+count+' lines');
}
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
const seen=new Set();
for(const file of sources) {
  const src=readFileSync(file,'utf8'),name=outputName(file),id=logical(file);
  assertBounded(id,src);
  if(seen.has(name)) throw new Error('Filename collision: '+name);
  seen.add(name);
  const compiled=await transform(src,{
    loader:'js',format:'cjs',target:'es2020',sourcefile:id,
    minifySyntax:true,legalComments:'none'
  });
  let target=registryBootstrap+'\nP6VC_Runtime.register('+JSON.stringify(id)+',function(require,module,exports){\n'+compiled.code+'\n});\n';
  if(id===entryFile) for(const fn of entrypoints)
    target+='function '+fn+'(e) { return P6VC_Runtime.load('+JSON.stringify(id)+').'+fn+'(e); }\n';
  assertBounded(name,target);
  writeFileSync(join(out,name),target);
}
// JSON contract is its own GAS module (not copied into any other provider file).
const schema=JSON.parse(readFileSync(schemaFile,'utf8'));
const schemaId=logical(schemaFile),schemaOutput='SCHEMA$database.schema.gs';
const schemaCode=registryBootstrap+'\nP6VC_Runtime.register('+JSON.stringify(schemaId)+',function(require,module,exports){\nmodule.exports='+JSON.stringify(schema)+';\n});\n';
assertBounded(schemaOutput,schemaCode);
writeFileSync(join(out,schemaOutput),schemaCode);
copyFileSync(join(root,'appsscript.json'),join(out,'appsscript.json'));
const expected=[...seen,schemaOutput,'appsscript.json'].sort();
const actual=readdirSync(out).sort();
if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('Missing/unexpected GAS output files');
console.log('Layer-mirrored GAS output built: '+(expected.length-1)+' .gs modules + manifest; no deployment performed');
