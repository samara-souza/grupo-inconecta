import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
const url=process.env.TURSO_DATABASE_URL?.trim();
const authToken=process.env.TURSO_AUTH_TOKEN?.trim();
if(!url||!url.startsWith('libsql://'))throw new Error('Informe TURSO_DATABASE_URL=libsql://... no .env.');
if(!authToken)throw new Error('Informe TURSO_AUTH_TOKEN no .env.');
export default defineConfig({out:'./drizzle',schema:'./src/db/schema.js',dialect:'turso',dbCredentials:{url,authToken}});
