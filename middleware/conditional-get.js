// koa-etag for calculating etag is usually put ahead in the middleware queue
module.exports = function * conditionalGet(next) {
    yield  * next;

    if (this.status === 200 && this.body && this.request.fresh) {
        this.response.status = 304;
        // if body == null, then koa will add status message automatically.
        this.response.body = '';  
        this.response.remove('Content-Type');
        this.response.remove('Content-Length');
        this.response.remove('Transfer-Encoding');
    }
};
