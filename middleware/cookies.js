var {
    parse, serialize
} = require('cookie');

var {
    sign, unsign
} = require('cookie-signature');

exports = module.exports = function initialize(app) {
    app.response.cookie = function setCookie(name, value, opts) {
        opts = Object.assign({
            path: '/'
        }, opts);

        if (opts.maxAge != null && !opts.expires) {
            var expires = new Date();
            expires.setSeconds(expires.getSeconds() + opts.maxAge);
            opts.expires = expires;
        }
        this._cookies[name] = [value, opts];
    };

    app.response.clearCookie = function clearCookie(name, options) {
        this.cookie(name, '', Object.assign({
            expires: new Date(0)
        }, options));
    };

    return function * middleware(next) {
        this.request.cookies = parse(this.get('cookie') || '');
        var responseCookies = this.response._cookies = {};

        yield * next;

        if (!Object.keys(responseCookies).length) return;

        var res = this.res;
        if (res.headersSent || !this.writable)
            throw new Error('Can\'t set cookies after headers are sent.');

        for (var name in responseCookies) {
            var cookie = responseCookies[name];
            this.response.append("Set-Cookie", serialize(name, cookie[0], cookie[1]));
        }
    };
};


// @param spec: {name: [secret, maxAge]}
exports.signedCookies = function(app, spec={}) {
    app.response.signedCookie = function signedCookie(name, value, opts) {
        if (!(name in spec)) throw new Error(`unknown signed cookie name ${name}.`);
        var [secret, maxAge] = spec[name];
        value = sign(value + '.' + Date.now(), secret);
        this.cookie(name, value, opts);
    };

    return function * middleware(next) {
        var cookies = this.request.cookies,
            signedCookies = this.request.signedCookies = {};

        for (var name in spec) {
            if (name in cookies) {
                var [secret, maxAge] = spec[name];
                var val = unsign(cookies[name], secret);
                delete cookies[name];
                if (val) {
                    var len = val.lastIndexOf('.');
                    if (~len) {
                        var ts = +val.slice(len + 1);
                        if (Date.now() - ts < maxAge)
                            signedCookies[name] = val.slice(0, len);
                    }
                }
            }
        }

        yield * next;
    };
};
