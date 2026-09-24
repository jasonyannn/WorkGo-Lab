// Prepare local persistent storage before serving the app. Hosted migrations are
// applied by Sites during publication; this helper never touches remote data.
import './sites-env.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const hosting=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(hosting.d1){
 mkdirSync('.sites-runtime',{recursive:true});
 const config=resolve('.sites-runtime/local-migrations.json');
 writeFileSync(config,JSON.stringify({name:'sango-local-migrations',compatibility_date:'2026-09-01',d1_databases:[{binding:hosting.d1,database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:resolve('drizzle')}]}));
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply',hosting.d1,'--local','--persist-to',resolve('.wrangler/state'),'--config',config],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
