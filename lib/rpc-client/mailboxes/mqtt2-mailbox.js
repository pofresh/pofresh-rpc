const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt2-mailbox');
const Constants = require('../../util/constants');
const MqttCon = require('mqtt-connection');
const Coder = require('../../util/coder');
const net = require('net');
const BaseMailbox = require('base-mailbox');

const CONNECT_TIMEOUT = 2000;

class MailBox extends BaseMailbox {
    constructor(server, opts) {
        super(server, opts);
        this.name = 'mqtt2-mailbox';
        this.curId = 0;
        this.servicesMap = {};
        this.keepalive = opts.keepalive || Constants.DEFAULT_PARAM.KEEPALIVE;
        this.keepaliveTimer = null;
        this.lastPing = -1;
        this.lastPong = -1;
        this.serverId = '';
        if (opts.context) {
            this.serverId = opts.context.serverId || '';
        }
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

    connect(tracer, cb) {
        super.connect(tracer, cb);
        tracer && tracer.info('client', __filename, 'connect', 'mqtt2-mailbox try to connect');
        if (this.connected) {
            tracer && tracer.error('client', __filename, 'connect', 'mqtt2-mailbox has already connected');
            return cb(new Error('mqtt2-mailbox has already connected.'));
        }

        let stream = net.createConnection(this.port, this.host);
        this.socket = MqttCon(stream);

        this.socket.connect({
            clientId: 'MQTT_RPC_' + Date.now()
        }, this.onConnection.bind(this));

        this.socket.on('publish', (pkg) => {
            if (pkg.topic === Constants.TOPIC_HANDSHAKE) {
                this.servicesMap = JSON.parse(pkg.payload.toString());
                return cb();
            }
            try {
                pkg = Coder.decodeClient(pkg.payload);
                this.processMsg(pkg);
            } catch (err) {
                logger.error('mqtt2-mailbox rpc client %s process remote server %s message with error: %s', self.serverId, self.id, err.stack);
            }
        });

        this.socket.on('error', this.onError.bind(this));

        this.socket.on('pingresp', () => {
            this.lastPong = Date.now();
        });

        this.socket.on('disconnect', this.onClose.bind(this));
    }

    /**
     * close mailbox
     */
    close() {
        super.close();
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }

    /**
     * send message to remote server
     *
     * @param msg {service:"", method:"", args:[]}
     * @param opts {} attach info to send method
     * @param cb declaration decided by remote interface
     */
    send(tracer, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'send', 'mqtt2-mailbox try to send');
        if (!this.connected) {
            tracer && tracer.error('client', __filename, 'send', 'mqtt2-mailbox not init');
            cb(tracer, new Error(this.serverId + ' mqtt2-mailbox is not init ' + this.id));
            return;
        }

        if (this.closed) {
            tracer && tracer.error('client', __filename, 'send', 'mailbox has already closed');
            cb(tracer, new Error(this.serverId + ' mqtt2-mailbox has already closed ' + this.id));
            return;
        }

        let id = this.curId++;
        this.requests[id] = cb;
        this.setCbTimeout(id, tracer, cb);

        let pkg;
        if (tracer && tracer.isEnabled) {
            pkg = {
                traceId: tracer.id,
                seqId: tracer.seq,
                source: tracer.source,
                remote: tracer.remote,
                id: id,
                msg: msg
            };
        } else {
            pkg = Coder.encodeClient(id, msg, this.servicesMap);
        }
        if (this.bufferMsg) {
            this.queue.push(pkg);
        } else {
            this.sendMessage(pkg);
        }
    }

    checkKeepAlive() {
        if (this.closed) {
            return;
        }

        let now = Date.now();
        let KEEP_ALIVE_TIMEOUT = this.keepalive * 2;
        if (this.lastPing > 0) {
            if (this.lastPong < this.lastPing) {
                if (now - this.lastPing > KEEP_ALIVE_TIMEOUT) {
                    logger.error('mqtt2-mailbox rpc client %s checkKeepAlive timeout from remote server %s for %d lastPing: %s lastPong: %s', this.serverId, this.id, KEEP_ALIVE_TIMEOUT, this.lastPing, this.lastPong);
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

    onConnection() {
        super.onConnection();
        this.keepaliveTimer = setInterval(() => {
            this.checkKeepAlive();
        }, this.keepalive);
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