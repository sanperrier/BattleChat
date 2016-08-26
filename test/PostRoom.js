import assert from 'assert';
import {request, fetchJSONData, config, clearDbAndGetTestUsers} from './helpers/common';

describe('REST Server: POST /room - create new room and retrive it', () => {
    let users = [];
    let rooms = {};

    before(
        () => clearDbAndGetTestUsers(4).then(_users => {
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
        .then(() => assert.equal(users.length, 4))
    );

    let test = (user, data, resCb, dataCb) => {
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
                resCb(res);
                if (dataCb) {
                    return fetchJSONData(res);
                }
            })
            .then(room => {
                if (dataCb) return dataCb(room)
            })
    };

    let findUserAndCheckEquality = (user, room) => {
        let user0 = room.users.find(u => u.uid == user.uid);
        assert.ok(user0);
        assert.equal(user0.uid, user.uid);
        assert.equal(user0.name, user.name);
        assert.equal(user0.avatar, user.avatar);
    };

    let baseCheckRoom = room => {
        assert.ok(room);
        assert.ok(room._id);
        assert.ok(room.messages);
        assert.ok(room.users);
    };

    it(`POST /room with 2 users should create new room with them`, () => {
        let user0 = users[0], user1 = users[1];
        return test(
            user0, { users: [user0.uid, user1.uid] },
            res => assert.equal(200, res.statusCode),
            room => {
                baseCheckRoom(room);
                assert.equal(room.personal, false);
                assert.equal(room.users.length, 2);
                findUserAndCheckEquality(user0, room);
                findUserAndCheckEquality(user1, room);

                assert.ok(!rooms[room._id]);
                rooms[room._id] = room;
            });
    });

    it(`POST /room with 3 users should create new room with them`, () => {
        let user0 = users[0], user1 = users[1], user2 = users[2];
        return test(
            user0, { users: [user0.uid, user1.uid, user2.uid] },
            res => assert.equal(200, res.statusCode),
            room => {
                baseCheckRoom(room);
                assert.equal(room.personal, false);
                assert.equal(room.users.length, 3);
                findUserAndCheckEquality(user0, room);
                findUserAndCheckEquality(user1, room);
                findUserAndCheckEquality(user2, room);

                assert.ok(!rooms[room._id]);
                rooms[room._id] = room;
            });
    });

    it(`POST /room with 4 users should create new room with them`, () => {
        let user0 = users[0], user1 = users[1], user2 = users[2], user3 = users[3];
        return test(
            user0, { users: [user0.uid, user1.uid, user2.uid, user3.uid] },
            res => assert.equal(200, res.statusCode),
            room => {
                baseCheckRoom(room);
                assert.equal(room.personal, false);
                assert.equal(room.users.length, 4);
                findUserAndCheckEquality(user0, room);
                findUserAndCheckEquality(user1, room);
                findUserAndCheckEquality(user2, room);
                findUserAndCheckEquality(user3, room);

                assert.ok(!rooms[room._id]);
                rooms[room._id] = room;
            });
    });

    it(`POST /room with 2 users and personal=true should create new personal room with them`, () => {
        let user0 = users[0], user1 = users[1];
        return test(
            user0, { users: [user0.uid, user1.uid], personal: true },
            res => assert.equal(200, res.statusCode),
            room => {
                baseCheckRoom(room);
                assert.equal(room.personal, true);
                assert.equal(room.users.length, 2);
                findUserAndCheckEquality(user0, room)
                findUserAndCheckEquality(user1, room)

                assert.ok(!rooms[room._id]);
                rooms[room._id] = room;
            });
    });

    it(`POST /room again with the same 2 users and personal=true should return previously created room with them`, () => {
        let user0 = users[2], user1 = users[3];
        return test(
            user0, { users: [user0.uid, user1.uid], personal: true },
            res => assert.equal(200, res.statusCode),
            oldRoom => {
                test(
                    user0, { users: [user0.uid, user1.uid], personal: true },
                    res => assert.equal(200, res.statusCode),
                    newRoom => {
                        baseCheckRoom(newRoom);
                        assert.equal(newRoom.personal, true);
                        assert.equal(newRoom.users.length, 2);
                        findUserAndCheckEquality(user0, newRoom)
                        findUserAndCheckEquality(user1, newRoom)

                        assert.ok(oldRoom);
                        assert.equal(oldRoom._id, newRoom._id);
                        assert.equal(oldRoom.personal, newRoom.personal);
                    });
            });
    });

    it(`POST /room with no users should return 409`, () => {
        let promises = [];
        for (let personal of [true, false]) {
            promises.push(
                test(
                    users[0], { users: [], personal: personal },
                    res => assert.equal(409, res.statusCode)));
        }
        return Promise.all(promises);
    });

    it(`POST /room with only 1 user should return 409`, () => {
        let promises = [];
        for (let personal of [true, false]) {
            promises.push(
                test(
                    users[0], { users: [users[0].uid], personal: personal },
                    res => assert.equal(409, res.statusCode)));
        }
        return Promise.all(promises);
    });

    it(`POST /room with 2 users with duplicate should return 400`, () => {
        let promises = [];
        for (let personal of [true, false]) {
            promises.push(test(
                users[0], { users: [users[0].uid, users[0].uid], personal: personal },
                res => assert.equal(400, res.statusCode)));
        }
        return Promise.all(promises);
    });

    it(`POST /room with users with duplicate should return 400`, () => {
        let user0 = users[0], user1 = users[1], user2 = users[2], user3 = users[2];
        return test(
            user0, { users: [user0.uid, user1.uid, user2.uid, user3.uid] },
            res => assert.equal(400, res.statusCode));
    });

    it(`POST /room with users without self included should return 400`, () => {
        let user0 = users[0], user1 = users[1], user2 = users[2];
        return test(
            user0, { users: [user1.uid, user2.uid] },
            res => assert.equal(400, res.statusCode));
    });

    it(`POST /room with 3 or more users and personal=true should return 400`, () => {
        let user0 = users[0], user1 = users[1], user2 = users[2], user3 = users[3];
        return Promise.all([
            test(
                user0, { users: [user0.uid, user1.uid, user2.uid], personal: true },
                res => assert.equal(400, res.statusCode)),
            test(
                user0, { users: [user0.uid, user1.uid, user2.uid, user3.uid], personal: true },
                res => assert.equal(400, res.statusCode))]);
    });
});