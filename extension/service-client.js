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
