import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
function run(args){const result=spawnSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1)}
const configPath=new URL('../wrangler.jsonc',import.meta.url);
const config=JSON.parse(readFileSync(configPath,'utf8'));
console.log('Настройка Лидофлоу. Платный тариф и домен не требуются.');
run(['login']);
if(config.d1_databases[0].database_id==='REPLACE_WITH_D1_DATABASE_ID'){
 console.log('Создаём базу leadflow-db. Если она уже есть, используйте её ID.');
 // Creation may report an existing database; continue to prompt for its ID.
 spawnSync(process.execPath,[cli,'d1','create','leadflow-db'],{cwd:root,stdio:'inherit'});
 const readline=createInterface({input:process.stdin,output:process.stdout});
 const id=(await readline.question('Вставьте database_id базы из вывода выше: ')).trim();readline.close();
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Нужен UUID базы D1. Повторите npm run setup.');
 config.d1_databases[0].database_id=id;writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
}
run(['d1','migrations','apply','DB','--remote']);
console.log('Задайте уникальный пароль CRM от 16 символов. Ввод скрыт; сохраните пароль в менеджере паролей.');
run(['secret','put','CRM_PASSWORD']);
console.log('Настройка завершена. Запустите npm run deploy — адрес CRM будет в выводе.');
