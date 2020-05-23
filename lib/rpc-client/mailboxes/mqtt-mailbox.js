const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt-mailbox');
const constants = require('../../util/constants');
const Tracer = require('../../util/tracer');
const MqttCon = require('mqtt-connection');
const util = require('util');
const net = require('net');
const BaseMailbox = require('./base-mailbox');

const CONNECT_TIMEOUT = 2000;

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'mqtt-mailbox';
        this.keepalive = opts.keepalive || constants.DEFAULT_PARAM.KEEPALIVE;
        this.keepaliveTimer = null;
        this.lastPing = -1;
        this.lastPong = -1;
        this.serverId = '';
        if (opts.context) {
            this.serverId = opts.context.serverId || '';
        }
    }

    connect(tracer, cb) {
        super.connect(tracer, cb);
        tracer && tracer.info('client', __filename, 'connect', 'mqtt-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'mqtt-mailbox has already connected');
            return cb(new Error('mailbox has already connected.'));
        }

        try {
            let stream = net.createConnection(this.port, this.host);
            this.socket = MqttCon(stream);
        } catch (e) {
            this.onError(e);
        }

        this.connectTimeout = setTimeout(() => {
            this.connectTimeout = null;
            logger.error('mqtt-mailbox rpc client %s connect to remote server %s timeout', this.serverId, this.id);
            this.emit('close', this.id);
        }, CONNECT_TIMEOUT);

        this.socket.connect({
            clientId: 'MQTT_RPC_' + Date.now()
        }, this.onConnection.bind(this));

        this.socket.on('publish', (pkg) => {
            pkg = pkg.payload.toString();
            try {
                pkg = JSON.parse(pkg);
                super.onMessage(pkg);
            } catch (err) {
                logger.error('mqtt-mailbox rpc client %s process remote server %s message with error: %s', this.serverId, this.id, err.stack);
            }
        });

        this.socket.on('error', this.onError.bind(this));

        this.socket.on('pingresp', () => {
            this.lastPong = Date.now();
        });

        this.socket.on('close', this.onClose.bind(this));
    }

    socketClose() {
        this.socket.destroy();
    }

    sendMessage(pkg) {
        this.socket.publish({
            topic: 'rpc',
            payload: JSON.stringify(pkg)
        });
    }

    onConnection() {
        super.onConnection();
        if(this.connectTimeout){
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
        }
        this.keepaliveTimer = setInterval(() => {
            this.checkKeepAlive();
        }, this.keepalive);
    }

    checkKeepAlive() {
        if (this.closed) {
            return;
        }
        // console.log('checkKeepAlive lastPing %d lastPong %d ~~~', this.lastPing, this.lastPong);
        let now = Date.now();
        let KEEP_ALIVE_TIMEOUT = this.keepalive * 2;
        if (this.lastPing > 0) {
            if (this.lastPong < this.lastPing) {
                if (now - this.lastPing > KEEP_ALIVE_TIMEOUT) {
                    logger.error('mqtt-mailbox rpc client %s checkKeepAlive timeout from remote server %s for %d lastPing: %s lastPong: %s', this.serverId, this.id, KEEP_ALIVE_TIMEOUT, this.lastPing, this.lastPong);
                    this.emit('close', this.id);
                    this.lastPing = -1;
                    // this.close();
                }
            } else {
                this.socket.pingreq();
                this.lastPing = Date.now();
            }
        } else {
            this.socket.pingreq();
            this.lastPing = Date.now();
        }
    }

    // close() {
    //     if(this.connectTimeout){
    //         clearTimeout(this.connectTimeout);
    //         this.connectTimeout = null;
    //     }
    //
    //     if (this.keepaliveTimer) {
    //         clearInterval(this.keepaliveTimer);
    //         this.keepaliveTimer = null;
    //     }
    //
    //     if (!super.close()) {
    //         return;
    //     }
    //     return true;
    // }
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