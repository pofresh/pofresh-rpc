const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'ws-acceptor');
const BaseAcceptor = require('./base-acceptor');
const sio = require('socket.io');

class Acceptor extends BaseAcceptor {

    listen(port) {
        //check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'));
            return;
        }
        this.inited = true;

        this.server = sio(port);

        this.on('connection', this.ipFilter.bind(this));

        this.server.on('error', this.onError.bind(this));

        this.server.on('connection', this.onConnection.bind(this));

        if (this.bufferMsg) {
            this._interval = setInterval(() => {
                this.flush(this);
            }, this.interval);
        }
    }

    onConnection(socket) {
        this.sockets[socket.id] = socket;

        this.emit('connection', {
            id: socket.id,
            ip: socket.handshake.address.address
        });

        socket.on('message', (pkg) => {
            try {
                if (pkg instanceof Array) {
                    this.processMsgs(socket, pkg);
                } else {
                    this.processMsg(socket, pkg);
                }
            } catch (e) {
                // socke.io would broken if uncaugth the exception
                logger.error('rpc server process message error: %j', e.stack);
            }
        });

        socket.on('disconnect', (reason) => {
            this.onSocketClose(socket);
        });
    }

    send(socket, msg) {
        socket.send(msg);
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