/**
 * Cache pequeno e temporário APENAS para leituras compartilhadas e autorizadas.
 * Não armazenar aqui sessões, senhas, nem dados de uma cobrança individual.
 * Cada instância do Render mantém seu próprio cache; TTL limita divergências.
 */
const MAX_ENTRIES = 48;
const cache = new Map();
let generation = 0;
const metrics = {hits:0,misses:0,invalidations:0};

export async function cachedRead(key,ttlMs,loader){
  const now=Date.now();const existing=cache.get(key);
  if(existing && existing.expires>now){metrics.hits++;return existing.promise;}
  metrics.misses++;
  const version=generation;
  const promise=Promise.resolve().then(loader);
  cache.delete(key);
  cache.set(key,{expires:now+ttlMs,promise});
  try{
    const result=await promise;
    if(generation!==version){if(cache.get(key)?.promise===promise)cache.delete(key);}
    else if(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);
    return result;
  }catch(error){if(cache.get(key)?.promise===promise)cache.delete(key);throw error;}
}
export function invalidateReadCache(){generation++;cache.clear();metrics.invalidations++;}
export function cacheMetrics(){return {...metrics,entries:cache.size};}
