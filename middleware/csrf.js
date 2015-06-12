var scmp = require('scmp');
var crypto = require('crypto');
var escape = require('base64-url').escape;

function randomString(size = 16) {
    var buf;
    try {
        buf = crypto.randomBytes(size);
    } catch (e) {
        buf = crypto.pseudoRandomBytes(size);
    }
    return escape(buf.toString('base64'));
}

function verify(secret, token) {
    if (typeof secret !== 'string' || !secret.length) return false;
    if (typeof token !== 'string' || !token.length) return false;

    return scmp(secret, token);
}

exports.middleware = function * (next) {
    // ignore get, head, options
    if (~['GET', 'HEAD', 'OPTIONS', 'TRACE'].indexOf(this.method)) {
        yield * next;
        return;
    }

    assertCsrf.call(this);

    Object.defineProperty(this, 'csrf', {
        get: function() {
            if (this._csrf) return this._csrf;

            var secret = this.request.cookies.csrftoken;
            if (!secret || !/^[\w_-]+$/.test(secret)) secret = randomString(16);

            this._csrf = secret;

            this.response.cookie('csrftoken', secret, {
                maxAge: 86400 * 3
            });
        }
    });
    yield * next;
};

function assertCsrf () {
    var body = this.request.body;
    var secret = this.cookies.csrftoken;
    if (!secret) this.throw(403, 'invalid csrf token');

    var token = (body && body._csrf) || this.get('x-csrftoken');
    if (!verify(secret, token)) this.throw(403, 'invalid csrf token');
}
