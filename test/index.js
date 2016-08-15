import http from 'http';
import assert from 'assert';
import config from './../src/config.js'

describe('Battle chat User', () => {
    let sessionAuth = {
        key: 'PHPSESSID',
        value: 'value'
    };

    describe('REST server', () => {
        let exampleUsers = [
            {
                uid: 'test1',
                name: 'TEST 1',
                avatar: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png'
            },
            {
                uid: 'test2',
                name: 'TEST 2',
                avatar: 'https://www.google.com/images/nav_logo242.png'
            },
            {
                uid: 'test3',
                name: 'TEST 3',
                avatar: ''
            },
            {
                uid: 'test4',
                name: 'TEST 4',
                avatar: ''
            },
        ];

        describe('auth', () => {
            let correctPath = `/user?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;
            let incorrectPath = `/user?${sessionAuth.key}=${sessionAuth.value + '0'}&uid=${exampleUsers[0].uid}`

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
        });

        describe('/user', () => {
            let basePath = '/user';
            let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUsers[0].uid}`;

            for (let exampleUser of exampleUsers) {
                let queryParams = `?${sessionAuth.key}=${sessionAuth.value}&uid=${exampleUser.uid}`;
                it('POST example user should create or fetch it', done => {
                    let postData = exampleUser;

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
        });
    });
});