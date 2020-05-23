const Server = require('..').server;

// remote service path info list
const paths = [
    {namespace: 'user', path: __dirname + '/remote/test'}
];

const port = 3333;

const server = Server.create({paths: paths, port: port});
server.start();
console.log('rpc server started.');

process.on('uncaughtException', function (err) {
    console.error(err);
});