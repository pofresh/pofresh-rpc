const Acceptor = require('./acceptors/sio-acceptor');
module.exports.create = function (opts, cb) {
    return Acceptor.create(opts, cb);
};
