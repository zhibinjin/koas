var request = require('supertest');
var koa = require('koa');
var assert = require('assert');
var router = require('../router');
var {
    splitPath, pathRegExp, reverse, Router, Route
} = router;


describe('basic functions', function() {
    describe('splitPath', function() {
        it('parse optional', function() {
            assert.deepEqual(splitPath('/a/:b/:c(\\d+)?'), ['a', {
                name: 'b',
                splat: false,
                optional: false,
                constraint: '[^/]+'
            }, {
                name: 'c',
                splat: false,
                optional: true,
                constraint: '\\d+'
            }]);
        });

        it('parse splat', function() {
            assert.deepEqual(splitPath('/a/:b/*c'), ['a', {
                name: 'b',
                splat: false,
                optional: false,
                constraint: '[^/]+'
            }, {
                name: 'c',
                splat: true,
                optional: undefined,
                constraint: undefined
            }]);
        });
    });

    describe('pathRegExp', function() {
        it('/', function() {
            assert.equal(pathRegExp(splitPath('/')), '^/$');
        });
        it('optional', function() {
            assert.equal(pathRegExp(splitPath('/a/:b/:c(\\d+)?')), '^/a/([^/]+)(?:/(\\d+))?$');
        });
        it('splat', function() {
            assert.equal(pathRegExp(splitPath('/a/:b/*c')), '^/a/([^/]+)(?:/(.*))?$');
        });
    });

    describe('reverse', function() {
        it('missing optional param', function() {
            assert.equal(reverse(splitPath('/a/:b/:c?'), {
                b: 'x',
                d: 'y'
            }), '/a/x?d=y');
        });
        it('splat', function() {
            assert.equal(reverse(splitPath('/a/:b/*c'), {
                b: 'x',
                c: 'y'
            }), '/a/x/y');
        });
        it('params should be encoded', function() {
            assert.equal(reverse(splitPath('/a/:b/*c'), {
                b: 'b 1',
                d: '&'
            }), '/a/b%201?d=%26');
        });
    });

});

var app = koa();
var _router = new Router('/');
app.use(_router.callback());
_router.route('/users/:id').get(function * () {
    this.body = this.params.id;
});
_router.route('/posts/:id?').get(function * (req, res, next) {
    this.body = '' + this.params.id;
    yield * next;
},function *() {
    this.body = this.body + ' end'
});

describe('Router', function(){
    describe('non-optional', function() {
        it('GET /users/1', function(done) {
            request(app.listen())
                .get('/users/1')
                .expect(200)
                .expect('1', done);
        });
    });
    describe('optional', function() {
        it('GET /posts', function(done) {
            request(app.listen())
                .get('/posts')
                .expect(200)
                .expect('undefined end', done);
        });
    });
});
