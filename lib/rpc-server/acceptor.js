let wsAcceptor = require('./acceptors/ws-acceptor');
module.exports.create = function (opts, cb) {
    const acceptor = opts.acceptor || wsAcceptor;
    return acceptor.create(opts, cb);
};
