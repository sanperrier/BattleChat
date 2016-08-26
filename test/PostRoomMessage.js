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

describe('REST Server: POST /room/:_id/message - post message to room', () => {
    let users = [];
    let room;

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
            .then(() => createRoom(users[0], { users: [users[0].uid, users[1].uid], personal: true }))
            .then(_room => room = _room)
            .then(() => {
                assert.equal(users.length, 3);
                assert.ok(room);
                assert.ok(room.users.find(u => u._id == users[0]._id));
                assert.ok(room.users.find(u => u._id == users[1]._id));
            })
    );

    let test = (user, _id, data, resCb, dataCb) => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/room/${_id}/message?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        }, data)
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

    it(`POST /room/:_id/message with { text: "%user% says hi to %room%" } should return message obj with user that sent it and populated with that message`, () => {
        let user = users[0];
        let text = `${user._id} says hi to ${room._id}`;
        return test(
            user, room._id, { text: text },
            res => assert.equal(200, res.statusCode),
            msg => {
                assert.ok(msg);
                assert.equal(msg.text, text);
                assert.equal(msg.user, user._id);
                baseCheckRoom(msg.room);
                assert.equal(msg.room._id, room._id);
                assert.equal(msg.room.users.length, room.users.length);
                findUserAndCheckEquality(user, msg.room);
                for (let user of room.users) {
                    findUserAndCheckEquality(user, msg.room);
                }
                let roomMsg = msg.room.messages.find(m => m._id == msg._id);
                assert.ok(roomMsg);
                assert.equal(msg._id, roomMsg._id);
                assert.equal(msg.text, roomMsg.text);
                assert.equal(msg.user, roomMsg.user);
            });
    });

    it(`POST /room/:_id/message where _id is not [a-Z0-9] should return 400`, () => {
        return test(
            users[0], encodeURIComponent('eval(console.log(im a super kaker!)'), { text: 'test' },
            res => assert.equal(400, res.statusCode)
        );
    });

    it(`POST /room/:_id/message where _id is incorrect should return 404`, () => {
        return test(
            users[0], room._id.replace(/^..../, '0000'), { text: 'test' },
            res => assert.equal(404, res.statusCode)
        );
    });

    it(`POST /room/:_id/message with empty text should return 409`, () => {
        return Promise.all([
            test(
                users[0], room._id, { text: '' },
                res => assert.equal(409, res.statusCode)
            ), test(
                users[0], room._id, { },
                res => assert.equal(409, res.statusCode)
            )]);
    });

    it(`POST /room/:_id/message from user that is not in that room should return 404`, () => {
        return test(
            users[2], room._id, { text: 'test' },
            res => assert.equal(404, res.statusCode)
        );
    });
});