const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'ws-acceptor');
const BaseAcceptor = require('./base-acceptor');
const sio = require('socket.io');

class Acceptor extends BaseAcceptor {

    constructor(opts, cb) {
        opts.name = "sio-acceptor";
        opts.createServer = function (){
           return sio();
        };
        super(opts, cb);
    }

    onConnection(socket) {
        this.sockets[socket.id] = socket;

        this.emit('connection', {
            id: socket.id,
            ip: socket.handshake.address.replace('::ffff:', '')
        });

        socket.on('message', (pkg) => {
            console.log('message', pkg);
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

        socket.on('error', this.emit.bind(this, 'error'));

        socket.on('disconnect', (reason) => {
            this.onSocketClose(socket);
        });
    }

    send(socket, msg) {
        socket.send(msg);
        console.log('server send', msg);
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