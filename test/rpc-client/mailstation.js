const lib = process.env.POFRESH_RPC_COV ? 'lib-cov' : 'lib';
const MailStation = require('../../' + lib + '/rpc-client/mailstation');
const should = require('should');
const Server = require('../../').server;
const Tracer = require('../../lib/util/tracer');
const failureProcess = require("../../lib/rpc-client/failureProcess");

const WAIT_TIME = 100;

// proxy records
const records = [
    {namespace: 'user', serverType: 'area', path: __dirname + '../../mock-remote/area'},
    {namespace: 'sys', serverType: 'connector', path: __dirname + '../../mock-remote/connector'}
];

// server info list
const serverList = [
    {id: 'area-server-1', type: "area", host: '127.0.0.1', port: 3333},
    {id: 'connector-server-1', type: "connector", host: '127.0.0.1', port: 4444},
    {id: 'connector-server-2', type: "connector", host: '127.0.0.1', port: 5555},
];

// rpc description message
const msg = {
    namespace: 'user',
    serverType: 'area',
    service: 'whoAmIRemote',
    method: 'doService',
    args: []
};

describe('mail station', function () {
    let gateways = [];

    before(function (done) {
        gateways = [];
        //start remote logger
        let item, opts;
        for (let i = 0, l = serverList.length; i < l; i++) {
            item = serverList[i];
            opts = {
                paths: records,
                port: item.port,
                context: {id: item.id}
            };

            const gateway = Server.create(opts);
            gateways.push(gateway);
            gateway.start();
        }
        done();
    });

    after(function (done) {
        //stop remote servers
        for (let i = 0; i < gateways.length; i++) {
            gateways[i].stop();
        }
        done();
        setTimeout(() => process.exit(), WAIT_TIME);
    });

    describe('#create', function () {
        it('should be ok for pass an empty opts to the factory method', function (done) {
            const station = MailStation.create();
            should.exist(station);

            station.start(function (err) {
                should.not.exist(err);
                station.stop();
                done();
            });

            station.should.have.property('mailboxFactory');
        });

        it('should change the default mailbox by pass the mailboxFactory to the create function', function () {
            const mailboxFactory = {
                create: function (opts, cb) {
                    return null;
                }
            };

            const opts = {
                mailboxFactory: mailboxFactory
            };

            const station = MailStation.create(opts);
            should.exist(station);

            station.should.have.property('mailboxFactory');
            station.mailboxFactory.should.equal(mailboxFactory);
        });
    });

    describe('#addServer', function () {
        it('should add the server info into the mail station', function () {
            const station = MailStation.create();
            should.exist(station);

            let i, l;
            for (i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            let servers = station.servers, item, server;
            for (i = 0, l = serverList.length; i < l; i++) {
                item = serverList[i];
                server = servers[item.id];
                should.exist(server);
                server.should.equal(item);
            }
        });
    });

    describe('#dispatch', function () {
        it('should send request to the right remote server and get the response from callback function', function (done) {
            let callbackCount = 0;
            let count = 0;
            const station = MailStation.create();
            should.exist(station);

            for (let i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const func = function (id) {
                return function (err, remoteId) {
                    should.exist(remoteId);
                    remoteId.should.equal(id);
                    callbackCount++;
                };
            };
            const tracer = new Tracer(null, false);

            station.start(function (err) {
                let item;
                for (let i = 0, l = serverList.length; i < l; i++) {
                    count++;
                    item = serverList[i];
                    station.dispatch(tracer, item.id, msg, null, func(item.id));
                }
            });
            setTimeout(function () {
                callbackCount.should.equal(count);
                station.stop();
                done();
            }, WAIT_TIME);
        });

        it('should send request to the right remote server and get the response from callback function', function (done) {
            let callbackCount = 0;
            let count = 0;
            const station = MailStation.create();
            should.exist(station);

            for (let i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const func = function (id) {
                return function (err, remoteId) {
                    should.exist(remoteId);
                    remoteId.should.equal(id);
                    callbackCount++;
                };
            };

            const tracer = new Tracer(null, false);

            station.start(function (err) {
                let item;
                for (let i = 0, l = serverList.length; i < l; i++) {
                    count++;
                    item = serverList[i];
                    station.dispatch(tracer, item.id, msg, null, func(item.id));
                }
            });
            setTimeout(function () {
                callbackCount.should.equal(count);
                station.stop();
                done();
            }, WAIT_TIME);
        });

        it('should update the mailbox map by add server after start', function (done) {
            let callbackCount = 0;
            const station = MailStation.create();
            should.exist(station);

            for (let i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const tracer = new Tracer(null, false);

            station.start(function (err) {
                // add area server
                const item = serverList[0];
                station.addServer(item);
                station.dispatch(tracer, item.id, msg, null, function (err, remoteId) {
                    should.exist(remoteId);
                    remoteId.should.equal(item.id);
                    callbackCount++;
                });
            });
            setTimeout(function () {
                callbackCount.should.equal(1);
                station.stop();
                done();
            }, WAIT_TIME);
        });

        it('should emit error info and forward message to blackhole if fail to connect to remote server in lazy connect mode', function (done) {
            // mock data
            const serverId = 'invalid-server-id';
            const server = {id: serverId, type: 'invalid-server', host: 'localhost', port: 1234};
            let callbackCount = 0;
            let eventCount = 0;
            const station = MailStation.create();
            should.exist(station);

            station.addServer(server);

            station.on('error', function (err) {
                should.exist(err);
                (1).should.equal(1);
                eventCount++;
            });

            station.on('error', failureProcess.bind(station));

            const tracer = new Tracer(null, false);

            station.start(function (err) {
                should.exist(station);
                station.dispatch(tracer, serverId, msg, null, function (err) {
                    should.exist(err);
                    ('rpc failed with error code: 3').should.equal(err.message);
                    callbackCount++;
                });
            });
            setTimeout(function () {
                eventCount.should.equal(1);
                callbackCount.should.equal(1);
                station.stop();
                done();
            }, WAIT_TIME * 3);
        });
    });

    describe('#filters', function () {
        it('should invoke filters in turn', function (done) {
            let preFilterCount = 0;
            let afterFilterCount = 0;
            const sid = 'connector-server-1';
            const orgMsg = msg;
            const orgOpts = {something: 'hello'};
            const station = MailStation.create();
            should.exist(station);

            for (let i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const tracer = new Tracer(null, false);

            station.start(function (err) {
                station.before(function (fsid, fmsg, fopts, next) {
                    preFilterCount.should.equal(0);
                    afterFilterCount.should.equal(0);
                    fsid.should.equal(sid);
                    fmsg.should.equal(msg);
                    fopts.should.equal(orgOpts);
                    preFilterCount++;
                    next(fsid, fmsg, fopts);
                });

                station.before(function (fsid, fmsg, fopts, next) {
                    preFilterCount.should.equal(1);
                    afterFilterCount.should.equal(0);
                    fsid.should.equal(sid);
                    fmsg.should.equal(msg);
                    fopts.should.equal(orgOpts);
                    preFilterCount++;
                    next(fsid, fmsg, fopts);
                });

                station.after(function (fsid, fmsg, fopts, next) {
                    preFilterCount.should.equal(2);
                    afterFilterCount.should.equal(0);
                    fsid.should.equal(sid);
                    fmsg.should.equal(msg);
                    fopts.should.equal(orgOpts);
                    afterFilterCount++;
                    next(fsid, fmsg, fopts);
                });

                station.after(function (fsid, fmsg, fopts, next) {
                    preFilterCount.should.equal(2);
                    afterFilterCount.should.equal(1);
                    fsid.should.equal(sid);
                    fmsg.should.equal(msg);
                    fopts.should.equal(orgOpts);
                    afterFilterCount++;
                    next(fsid, fmsg, fopts);
                });

                station.dispatch(tracer, sid, orgMsg, orgOpts, function () {
                });
            });

            setTimeout(function () {
                preFilterCount.should.equal(2);
                afterFilterCount.should.equal(2);
                station.stop();
                done();
            }, WAIT_TIME);
        });
    });

    describe('#close', function () {
        it('should emit a close event for each mailbox close', function (done) {
            let closeEventCount = 0, i, l;
            const remoteIds = [];
            const mailboxIds = [];

            for (i = 0, l = serverList.length; i < l; i++) {
                remoteIds.push(serverList[i].id);
            }
            remoteIds.sort();

            const station = MailStation.create();
            should.exist(station);

            for (i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const func = function (id) {
                return function (err, remoteId) {
                    should.exist(remoteId);
                    remoteId.should.equal(id);
                };
            };

            const tracer = new Tracer(null, false);

            station.start(function (err) {
                // invoke the lazy connect
                let item;
                for (let i = 0, l = serverList.length; i < l; i++) {
                    item = serverList[i];
                    station.dispatch(tracer, item.id, msg, null, func(item.id));
                }

                station.on('close', function (mailboxId) {
                    mailboxIds.push(mailboxId);
                    closeEventCount++;
                });
            });

            setTimeout(function () {
                station.stop(true);
                setTimeout(function () {
                    closeEventCount.should.equal(remoteIds.length);
                    mailboxIds.sort();
                    mailboxIds.should.eql(remoteIds);
                    done();
                }, WAIT_TIME);
            }, WAIT_TIME);
        });

        it('should return an error when try to dispatch message by a closed station', function (done) {
            let errorEventCount = 0;
            let i, l;

            const station = MailStation.create();
            should.exist(station);

            for (i = 0, l = serverList.length; i < l; i++) {
                station.addServer(serverList[i]);
            }

            const func = function (err, remoteId, attach) {
                should.exist(err);
                errorEventCount++;
            };

            const tracer = new Tracer(null, false);

            station.on('error', failureProcess.bind(station));

            station.start(function (err) {
                station.stop();
                let item;
                for (i = 0, l = serverList.length; i < l; i++) {
                    item = serverList[i];
                    station.dispatch(tracer, item.id, msg, {}, func);
                }
            });
            setTimeout(function () {
                errorEventCount.should.equal(serverList.length);
                done();
            }, WAIT_TIME);
        });
    });
});
