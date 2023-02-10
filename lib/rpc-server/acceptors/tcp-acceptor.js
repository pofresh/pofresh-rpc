const Composer = require('stream-pkg');

const BaseAcceptor = require('./base-acceptor');

let curId = 1;

class Acceptor extends BaseAcceptor {
    constructor(opts, cb) {
        opts.name = "tcp-acceptor";
        super(opts, cb);
        this.pkgSize = opts.pkgSize;
    }

    onConnection(socket) {
        socket.id = curId++;
        this.sockets[socket.id] = socket;
        this.emit('connection', {
            id: socket.id,
            ip: socket.remoteAddress.replace('::ffff:', '')
        });

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