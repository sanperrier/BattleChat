export default {
    db: 'mongodb://localhost/chat',
    gameHostname: 'game.server',
    gameRegPath: (login, email, passwd, authDeviceId) => `/reg`,
    gameAuthPath: (login, email, passwd, authDeviceId) => `/auth`,
    hostname: 'localhost',
    port: 3001,
    deviceId: 'testdeviceid'
};