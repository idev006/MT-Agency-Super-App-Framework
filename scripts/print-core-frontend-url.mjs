#!/usr/bin/env node
// One public browser endpoint, derived from the trusted-endpoints contract.
import {readFileSync} from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../apps/vehicle-contact/contracts/trusted-endpoints.v1.json', import.meta.url), 'utf8'));
const origin = contract.endpoints.find(item => item.id === 'cloud-run-core')?.url;
if (!origin || !/^https:\/\/[a-z0-9.-]+\.run\.app$/.test(origin)) throw new Error('CORE_ENDPOINT_NOT_CONFIGURED');
process.stdout.write(`${origin}/api/frontend\n`);
