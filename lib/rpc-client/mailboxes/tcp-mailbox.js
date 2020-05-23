const Tracer = require('../../util/tracer');
const utils = require('../../util/utils');
const Composer = require('stream-pkg');
const net = require('net');
const BaseMailbox = require('./base-mailbox');

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'tcp-mailbox';
        this.composer = new Composer({
            maxLength: opts.pkgSize
        });
    }

    connect(tracer, cb) {
        super.connect(tracer, cb);
        tracer.info('client', __filename, 'connect', 'tcp-mailbox try to connect');
        if (this.connected) {
            utils.invokeCallback(cb, new Error('tcp-mailbox has already connected.'));
            return;
        }

        try{
            this.socket = net.connect({
                port: this.port,
                host: this.host
            }, this.onConnection.bind(this));
        }catch (e) {
            this.onError(e);
        }

        this.composer.on('data', (data) => {
            var pkg = JSON.parse(data.toString());
            super.onMessage(pkg);
        });

        this.socket.on('data', (data) => {
            this.composer.feed(data);
        });

        this.socket.on('error', this.onError.bind(this));

        this.socket.on('end', this.onClose.bind(this));

        // TODO: reconnect and heartbeat
    }


    sendMessage(pkg) {
        this.socket.write(this.composer.compose(JSON.stringify(pkg)));
    }

    socketClose() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
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