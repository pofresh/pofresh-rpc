const crc = require('crc');
const ConsistentHash = require('../util/consistentHash');

/**
 * Calculate route info and return an appropriate server id.
 *
 * @param session {Object} session object for current rpc request
 * @param msg {Object} rpc message. {serverType, service, method, args, opts}
 * @param context {Object} context of client
 * @param cb(err, serverId)
 */
function defRoute(session, msg, context, cb) {
    const list = context.getServersByType(msg.serverType);
    if (!list || !list.length) {
        cb(new Error('can not find server info for type:' + msg.serverType));
        return;
    }
    const uid = session ? (session.uid || '') : '';
    const index = Math.abs(crc.crc32(uid.toString())) % list.length;
    cb(null, list[index].id);
}

/**
 * Random algorithm for calculating server id.
 *
 * @param client {Object} rpc client.
 * @param serverType {String} rpc target serverType.
 * @param msg {Object} rpc message.
 * @param cb {Function} cb(err, serverId).
 */
function rdRoute(client, serverType, msg, cb) {
    const servers = client._station.serversMap[serverType];
    if (!servers || !servers.length) {
        cb(new Error('rpc servers not exist with serverType: ' + serverType));
        return;
    }
    const index = Math.floor(Math.random() * servers.length);
    cb(null, servers[index]);
}

/**
 * Round-Robin algorithm for calculating server id.
 *
 * @param client {Object} rpc client.
 * @param serverType {String} rpc target serverType.
 * @param msg {Object} rpc message.
 * @param cb {Function} cb(err, serverId).
 */
function rrRoute(client, serverType, msg, cb) {
    let servers = client._station.serversMap[serverType];
    if (!servers || !servers.length) {
        cb(new Error('rpc servers not exist with serverType: ' + serverType));
        return;
    }
    let index;
    if (!client.rrParam) {
        client.rrParam = {};
    }
    if (!!client.rrParam[serverType]) {
        index = client.rrParam[serverType];
    } else {
        index = 0;
    }
    cb(null, servers[index % servers.length]);
    if (index++ === Number.MAX_VALUE) {
        index = 0;
    }
    client.rrParam[serverType] = index;
}

/**
 * Weight-Round-Robin algorithm for calculating server id.
 *
 * @param client {Object} rpc client.
 * @param serverType {String} rpc target serverType.
 * @param msg {Object} rpc message.
 * @param cb {Function} cb(err, serverId).
 */
function wrrRoute(client, serverType, msg, cb) {
    let servers = client._station.serversMap[serverType];
    if (!servers || !servers.length) {
        cb(new Error('rpc servers not exist with serverType: ' + serverType));
        return;
    }
    let index, weight;
    if (!client.wrrParam) {
        client.wrrParam = {};
    }
    if (!!client.wrrParam[serverType]) {
        index = client.wrrParam[serverType].index;
        weight = client.wrrParam[serverType].weight;
    } else {
        index = -1;
        weight = 0;
    }
    let getMaxWeight = function () {
        let maxWeight = -1;
        for (let i = 0; i < servers.length; i++) {
            let server = client._station.servers[servers[i]];
            if (!!server.weight && server.weight > maxWeight) {
                maxWeight = server.weight;
            }
        }
        return maxWeight;
    };
    while (true) {
        index = (index + 1) % servers.length;
        if (index === 0) {
            weight = weight - 1;
            if (weight <= 0) {
                weight = getMaxWeight();
                if (weight <= 0) {
                    cb(new Error('rpc wrr route get invalid weight.'));
                    return;
                }
            }
        }
        let server = client._station.servers[servers[index]];
        if (server.weight >= weight) {
            client.wrrParam[serverType] = {
                index: index,
                weight: weight
            };
            cb(null, server.id);
            return;
        }
    }
}

/**
 * Least-Active algorithm for calculating server id.
 *
 * @param client {Object} rpc client.
 * @param serverType {String} rpc target serverType.
 * @param msg {Object} rpc message.
 * @param cb {Function} cb(err, serverId).
 */
function laRoute(client, serverType, msg, cb) {
    let servers = client._station.serversMap[serverType];
    if (!servers || !servers.length) {
        return cb(new Error('rpc servers not exist with serverType: ' + serverType));
    }
    let actives = [];
    if (!client.laParam) {
        client.laParam = {};
    }
    if (!!client.laParam[serverType]) {
        for (let j = 0; j < servers.length; j++) {
            let count = client.laParam[serverType][servers[j]];
            if (!count) {
                client.laParam[servers[j]] = count = 0;
            }
            actives.push(count);
        }
    } else {
        client.laParam[serverType] = {};
        for (let i = 0; i < servers.length; i++) {
            client.laParam[serverType][servers[i]] = 0;
            actives.push(0);
        }
    }
    let rs = [];
    let minInvoke = Number.MAX_VALUE;
    for (let k = 0; k < actives.length; k++) {
        if (actives[k] < minInvoke) {
            minInvoke = actives[k];
            rs = [];
            rs.push(servers[k]);
        } else if (actives[k] === minInvoke) {
            rs.push(servers[k]);
        }
    }
    let index = Math.floor(Math.random() * rs.length);
    let serverId = rs[index];
    client.laParam[serverType][serverId] += 1;
    cb(null, serverId);
}

/**
 * Consistent-Hash algorithm for calculating server id.
 *
 * @param client {Object} rpc client.
 * @param serverType {String} rpc target serverType.
 * @param msg {Object} rpc message.
 * @param cb {Function} cb(err, serverId).
 */
function chRoute(client, serverType, msg, cb) {
    let servers = client._station.serversMap[serverType];
    if (!servers || !servers.length) {
        return cb(new Error('rpc servers not exist with serverType: ' + serverType));
    }

    let index, con;
    if (!client.chParam) {
        client.chParam = {};
    }
    if (!!client.chParam[serverType]) {
        con = client.chParam[serverType].consistentHash;
    } else {
        client.opts.station = client._station;
        con = new ConsistentHash(servers, client.opts);
    }
    let hashFieldIndex = client.opts.hashFieldIndex;
    let field = msg.args[hashFieldIndex] || JSON.stringify(msg);
    cb(null, con.getNode(field));
    client.chParam[serverType] = {
        consistentHash: con
    };
}

module.exports = {
    rr: rrRoute,
    wrr: wrrRoute,
    la: laRoute,
    ch: chRoute,
    rd: rdRoute,
    df: defRoute
};