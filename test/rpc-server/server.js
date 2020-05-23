const Server = require('../../').server;
const should = require('should');

const WAIT_TIME = 100;

const paths = [
    {namespace: 'user', path: __dirname + '../../mock-remote/area'},
    {namespace: 'sys', path: __dirname + '../../mock-remote/connector'}
];

const port = 3333;

describe('server', function () {

    describe('#create', function () {
        it('should create gateway by providing port and paths parameters', function (done) {
            let opts = {
                paths: paths,
                port: port
            };

            let errorCount = 0;
            let closeCount = 0;
            let gateway = Server.create(opts);

            should.exist(gateway);
            gateway.on('error', (err) => {
                errorCount++;
            });
            gateway.on('closed', () => {
                closeCount++;
            });

            gateway.start();
            gateway.stop();

            setTimeout(() => {
                errorCount.should.equal(0);
                closeCount.should.equal(1);
                done();
            }, WAIT_TIME);
        });

        it('should change the default acceptor by pass the acceptorFactory to the create function', function (done) {
            let oport = 3333;
            let constructCount = 0, listenCount = 0, closeCount = 0;

            class MockAcceptor {
                constructor(opts, cb) {
                    constructCount++;
                }

                listen(port) {
                    oport.should.equal(port);
                    listenCount++;
                }

                close() {
                    closeCount++;
                }

                on() {
                }

                emit() {
                }
            }

            let acceptorFactory = {
                create: function (opts, cb) {
                    return new MockAcceptor(null, cb);
                }
            };

            let opts = {
                paths: paths,
                port: oport,
                acceptorFactory: acceptorFactory
            };

            let gateway = Server.create(opts);

            should.exist(gateway);

            gateway.start();
            gateway.stop();

            setTimeout(() => {
                constructCount.should.equal(1);
                listenCount.should.equal(1);
                closeCount.should.equal(1);
                done();
            }, WAIT_TIME);
        });
    });
});