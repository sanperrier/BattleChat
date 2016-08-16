import http from 'http';
import assert from 'assert';
import config from './../src/config.js'

describe('Battle chat', () => {
    let sessionAuth = {
        key: 'PHPSESSID',
        value: ''
    };

    describe('REST server', () => {
        let exampleUsers = [
            {
                uid: 'test1',
                name: 'TEST 1 123456',
                avatar: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png'
            },
            {
                uid: 'test2',
                name: 'TEST 2 123456',
                avatar: 'https://www.google.com/images/nav_logo242.png'
            },
            {
                uid: 'test3',
                name: 'TEST 3 123456',
                avatar: ''
            },
            {
                uid: 'test4',
                name: 'TEST 4 123456',
                avatar: ''
            },
        ];

        describe('auth', () => {
            let correctPath = `/user?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;
            let incorrectPath = `/user?${sessionAuth.key}=${sessionAuth.value + '0'}&uid=${exampleUsers[0].uid}`;
            let incorrectPathMissingSession = `/user?uid=${exampleUsers[0].uid}`;

            it('Simple GET /user with correct session value should return 200', done => {
                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: correctPath,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, res => {
                    assert.equal(200, res.statusCode);
                    done();
                });

                req.on('error', err => done(err));
                req.end();
            });

            it('Simple GET /user with incorrect session value should return 403 or 401', done => {
                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: incorrectPath,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, res => {
                    assert.ok(res.statusCode == 401 || res.statusCode == 403);
                    done();
                });

                req.on('error', err => done(err));
                req.end();
            });

            it('Simple GET /user without session value should return 403 or 401', done => {
                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: incorrectPathMissingSession,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, res => {
                    assert.ok(res.statusCode == 401 || res.statusCode == 403);
                    done();
                });

                req.on('error', err => done(err));
                req.end();
            });
        });

        describe('POST /user', () => {
            let basePath = '/user';

            for (let exampleUser of exampleUsers) {
                let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUser.uid}`;
                it('POST example user should create or fetch it', done => {
                    let postData = Object.assign({}, exampleUser);

                    let req = http.request({
                        hostname: 'localhost',
                        port: config.port,
                        path: basePath + queryParams,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                        }
                    }, res => {
                        assert.equal(200, res.statusCode);

                        let chunks = [];

                        res.on('data', chunk => chunks.push(chunk));

                        res.on('end', () => {
                            let data = JSON.parse(Buffer.concat(chunks).toString());

                            assert.ok(data._id);
                            assert.equal(data.uid, postData.uid);
                            assert.equal(data.name, postData.name);
                            assert.equal(data.avatar, postData.avatar);

                            exampleUser._id = data._id;

                            done();
                        });

                    });

                    req.on('error', err => done(err));

                    req.write(JSON.stringify(postData));
                    req.end();
                });
            }

            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;
            it('POST user without uid should return 409', done => {
                let postData = Object.assign({}, exampleUsers[0]);
                delete postData.uid;

                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + queryParams,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                    }
                }, res => {
                    assert.equal(409, res.statusCode);

                    done()
                });

                req.on('error', err => done(err));

                req.write(JSON.stringify(postData));
                req.end();
            });

            it('POST user without name should return 409', done => {
                let postData = Object.assign({}, exampleUsers[0]);
                delete postData.name;

                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + queryParams,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                    }
                }, res => {
                    assert.equal(409, res.statusCode);

                    done()
                });

                req.on('error', err => done(err));

                req.write(JSON.stringify(postData));
                req.end();
            });
        });

        describe('GET /user', () => {
            let basePath = '/user';
            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;

            it('GET should return at least example users', done => {
                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + queryParams,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, res => {
                    assert.equal(200, res.statusCode);

                    let chunks = [];

                    res.on('data', chunk => chunks.push(chunk));

                    res.on('end', () => {
                        let data = JSON.parse(Buffer.concat(chunks).toString());

                        assert.ok(data.length);
                        assert.ok(data.length >= exampleUsers.length);

                        for (let exampleUser of exampleUsers) {
                            let user = data.find(elem => elem.uid == exampleUser.uid);

                            assert.ok(user);
                            assert.equal(user.uid, exampleUser.uid);
                            assert.equal(user.name, exampleUser.name);
                            assert.equal(user.avatar, exampleUser.avatar);
                        }
                        done();
                    });

                });

                req.on('error', err => done(err));
                req.end();
            });
        });

        describe('GET /user/:_id', () => {
            let basePath = '/user';
            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;

            for (let exampleUser of exampleUsers) {
                let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUser.uid}`;
                it('GET user by example id should return example user', done => {
                    let req = http.request({
                        hostname: 'localhost',
                        port: config.port,
                        path: basePath + `/${exampleUser._id}` + queryParams,
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    }, res => {
                        assert.equal(200, res.statusCode);

                        let chunks = [];

                        res.on('data', chunk => chunks.push(chunk));

                        res.on('end', () => {
                            let user = JSON.parse(Buffer.concat(chunks).toString());

                            assert.ok(user);
                            assert.equal(user._id, exampleUser._id);
                            assert.equal(user.uid, exampleUser.uid);
                            assert.equal(user.name, exampleUser.name);
                            assert.equal(user.avatar, exampleUser.avatar);

                            done();
                        });

                    });

                    req.on('error', err => done(err));
                    req.end();
                });
            }

            it('GET non-existent user should return 404', done => {
                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + `/000000bb7d6723344a71669b` + queryParams,
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }, res => {
                    assert.equal(404, res.statusCode);

                    done();
                });

                req.on('error', err => done(err));
                req.end();
            });
        });

        describe('PUT /user/:_id', () => {
            let basePath = '/user';

            for (let exampleUser of exampleUsers) {
                let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUser.uid}`;
                it('PUT example user should update it', done => {
                    let postData = Object.assign({}, exampleUser);
                    postData.name = postData.name.replace(/([0-9]+)$/, (str, p1) => { return String(Number(p1) + 1) });
                    postData.avatar = postData.avatar.replace(/https/, 'http');

                    let req = http.request({
                        hostname: 'localhost',
                        port: config.port,
                        path: basePath + `/${exampleUser._id}` + queryParams,
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                        }
                    }, res => {
                        assert.equal(200, res.statusCode);

                        let chunks = [];

                        res.on('data', chunk => chunks.push(chunk));

                        res.on('end', () => {
                            let data = JSON.parse(Buffer.concat(chunks).toString());

                            assert.ok(data._id);
                            assert.equal(data.uid, postData.uid);
                            assert.equal(data.name, postData.name);
                            assert.equal(data.avatar, postData.avatar);


                            Object.assign(exampleUser, data);

                            done();
                        });

                    });

                    req.on('error', err => done(err));

                    req.write(JSON.stringify(postData));
                    req.end();
                });
            }

            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;
            it('PUT to another user should return 401', done => {
                let postData = Object.assign({}, exampleUsers[1]);

                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + `/${exampleUsers[1]._id}` + queryParams,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                    }
                }, res => {
                    assert.equal(401, res.statusCode);

                    done()
                });

                req.on('error', err => done(err));

                req.write(JSON.stringify(postData));
                req.end();
            });

            it('PUT new uid should return 400', done => {
                let postData = Object.assign({}, exampleUsers[0]);
                postData.uid = exampleUsers[1].uid;

                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + `/${exampleUsers[0]._id}` + queryParams,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                    }
                }, res => {
                    assert.equal(400, res.statusCode);

                    done()
                });

                req.on('error', err => done(err));

                req.write(JSON.stringify(postData));
                req.end();
            });

            it('PUT _id different from user\'s _id should return 400', done => {
                let postData = Object.assign({}, exampleUsers[0]);
                postData._id = exampleUsers[1]._id;

                let req = http.request({
                    hostname: 'localhost',
                    port: config.port,
                    path: basePath + `/${exampleUsers[0]._id}` + queryParams,
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(JSON.stringify(postData))
                    }
                }, res => {
                    assert.equal(400, res.statusCode);

                    done()
                });

                req.on('error', err => done(err));

                req.write(JSON.stringify(postData));
                req.end();
            });
        });
    });
});