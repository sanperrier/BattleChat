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

        describe('GET /user', () => {
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

        describe('POST /room', () => {
            let rooms = {};

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        for (let index2 of includeUserIndices) {
                            if (index2 != index1 && index2 != index0) {
                                for (let index3 of includeUserIndices) {
                                    if (index3 != index2 && index3 != index1 && index3 != index0) {
                                        it(`POST /room with users: [${index0}, ${index1}, ${index2}, ${index3}] should create new room with them`, done => {
                                            let user0 = users[index0];
                                            let user1 = users[index1];
                                            let user2 = users[index2];
                                            let user3 = users[index3];
                                            request({
                                                hostname: config.hostname,
                                                port: config.port,
                                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                }
                                            }, { users: [user0.uid, user1.uid, user2.uid, user3.uid] })
                                                .then(res => {
                                                    assert.equal(200, res.statusCode);
                                                    return fetchJSONData(res);
                                                })
                                                .then(room => {
                                                    assert.ok(room);
                                                    assert.ok(room._id);
                                                    assert.ok(room.messages);
                                                    assert.ok(room.users);
                                                    assert.equal(room.personal, false);
                                                    assert.equal(room.users.length, 4);
                                                    {
                                                        let user = room.users.find(u => u.uid == user0.uid);
                                                        assert.ok(user);
                                                        assert.equal(user.uid, user0.uid);
                                                        assert.equal(user.name, user0.name);
                                                        assert.equal(user.avatar, user0.avatar);
                                                    }
                                                    {
                                                        let user = room.users.find(u => u.uid == user1.uid);
                                                        assert.ok(user);
                                                        assert.equal(user.uid, user1.uid);
                                                        assert.equal(user.name, user1.name);
                                                        assert.equal(user.avatar, user1.avatar);
                                                    }
                                                    {
                                                        let user = room.users.find(u => u.uid == user2.uid);
                                                        assert.ok(user);
                                                        assert.equal(user.uid, user2.uid);
                                                        assert.equal(user.name, user2.name);
                                                        assert.equal(user.avatar, user2.avatar);
                                                    }
                                                    {
                                                        let user = room.users.find(u => u.uid == user3.uid);
                                                        assert.ok(user);
                                                        assert.equal(user.uid, user3.uid);
                                                        assert.equal(user.name, user3.name);
                                                        assert.equal(user.avatar, user3.avatar);
                                                    }

                                                    assert.ok(!rooms[room._id]);

                                                    rooms[room._id] = room;
                                                })
                                                .then(() => done())
                                                .catch(err => done(err));
                                        });
                                    }
                                }

                                it(`POST /room with users: [${index0}, ${index1}, ${index2}] should create new room with them`, done => {
                                    let user0 = users[index0];
                                    let user1 = users[index1];
                                    let user2 = users[index2];
                                    request({
                                        hostname: config.hostname,
                                        port: config.port,
                                        path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        }
                                    }, { users: [user0.uid, user1.uid, user2.uid] })
                                        .then(res => {
                                            assert.equal(200, res.statusCode);
                                            return fetchJSONData(res);
                                        })
                                        .then(room => {
                                            assert.ok(room);
                                            assert.ok(room._id);
                                            assert.ok(room.messages);
                                            assert.ok(room.users);
                                            assert.equal(room.personal, false);
                                            assert.equal(room.users.length, 3);
                                            {
                                                let user = room.users.find(u => u.uid == user0.uid);
                                                assert.ok(user);
                                                assert.equal(user.uid, user0.uid);
                                                assert.equal(user.name, user0.name);
                                                assert.equal(user.avatar, user0.avatar);
                                            }
                                            {
                                                let user = room.users.find(u => u.uid == user1.uid);
                                                assert.ok(user);
                                                assert.equal(user.uid, user1.uid);
                                                assert.equal(user.name, user1.name);
                                                assert.equal(user.avatar, user1.avatar);
                                            }
                                            {
                                                let user = room.users.find(u => u.uid == user2.uid);
                                                assert.ok(user);
                                                assert.equal(user.uid, user2.uid);
                                                assert.equal(user.name, user2.name);
                                                assert.equal(user.avatar, user2.avatar);
                                            }

                                            assert.ok(!rooms[room._id]);

                                            rooms[room._id] = room;
                                        })
                                        .then(() => done())
                                        .catch(err => done(err));
                                });

                            }
                        }

                        it(`POST /room with users: [${index0}, ${index1}] should create new room with them`, done => {
                            let user0 = users[index0];
                            let user1 = users[index1];
                            request({
                                hostname: config.hostname,
                                port: config.port,
                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            }, { users: [user0.uid, user1.uid] })
                                .then(res => {
                                    assert.equal(200, res.statusCode);
                                    return fetchJSONData(res);
                                })
                                .then(room => {
                                    assert.ok(room);
                                    assert.ok(room._id);
                                    assert.ok(room.messages);
                                    assert.ok(room.users);
                                    assert.equal(room.personal, false);
                                    assert.equal(room.users.length, 2);
                                    {
                                        let user = room.users.find(u => u.uid == user0.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user0.uid);
                                        assert.equal(user.name, user0.name);
                                        assert.equal(user.avatar, user0.avatar);
                                    }
                                    {
                                        let user = room.users.find(u => u.uid == user1.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user1.uid);
                                        assert.equal(user.name, user1.name);
                                        assert.equal(user.avatar, user1.avatar);
                                    }

                                    assert.ok(!rooms[room._id]);

                                    rooms[room._id] = room;
                                })
                                .then(() => done())
                                .catch(err => done(err));
                        });
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 < index1) {
                        it(`POST /room with users: [${index0}, ${index1}] and personal=true should create new personal room with them`, done => {
                            let user0 = users[index0];
                            let user1 = users[index1];
                            request({
                                hostname: config.hostname,
                                port: config.port,
                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            },{ users: [user0.uid, user1.uid], personal: true })
                                .then(res => {
                                    assert.equal(200, res.statusCode);
                                    return fetchJSONData(res);
                                })
                                .then(room => {
                                    assert.ok(room);
                                    assert.ok(room._id);
                                    assert.ok(room.messages);
                                    assert.ok(room.users);
                                    assert.equal(room.personal, true);
                                    assert.equal(room.users.length, 2);
                                    {
                                        let user = room.users.find(u => u.uid == user0.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user0.uid);
                                        assert.equal(user.name, user0.name);
                                        assert.equal(user.avatar, user0.avatar);
                                    }
                                    {
                                        let user = room.users.find(u => u.uid == user1.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user1.uid);
                                        assert.equal(user.name, user1.name);
                                        assert.equal(user.avatar, user1.avatar);
                                    }

                                    assert.ok(!rooms[room._id]);

                                    rooms[room._id] = room;
                                })
                                .then(() => done())
                                .catch(err => done(err));
                        });
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        it(`POST /room again with the same users: [${index0}, ${index1}] and personal=true should return previously created room with them`, done => {
                            let user0 = users[index0];
                            let user1 = users[index1];
                            request({
                                hostname: config.hostname,
                                port: config.port,
                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            }, { users: [user0.uid, user1.uid], personal: true })
                                .then(res => {
                                    assert.equal(200, res.statusCode);
                                    return fetchJSONData(res);
                                })
                                .then(newRoom => {
                                    let oldRoom = rooms[newRoom._id];

                                    assert.ok(oldRoom);
                                    assert.ok(oldRoom.messages);
                                    assert.equal(oldRoom._id, newRoom._id);
                                    assert.equal(oldRoom.personal, newRoom.personal);
                                    assert.equal(oldRoom.users.length, newRoom.users.length);
                                    {
                                        let user = newRoom.users.find(u => u.uid == user0.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user0.uid);
                                        assert.equal(user.name, user0.name);
                                        assert.equal(user.avatar, user0.avatar);
                                    }
                                    {
                                        let user = newRoom.users.find(u => u.uid == user1.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, user1.uid);
                                        assert.equal(user.name, user1.name);
                                        assert.equal(user.avatar, user1.avatar);
                                    }

                                    for (let oldUser of oldRoom.users) {
                                        let user = oldRoom.users.find(u => u.uid == oldUser.uid);
                                        assert.ok(user);
                                        assert.equal(user.uid, oldUser.uid);
                                        assert.equal(user.name, oldUser.name);
                                        assert.equal(user.avatar, oldUser.avatar);
                                    }
                                })
                                .then(() => done())
                                .catch(err => done(err));
                        });
                    }
                }
            }

            for (let personal of [true, false]) {
                it(`POST /room with no users should return 409`, done => {
                    let user = users[includeUserIndices[0]];
                    request({
                        hostname: config.hostname,
                        port: config.port,
                        path: `/room?sessionKey=${user.sessionKey}&sessionValue=${user.sessionValue}&authDeviceId=${user.authDeviceId}`,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    }, { users: [], personal: personal })
                        .then(res => {
                            assert.equal(409, res.statusCode);
                        })
                        .then(() => done())
                        .catch(err => done(err));
                });
            }

            for (let index0 of includeUserIndices) {
                    for (let personal of [true, false]) {
                        it(`POST /room with only 1 user: [${index0}] and personal=${personal} should return 409`, done => {
                            let user0 = users[index0];
                            request({
                                hostname: config.hostname,
                                port: config.port,
                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            }, { users: [user0.uid], personal: personal })
                                .then(res => {
                                    assert.equal(409, res.statusCode);
                                })
                                .then(() => done())
                                .catch(err => done(err));
                        });
                    }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 == index1) {
                        for (let personal of [true, false]) {
                            it(`POST /room with the same user as users: [${index1}, ${index0}] and personal=${personal} should return 400`, done => {
                                let user0 = users[index0];
                                let user1 = users[index1];
                                request({
                                    hostname: config.hostname,
                                    port: config.port,
                                    path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    }
                                }, { users: [user0.uid, user1.uid], personal: personal })
                                    .then(res => {
                                        assert.equal(400, res.statusCode);
                                    })
                                    .then(() => done())
                                    .catch(err => done(err));
                            });
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        for (let index2 of includeUserIndices) {
                            if (index2 != index1 && index2 != index0) {
                                for (let index3 of includeUserIndices) {
                                    if (index3 == index2 || index3 == index1 || index3 == index0) {
                                        it(`POST /room with users: [${index0}, ${index1}, ${index2}, ${index3}] should return 400`, done => {
                                            let user0 = users[index0];
                                            let user1 = users[index1];
                                            let user2 = users[index2];
                                            let user3 = users[index3];
                                            request({
                                                hostname: config.hostname,
                                                port: config.port,
                                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                }
                                            }, { users: [user0.uid, user1.uid, user2.uid, user3.uid] })
                                                .then(res => {
                                                    assert.equal(400, res.statusCode);
                                                })
                                                .then(() => done())
                                                .catch(err => done(err));
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        for (let index2 of includeUserIndices) {
                            if (index2 != index1 && index2 != index0) {
                                for (let index3 of includeUserIndices) {
                                    if (index3 != index2 && index3 != index1 && index3 != index0) {
                                        it(`POST /room with users: [${index1}, ${index2}, ${index3}] from user ${index0} should return 400`, done => {
                                            let user0 = users[index0];
                                            let user1 = users[index1];
                                            let user2 = users[index2];
                                            let user3 = users[index3];
                                            request({
                                                hostname: config.hostname,
                                                port: config.port,
                                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                }
                                            }, { users: [user1.uid, user2.uid, user3.uid], personal: true })
                                                .then(res => {
                                                    assert.equal(400, res.statusCode);
                                                })
                                                .then(() => done())
                                                .catch(err => done(err));
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for (let index0 of includeUserIndices) {
                for (let index1 of includeUserIndices) {
                    if (index0 != index1) {
                        for (let index2 of includeUserIndices) {
                            if (index2 != index1 && index2 != index0) {
                                for (let index3 of includeUserIndices) {
                                    if (index3 != index2 && index3 != index1 && index3 != index0) {
                                        it(`POST /room with users: [${index0}, ${index1}, ${index2}, ${index3}] and personal=true should return 400`, done => {
                                            let user0 = users[index0];
                                            let user1 = users[index1];
                                            let user2 = users[index2];
                                            let user3 = users[index3];
                                            request({
                                                hostname: config.hostname,
                                                port: config.port,
                                                path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                }
                                            }, { users: [user0.uid, user1.uid, user2.uid, user3.uid], personal: true })
                                                .then(res => {
                                                    assert.equal(400, res.statusCode);
                                                })
                                                .then(() => done())
                                                .catch(err => done(err));
                                        });
                                    }
                                }

                                it(`POST /room with users: [${index0}, ${index1}, ${index2}] and personal=true should return 400`, done => {
                                    let user0 = users[index0];
                                    let user1 = users[index1];
                                    let user2 = users[index2];
                                    request({
                                        hostname: config.hostname,
                                        port: config.port,
                                        path: `/room?sessionKey=${user0.sessionKey}&sessionValue=${user0.sessionValue}&authDeviceId=${user0.authDeviceId}`,
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        }
                                    }, { users: [user0.uid, user1.uid, user2.uid], personal: true })
                                        .then(res => {
                                            assert.equal(400, res.statusCode);
                                        })
                                        .then(() => done())
                                        .catch(err => done(err));
                                });
                            }
                        }
                    }
                }
            }
        });

    //    describe('PUT /user/:_id', () => {
    //        let basePath = '/user';

    //        for (let exampleUser of exampleUsers) {
    //            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUser.uid}`;
    //            it('PUT example user should update it', done => {
    //                let postData = Object.assign({}, exampleUser);
    //                postData.name = postData.name.replace(/([0-9]+)$/, (str, p1) => { return String(Number(p1) + 1) });
    //                postData.avatar = postData.avatar.replace(/https/, 'http');

    //                let req = http.request({
    //                    hostname: 'localhost',
    //                    port: config.port,
    //                    path: basePath + `/${exampleUser._id}` + queryParams,
    //                    method: 'PUT',
    //                    headers: {
    //                        'Content-Type': 'application/json',
    //                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
    //                    }
    //                }, res => {
    //                    assert.equal(200, res.statusCode);

    //                    let chunks = [];

    //                    res.on('data', chunk => chunks.push(chunk));

    //                    res.on('end', () => {
    //                        let data = JSON.parse(Buffer.concat(chunks).toString());

    //                        assert.ok(data._id);
    //                        assert.equal(data.uid, postData.uid);
    //                        assert.equal(data.name, postData.name);
    //                        assert.equal(data.avatar, postData.avatar);


    //                        Object.assign(exampleUser, data);

    //                        done();
    //                    });

    //                });

    //                req.on('error', err => done(err));

    //                req.write(JSON.stringify(postData));
    //                req.end();
    //            });
    //        }

    //        let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;
    //        it('PUT to another user should return 401', done => {
    //            let postData = Object.assign({}, exampleUsers[1]);

    //            let req = http.request({
    //                hostname: 'localhost',
    //                port: config.port,
    //                path: basePath + `/${exampleUsers[1]._id}` + queryParams,
    //                method: 'PUT',
    //                headers: {
    //                    'Content-Type': 'application/json',
    //                    'Content-Length': Buffer.byteLength(JSON.stringify(postData))
    //                }
    //            }, res => {
    //                assert.equal(401, res.statusCode);

    //                done()
    //            });

    //            req.on('error', err => done(err));

    //            req.write(JSON.stringify(postData));
    //            req.end();
    //        });

    //        it('PUT new uid should return 400', done => {
    //            let postData = Object.assign({}, exampleUsers[0]);
    //            postData.uid = exampleUsers[1].uid;

    //            let req = http.request({
    //                hostname: 'localhost',
    //                port: config.port,
    //                path: basePath + `/${exampleUsers[0]._id}` + queryParams,
    //                method: 'PUT',
    //                headers: {
    //                    'Content-Type': 'application/json',
    //                    'Content-Length': Buffer.byteLength(JSON.stringify(postData))
    //                }
    //            }, res => {
    //                assert.equal(400, res.statusCode);

    //                done()
    //            });

    //            req.on('error', err => done(err));

    //            req.write(JSON.stringify(postData));
    //            req.end();
    //        });

    //        it('PUT _id different from user\'s _id should return 400', done => {
    //            let postData = Object.assign({}, exampleUsers[0]);
    //            postData._id = exampleUsers[1]._id;

    //            let req = http.request({
    //                hostname: 'localhost',
    //                port: config.port,
    //                path: basePath + `/${exampleUsers[0]._id}` + queryParams,
    //                method: 'PUT',
    //                headers: {
    //                    'Content-Type': 'application/json',
    //                    'Content-Length': Buffer.byteLength(JSON.stringify(postData))
    //                }
    //            }, res => {
    //                assert.equal(400, res.statusCode);

    //                done()
    //            });

    //            req.on('error', err => done(err));

    //            req.write(JSON.stringify(postData));
    //            req.end();
    //        });
    //    });

    //    describe('GET /room', () => {
    //        let basePath = '/room';
    //        let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;

    //        it('GET should return 200', done => {
    //            let req = http.request({
    //                hostname: 'localhost',
    //                port: config.port,
    //                path: basePath + queryParams,
    //                method: 'GET',
    //                headers: {
    //                    'Content-Type': 'application/json',
    //                }
    //            }, res => {
    //                assert.equal(200, res.statusCode);

    //                done();
    //                //let chunks = [];

    //                //res.on('data', chunk => chunks.push(chunk));

    //                //res.on('end', () => {
    //                //    let data = JSON.parse(Buffer.concat(chunks).toString());

    //                //    assert.ok(data.length);
    //                //    assert.ok(data.length >= exampleUsers.length);

    //                //    for (let exampleUser of exampleUsers) {
    //                //        let user = data.find(elem => elem.uid == exampleUser.uid);

    //                //        assert.ok(user);
    //                //        assert.equal(user.uid, exampleUser.uid);
    //                //        assert.equal(user.name, exampleUser.name);
    //                //        assert.equal(user.avatar, exampleUser.avatar);
    //                //    }
    //                //    done();
    //                //});

    //            });

    //            req.on('error', err => done(err));
    //            req.end();
    //        });
    //    });
    });
});