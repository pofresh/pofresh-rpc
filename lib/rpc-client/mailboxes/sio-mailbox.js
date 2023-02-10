const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'ws-mailbox');
const constants = require('../../util/constants');
const client = require('socket.io-client');
const BaseMailbox = require('./base-mailbox');

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'ws-mailbox';
    }

    connect(tracer, cb) {
        this.tracer = tracer;
        this.cb = cb;
        tracer && tracer.info('client', __filename, 'connect', 'ws-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'ws-mailbox has already connected');
            cb(new Error('ws-mailbox has already connected.'));
            return;
        }
        this.socket = client('ws://' + this.host + ':' + this.port, {
            'force new connection': true,
            'reconnection': false
        });
        this.socket.on('message', this.onMessage.bind(this));

        this.socket.on('connect', this.onConnection.bind(this));

        this.socket.on('error', this.onError.bind(this));

        this.socket.on('disconnect', this.onClose.bind(this));

        this.socket.on('connect_error', this.onError.bind(this));
    }

    socketClose() {
        this.socket.disconnect();
    }

    sendMessage(pkg) {
        this.socket.send(pkg);
        console.log('send msg');
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