import http from 'http';
import mongoose from 'mongoose';
import assert from 'assert';
import stripBom from 'strip-bom-buf';
import config from './config.js'

function request(options, data) {
    return new Promise((resolve, reject) => {
        let req = http.request(options, res => resolve(res));

        req.on('error', err => reject(err))
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

function fetchJSONData(res) {
    return new Promise((resolve, reject) => {
        let chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
            let data = stripBom(Buffer.concat(chunks)).toString('utf-8');
            if (/^\(.*\)$/.test(data)) {
                data = data.slice(1, -1);
            }
            resolve(JSON.parse(data));
        });
    });
}

let users = {};
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

        it(`Create or fetch test user ${index} on game server`, done => {
            request({
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
                        users[index] = user;
                        return user;
                    } else {
                        throw new Error(JSON.stringify(data));
                    }
                })
                .then(() => done())
                .catch(err => done(err));
        });
    }
});

describe('Battle chat', () => {
    describe('REST server', () => {
        describe('Auth via game server', () => {
            it('GET /user with correct credentials should return 200', done => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/user?sessionKey=${users[1].sessionKey}&sessionValue=${users[1].sessionValue}&authDeviceId=${users[1].authDeviceId}`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => {
                        assert.equal(200, res.statusCode);
                        done();
                    })
                    .catch(err => done(err));
            });

            it('GET /user with incorrect sessionKey should return 401 or 403', done => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/user?sessionKey=${users[1].sessionKey.replace('SESS', 'SOSS')}&sessionValue=${users[1].sessionValue}&authDeviceId=${users[1].authDeviceId}`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => {
                        assert.ok(res.statusCode == 401 || res.statusCode == 403);
                        done();
                    })
                    .catch(err => done(err));
            });

            it('GET /user with incorrect sessionValue should return 401 or 403', done => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/user?sessionKey=${users[1].sessionKey}&sessionValue=${users[1].sessionValue.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}&authDeviceId=${users[1].authDeviceId}`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => {
                        assert.ok(res.statusCode == 401 || res.statusCode == 403);
                        done();
                    })
                    .catch(err => done(err));
            });

            it('GET /user with incorrect authDeviceId should return 401 or 403', done => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/user?sessionKey=${users[1].sessionKey}&sessionValue=${users[1].sessionValue}&authDeviceId=${users[1].authDeviceId.replace(/([0-9])/, num => Number(num) + 1).replace(/([a-zA-Z])/, 'z')}`,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => {
                        assert.ok(res.statusCode == 401 || res.statusCode == 403);
                    })
                    .then(() => done())
                    .catch(err => done(err));
            });
        });

        describe('GET /user - retreiving current user', () => {
            for (let index of includeUserIndices) {
                it(`GET user should return test user ${index}`, done => {
                    let user = users[index];
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
                        })
                        .then(() => done())
                        .catch(err => done(err));
                });
            }
        });

        describe('POST /room - create new room and retrive it', () => {
            let test = (done, userIndex, data, resCb, dataCb) => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/room?sessionKey=${users[userIndex].sessionKey}&sessionValue=${users[userIndex].sessionValue}&authDeviceId=${users[userIndex].authDeviceId}`,
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
                        if (dataCb) {
                            dataCb(room)
                        }
                    })
                    .then(() => done())
                    .catch(err => done(err));
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

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) if (index0 != index1) {
                    it(`POST /room with users: [${index0}, ${index1}] should create new room with them`, done => test(done,
                        index0,
                        { users: [users[index0].uid, users[index1].uid] },
                        res => {
                            assert.equal(200, res.statusCode);
                        },
                        room => {
                            baseCheckRoom(room);
                            assert.equal(room.personal, false);
                            assert.equal(room.users.length, 2);
                            findUserAndCheckEquality(users[index0], room);
                            findUserAndCheckEquality(users[index1], room)

                            assert.ok(!rooms[room._id]);

                            rooms[room._id] = room;
                        })
                    );

                    for (let index2 of includeUserIndices) if (index2 != index1 && index2 != index0) {
                        it(`POST /room with users: [${index0}, ${index1}, ${index2}] should create new room with them`, done => test(done,
                            index0,
                            { users: [users[index0].uid, users[index1].uid, users[index2].uid] },
                            res => {
                                assert.equal(200, res.statusCode);
                            },
                            room => {
                                baseCheckRoom(room);
                                assert.equal(room.personal, false);
                                assert.equal(room.users.length, 3);
                                findUserAndCheckEquality(users[index0], room)
                                findUserAndCheckEquality(users[index1], room)
                                findUserAndCheckEquality(users[index2], room)

                                assert.ok(!rooms[room._id]);

                                rooms[room._id] = room;
                            })
                        );

                        for (let index3 of includeUserIndices) if (index3 != index2 && index3 != index1 && index3 != index0) {
                            it(`POST /room with users: [${index0}, ${index1}, ${index2}, ${index3}] should create new room with them`, done => test(done,
                                index0,
                                { users: [users[index0].uid, users[index1].uid, users[index2].uid, users[index3].uid] },
                                res => {
                                    assert.equal(200, res.statusCode);
                                },
                                room => {
                                    baseCheckRoom(room);
                                    assert.equal(room.personal, false);
                                    assert.equal(room.users.length, 4);
                                    findUserAndCheckEquality(users[index0], room)
                                    findUserAndCheckEquality(users[index1], room)
                                    findUserAndCheckEquality(users[index2], room)
                                    findUserAndCheckEquality(users[index3], room)

                                    assert.ok(!rooms[room._id]);

                                    rooms[room._id] = room;
                                })
                            );
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 < index1) {
                        it(`POST /room with users: [${index0}, ${index1}] and personal=true should create new personal room with them`, done => test(done,
                            index0,
                            { users: [users[index0].uid, users[index1].uid], personal: true },
                            res => {
                                assert.equal(200, res.statusCode);
                            },
                            room => {
                                baseCheckRoom(room);
                                assert.equal(room.personal, true);
                                assert.equal(room.users.length, 2);
                                findUserAndCheckEquality(users[index0], room)
                                findUserAndCheckEquality(users[index1], room)

                                assert.ok(!rooms[room._id]);

                                rooms[room._id] = room;
                            })
                        );
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        it(`POST /room again with the same users: [${index0}, ${index1}] and personal=true should return previously created room with them`, done => test(done,
                            index0,
                            { users: [users[index0].uid, users[index1].uid], personal: true },
                            res => {
                                assert.equal(200, res.statusCode);
                            },
                            room => {
                                baseCheckRoom(room);
                                assert.equal(room.personal, true);
                                assert.equal(room.users.length, 2);
                                findUserAndCheckEquality(users[index0], room)
                                findUserAndCheckEquality(users[index1], room)

                                let oldRoom = rooms[room._id];
                                assert.ok(oldRoom);
                                assert.equal(oldRoom._id, room._id);
                                assert.equal(oldRoom.personal, room.personal);
                                assert.equal(oldRoom.users.length, room.users.length);
                                findUserAndCheckEquality(users[index0], oldRoom)
                                findUserAndCheckEquality(users[index1], oldRoom)
                            })
                        );
                    }
                }
            }

            for (let personal of [true, false]) {
                it(`POST /room with no users should return 409`, done => test(done,
                    includeUserIndices[0],
                    { users: [], personal: personal },
                    res => {
                        assert.equal(409, res.statusCode);
                    })
                );
            }

            for (let index of includeUserIndices) {
                for (let personal of [true, false]) {
                    it(`POST /room with only 1 user: [${index}] and personal=${personal} should return 409`, done => test(done,
                        index,
                        { users: [users[index]], personal: personal },
                        res => {
                            assert.equal(409, res.statusCode);
                        })
                    );
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) if (index0 == index1) {
                    for (let personal of [true, false]) {
                        it(`POST /room with the same user as users: [${index1}, ${index0}] and personal=${personal} should return 400`, done => test(done,
                            index0,
                            { users: [users[index0], users[index1]], personal: personal },
                            res => {
                                assert.equal(400, res.statusCode);
                            })
                        );
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) if (index0 != index1) {
                    for (let index2 of includeUserIndices) if (index2 != index1 && index2 != index0) {
                        for (let index3 of includeUserIndices) if (index3 == index2 || index3 == index1 || index3 == index0) {
                            it(`POST /room with users with duplicate: [${index0}, ${index1}, ${index2}, ${index3}] should return 400`, done => test(done,
                                index0,
                                { users: [users[index0], users[index1], users[index2], users[index3]] },
                                res => {
                                    assert.equal(400, res.statusCode);
                                })
                            );
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) if (index0 != index1) {
                    for (let index2 of includeUserIndices) if (index2 != index1 && index2 != index0) {
                        for (let index3 of includeUserIndices) if (index3 != index2 && index3 != index1 && index3 != index0) {
                            it(`POST /room with users: [${index1}, ${index2}, ${index3}] from user ${index0} should return 400`, done => test(done,
                                index0,
                                { users: [users[index0], users[index1], users[index2], users[index3]] },
                                res => {
                                    assert.equal(400, res.statusCode);
                                })
                            );
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) if (index0 != index1) {
                    for (let index2 of includeUserIndices) if (index2 != index1 && index2 != index0) {
                        it(`POST /room with users: [${index0}, ${index1}, ${index2}] and personal=true should return 400`, done => test(done,
                            index0,
                            { users: [users[index0], users[index1], users[index2]], personal: true },
                            res => {
                                assert.equal(400, res.statusCode);
                            })
                        );

                        for (let index3 of includeUserIndices) if (index3 != index2 && index3 != index1 && index3 != index0) {
                            it(`POST /room with users: [${index0}, ${index1}, ${index2}, ${index3}] and personal=true should return 400`, done => test(done,
                                index0,
                                { users: [users[index0], users[index1], users[index2], users[index3]], personal: true },
                                res => {
                                    assert.equal(400, res.statusCode);
                                })
                            );
                        }
                    }
                }
            }
        });

        describe('GET /room - retrive rooms current user is in', () => {
            let test = (done, userIndex, personal, resCb, dataCb) => {
                request({
                    hostname: config.hostname,
                    port: config.port,
                    path: `/room?sessionKey=${users[userIndex].sessionKey}&sessionValue=${users[userIndex].sessionValue}&authDeviceId=${users[userIndex].authDeviceId}${personal ? '&personal' : ''}`,
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
                    .then(() => done())
                    .catch(err => done(err));
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

            for (let index of includeUserIndices) {
                it(`GET /room with user ${index} should return array of rooms that he is in`, done => test(done,
                    index,
                    false,
                    res => {
                        assert.equal(200, res.statusCode);
                    },
                    newRooms => {
                        assert.ok(newRooms);
                        let createdRoomsIds = [];
                        for (let roomId in rooms) if (rooms.hasOwnProperty(roomId)) {
                            if (rooms[roomId].users.find(u => u.uid == users[index].uid))
                                createdRoomsIds.push(roomId);
                        }

                        assert.equal(newRooms.length, createdRoomsIds.length);
                        for (let room of newRooms) {
                            baseCheckRoom(room);

                            let createdRoom = rooms[room._id];
                            assert.ok(createdRoom);
                            assert.equal(room._id, createdRoom._id);
                            assert.equal(room.users.length, createdRoom.users.length);
                            for (let user of createdRoom.users) {
                                findUserAndCheckEquality(user, room);
                            }
                        }
                    })
                );
            }

            for (let index of includeUserIndices) {
                it(`GET /room with user ${index} and personal should return array of personal rooms that he is in`, done => test(done,
                    index,
                    true,
                    res => {
                        assert.equal(200, res.statusCode);
                    },
                    newRooms => {
                        assert.ok(newRooms);
                        let createdRoomsIds = [];
                        for (let roomId in rooms) if (rooms.hasOwnProperty(roomId)) {
                            if (rooms[roomId].personal && rooms[roomId].users.find(u => u.uid == users[index].uid))
                                createdRoomsIds.push(roomId);
                        }

                        assert.equal(newRooms.length, createdRoomsIds.length);
                        for (let room of newRooms) {
                            baseCheckRoom(room);

                            let createdRoom = rooms[room._id];
                            assert.ok(createdRoom);
                            assert.equal(room._id, createdRoom._id);
                            assert.equal(room.users.length, createdRoom.users.length);
                            for (let user of createdRoom.users) {
                                findUserAndCheckEquality(user, room);
                            }
                        }
                    })
                );
            }
        });
    });
});