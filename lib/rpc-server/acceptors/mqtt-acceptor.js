const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt-acceptor');
const Tracer = require('../../util/tracer');
const MqttCon = require('mqtt-connection');
const BaseAcceptor = require('./base-acceptor');

let curId = 1;

class Acceptor extends BaseAcceptor {
    onConnection(stream) {
        let socket = MqttCon(stream);
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

    close() {
        if (!!this.closed) {
            return;
        }
        this.closed = true;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        try {
            this.server.close();
            // process.exit(0);
        } catch (err) {
            logger.error('rpc server close error: %j', err.stack);
        }
        this.emit('closed');
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