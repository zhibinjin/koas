var request = require('supertest');
var koa = require('koa');
var assert = require('assert');

describe('cookies middleware', function() {
    var app = koa();
    
    app.use(require('../middleware/cookies')(app));
    app.use(require('../middleware/cookies').signedCookies(app, {b:['aaa', 100000]}));

    app.use(function * (next) {
        var path = this.request.path;
        this.status = 200;
        if (path === '/')
            this.response.cookie('a', '0');
        else if(path === '/return')
            this.response.body = this.request.cookies.a;
        else if (path ==='/signed')
            this.response.signedCookie('b', '100');
        else {
            this.response.body = this.request.signedCookies.b;
        }
    });

    var agent = request.agent(app.listen());

    it('should save cookies', function(done) {
        agent
            .get('/')
            .expect('set-cookie', 'a=0; Path=/', done);
    });
    it('should send cookies', function(done) {
        agent
            .get('/return')
            .expect('0', done);
    });
    it('should sign cookies', function(done) {
        agent
        .get('/signed')
        .end(function(err, res) {
            if (err) throw err;
            console.log(res.header);
            assert.ok(res.header['set-cookie'][0].match(/^b\=100\.\d+\.\w+/));
            done();
        });
    //    .expect('set-cookie', 'b', done);
    });
    it('should parse signed cookie correctly', function(done) {
        agent
        .get('/signed/return')
        .expect('100',done);
    });
});
