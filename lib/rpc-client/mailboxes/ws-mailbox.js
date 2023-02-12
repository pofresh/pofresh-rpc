const utils = require('../../util/utils');
const WSClient = require('ws').WebSocket;
const BaseMailbox = require('./base-mailbox');

const KEEP_ALIVE_TIMEOUT = 10 * 1000;
const KEEP_ALIVE_INTERVAL = 30 * 1000;

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'ws-mailbox';
        this._KPinterval = null;
        this._KP_last_ping_time = -1;
        this._KP_last_pong_time = -1;
    }

    connect(tracer, cb) {
        super.connect(tracer, cb);
        tracer && tracer.info('client', __filename, 'connect', 'ws-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'ws-mailbox has already connected');
            cb(new Error('ws-mailbox has already connected.'));
            return;
        }

        try {
            this.socket = new WSClient('ws://' + this.host + ':' + this.port);
            //this.socket = wsClient.connect(this.host + ':' + this.port, {'force new connection': true, 'reconnect': false});
        } catch (e) {
            this.onError(e);
        }

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
        const msg = JSON.parse(pkg);
        super.onMessage(msg.body);
    }

    onError(err) {
        utils.invokeCallback(this.cb, err);
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
                    console.error('ws-mailbox rpc client checkKeepAlive error because > KEEP_ALIVE_TIMEOUT');
                    this.close();
                    return;
                } else {
                    return;
                }
            }
            if (this._KP_last_pong_time >= this._KP_last_ping_time) {
                this.socket.ping();
                this._KP_last_ping_time = Date.now();
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
        if (this.closed) {
            return;
        }

        super.close();
        if (this._KPinterval) {
            clearInterval(this._KPinterval);
            this._KPinterval = null;
        }
        this.socket.close();
        this._KP_last_ping_time = -1;
        this._KP_last_pong_time = -1;
    }

    sendMessage(dataObj) {
        let str = JSON.stringify({body: dataObj});
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