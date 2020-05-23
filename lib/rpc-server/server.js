const Loader = require('pofresh-loader');
const Gateway = require('./gateway');

function loadRemoteServices(paths, context) {
    let res = {},
        item, m;
    for (let i = 0, l = paths.length; i < l; i++) {
        item = paths[i];
        m = Loader.load(item.path, context);
        if (m) {
            res[item.namespace] = res[item.namespace] || {};
            res[item.namespace] = m;
        }
    }
    return res;
}

/**
 * Create rpc server.
 *
 * @param  {Object}      opts construct parameters
 *                       opts.port {Number|String} rpc server listen port
 *                       opts.paths {Array} remote service code paths, [{namespace, path}, ...]
 *                       opts.context {Object} context for remote service
 *                       opts.acceptorFactory {Object} (optionals)acceptorFactory.create(opts, cb)
 * @return {Object}      rpc server instance
 */
module.exports.create = function (opts) {
    if (!opts || !opts.port || opts.port < 0 || !opts.paths) {
        throw new Error('opts.port or opts.paths invalid.');
    }
    opts.services = loadRemoteServices(opts.paths, opts.context);
    return Gateway.create(opts);
};

module.exports.WSAcceptor = require('./acceptors/ws-acceptor');
module.exports.TcpAcceptor = require('./acceptors/tcp-acceptor');
module.exports.MqttAcceptor = require('./acceptors/mqtt-acceptor');