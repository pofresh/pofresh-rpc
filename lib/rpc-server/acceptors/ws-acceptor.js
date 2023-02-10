const ws = require('ws').Server;
const BaseAcceptor = require('./base-acceptor');

let DEFAULT_ZIP_LENGTH = 1024 * 10;
let useZipCompress = false;
let gid = 1;

class Acceptor extends BaseAcceptor {
    constructor(opts, cb) {
        opts.name = "ws-acceptor";
        super(opts, cb);
        DEFAULT_ZIP_LENGTH = opts.doZipLength || DEFAULT_ZIP_LENGTH;
        useZipCompress = opts.useZipCompress || false;

        opts.createServer = function (port) {
            return new ws({port});
        };
    }

    onConnection(socket) {
        var id = gid++;
        socket.id = id;
        this.sockets[id] = socket;

        this.emit('connection', {
            id: id,
            ip: socket._socket.remoteAddress
        });

        socket.on('message', (data, flags) => {
            try {
                // console.log("ws rpc server received message = " + data);
                let msg = JSON.parse(data);

                if (msg.body instanceof Array) {
                    this.processMsgs(socket, msg.body);
                } else {
                    this.processMsg(socket, msg.body);
                }
            } catch (e) {
                console.error('ws rpc server process message with error: %j', e.stack);
            }
        });

        socket.on('close', (code, message) => {
            this.onSocketClose(socket);
        });
    }

    send(socket, msg) {
        let str = JSON.stringify({body: msg});
        socket.send(str);
    }

    listen(port) {
        //check status
        if (!!this.inited) {
            this.cb(new Error('already inited.'));
            return;
        }
        this.inited = true;

        this.server.on('error', (err) => {
            this.emit('error', err);
        });


        this.on('connection', this.ipFilter.bind(this));

        if (this.bufferMsg) {
            this._interval = setInterval(function () {
                this.flush();
            }, this.interval);
        }
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