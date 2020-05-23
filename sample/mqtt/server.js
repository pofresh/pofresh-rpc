const net = require('net'),
    mqttCon = require('mqtt-connection'),
    server = new net.Server();
let num = 300;
let len = num * num;
let i = 1;

let start = 0;
server.on('connection', function (stream) {
    var conn = mqttCon(stream);

    conn.on('connect', function () {
        console.log('connected');
    });

    conn.on('publish', function (packet) {
        // console.log(packet);
        conn.puback({
            messageId: packet.messageId
        })
    });

    conn.on('pingreq', function () {
        conn.pingresp();
    });

    conn.on('error', err => console.log(err))
    // conn is your MQTT connection!
});

server.listen(1883)
console.log('server started.');