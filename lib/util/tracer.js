const uuid = require('uuid').v5;

class Tracer {
    constructor(logger, enabledRpcLog, source, remote, msg, id, seq) {
        this.isEnabled = enabledRpcLog;
        if (!enabledRpcLog) {
            return;
        }
        this.logger = logger;
        this.source = source;
        this.remote = remote;
        this.id = id || uuid();
        this.seq = seq || 1;
        this.msg = msg;
    }

    getLogger(role, module, method, des) {
        return {
            traceId: this.id,
            seq: this.seq++,
            role: role,
            source: this.source,
            remote: this.remote,
            module: getModule(module),
            method: method,
            args: this.msg,
            timestamp: Date.now(),
            description: des
        };
    }

    info(role, module, method, des) {
        if (this.isEnabled) {
            this.logger.info(JSON.stringify(this.getLogger(role, module, method, des)));
        }
        return;
    }

    debug(role, module, method, des) {
        if (this.isEnabled) {
            this.logger.debug(JSON.stringify(this.getLogger(role, module, method, des)));
        }
        return;
    }

    error(role, module, method, des) {
        if (this.isEnabled) {
            this.logger.error(JSON.stringify(this.getLogger(role, module, method, des)));
        }
        return;
    }
};

module.exports = Tracer;

function getModule(module) {
    let rs = '';
    let strs = module.split('/');
    let lines = strs.slice(-3);
    for (let i = 0; i < lines.length; i++) {
        rs += '/' + lines[i];
    }
    return rs;
};