/* The build bundles this module and the shared simulation. */
const service = require('../server/service.cjs');
module.exports = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return service.handle(request, env);
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response('Static asset binding is unavailable', {status:503});
  }
};
