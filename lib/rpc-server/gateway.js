const defaultAcceptorFactory = require('./acceptor');
const EventEmitter = require('events');
const fs = require('fs');
const Loader = require('pofresh-loader');
const Dispatcher = require('./dispatcher');

class Gateway extends EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts || {};
        this.port = opts.port || 3050;
        this.started = false;
        this.stoped = false;
        this.acceptorFactory = opts.acceptorFactory || defaultAcceptorFactory;
        this.services = opts.services;
        let dispatcher = new Dispatcher(this.services);
        if (this.opts.reloadRemotes) {
            watchServices(this, dispatcher);
        }
        this.acceptor = this.acceptorFactory.create(opts, (tracer, msg, cb) => {
            dispatcher.route(tracer, msg, cb);
        });
    }

    start() {
        if (this.started) {
            throw new Error('gateway already start.');
        }
        this.started = true;

        this.acceptor.on('error', this.emit.bind(this, 'error'));
        this.acceptor.on('closed', this.emit.bind(this, 'closed'));
        this.acceptor.listen(this.port);
    }

    stop() {
        if (!this.started || this.stoped) {
            return;
        }
        this.stoped = true;
        try {
            this.acceptor.close();
        } catch (err) {
            console.error('acceptor close error', err);
        }
    }
}

function watchServices(gateway, dispatcher) {
    let paths = gateway.opts.paths;
    let app = gateway.opts.context;
    for (let i = 0; i < paths.length; i++) {
        (function (index) {
            fs.watch(paths[index].path, function (event, name) {
                if (event === 'change') {
                    let res = {};
                    let item = paths[index];
                    let m = Loader.load(item.path, app);
                    if (m) {
                        res[item.namespace] = res[item.namespace] || {};
                        res[item.namespace] = m;
                    }
                    dispatcher.emit('reload', res);
                }
            });
        })(i);
    }
}

/**
 * create and init gateway
 *
 * @param opts {services: {rpcServices}, connector:conFactory(optional), router:routeFunction(optional)}
 */
module.exports.create = function (opts) {
    if (!opts || !opts.services) {
        throw new Error('opts and opts.services should not be empty.');
    }

    return new Gateway(opts);
};