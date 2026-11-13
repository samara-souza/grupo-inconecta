import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedRead,invalidateReadCache,cacheMetrics} from '../src/lib/readCache.js';

test('cache compartilha apenas uma consulta entre 100 acessos simultâneos',async()=>{
 invalidateReadCache();let calls=0;
 const loader=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return [{empresa:'Teste'}];};
 const responses=await Promise.all(Array.from({length:100},()=>cachedRead('diretorio:test',10000,loader)));
 assert.equal(calls,1);assert.equal(responses.length,100);
 assert.equal(cacheMetrics().entries,1);
});

test('gravação invalida leitura imediatamente, inclusive consulta ainda pendente',async()=>{
 invalidateReadCache();let done;
 const slow=cachedRead('key',60000,()=>new Promise(resolve=>{done=resolve;}));
 await new Promise(resolve=>setImmediate(resolve));
 invalidateReadCache();
 const fresh=await cachedRead('key',60000,async()=>2);
 done(1);assert.equal(await slow,1);assert.equal(fresh,2);
 assert.equal(await cachedRead('key',60000,async()=>3),2);
});

test('expiração e falha não deixam uma entrada envenenada',async()=>{
 invalidateReadCache();let n=0;
 await assert.rejects(()=>cachedRead('fail',60000,async()=>{throw Error('temporário');}),/temporário/);
 assert.equal(await cachedRead('fail',60000,async()=>4),4);
 assert.equal(await cachedRead('expire',1,async()=>++n),1);
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(await cachedRead('expire',1,async()=>++n),2);
});
