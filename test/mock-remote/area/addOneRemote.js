/**
 * Mock remote service
 */

class Service {
    doService(value, cb) {
        cb(null, value + 1);
    }

    doAddTwo(value, cb) {
        cb(null, value + 2);
    }
}

module.exports = function () {
   return new Service();
};