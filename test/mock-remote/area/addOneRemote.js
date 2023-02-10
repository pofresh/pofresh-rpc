/**
 * Mock remote service
 */

class Service {
    doService(value, cb) {
        console.log('111111');
        cb(null, value + 1);
    }

    doAddTwo(value, cb) {
        cb(null, value + 2);
    }
}

module.exports = function (app) {
   return new Service();
};