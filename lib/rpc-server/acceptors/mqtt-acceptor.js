const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt-acceptor');
const MqttCon = require('mqtt-connection');
const BaseAcceptor = require('./base-acceptor');

let curId = 1;

class Acceptor extends BaseAcceptor {
    constructor(opts, cb) {
        opts.name = "mqtt-acceptor";
        super(opts, cb);
    }
    onConnection(stream) {
        const socket = MqttCon(stream);
        socket.id = curId++;
        this.sockets[socket.id] = socket;

        socket.on('connect', (pkg) => {
            // console.log('connected', stream);
            // this.emit('connection', {
            //     id: socket.id,
            //     ip: socket.handshake.address.address
            // });
        });

        socket.on('publish', (pkg) => {
            pkg = pkg.payload.toString();
            let isArray = false;
            try {
                pkg = JSON.parse(pkg);
                if (pkg instanceof Array) {
                    this.processMsgs(socket, pkg);
                    isArray = true;
                } else {
                    this.processMsg(socket, pkg);
                }
            } catch (err) {
                if (!isArray) {
                    this.send(socket, {
                        id: pkg.id,
                        resp: [this.cloneError(err)]
                    });
                }
                logger.error('process rpc message error %s', err.stack);
            }
        });

        socket.on('pingreq', () => {
            socket.pingresp();
        });

        socket.on('subscribe', function (packet) {
            // send a suback with messageId and granted QoS level
            // socket.suback({ granted: [packet.qos], messageId: packet.messageId });
        });

        socket.on('error', () => {
            this.onSocketClose(socket);
        });

        socket.on('close', () => {
            this.onSocketClose(socket);
        });

        socket.on('disconnect', (reason) => {
            this.onSocketClose(socket);
        });
    }

    send(socket, msg) {
        socket.publish({
            topic: 'rpc',
            payload: JSON.stringify(msg)
        });
    }
}

/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
module.exports.create = function (opts, cb) {
    return new Acceptor(opts || {}, cb);
};