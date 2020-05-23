const net = require('net');
const Composer = require('stream-pkg');

const BaseAcceptor = require('./base-acceptor');

class Acceptor extends BaseAcceptor {
    constructor(opts, cb) {
        super(opts, cb);
        opts.server = net.createServer();
        this.pkgSize = opts.pkgSize;
    }

    onConnection(socket) {
        this.sockets[socket.id] = socket;

        // this.emit('connection', {
        //     id: socket.id,
        //     ip: socket.handshake.address.address
        // });

        socket.composer = new Composer({
            maxLength: this.pkgSize
        });

        socket.on('data', (data) => {
            socket.composer.feed(data);
        });

        socket.composer.on('data', (data) => {
            let pkg = JSON.parse(data.toString());
            if (pkg instanceof Array) {
                this.processMsgs(socket, pkg);
            } else {
                this.processMsg(socket, pkg);
            }
        });

        socket.on('close', () => {
           this.onSocketClose(socket);
        });
    }

    send(socket, msg) {
        socket.write(socket.composer.compose(JSON.stringify(msg)));
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

process.on('SIGINT', function () {
    process.exit();
});