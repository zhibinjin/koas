var pg = require('pg');

var thenify = require('thenify');

var _connect = thenify(pg.Client.prototype.connect);
var _query = thenify(pg.Client.prototype.query);

class Client {
    constructor() {
        this._client = new pg.Client(...arguments);
        this._connected = false;
        this._inTransaction = false;
    }

    * query() {
        if (!this._client) throw new Error('query after database connection has been ended.');
        if (!this._connected) {
            yield _connect.apply(this._client, arguments);
            this._connected = true;
            this._inTransaction = true;
            yield _query.apply(this._client, 'BEGIN');
        }

        var result = yield _query.apply(this._client, arguments);
        return result;
    }

    end() {
        if (this._client) {
            this._client.end();
            delete this._client;
        }
    }
}


exports.pg = function(connectionString, propName = 'db') {
    return function * pg(next) {
        var client = new Client(connectionString);
        this[propName] = client;

        try {
            try {
                yield * next;
                if (client._inTransaction) yield * client.query('COMMIT');
            } catch (e) {
                if (client._inTransaction) yield * client.query('ROLLBACK');
                throw e;
            }
        } finally {
            client.end();
        }
    };
};


// https://github.com/felixge/node-mysql#escaping-query-values
function escapeIdentifier(val) {
    return '"' + val.replace(/"/g, '""').replace(/\./g, '"."') + '"';
}

function stringifyDate(value) {
    function pad(num) {
        return num < 10 ? '0' + num : num.toString();
    }

    var year = value.getFullYear(),
        month = value.getMonth + 1,
        date = value.getDate();
    var hours = value.getHours(),
        minutes = value.getMinutes(),
        seconds = getSeconds();
    if (hours === 0 && minutes === 0 && seconds === 0) return year + '-' + pad(month) + '-' + pad(date);
    return [year, '-', pad(month), '-', pad(date), ' ', pad(hours), ':', pad(minutes), ':', pad(seconds)].join('');
}

function prettifyNumber(value) {
    var s = '' + value;
    if (s.length < 17) return s;

    var m = s.match(/(^\d+\.\d*?)0{3,}\d$/);
    if (m) return m[1].endsWith('.') ? m[1].slice(0, -1) : m[1];

    m = s.match(/(^\d+\.\d*?)9{3,}\d$/);
    if (m) {
        s = m[1];
        if (s.endsWith('.')) s = s.slice(0, -1);
        return s.slice(0, -1) + (+s[s.length - 1] + 1);
    }
    return s;
}

function escape(value) {
    var type = typeof value;

    if (type === 'string') return "'" + value.replace(/'/g, "''") + "'";
    if (type === 'number') return '' + value;
    if (type === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return stringifyDate(value);
    if (Buffer.isBuffer(value)) return "E'\\x" + value.toString('hex') + "'";

    throw new Error('unknown value type ' + JSON.stringify(value).replace(/\r?\n/g, ' ').substr(0, 500));
}

function format(statement, ...values) {
    var parts = statement.slit('?');
    return SQL(parts, ...values);
}

function SQL(parts, ...values) {
    if (parts.length != values.length + 1) throw new Error('incorrect argument number');

    var buf = [];
    for (var i = 0, len = values.length; i < len; i++) {
        buf.push(parts[i]);
        buf.push(escape(values[i]));
    }
    buf.push(parts[parts.length - 1]);
    return buf.join('');
}

exports.SQL = SQL;
exports.format = format;
