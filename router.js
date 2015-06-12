var debug = require('debug')('koa-router');
var qs = require('querystring');
var compose = require('koa-compose');
var _ = require('lodash');

var methods = ['get', 'post', 'put', 'delete', 'head', 'patch', 'options'];
var VAR_RE = /^(?:\:(\w+)(?:\((.+)\))?(\?)?|\*(\w+))$/;

function splitPath(path) {
    var pieces = [];
    for (var bit of path.split('/')) {
        if (!bit) continue;
        var captures = bit.match(VAR_RE);
        if (captures) {
            pieces.push({
                name: captures[1] || captures[4],
                splat: !!captures[4],
                optional: captures[1] ? captures[3] === '?' : undefined,
                constraint: captures[1] ? captures[2] || '[^/]+' : undefined
            });
        } else {
            pieces.push(bit);
        }
    }
    if (!pieces.slice(0, -1).every(piece => piece.splat !== true && piece.optional !== true)) throw new Error('Only the last part of a path can be splat or optional.');
    return pieces;
}

function escapeRegExp(string) {
    return string.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
}

function pathRegExp(parts) {
    if (!parts.length) return '^/$';

    return '^' + parts.map(function(part) {
        if (typeof part === 'string') return '/' + escapeRegExp(part);
        if (part.splat) return '(?:/(.*))?';
        var regex = '/(' + part.constraint + ')';
        if (part.optional) regex = '(?:' + regex + ')?';
        return regex;
    }).join('') + '$';
}

function reverse(parts, params = {}) {
    if (typeof params === 'object') {
        let pieces = [];
        params = Object.assign({}, params);

        for (let part of parts) {
            if (typeof part === 'string') pieces.push(part);
            let value = params[part.name];
            if (value !== undefined)
                pieces.push(encodeURIComponent(value));
            else if (!part.optional) new Error();

            delete params[part.name];
        }
        let url = '/' + pieces.join('/');
        let keys = Object.keys(params);
        if (keys.length) url += '?' + qs.stringify(params);
        return url;
    } else {
        let i = 1,
            pieces = [];
        for (let part of parts) {
            if (typeof part === 'string') pieces.push(part);
            let value = arguments[i++];
            if (value !== undefined)
                pieces.push(encodeURIComponent(value));
            else if (!part.optional) new Error();
        }
        return '/' + pieces.join('/');
    }
}


class Router {
    constructor(prefix = '/') {
        this.prefix = prefix.replace(/\/$/, '');
        this.prefixRe = new RegExp('^' + this.prefix + '(?:/|$)');
        this.methods = methods;
        this.middleware = [];
        this.routes = [];
        this.paramFns = {};
    }

    use(paths, ...middleware) {
        if (typeof paths === 'function') {
            middleware = [...arguments];
            paths = [/^\//];
        } else if (!Array.isArray(paths)) {
            paths = [paths];
        }
        paths = paths.map(path => typeof path === 'string' ? new RegExp('^' + path + '(?:/|$)') : path);

        this.middleware.push([paths, middleware]);
    }

    match(method, path) {
        if (!this.prefixRe.test(path)) return [];

        for(var route of this.routes) {
            var captures = route.match(method, path);
            if (captures) return [route, captures];
        }
    }

    callback() {
        var router = this;

        return function * middleware(next) {
            var path = this.path,
                matched = router.match(this.method, path);
            if (!matched) return yield * next;

            var [route, captures] = matched;

            debug('dispatching %s %s', route.path, route.regexp);

            this.params = captures;
            this.route = route;

            var middleware = router.middleware.filter(([patterns, mw]) => patterns.some(pattern =>pattern.test(path)))
                .map(([prefix, mw]) => mw);

            var paramMw = function * paramMw(next) {
                for (var name of route.paramNames) {
                    if (name in router.paramFns) {
                        captures[name] = yield * router.paramFns[name].call(this, captures[name]);
                    }
                }
                yield * next;
            };

            var handlers = route.handlersForMethod(this.method);
            handlers = handlers.map(handler => function * (next) {
                yield * handler.apply(this, [this.request, this.response, next].slice(0, handler.length));
            });
            yield * compose(middleware.concat(paramMw, handlers)).call(this);
        };
    }

    getRoute(name) {
        if (!name) throw new Error('name is required.');

        for (var route of this.routes) {
            if (route.name === name) return route;
        }
    }

    route(name, path) {
        if (name && this.getRoute(name)) throw new Error(`route ${name} has already been defined.`);
        if (arguments.length === 1) {
            path = name;
            name = undefined;
        }

        if (!path.startsWith('/')) path = '/' + path;
        path = this.prefix + path;

        var route = new Route(name, path);
        this.routes.push(route);
        return route;
    }

    url(name, ...args) {
        var route = this.getRoute(name);
        if (!route) throw new Error(`no route found for name ${name}`);
        return route.url(...args);
    }

    param(name, fn) {
        this.paramFns[name] = fn;
        return this;
    }

    all(name, path, methods, ...handlers) {
        if (typeof methods !== 'string' && !Array.isArray(methods)) {
            handlers = [...arguments].slice(2);
            methods = path;
            path = name;
            name = undefined;
        } else {
            handlers = [...arguments].slice(3);
        }
        var route = this.route(name, path);
        route.all(methods, ...handlers);
    }
}

methods.forEach(method => {
    Router.prototype[method] = function(name, path, ...handlers) {
        var args = [...arguments];
        // if typeof path !== 'string', then name is missing.
        args.splice(typeof path === 'function' ? 1 : 2, 0, [method]);
        return this.all(...args);
    };
});


class Route {
    constructor(name, path) {
        this.name = name;
        this.handlers = [];
        this.path = path;
        this.parts = splitPath(path);
        this.regexp = new RegExp(pathRegExp(this.parts));
        this.paramNames = this.parts.filter(part => typeof part === 'object').map(part => part.name);
    }

    match(method, path) {
        var captures  = path.match(this.regexp);
        if (captures && this.handlers.some(([methods, handlers]) => !methods  || ~methods.indexOf(method))) {
            return _.object(this.paramNames, captures.slice(1));
        }
        return false;
    }

    // method must has been uppercased.
    handlersForMethod(method) {
        return _.flatten(this.handlers
            .filter(([methods, handlers]) => !methods || ~methods.indexOf(method))
            .map(([methods, handlers]) => handlers));
    }

    url() {
        return reverse(this.parts, ...arguments);
    }

    all(methods, ...handlers) {
        if (typeof methods === 'function') {
            handlers = [methods].concat(handlers);
            methods = null;
        } else {
            methods = methods.map(method => method.toUpperCase());
        }

        this.handlers.push([methods, handlers]);
        return this;
    }

}

methods.forEach(method => {
    Route.prototype[method] = function(...handlers) {
        return this.all([method], ...handlers);
    };
});

module.exports = exports = function(...args) {
    return new Router(...args);
};
exports.Router = Router;
exports.Route = Route;
exports.splitPath = splitPath;
exports.reverse = reverse;
exports.pathRegExp = pathRegExp;
