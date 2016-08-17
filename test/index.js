import http from 'http';
import mongoose from 'mongoose';
import assert from 'assert';
import stripBom from 'strip-bom-buf';
import config from './config.js'

function request(options, data) {
    return new Promise((resolve, reject) => {
        let req = http.request(options, res => resolve(res));

        req.on('error', err => reject(err))
        if (data) req.write(data);
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
                it('GET user should return test user', done => {
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