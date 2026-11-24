// Cloud Run entrypoint (VC-ADR-033). Config comes only from the environment; see runtime.mjs.
import http from 'node:http';
import {createCloudRunApplication} from './runtime.mjs';
import {createApiHandler} from './http-handler.mjs';

const application = createCloudRunApplication();
const port = Number(process.env.PORT || 8080);
http.createServer(createApiHandler(application)).listen(port, () => console.log(JSON.stringify({event: 'listening', port})));
