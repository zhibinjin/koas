var send = require('koa-send');

// static handler
function *serve(next) {
    if (this.method !== 'HEAD' && this.method !== 'GET') return;
    yield send(this, this.path, opts)
}
