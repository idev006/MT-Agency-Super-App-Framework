import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=[
 'domain/ports/SchemaRepository.js',
 'api/dto/RequestValidator.js',
 'api/responses/ResponseFactory.js',
 'api/security/Policy.js',
 'api/groups/system/SystemGroup.js',
 'api/controllers/VehicleController.js',
 'api/routes/Router.js',
 'application/use-cases/VerifySchema.js',
 'infrastructure/persistence/sheets/SheetsSchemaRepository.js',
 'composition/Container.js',
 'entrypoints/WebApp.js'
];
const body=source.map(p=>'// '+p+'\n'+readFileSync(join(root,'src',p),'utf8')).join('\n');
mkdirSync(join(root,'dist'),{recursive:true});
writeFileSync(join(root,'dist','Code.gs'),body);
writeFileSync(join(root,'dist','appsscript.json'),readFileSync(join(root,'appsscript.json')));
console.log('GAS build produced dist/Code.gs and manifest; deployment is not performed');
