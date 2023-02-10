const should = require('should');
const lib = process.env.POFRESH_RPC_COV ? 'lib-cov' : 'lib';
const Gateway = require('../../' + lib + '/rpc-server/gateway');
const Client = require('../../' + lib + '/rpc-client/mailboxes/sio-mailbox');

const WAIT_TIME = 100;

class DoService {
    doService(num, cb) {
        cb(null, num + 1);
    }
}

const services = {
    user: {
        addOneService: new DoService(),
        addTwoService: {
            doService: function (num, cb) {
                cb(null, num + 2);
            }
        }
    }
};

const port = 3333;
const opts = {services: services, port: port};

const server = {
    id: 'area-server-1',
    host: '127.0.0.1',
    port: port
};

describe('gateway', function () {
    after(function (done) {
        done();
        setTimeout(() => process.exit(), WAIT_TIME);
    });

    describe('#start', function () {
        it('should be ok when listen a valid port and emit a closed event when it closed', function (done) {
            let errorCount = 0;
            let closeCount = 0;
            let gateway = Gateway.create(opts);

            should.exist(gateway);
            gateway.on('error', function (err) {
                errorCount++;
            });
            gateway.on('closed', function () {
                closeCount++;
            });

            gateway.start();
            gateway.stop();

            setTimeout(function () {
                errorCount.should.equal(0);
                closeCount.should.equal(1);
                done();
            }, WAIT_TIME);
        });

        // it('should emit an error when listen a port in use', function (done) {
        //     let errorCount = 0;
        //     let opts = {services: services, port: 80};
        //     let gateway80 = Gateway.create(opts);
        //     let gateway = Gateway.create(opts);
        //
        //     should.exist(gateway);
        //     gateway.on('error', function (err) {
        //         should.exist(err);
        //         errorCount++;
        //     });
        //
        //     gateway80.start();
        //     gateway.start();
        //
        //     setTimeout(function () {
        //         errorCount.should.equal(1);
        //         done();
        //     }, WAIT_TIME);
        // });
    });

    describe('#new message callback', function () {
        it('should route msg to the appropriate service object and return response to remote client by callback', function (done) {
            let clientCallbackCount = 0;
            let value = 1;
            let msg = {
                namespace: 'user',
                service: 'addOneService',
                method: 'doService',
                args: [value]
            };

            let gateway = Gateway.create(opts);

            should.exist(gateway);
            gateway.start();

            let client = Client.create(server);
            client.connect(null, function () {
                client.send(null, msg, null, function (tracer, err, result) {
                    result[1].should.eql(value + 1);
                    clientCallbackCount++;
                });
            });

            setTimeout(function () {
                clientCallbackCount.should.equal(1);
                client.close();
                gateway.stop();
                done();
            }, WAIT_TIME);
        });

        it('should return an error if the service not exist', function (done) {
            let clientCallbackCount = 0;
            let value = 1;
            let msg = {
                namespace: 'user',
                service: 'addNService',
                method: 'doService',
                args: [value]
            };

            let gateway = Gateway.create(opts);

            should.exist(gateway);
            gateway.start();

            let client = Client.create(server);
            client.connect(null, function () {
                client.send(null, msg, null, function (tracer, err, result) {
                    should.exist(result[0]);
                    should.not.exist(result[1]);
                    clientCallbackCount++;
                });
            });

            setTimeout(function () {
                clientCallbackCount.should.equal(1);
                client.close();
                gateway.stop();
                done();
            }, WAIT_TIME);
        });

        it('should keep the relationship with request and response in batch rpc calls', function (done) {
            let clientCallbackCount = 0;
            let value = 1;
            let msg1 = {
                namespace: 'user',
                service: 'addOneService',
                method: 'doService',
                args: [value]
            };
            let msg2 = {
                namespace: 'user',
                service: 'addTwoService',
                method: 'doService',
                args: [value]
            };

            let gateway = Gateway.create(opts);

            should.exist(gateway);
            gateway.start();

            let client = Client.create(server);
            client.connect(null, function () {
                client.send(null, msg1, null, function (tracer, err, result) {
                    result[1].should.eql(value + 1);
                    clientCallbackCount++;
                });

                client.send(null, msg2, null, function (tracer, err, result) {
                    result[1].should.eql(value + 2);
                    clientCallbackCount++;
                });
            });

            setTimeout(function () {
                clientCallbackCount.should.equal(2);
                client.close();
                gateway.stop();
                done();
            }, WAIT_TIME);
        });
    });
});