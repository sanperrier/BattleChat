import assert from 'assert';
import {request, fetchJSONData, config, clearDbAndGetTestUsers} from './helpers/common';

function createRoom(user, data) {
    return request({
        hostname: config.hostname,
        port: config.port,
        path: `/room?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    }, data)
        .then(res => {
            assert.equal(200, res.statusCode);
            return fetchJSONData(res)
        });
}

describe('REST Server: GET /room/:_id - retrive room by _id', () => {
    let users = [];
    let roomWithUser0;
    let personalRoomWithUser0;
    let roomWithoutUser0;

    before(
        () => clearDbAndGetTestUsers(3).then(_users => {
            let promises = [];
            for (let _user of _users) {
                promises.push(
                    request({
                        hostname: config.hostname,
                        port: config.port,
                        path: `/user?sessionKey=${_user.sessionKey}&sessionValue=${_user.sessionValue}&authDeviceId=${_user.authDeviceId}`,
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    })
                        .then(res => {
                            assert.equal(200, res.statusCode);
                            return fetchJSONData(res)
                        }).then((user) => {
                            assert.ok(user);
                            assert.equal(user.uid, _user.uid);
                            _user._id = user._id;
                            users.push(_user);
                        }));
            }
            return Promise.all(promises);
        })
            .then(() => createRoom(users[0], { users: [users[0].uid, users[1].uid, users[2].uid] }))
            .then(room => roomWithUser0 = room)
            .then(() => createRoom(users[0], { users: [users[0].uid, users[1].uid], personal: true }))
            .then(room => personalRoomWithUser0 = room)
            .then(() => createRoom(users[1], { users: [users[1].uid, users[2].uid] }))
            .then(room => roomWithoutUser0 = room)
            .then(() => {
                assert.equal(users.length, 3);
                assert.ok(roomWithUser0);
                assert.equal(roomWithUser0.personal, false);
                assert.ok(roomWithUser0.users.find(u => u._id == users[0]._id));
                assert.ok(personalRoomWithUser0);
                assert.equal(personalRoomWithUser0.personal, true);
                assert.ok(personalRoomWithUser0.users.find(u => u._id == users[0]._id));
                assert.ok(roomWithoutUser0);
                assert.equal(roomWithoutUser0.users.find(u => u._id == users[0]._id), undefined);
            })
    );

    let test = (user, _id, resCb, dataCb) => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/room/${_id}?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => {
                resCb(res);
                if (dataCb) return fetchJSONData(res);
            })
            .then(room => {
                if (dataCb) dataCb(room)
            });
    };

    let baseCheckRoom = room => {
        assert.ok(room);
        assert.ok(room._id);
        assert.ok(room.messages);
        assert.ok(room.users);
    };

    let findUserAndCheckEquality = (user, room) => {
        let user0 = room.users.find(u => u.uid == user.uid);
        assert.ok(user0);
        assert.equal(user0.uid, user.uid);
        assert.equal(user0.name, user.name);
        assert.equal(user0.avatar, user.avatar);
    };

    it(`GET /room/:_id should return room`, () => {
        return Promise.all([
            test(
                users[0], roomWithUser0._id,
                res => assert.equal(200, res.statusCode),
                room => {
                    baseCheckRoom(room);
                    assert.equal(room._id, roomWithUser0._id);
                    assert.equal(room.personal, roomWithUser0.personal);
                    assert.equal(room.users.length, roomWithUser0.users.length);

                    findUserAndCheckEquality(users[0], room);
                    for (let user of room.users) {
                        findUserAndCheckEquality(user, roomWithUser0);
                    }
                }),
            test(
                users[0], personalRoomWithUser0._id,
                res => assert.equal(200, res.statusCode),
                room => {
                    baseCheckRoom(room);
                    assert.equal(room._id, personalRoomWithUser0._id);
                    assert.equal(room.personal, personalRoomWithUser0.personal);
                    assert.equal(room.users.length, personalRoomWithUser0.users.length);

                    findUserAndCheckEquality(users[0], room);
                    for (let user of room.users) {
                        findUserAndCheckEquality(user, personalRoomWithUser0);
                    }
                })]);
    });

    it(`GET /room/:_id where _id is not [a-Z0-9] should return 400`, () => {
        return test(
            users[0], encodeURIComponent('eval(console.log(im a super kaker!)'),
            res => assert.equal(400, res.statusCode)
        );
    });

    it(`GET /room/:_id where _id is incorrect should return 404`, () => {
        return test(
            users[0], roomWithUser0._id.replace(/^..../, '0000'),
            res => assert.equal(404, res.statusCode)
        );
    });

    it(`GET /room/:_id from user that is not in that room should return 404`, () => {
        return test(
            users[0], roomWithoutUser0._id,
            res => assert.equal(404, res.statusCode)
        );
    });
});