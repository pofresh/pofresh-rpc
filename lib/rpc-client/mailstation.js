const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'MailStation');
const EventEmitter = require('events');
const defaultMailboxFactory = require('./mailbox');
const constants = require('../util/constants');
const utils = require('../util/utils');

const STATE_INITED = 1; // station has inited
const STATE_STARTED = 2; // station has started
const STATE_CLOSED = 3; // station has closed

/**
 * Mail station constructor.
 *
 * @param {Object} opts construct parameters
 */
class MailStation extends EventEmitter {
    constructor(opts) {
        super();
        this.opts = opts;
        this.servers = {}; // remote server info map, key: server id, value: info
        this.serversMap = {}; // remote server info map, key: serverType, value: servers array
        this.onlines = {}; // remote server online map, key: server id, value: 0/offline 1/online
        this.mailboxFactory = opts.mailboxFactory || defaultMailboxFactory;

        // filters
        this.befores = [];
        this.afters = [];

        // pending request queues
        this.pendings = {};
        this.pendingSize = opts.pendingSize || constants.DEFAULT_PARAM.DEFAULT_PENDING_SIZE;

        // connecting remote server mailbox map
        this.connecting = {};

        // working mailbox map
        this.mailboxes = {};

        this.state = STATE_INITED;
    }

    /**
     * Init and start station. Connect all mailbox to remote servers.
     *
     * @param  {Function} cb(err) callback function
     * @return {Void}
     */
    start(cb) {
        if (this.state > STATE_INITED) {
            cb(new Error('station has started.'));
            return;
        }

        process.nextTick(() => {
            this.state = STATE_STARTED;
            cb();
        });
    }

    /**
     * Stop station and all its mailboxes
     *
     * @param  {Boolean} force whether stop station forcely
     * @return {Void}
     */
    stop(force) {
        if (this.state !== STATE_STARTED) {
            logger.warn('[pofresh-rpc] client is not running now.');
            return;
        }
        this.state = STATE_CLOSED;

        const self = this;

        function closeAll() {
            for (let id in self.mailboxes) {
                self.mailboxes[id].close();
            }
        }

        if (force) {
            closeAll();
        } else {
            setTimeout(closeAll, constants.DEFAULT_PARAM.GRACE_TIMEOUT);
        }
    }

    /**
     * Add a new server info into the mail station and clear
     * the blackhole associated with the server id if any before.
     *
     * @param {Object} serverInfo server info such as {id, host, port}
     */
    addServer(serverInfo) {
        if (!serverInfo || !serverInfo.id) {
            return;
        }

        let id = serverInfo.id;
        let type = serverInfo.serverType;
        this.servers[id] = serverInfo;
        this.onlines[id] = 1;

        if (!this.serversMap[type]) {
            this.serversMap[type] = [];
        }

        if (this.serversMap[type].indexOf(id) < 0) {
            this.serversMap[type].push(id);
        }
        this.emit('addServer', id);
    }

    /**
     * Batch version for add new server info.
     *
     * @param {Array} serverInfos server info list
     */
    addServers(serverInfos) {
        if (!serverInfos || !serverInfos.length) {
            return;
        }
        serverInfos.forEach(serverInfo => this.addServer(serverInfo));
    }

    /**
     * Remove a server info from the mail station and remove
     * the mailbox instance associated with the server id.
     *
     * @param  {String|Number} id server id
     */
    removeServer(id) {
        delete this.servers[id];
        this.onlines[id] = 0;
        let mailbox = this.mailboxes[id];
        if (mailbox) {
            mailbox.close();
            delete this.mailboxes[id];
        }

        for (let type in this.serversMap) {
            let index = this.serversMap[type].indexOf(id);
            if (index >= 0) {
                this.serversMap[type].splice(index, 1);
            }
        }

        this.emit('removeServer', id);
    }

    /**
     * Batch version for remove remote servers.
     *
     * @param  {Array} ids server id list
     */
    removeServers(ids) {
        if (!ids || !ids.length) {
            return;
        }
        ids.forEach(id => this.removeServer(id));
    }

    /**
     * Clear station infomation.
     *
     */
    clearStation() {
        this.servers = {};
        this.onlines = {};
        this.serversMap = {};
    }

    /**
     * Replace remote servers info.
     *
     * @param {Array} serverInfos server info list
     */
    replaceServers(serverInfos) {
        this.clearStation();
        if (!serverInfos || !serverInfos.length) {
            return;
        }

        serverInfos.forEach(serverInfo => {
            let id = serverInfo.id;
            let type = serverInfo.serverType;
            this.servers[id] = serverInfo;
            this.onlines[id] = 1;
            if (!this.serversMap[type]) {
                this.serversMap[type] = [];
            }
            if (this.serversMap[type].indexOf(id) < 0) {
                this.serversMap[type].push(id);
            }
        });
    }

    /**
     * Dispatch rpc message to the mailbox
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @param  {String}   serverId remote server id
     * @param  {Object}   msg      rpc invoke message
     * @param  {Object}   opts     rpc invoke option args
     * @param  {Function} cb       callback function
     * @return {Void}
     */
    dispatch(tracer, serverId, msg, opts, cb) {
        cb = cb || function () {
        };
        tracer && tracer.info('client', __filename, 'dispatch', 'dispatch rpc message to the mailbox');
        tracer && (tracer.cb = cb);
        if (this.state !== STATE_STARTED) {
            tracer && tracer.error('client', __filename, 'dispatch', 'client is not running now');
            logger.error('[pofresh-rpc] client is not running now.');
            cb(new Error('[pofresh-rpc] client is not running now.'));
            this.emit('error', constants.RPC_ERROR.SERVER_NOT_STARTED, tracer, serverId, msg, opts);
            return;
        }
        console.log('back');
        const self = this;
        let mailbox = this.mailboxes[serverId];
        if (!mailbox) {
            tracer && tracer.debug('client', __filename, 'dispatch', 'mailbox is not exist');
            // try to connect remote server if mailbox instance not exist yet
            if (!lazyConnect(tracer, this, serverId, this.mailboxFactory, cb)) {
                tracer && tracer.error('client', __filename, 'dispatch', 'fail to find remote server:' + serverId);
                logger.error('[pofresh-rpc] fail to find remote server:' + serverId);
                cb(new Error('[pofresh-rpc] fail to find remote server:' + serverId));
                this.emit('error', constants.RPC_ERROR.NO_TRAGET_SERVER, tracer, serverId, msg, opts);
                return;
            }
            // push request to the pending queue
            addToPending(tracer, this, serverId, arguments);
            return;
        }

        if (this.connecting[serverId]) {
            tracer && tracer.debug('client', __filename, 'dispatch', 'request add to connecting');
            // if the mailbox is connecting to remote server
            addToPending(tracer, this, serverId, arguments);
            return;
        }

        function send(tracer, err, serverId, msg, opts) {
            console.log('send');
            tracer && tracer.info('client', __filename, 'send', 'get corresponding mailbox and try to send message');
            if (err) {
                cb(err);
                return errorHandler(tracer, self, err, serverId, msg, opts);
            }

            const mailbox = self.mailboxes[serverId];
            if (!mailbox) {
                tracer && tracer.error('client', __filename, 'send', 'can not find mailbox with id:' + serverId);
                logger.error('[pofresh-rpc] could not find mailbox with id:' + serverId);
                cb(new Error('[pofresh-rpc] could not find mailbox with id:' + serverId));
                self.emit('error', constants.RPC_ERROR.FAIL_FIND_MAILBOX, tracer, serverId, msg, opts);
                return;
            }
            mailbox.send(tracer, msg, opts, function (tracer_send, send_err, args) {
                // let tracer_send = arguments[0];
                // let send_err = arguments[1];
                console.log('send back');
                if (send_err) {
                    logger.error('[pofresh-rpc] fail to send message %s', send_err.stack || send_err.message);
                    self.emit('error', constants.RPC_ERROR.FAIL_SEND_MESSAGE, tracer, serverId, msg, opts);
                    cb(send_err);
                    // utils.applyCallback(cb, send_err);
                    return;
                }
                // let args = arguments[2];
                doFilter(tracer_send, null, serverId, msg, opts, self.afters, 0, 'after', function (tracer, err, serverId, msg, opts) {
                    if (err) {
                        errorHandler(tracer, self, err, serverId, msg, opts);
                    }
                    utils.applyCallback(cb, args);
                });
            });
        }

        doFilter(tracer, null, serverId, msg, opts, this.befores, 0, 'before', send);
    }

    /**
     * Add a before filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    before(filter) {
        if (Array.isArray(filter)) {
            this.befores = this.befores.concat(filter);
            return;
        }
        this.befores.push(filter);
    }

    /**
     * Add after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    after(filter) {
        if (Array.isArray(filter)) {
            this.afters = this.afters.concat(filter);
            return;
        }
        this.afters.push(filter);
    }

    /**
     * Add before and after filter
     *
     * @param  {[type]} filter [description]
     * @return {[type]}        [description]
     */
    filter(filter) {
        this.befores.push(filter);
        this.afters.push(filter);
    }

    /**
     * Try to connect to remote server
     *
     * @param  {Object}   tracer   rpc debug tracer
     * @return {String}   serverId remote server id
     * @param  {Function}   cb     callback function
     */
    connect(tracer, serverId, cb) {
        let mailbox = this.mailboxes[serverId];
        console.log(56);
        mailbox.connect(tracer, (err) => {
            if (err) {
                tracer && tracer.error('client', __filename, 'lazyConnect', 'fail to connect to remote server: ' + serverId);
                logger.error('[pofresh-rpc] mailbox fail to connect to remote server: ' + serverId);
                if (this.mailboxes[serverId]) {
                    delete this.mailboxes[serverId];
                }
                this.emit('error', constants.RPC_ERROR.FAIL_CONNECT_SERVER, tracer, serverId, null, this.opts);
                return;
            }
            mailbox.on('close', (id) => {
                let mbox = this.mailboxes[id];
                if (mbox) {
                    mbox.close();
                    delete this.mailboxes[id];
                }
                this.emit('close', id);
            });
            delete this.connecting[serverId];
            flushPending(tracer, this, serverId);
        });
    }
}

/**
 * Do before or after filter
 */
function doFilter(tracer, err, serverId, msg, opts, filters, index, operate, cb) {
    if (index < filters.length) {
        tracer && tracer.info('client', __filename, 'doFilter', 'do ' + operate + ' filter ' + filters[index].name);
    }
    if (index >= filters.length || !!err) {
        cb(tracer, err, serverId, msg, opts);
        return;
    }
    const filter = filters[index];
    let filterFn = null;
    if (typeof filter === 'function') {
        filterFn = filter;
    } else if (typeof filter[operate] === 'function') {
        filterFn = filter[operate];
    }
    if (filterFn) {
        filterFn(serverId, msg, opts, function (target, message, options) {
            index++;
            //compatible for pofresh filter next(err) method
            if (utils.getObjectClass(target) === 'Error') {
                doFilter(tracer, target, serverId, msg, opts, filters, index, operate, cb);
            } else {
                doFilter(tracer, null, target || serverId, message || msg, options || opts, filters, index, operate, cb);
            }
        });
        return;
    }
    index++;
    doFilter(tracer, err, serverId, msg, opts, filters, index, operate, cb);
}

function lazyConnect(tracer, station, serverId, factory, cb) {
    tracer && tracer.info('client', __filename, 'lazyConnect', 'create mailbox and try to connect to remote server');
    const server = station.servers[serverId];
    const online = station.onlines[serverId];
    console.log('ttttt');
    if (!server) {
        logger.error('[pofresh-rpc] unknown server: %s', serverId);
        return false;
    }
    if (online !== 1) {
        logger.error('[pofresh-rpc] server is not online: %s', serverId);
        return false;
    }
    const mailbox = factory.create(server, station.opts);
    station.connecting[serverId] = true;
    station.mailboxes[serverId] = mailbox;
    station.connect(tracer, serverId, cb);
    return true;
}

function addToPending(tracer, station, serverId, args) {
    tracer && tracer.info('client', __filename, 'addToPending', 'add pending requests to pending queue');
    let pending = station.pendings[serverId];
    if (!pending) {
        pending = station.pendings[serverId] = [];
    }
    if (pending.length > station.pendingSize) {
        tracer && tracer.debug('client', __filename, 'addToPending', 'station pending too much for: ' + serverId);
        logger.warn('[pofresh-rpc] station pending too much for: %s', serverId);
        return;
    }
    pending.push(args);
}

function flushPending(tracer, station, serverId) {
    tracer && tracer.info('client', __filename, 'flushPending', 'flush pending requests to dispatch method');
    let pending = station.pendings[serverId];
    let mailbox = station.mailboxes[serverId];
    if (!pending || !pending.length) {
        return;
    }
    if (!mailbox) {
        tracer && tracer.error('client', __filename, 'flushPending', 'fail to flush pending messages for empty mailbox: ' + serverId);
        logger.error('[pofresh-rpc] fail to flush pending messages for empty mailbox: ' + serverId);
    }
    pending.forEach(p => station.dispatch.apply(station, p));
    delete station.pendings[serverId];
    console.log(67);
}

function errorHandler(tracer, station, err, serverId, msg, opts) {
    if (station.handleError) {
        station.handleError(err, serverId, msg, opts);
    } else {
        logger.error('[pofresh-rpc] rpc filter error with serverId: %s, err: %j', serverId, err.stack);
        station.emit('error', constants.RPC_ERROR.FILTER_ERROR, tracer, serverId, msg, opts);
    }
}

/**
 * Mail station factory function.
 *
 * @param  {Object} opts construct paramters
 *           opts.servers {Object} global server info map. {serverType: [{id, host, port, ...}, ...]}
 *           opts.mailboxFactory {Function} mailbox factory function
 * @return {Object}      mail station instance
 */
module.exports.create = function (opts) {
    return new MailStation(opts || {});
};