const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'mqtt-acceptor');
const EventEmitter = require('events');
const Tracer = require('../../util/tracer');
const net = require('net');

class Acceptor extends EventEmitter {
    constructor(opts, cb) {
        super();
        opts = opts || {};
        this.name = opts.name || 'acceptor';
        this.server = null;
        this.opts = opts;
        this.interval = opts.interval; // flush interval in ms
        this.bufferMsg = opts.bufferMsg;
        this.rpcLogger = opts.rpcLogger;
        this.rpcDebugLog = opts.rpcDebugLog;
        this.whitelist = opts.whitelist;
        this._interval = null; // interval object
        this.sockets = {};
        this.msgQueues = {};
        this.cb = cb;
    }

    listen(port) {
        //check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'));
            return;
        }
        this.inited = true;

        if (!this.server) {
            if (this.opts.createServer) {
                this.server = this.opts.createServer(port);
            } else {
                this.server = new net.Server();
            }
        }

        this.on('connection', this.ipFilter.bind(this));

        this.server.on('error', this.onError.bind(this));

        this.server.on('connection', this.onConnection.bind(this));

        if (typeof this.server.listen === "function") {
            this.server.listen(port);
        }

        if (this.bufferMsg) {
            this._interval = setInterval(() => {
                this.flush(this);
            }, this.interval);
        }
    }

    onConnection(socket) {

    }

    onError(err) {
        logger.error('rpc server is error: %j', err.stack);
        this.emit('error', err);
    }

    onSocketClose(socket) {
        if (!socket.closed) {
            const id = socket.id;
            socket.closed = true;
            delete this.sockets[id];
            delete this.msgQueues[id];
        }
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
        } catch (err) {
            logger.error('rpc server close error: %j', err.stack);
        }
        this.emit('closed');
    }

    ipFilter(obj) {
        if (typeof this.whitelist !== 'function') {
            return;
        }
        this.whitelist((err, tmpList) => {
            if (err) {
                logger.error('%j.(RPC whitelist).', err);
                return;
            }
            if (!Array.isArray(tmpList)) {
                logger.error('%j is not an array.(RPC whitelist).', tmpList);
                return;
            }
            if (obj && obj.ip && obj.id) {
                for (let i in tmpList) {
                    const exp = new RegExp(tmpList[i]);
                    if (exp.test(obj.ip)) {
                        return;
                    }
                }
                const sock = this.sockets[obj.id];
                if (sock) {
                    sock.disconnect('unauthorized');
                    logger.warn('%s is rejected(RPC whitelist).', obj.ip);
                }
            }
        });
    }

    processMsg(socket, pkg) {
        let tracer = null;
        if (this.rpcDebugLog) {
            tracer = new Tracer(this.rpcLogger, this.rpcDebugLog, pkg.remote, pkg.source, pkg.msg, pkg.traceId, pkg.seqId);
            tracer.info('server', __filename, 'processMsg', this.name + ' receive message and try to process message');
        }
        let self = this;
        this.cb(tracer, pkg.msg, function () {
            const args = Array.prototype.slice.call(arguments, 0);
            const errorArg = args[0]; // first callback argument can be error object, the others are message
            if (errorArg && errorArg instanceof Error) {
                args[0] = self.cloneError(errorArg);
            }

            const resp = {
                id: pkg.id,
                resp: args
            };

            if (tracer && tracer.isEnabled) {
                resp.traceId = tracer.id;
                resp.seqId = tracer.seq;
                resp.source = tracer.source;
            }
            if (self.bufferMsg) {
                self.enqueue(socket, resp);
            } else {
                self.send(socket, resp);
            }
        });
    }

    processMsgs(socket, pkgs) {
        pkgs.forEach(pkg => this.processMsg(socket, pkg));
    }

    enqueue(socket, msg) {
        let queue = this.msgQueues[socket.id];
        if (!queue) {
            queue = this.msgQueues[socket.id] = [];
        }
        queue.push(msg);
    }

    send(socket, msg) {

    }

    flush() {
        let sockets = this.sockets,
            queues = this.msgQueues,
            queue, socket;
        for (let socketId in queues) {
            socket = sockets[socketId];
            if (!socket) {
                // clear pending messages if the socket not exist any more
                delete queues[socketId];
                continue;
            }
            queue = queues[socketId];
            if (!queue.length) {
                continue;
            }
            this.send(socket, queue);
            queues[socketId] = [];
        }
    }

    cloneError(origin) {
        // copy the stack infos for Error instance json result is empty
        return {
            msg: origin.msg,
            stack: origin.stack
        };
    }
}

/**
 * create acceptor
 *
 * @param opts init params
 * @param cb(tracer, msg, cb) callback function that would be invoked when new message arrives
 */
module.exports = Acceptor;
