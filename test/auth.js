import assert from 'assert';
import {request, fetchJSONData, config, clearDbAndGetTestUsers} from './helpers/common';

describe('REST Server: Auth via game server', () => {
    let user;
    before(() => clearDbAndGetTestUsers(1).then(users => user = users[0])
        .then(user => assert.ok(user)));

    it('GET /user with correct credentials should return 200', () => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/user?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => assert.equal(200, res.statusCode));
    });

    it('GET /user with incorrect sessionKey should return 401 or 403', () => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/user?sessionKey=${user.sessionKey.replace('SESS', 'SOSS')}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => assert.ok(res.statusCode == 401 || res.statusCode == 403));
    });

    it('GET /user with incorrect sessionValue should return 401 or 403', () => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/user?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}&authDeviceId=${user.authDeviceId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => assert.ok(res.statusCode == 401 || res.statusCode == 403));
    });

    it('GET /user with incorrect authDeviceId should return 401 or 403', () => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/user?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => assert.ok(res.statusCode == 401 || res.statusCode == 403));
    });

    it('GET /user with sessionKey that is not [a-Z0-9]+ should return 401 or 403', () => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/user?sessionKey=${encodeURIComponent('eval(console.log(im a super kaker!))')}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(res => assert.ok(res.statusCode == 401 || res.statusCode == 403));
    });
});