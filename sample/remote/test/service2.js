// remote service

module.exports = function (context) {
    return {
        echo: function (msg, data, cb) {
            // setTimeout(function() {
            console.log('msg', msg);
            console.log('data', data);
            cb(null, msg);
            // cb(null, msg, 'aaa' + Date.now());
            // }, 15000);
        }
    };
};