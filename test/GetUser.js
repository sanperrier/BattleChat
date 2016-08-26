import assert from 'assert';
import {request, fetchJSONData, config, clearDbAndGetTestUsers} from './helpers/common';

describe('REST Server: GET /user - retreiving current user', () => {
    let user;
    before(() => clearDbAndGetTestUsers(1).then(users => user = users[0])
        .then(user => assert.ok(user)));

    it(`GET user should return test user`, () => {
        return request({
                hostname: config.hostname,
                port: config.port,
                path: `/user?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            })
            .then(res => {
                assert.equal(200, res.statusCode);
                return fetchJSONData(res);
            })
            .then(data => {
                assert.ok(data);
                assert.ok(data._id);
                assert.equal(data.uid, user.uid);
                assert.equal(data.name, user.name);
                assert.equal(data.avatar, user.avatar);
            });
    });
});