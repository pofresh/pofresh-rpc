const utils = require('../../util/utils');
const wsClient = require('ws');
const BaseMailbox = require('./base-mailbox');

const KEEP_ALIVE_TIMEOUT = 10 * 1000;
const KEEP_ALIVE_INTERVAL = 30 * 1000;

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'ws2-mailbox';
        this._KPinterval = null;
        this._KP_last_ping_time = -1;
        this._KP_last_pong_time = -1;
    }

    connect(tracer, cb) {
        super.connect(tracer, cb);
        tracer && tracer.info('client', __filename, 'connect', 'ws2-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'ws2-mailbox has already connected');
            cb(new Error('ws2-mailbox has already connected.'));
            return;
        }

        this.socket = new wsClient('ws://' + this.host + ':' + this.port);
        //this.socket = wsClient.connect(this.host + ':' + this.port, {'force new connection': true, 'reconnect': false});

        this.socket.on('message', this.onMessage.bind(this));

        this.socket.on('open', this.onConnection.bind(this));

        this.socket.on('error', this.onError.bind(this));

        this.socket.on('close', this.onClose.bind(this));
        //  this.socket.on('ping', function (data, flags) {
        //  });
        this.socket.on('pong', (data, flags) => {
            this._KP_last_pong_time = Date.now();
        });

    }

    onConnection() {
        if (this.connected) {
            //ignore reconnect
            return;
        }

        super.onConnection();

        this._KPinterval = setInterval(() => {
            this.checkKeepAlive(this);
        }, KEEP_ALIVE_INTERVAL);

    }

    onMessage(pkg) {
        try {
            // console.log("ws rpc client received message = " + data);
            let msg = pkg;

            msg = JSON.parse(msg);

            if (msg.body instanceof Array) {
                this.processMsgs(msg.body);
            } else {
                this.processMsg(msg.body);
            }
        } catch (e) {
            console.error('ws2-mailbox rpc client process message with error: %j', e.stack);
        }
    }

    onError(err) {
        utils.invokeCallback(this.cb, err);
        this.close();
    }

    onClose(code, message) {
        var reqs = this.requests,
            cb;
        for (var id in reqs) {
            cb = reqs[id];
            utils.invokeCallback(cb, new Error('ws2-mailbox disconnect with remote server.'));
        }
        this.emit('close', this.id);
        this.close();
    }

    checkKeepAlive() {
        if (this.closed) {
            return;
        }
        var now = Date.now();
        if (this._KP_last_ping_time > 0) {
            if (this._KP_last_pong_time < this._KP_last_ping_time) {
                if (now - this._KP_last_ping_time > KEEP_ALIVE_TIMEOUT) {
                    console.error('ws2-mailbox rpc client checkKeepAlive error because > KEEP_ALIVE_TIMEOUT');
                    this.close();
                    return;
                } else {
                    return;
                }
            }
            if (this._KP_last_pong_time >= this._KP_last_ping_time) {
                this.socket.ping();
                this._KP_last_ping_time = Date.now();
                return;
            }
        } else {
            this.socket.ping();
            this._KP_last_ping_time = Date.now();
        }
    }

    /**
     * close mailbox
     */
    close() {
        super.close();
        if (this.closed) {
            return;
        }
        if (this._KPinterval) {
            clearInterval(this._KPinterval);
            this._KPinterval = null;
        }
        this.socket.close();
        this._KP_last_ping_time = -1;
        this._KP_last_pong_time = -1;
    }

    sendMessage(dataObj) {
        let str = JSON.stringify({
            body: dataObj
        });
        this.socket.send(str);
    }
}


/**
 * Factory method to create mailbox
 *
 * @param {Object} server remote server info {id:"", host:"", port:""}
 * @param {Object} opts construct parameters
 *                      opts.bufferMsg {Boolean} msg should be buffered or send immediately.
 *                      opts.interval {Boolean} msg queue flush interval if bufferMsg is true. default is 50 ms
 */
module.exports.create = function (server, opts) {
    return new MailBox(server, opts || {});
};