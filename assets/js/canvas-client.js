/* File: assets/js/canvas-client.js
 * READ ONLY Canvas data access. Two interchangeable backends:
 *   - ProxyClient: calls the local proxy (proxy/server.js), which adds the token.
 *   - DemoClient:  returns fictional data from demo-data.js.
 * The browser never sees or sends a Canvas token.
 */
(function () {
  class CanvasError extends Error {
    constructor(message, status, detail) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  }

  class ProxyClient {
    constructor(baseUrl) {
      this.base = baseUrl.replace(/\/+$/, '');
      this.mode = 'proxy';
    }

    // Generic GET. `all` asks the proxy to follow Canvas pagination.
    async get(path, params = {}, all = false) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
      }
      if (all) qs.set('all', '1');
      const url = `${this.base}${path}${qs.toString() ? '?' + qs : ''}`;
      let res;
      try {
        res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      } catch (e) {
        throw new CanvasError('Could not reach the local proxy. Is it running? (node proxy/server.js)', 0, String(e));
      }
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) {
        const msg = body?.hint || body?.error || `Request failed (HTTP ${res.status})`;
        throw new CanvasError(msg, res.status, body);
      }
      return body;
    }

    health() { return this.get('/health'); }
    self() { return this.get('/api/v1/users/self'); }
    courses() {
      return this.get('/api/v1/courses', { enrollment_state: 'active', per_page: 100, 'include[]': ['term'] }, true);
    }
    course(id) { return this.get(`/api/v1/courses/${id}`, { 'include[]': ['term'] }); }
    modules(id) { return this.get(`/api/v1/courses/${id}/modules`, { 'include[]': ['items'], per_page: 100 }, true); }
    // Canvas omits `items` from include[]=items when a module is very large; fetch them separately.
    moduleItems(id, moduleId) { return this.get(`/api/v1/courses/${id}/modules/${moduleId}/items`, { per_page: 100 }, true); }
    pages(id) { return this.get(`/api/v1/courses/${id}/pages`, { per_page: 100, sort: 'title' }, true); }
    page(id, url) { return this.get(`/api/v1/courses/${id}/pages/${encodeURIComponent(url)}`); }
    assignments(id) { return this.get(`/api/v1/courses/${id}/assignments`, { per_page: 100, order_by: 'due_at' }, true); }
    discussions(id) { return this.get(`/api/v1/courses/${id}/discussion_topics`, { per_page: 100 }, true); }
    quizzes(id) { return this.get(`/api/v1/courses/${id}/quizzes`, { per_page: 100 }, true); }
    files(id) { return this.get(`/api/v1/courses/${id}/files`, { per_page: 100, sort: 'name' }, true); }
  }

  class DemoClient {
    constructor(data) { this.d = data; this.mode = 'demo'; }
    async _(v) { await new Promise((r) => setTimeout(r, 120)); return structuredClone(v); }
    _c(id) {
      const c = this.d.byCourse[id];
      if (!c) throw new CanvasError('Course not found in demo data', 404);
      return c;
    }
    health() { return this._({ ok: true, mode: 'demo' }); }
    self() { return this._(this.d.self); }
    courses() { return this._(this.d.courses); }
    course(id) { return this._(this.d.courses.find((c) => c.id === Number(id))); }
    modules(id) { return this._(this._c(id).modules); }
    moduleItems(id, moduleId) { return this._(this._c(id).modules.find((m) => m.id === Number(moduleId))?.items || []); }
    pages(id) { return this._(this._c(id).pages.map(({ body, ...rest }) => rest)); }
    page(id, url) {
      const p = this._c(id).pages.find((x) => x.url === url);
      if (!p) throw new CanvasError('Page not found', 404);
      return this._(p);
    }
    assignments(id) { return this._(this._c(id).assignments); }
    discussions(id) { return this._(this._c(id).discussions); }
    quizzes(id) { return this._(this._c(id).quizzes); }
    files(id) { return this._(this._c(id).files); }
  }

  window.CCC_Canvas = { ProxyClient, DemoClient, CanvasError };
})();
