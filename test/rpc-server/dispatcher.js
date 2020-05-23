const lib = process.env.POFRESH_RPC_COV ? 'lib-cov' : 'lib';
const Dispatcher = require('../../' + lib + '/rpc-server/dispatcher');
const should = require('should');
const Tracer = require('../../lib/util/tracer');

const WAIT_TIME = 20;

const services = {
    'user': {
        addOneService: {
            doService: function (num, cb) {
                cb(null, num + 1);
            }
        }
    },
    'sys': {
        addTwoService: {
            doService: function (num, cb) {
                cb(null, num + 2);
            }
        }
    }
};

const tracer = new Tracer(console, false);


describe('dispatcher', function () {
    const dispatcher = new Dispatcher(services);

    it('should be find the right service object', function (done) {

        let methodStr = 'doService';
        let serviceStr1 = 'addOneService';
        let serviceStr2 = 'addTwoService';
        let namespace1 = 'user';
        let namespace2 = 'sys';
        let value = 1;
        let callbackCount = 0;

        let msg1 = {namespace: namespace1, service: serviceStr1, method: methodStr, args: [value]};
        dispatcher.route(tracer, msg1, function (err, result) {
            should.not.exist(err);
            should.exist(result);
            result.should.equal(value + 1);
            callbackCount++;
        });

        let msg2 = {namespace: namespace2, service: serviceStr2, method: methodStr, args: [value]};
        dispatcher.route(tracer, msg2, function (err, result) {
            should.not.exist(err);
            should.exist(result);
            result.should.equal(value + 2);
            callbackCount++;
        });

        //wait for all finished
        setTimeout(function () {
            callbackCount.should.equal(2);
            done();
        }, WAIT_TIME);
    });

    it('should return an error if the service or method not exist', function (done) {
        let serviceStr1 = 'addZeroService';
        let methodStr1 = 'doService';
        let serviceStr2 = 'addOneService';
        let methodStr2 = 'doOtherServcie';
        let namespace = 'user';
        let value = 1;
        let callbackCount = 0;

        let msg1 = {namespace: namespace, service: serviceStr1, method: methodStr1, args: [value]};
        dispatcher.route(tracer, msg1, function (err, result) {
            should.exist(err);
            should.not.exist(result);
            callbackCount++;
        });

        let msg2 = {namespace: namespace, service: serviceStr2, method: methodStr2, args: [value]};
        dispatcher.route(tracer, msg2, function (err, result) {
            should.exist(err);
            should.not.exist(result);
            callbackCount++;
        });

        //wait for all finished
        setTimeout(function () {
            callbackCount.should.equal(2);
            done();
        }, WAIT_TIME);
    });
});
