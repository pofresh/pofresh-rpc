/**
 * Default mailbox factory
 */
const socketIoMailbox = require('./mailboxes/sio-mailbox');

/**
 * default mailbox factory
 *
 * @param {Object} serverInfo single server instance info, {id, host, port, ...}
 * @param {Object} opts construct parameters
 * @return {Object} mailbox instancef
 */
module.exports.create = function (serverInfo, opts) {
    return socketIoMailbox.create(serverInfo, opts);
};
