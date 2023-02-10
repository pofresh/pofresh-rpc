const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt2-acceptor');
const Constant = require('../../util/constants');
const Tracer = require('../../util/tracer');
const utils = require('../../util/utils');
const Coder = require('../../util/coder');
const MqttCon = require('mqtt-connection');
const BaseAcceptor = require('./base-acceptor');

let curId = 1;

class Acceptor extends BaseAcceptor {
    constructor(opts, cb) {
        opts.name = "mqtt2-acceptor";
        super(opts, cb);
        this.services = opts.services;
        this.servicesMap = {};
    }

    onConnection(socket) {
        this.server.on('connection', function (stream) {
            const socket = MqttCon(stream);
            socket.id = curId++;

            socket.on('connect', (pkg) => {
                sendHandshake(socket, this);
            });

            socket.on('publish', (pkg) => {
                pkg = Coder.decodeServer(pkg.payload, this.servicesMap);
                try {
                    this.processMsg(socket, pkg);
                } catch (err) {
                    const resp = Coder.encodeServer(pkg.id, [this.cloneError(err)]);
                    // doSend(socket, resp);
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

            this.sockets[socket.id] = socket;

            socket.on('disconnect', (reason) => {
                this.onSocketClose(socket);
            });
        });
    }

    send(socket, msg) {
        socket.publish({
            topic: Constant.TOPIC_RPC,
            payload: msg
            // payload: JSON.stringify(msg)
        });
    }

    processMsg(socket, pkg) {
        let tracer = null;
        if (this.rpcDebugLog) {
            tracer = new Tracer(this.rpcLogger, this.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.traceId, pkg.seqId);
            tracer.info('server', __filename, 'processMsg', this.name + ' receive message and try to process message');
        }
        this.cb(tracer, pkg.msg, function () {
            // var args = Array.prototype.slice.call(arguments, 0);
            var len = arguments.length;
            var args = new Array(len);
            for (var i = 0; i < len; i++) {
                args[i] = arguments[i];
            }

            var errorArg = args[0]; // first callback argument can be error object, the others are message
            if (errorArg && errorArg instanceof Error) {
                args[0] = this.cloneError(errorArg);
            }

            var resp;
            if (tracer && tracer.isEnabled) {
                resp = {
                    traceId: tracer.id,
                    seqId: tracer.seq,
                    source: tracer.source,
                    id: pkg.id,
                    resp: args
                };
            } else {
                resp = Coder.encodeServer(pkg.id, args);
            }
            if (this.bufferMsg) {
                this.enqueue(socket, resp);
            } else {
                this.send(socket, resp);
            }
        });
    }
}

function doSendHandshake(socket, msg) {
    socket.publish({
        topic: Constant.TOPIC_HANDSHAKE,
        payload: msg
        // payload: JSON.stringify(msg)
    });
}

function sendHandshake(socket, acceptor) {
    var servicesMap = utils.genServicesMap(acceptor.services);
    acceptor.servicesMap = servicesMap;
    doSendHandshake(socket, JSON.stringify(servicesMap));
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