const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'base-mailbox');
const EventEmitter = require('events');
const constants = require('../../util/constants');
const Tracer = require('../../util/tracer');

class MailBox extends EventEmitter {
    constructor(server, opts) {
        super();
        this.name = '';
        this.curId = 0;
        this.id = server.id;
        this.host = server.host;
        this.port = server.port;
        this.requests = {};
        this.timeout = {};
        this.queue = [];
        this.bufferMsg = opts.bufferMsg;
        this.interval = opts.interval || constants.DEFAULT_PARAM.INTERVAL;
        this.timeoutValue = opts.timeout || constants.DEFAULT_PARAM.CALLBACK_TIMEOUT;
        this.connected = false;
        this.closed = false;
        this.opts = opts || {};
    }

    connect(tracer, cb) {
        this.tracer = tracer;
        this.cb = cb;
    }

    /**
     * close mailbox
     */
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.connected = false;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        this.socketClose();
        return true;
    }

    socketClose() {
    }

    /**
     * send message to remote server
     *
     * @param tracer tracer
     * @param msg {service:"", method:"", args:[]}
     * @param opts attach info to send method
     * @param cb declaration decided by remote interface
     */
    send(tracer, msg, opts, cb) {
        tracer && tracer.info('client', __filename, 'send', this.name + ' try to send');
        if (!this.connected) {
            tracer && tracer.error('client', __filename, 'send', this.name + ' not init');
            cb(tracer, new Error('ws-mailbox is not init'));
            return;
        }

        if (this.closed) {
            tracer && tracer.error('client', __filename, 'send', this.name + ' has already closed');
            cb(tracer, new Error(this.name + ' has already closed'));
            return;
        }

        const id = this.curId++;
        this.requests[id] = cb;
        this.setCbTimeout(id, tracer, cb);

        let pkg = {
            id: id,
            msg: msg
        };
        if (tracer && tracer.isEnabled) {
            pkg = {
                traceId: tracer.id,
                seqId: tracer.seq,
                source: tracer.source,
                remote: tracer.remote,
                id: id,
                msg: msg
            };
        }
        if (this.bufferMsg) {
            this.queue.push(pkg);
        } else {
            this.sendMessage(pkg);
        }
    }

    sendMessage(pkg) {
    }

    onConnection() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        if (this.bufferMsg) {
            this._interval = setInterval(() => {
                if (this.closed || !this.queue.length) {
                    return;
                }
                this.sendMessage(this.queue);
                this.queue = [];

            }, this.interval);
        }
        this.cb();
    }

    onMessage(pkg) {
        try {
            if (pkg instanceof Array) {
                this.processMsgs(pkg);
            } else {
                this.processMsg(pkg);
            }
        } catch (err) {
            logger.error(this.name + ' rpc client process message with error: %s', err.stack);
            this.emit('error', err);
        }
    }

    onError(err) {
        logger.error(this.name + ' rpc socket is error, remote server host: %s, port: %s', this.host, this.port);
        this.cb(err);
    }

    onClose(reason) {
        logger.error(this.name + ' rpc socket is disconnect, reason: %s', reason);
        const reqs = this.requests;
        let cb;
        for (let id in reqs) {
            cb = reqs[id];
            cb(this.tracer, new Error(this.name + ' disconnect with remote server.'));
        }
        this.emit('close', this.id);
    }

    processMsg(pkg) {
        this.clearCbTimeout(pkg.id);
        const cb = this.requests[pkg.id];
        if (!cb) {
            return;
        }
        delete this.requests[pkg.id];
        const rpcDebugLog = this.opts.rpcDebugLog;
        let tracer = null;
        let sendErr = null;
        if (rpcDebugLog) {
            tracer = new Tracer(this.opts.rpcLogger, this.opts.rpcDebugLog, this.opts.clientId, pkg.source, pkg.resp, pkg.traceId, pkg.seqId);
        }
        cb(tracer, sendErr, pkg.resp);
    }

    processMsgs(pkgs) {
        pkgs.forEach(pkg => this.processMsg(pkg));
    }

    setCbTimeout(id, tracer, cb) {
        this.timeout[id] = setTimeout(() => {
            logger.warn(this.name + ' rpc request is timeout, id: %s, host: %s, port: %s', id, this.host, this.port);
            this.clearCbTimeout(id);
            if (!!this.requests[id]) {
                delete this.requests[id];
            }
            logger.error(this.name + ' rpc callback timeout, remote server host: %s, port: %s', this.host, this.port);
            cb && cb(tracer, new Error(this.name + ' rpc callback timeout'));
        }, this.timeoutValue);
    }

    clearCbTimeout(id) {
        if (!this.timeout[id]) {
            logger.warn(this.name + ' timer is not exsits, id: %s, host: %s, port: %s', id, this.host, this.port);
            return;
        }
        clearTimeout(this.timeout[id]);
        delete this.timeout[id];
    }
}

module.exports = MailBox;