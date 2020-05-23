const logger = require('pofresh-logger').getLogger('pofresh-rpc', 'rpc-proxy');
const exp = module.exports;

/**
 * Create proxy.
 *
 * @param  {Object} opts construct parameters
 *           opts.origin {Object} delegated object
 *           opts.proxyCB {Function} proxy invoke callback
 *           opts.service {String} deletgated service name
 *           opts.attach {Object} attach parameter pass to proxyCB
 * @return {Object}      proxy instance
 */
exp.create = function (opts) {
    if (!opts || !opts.origin) {
        logger.warn('opts and opts.origin should not be empty.');
        return null;
    }

    if (!opts.proxyCB || typeof opts.proxyCB !== 'function') {
        logger.warn('opts.proxyCB is not a function, return the origin module directly.');
        return opts.origin;
    }

    //generate proxy for function field
    let res = {};
    for (let field in opts.origin) {
        if (typeof opts.origin[field] === 'function') {
            res[field] = genFunctionProxy(opts.service, field, opts.origin, opts.attach, opts.proxyCB);
        }
    }

    return res;
};

/**
 * Generate prxoy for function type field
 *
 * @param namespace {String} current namespace
 * @param serverType {String} server type string
 * @param serviceName {String} delegated service name
 * @param methodName {String} delegated method name
 * @param origin {Object} origin object
 * @param proxyCB {Functoin} proxy callback function
 * @returns function proxy
 */
function genFunctionProxy(serviceName, methodName, origin, attach, proxyCB) {
    return (function () {
        let proxy = function () {
            let len = arguments.length;
            let args = new Array(len);
            for (let i = 0; i < len; i++) {
                args[i] = arguments[i];
            }
            proxyCB(serviceName, methodName, args, attach);
        };

        proxy.toServer = function () {
            let len = arguments.length;
            let args = new Array(len);
            for (let i = 0; i < len; i++) {
                args[i] = arguments[i];
            }
            proxyCB(serviceName, methodName, args, attach, true);
        };

        return proxy;
    })();
}