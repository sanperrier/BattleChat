import mongoose from 'mongoose';
import assert from 'assert';
import {request, fetchJSONData, config} from './helpers/common';

import util from 'util';

let users = [];
let includeUserIndices = [1, 2, 3, 4];

let rooms = {};

before('Test setup', () => {
    it('Clear test db', done => {
        mongoose.connect(config.db, () => {
            mongoose.connection.db.dropDatabase();
            done();
        });
    });

    for (let index of includeUserIndices) {
        let login = `battle-chat-tester${index}`;
        let email = `battle-chat-tester${index}@example.org`;
        let passwd = `battle-chat-tester${index}`;
        let authDeviceId = config.deviceId;

        it(`Create or fetch test user ${index} on game server`, () => {
            return request({
                hostname: config.gameHostname,
                port: 80,
                path: config.gameRegPath(login, email, passwd, authDeviceId),
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
                    if (data.answer_type == "ok") {
                        return data;
                    } else if (data.answer_type == "err") {
                        if (data.answer.error_code == '00005') {
                            return request({
                                hostname: config.gameHostname,
                                port: 80,
                                path: config.gameAuthPath(login, email, passwd, authDeviceId),
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            }).then(res => fetchJSONData(res));
                        } else {
                            throw new Error(JSON.stringify(data));
                        }
                    } else {
                        throw new Error(JSON.stringify(data));
                    }
                })
                .then(data => {
                    if (data.session_name && data.session_id) {
                        let user = {
                            sessionKey: data.session_name,
                            sessionValue: data.session_id,
                            authDeviceId: authDeviceId,
                            uid: data.answer.u_id,
                            name: data.answer.u_name ? (data.answer.u_surname ? `${data.answer.u_name} ${data.answer.u_surname}` : data.answer.u_name) : (data.answer.u_login ? data.answer.u_login : data.answer.u_guest_login),
                            avatar: data.answer.u_ava || ''
                        };
                        user.index = index;
                        users.push(user);
                        return user;
                    } else {
                        throw new Error(JSON.stringify(data));
                    }
                });
        });
    }
});

describe('Battle chat', () => {
    describe('REST server', () => {
        describe('Auth via game server', () => {
            it('GET /user with correct credentials should return 200', () => {
                return request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/user?sessionKey=${users[0].sessionKey}&sessionValue=${users[0].sessionValue}&authDeviceId=${users[0].authDeviceId}`,
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
                    path: `/user?sessionKey=${users[0].sessionKey.replace('SESS', 'SOSS')}&sessionValue=${users[0].sessionValue}&authDeviceId=${users[0].authDeviceId}`,
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
                    path: `/user?sessionKey=${users[0].sessionKey}&sessionValue=${users[0].sessionValue.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}&authDeviceId=${users[0].authDeviceId}`,
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
                    path: `/user?sessionKey=${users[0].sessionKey}&sessionValue=${users[0].sessionValue}&authDeviceId=${users[0].authDeviceId.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}`,
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
                    path: `/user?sessionKey=${encodeURIComponent('eval(console.log(im a super kaker!))')}&sessionValue=${users[0].sessionValue}&authDeviceId=${users[0].authDeviceId}`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => assert.ok(res.statusCode == 401 || res.statusCode == 403));
            });
        });

        describe('GET /user - retreiving current user', () => {
            it(`GET user should return test user`, () => {
                let promises = [];
                for (let user of users) {
                    promises.push(
                        request({
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
                        }));
                }
                return Promise.all(promises);
            });
        });

        describe('POST /room - create new room and retrive it', () => {
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
                        if (dataCb) dataCb(room)
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
                let promises = [];
                for (let user0 of users) for (let user1 of users) if (user0.index < user1.index) {
                    promises.push(test(
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
                        }));
                }
                return Promise.all(promises);
            });

            it(`POST /room with 3 users should create new room with them`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) for (let user2 of users) if (user0.index < user1.index && user1.index < user2.index) {
                    promises.push(test(
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
                        }));
                }
                return Promise.all(promises);
            });

            it(`POST /room with 4 users should create new room with them`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) for (let user2 of users) for (let user3 of users) if (user0.index < user1.index && user1.index < user2.index && user2.index < user3.index) {
                    promises.push(test(
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
                        }));
                }
                return Promise.all(promises);
            });

            it(`POST /room with 2 users and personal=true should create new personal room with them`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) if (user0.index > user1.index) {
                    promises.push(test(
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
                        }));
                }
                return Promise.all(promises);
            });

            it(`POST /room again with the same 2 users and personal=true should return previously created room with them`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) if (user0.index != user1.index) {
                    promises.push(test(
                        user0, { users: [user0.uid, user1.uid], personal: true },
                        res => assert.equal(200, res.statusCode),
                        room => {
                            baseCheckRoom(room);
                            assert.equal(room.personal, true);
                            assert.equal(room.users.length, 2);
                            findUserAndCheckEquality(user0, room)
                            findUserAndCheckEquality(user1, room)

                            let oldRoom = rooms[room._id];
                            assert.ok(oldRoom);
                            assert.equal(oldRoom._id, room._id);
                            assert.equal(oldRoom.personal, room.personal);
                            assert.equal(oldRoom.users.length, room.users.length);
                            findUserAndCheckEquality(user0, oldRoom)
                            findUserAndCheckEquality(user1, oldRoom)
                        }));
                }
                return Promise.all(promises);
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
                let promises = [];
                for (let user0 of users) for (let user1 of users) for (let user2 of users) for (let user3 of users) if (user0.index < user1.index && user1.index < user2.index && (user3.index == user0.index || user3.index == user1.index || user3.index == user2.index)) {
                    promises.push(test(
                        user0, { users: [user0.uid, user1.uid, user2.uid, user3.uid] },
                        res => assert.equal(400, res.statusCode)));
                }
                return Promise.all(promises);
            });

            it(`POST /room with users without self included should return 400`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) for (let user2 of users) if (user0.index < user1.index && user1.index < user2.index) {
                    promises.push(test(
                        user0, { users: [user1.uid, user2.uid] },
                        res => assert.equal(400, res.statusCode)));
                }
                return Promise.all(promises);
            });

            it(`POST /room with 3 or more users and personal=true should return 400`, () => {
                let promises = [];
                for (let user0 of users) for (let user1 of users) for (let user2 of users) if (user0.index < user1.index && user1.index < user2.index) {
                    promises.push(test(
                        user0, { users: [user0.uid, user1.uid, user2.uid], personal: true },
                        res => assert.equal(400, res.statusCode)));

                    for (let user3 of users) if (user2.index < user3.index) {
                        promises.push(test(
                            user0, { users: [user0.uid, user1.uid, user2.uid, user3.uid], personal: true },
                            res => assert.equal(400, res.statusCode)));
                    }
                }
                return Promise.all(promises);
            });
        });

        describe('GET /room - retrive rooms current user is in', () => {
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
                let promises = [];
                for (let user of users) {
                    promises.push(test(
                        user, false,
                        res => assert.equal(200, res.statusCode),
                        newRooms => {
                            assert.ok(newRooms);
                            let createdRoomsIds = [];
                            for (let roomId in rooms) if (rooms.hasOwnProperty(roomId)) {
                                if (rooms[roomId].users.find(u => u.uid == user.uid))
                                    createdRoomsIds.push(roomId);
                            }

                            assert.equal(newRooms.length, createdRoomsIds.length);
                            for (let room of newRooms) {
                                baseCheckRoom(room);

                                let createdRoom = rooms[room._id];
                                assert.ok(createdRoom);
                                assert.equal(room._id, createdRoom._id);
                                assert.equal(room.personal, createdRoom.personal);
                                assert.equal(room.users.length, createdRoom.users.length);
                                for (let user of createdRoom.users) {
                                    findUserAndCheckEquality(user, room);
                                }
                            }

                            user.rooms = newRooms;
                        }));
                }
                return Promise.all(promises);
            });

            it(`GET /room?personal with user should return array of personal rooms that he is in`, () => {
                let promises = [];
                for (let user of users) {
                    promises.push(test(
                        user, true,
                        res => assert.equal(200, res.statusCode),
                        newRooms => {
                            assert.ok(newRooms);
                            let createdRoomsIds = [];
                            for (let roomId in rooms) if (rooms.hasOwnProperty(roomId)) {
                                if (rooms[roomId].personal && rooms[roomId].users.find(u => u.uid == user.uid))
                                    createdRoomsIds.push(roomId);
                            }

                            assert.equal(newRooms.length, createdRoomsIds.length);
                            for (let room of newRooms) {
                                baseCheckRoom(room);

                                let createdRoom = rooms[room._id];
                                assert.ok(createdRoom);
                                assert.equal(room._id, createdRoom._id);
                                assert.equal(room.personal, createdRoom.personal);
                                assert.equal(room.users.length, createdRoom.users.length);
                                for (let user of createdRoom.users) {
                                    findUserAndCheckEquality(user, room);
                                }
                            }
                        }));
                }
                return Promise.all(promises);
            });
        });

        describe('GET /room/:_id - retrive room by _id', () => {
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
                let promises = [];
                let checkingRooms = {};
                for (let user of users) for (let room of user.rooms) if (!checkingRooms[room._id]) {
                    checkingRooms[room._id] = room;
                    promises.push(test(
                        user, room._id,
                        res => assert.equal(200, res.statusCode),
                        newRoom => {
                            baseCheckRoom(newRoom);
                            assert.equal(newRoom._id, room._id);
                            assert.equal(newRoom.users.length, room.users.length);

                            findUserAndCheckEquality(user, newRoom);
                            for (let user of room.users) {
                                findUserAndCheckEquality(user, newRoom);
                            }
                        }));
                }
                return Promise.all(promises);
            });

            it(`GET /room/:_id where _id is not [a-Z0-9] should return 400`, () => {
                return test(
                    users[0], encodeURIComponent('eval(console.log(im a super kaker!)'),
                    res => assert.equal(400, res.statusCode)
                );
            });

            it(`GET /room/:_id where _id is incorrect should return 404`, () => {
                return test(
                    users[0], users[0].rooms[0]._id.replace(/^..../, '0000'),
                    res => assert.equal(404, res.statusCode)
                );
            });

            it(`GET /room/:_id from user that is not in that room should return 404`, () => {
                return test(
                    users[0], users[1].rooms.find(r => !r.users.find(u => u._id == users[0]._id))._id,
                    res => assert.equal(404, res.statusCode)
                );
            });
        });
    });
});