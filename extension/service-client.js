// Shared by the background modules. Each module keeps its own error messages and response checks.
(() => {
  const config = () => globalThis.SEI_ORGANIZADOR_CONFIG;
  // The fixed service address is validated in one place for every request to the shared API.
  globalThis.seiServiceFetch = async (path, { body, timeout = 10000 } = {}) => {
    const base = new URL(config().serviceUrl);
    if (base.username || base.password || base.search || base.hash) throw new Error('URL de serviço inválida');
    if (
      base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))
    )
      throw new Error('Serviço exige HTTPS');
    return fetch(new URL(`/v1/units/${config().unitId}/${path}`, base), {
      method: body ? 'POST' : 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  };
  // Short-lived answers of the shared API. Each SEI page load syncs the panel (twice, plus the alarm),
  // so a user navigating every few seconds sent ~37 requests/min; a read younger than `ttl` is reused.
  // Writes clear the entries they affect. Values are JSON answers, copied so callers never share an object.
  globalThis.seiFreshCache = (ttl) => {
    const entries = new Map();
    return {
      get(key) {
        const entry = entries.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.at >= ttl) {
          entries.delete(key);
          return undefined;
        }
        return JSON.parse(entry.json);
      },
      set(key, value) {
        if (entries.size >= 200) entries.delete(entries.keys().next().value);
        entries.set(key, { at: Date.now(), json: JSON.stringify(value) });
      },
      clear(prefix = '') {
        for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
      },
    };
  };
  // One queue per module: operations of the same module never interleave their storage reads/writes.
  globalThis.seiCreateQueue = () => {
    let queue = Promise.resolve();
    return (fn) => {
      const result = queue.then(fn);
      queue = result.catch(() => {});
      return result;
    };
  };
  globalThis.seiValidIdentity = (identity) =>
    identity?.unit === config().unitId &&
    identity.org === config().org &&
    typeof identity.login === 'string' &&
    !!identity.login.trim() &&
    identity.login.length <= 100;
})();
