// Process entry for the p6vc-core container (VC-ADR-046). Config comes only from the environment.
import http from 'node:http';
import {createCoreHandler} from './server.mjs';

const port = Number(process.env.PORT || 8080);
http.createServer(createCoreHandler()).listen(port, () => console.log(JSON.stringify({event: 'listening', service: 'p6vc-core', port})));
