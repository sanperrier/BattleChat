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

describe('REST Server: GET /room - retrive rooms current user is in', () => {
    let users = [];
    let roomsWithUser0 = [];
    let personalRoomsWithUser0 = [];

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
            .then(room => {
                roomsWithUser0.push(room);
                personalRoomsWithUser0.push(room);
            })
            .then(() => createRoom(users[0], { users: [users[0].uid, users[2].uid], personal: true }))
            .then(room => {
                roomsWithUser0.push(room);
                personalRoomsWithUser0.push(room);
            })
            .then(() => createRoom(users[0], { users: [users[0].uid, users[1].uid, users[2].uid], personal: false }))
            .then(room => {
                roomsWithUser0.push(room);
            })
            .then(() => createRoom(users[1], { users: [users[1].uid, users[2].uid], personal: true }))
            .then(() => {
                assert.equal(users.length, 3);
                assert.equal(roomsWithUser0.length, 3);
                assert.equal(personalRoomsWithUser0.length, 2);
            })
    );

    let test = (user, personal, resCb, dataCb) => {
        return request({
            hostname: config.hostname,
            port: config.port,
            path: `/room?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}${personal ? '&personal' : ''}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        })
            .then(res => {
                resCb(res);
                if (dataCb) {
                    return fetchJSONData(res);
                }
            })
            .then(rooms => {
                if (dataCb) {
                    dataCb(rooms)
                }
            })
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

    it(`GET /room with user should return array of rooms that he is in`, () => {
        let user = users[0];
        return test(
            user, false,
            res => assert.equal(200, res.statusCode),
            rooms => {
                assert.ok(rooms);
                assert.equal(rooms.length, roomsWithUser0.length);
                for (let room of rooms) {
                    baseCheckRoom(room);
                    let _room = roomsWithUser0.find(r => r._id == room._id);
                    assert.ok(_room);
                    assert.equal(room._id, _room._id);
                    assert.equal(room.personal, _room.personal);
                    assert.equal(room.users.length, _room.users.length);
                    for (let user of room.users) {
                        findUserAndCheckEquality(user, _room);
                    }
                }
            });
    });

    it(`GET /room?personal with user should return array of personal rooms that he is in`, () => {
        let user = users[0];
        return test(
            user, true,
            res => assert.equal(200, res.statusCode),
            rooms => {
                assert.ok(rooms);
                assert.equal(rooms.length, personalRoomsWithUser0.length);
                for (let room of rooms) {
                    baseCheckRoom(room);
                    let _room = roomsWithUser0.find(r => r._id == room._id);
                    assert.ok(_room);
                    assert.equal(room._id, _room._id);
                    assert.equal(room.personal, _room.personal);
                    assert.equal(room.users.length, _room.users.length);
                    for (let user of room.users) {
                        findUserAndCheckEquality(user, _room);
                    }
                }
            });
    });
});