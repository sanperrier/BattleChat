import http from 'http';
import stripBom from 'strip-bom-buf';
import config from './config';
import mongoose from 'mongoose';

export {config};

export function request(options, data) {
    return new Promise((resolve, reject) => {
        let req = http.request(options, res => resolve(res));

        req.on('error', err => reject(err))
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

export function fetchJSONData(res) {
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

function dropCollection(connection, name) {
    return new Promise((resolve, reject) => {
        connection.collection(name).drop((err, result) => {
            if (err && err.message != 'ns not found') reject(err);
            else resolve();
        });
    });
}

export function clearDbAndGetTestUsers(num) {
    return new Promise((resolve, reject) => {
        if (mongoose.connection.readyState == 0) {
            mongoose.connect(config.db, (err) => {
                if (err) reject(err);
                else resolve(mongoose.connection);
            });
        } else if (mongoose.connection.readyState == 1) {
            resolve(mongoose.connection);
        } else if (mongoose.connection.readyState == 2) {
            mongoose.connection.once('connected', () => {
                resolve(mongoose.connection);
            });
        } else if (mongoose.connection.readyState == 3) {
            mongoose.connection.once('disconnected', () => {
                mongoose.connect(config.db, (err) => {
                    if (err) reject(err);
                    else {
                        resolve(mongoose.connection);
                    }
                });
            });
        }
    })
    .then(connection => Promise.all([dropCollection(connection, 'rooms'), dropCollection(connection, 'users'), dropCollection(connection, 'messages')]))
    .then(() => {
        let promises = [];
        for (var index = 0; index < num; ++index) {
            let login = `battle-chat-tester${index}`;
            let email = `battle-chat-tester${index}@example.org`;
            let passwd = `battle-chat-tester${index}`;
            let authDeviceId = config.deviceId;

            promises.push(
                request({
                    hostname: config.gameHostname,
                    port: 80,
                    path: config.gameRegPath(login, email, passwd, authDeviceId),
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                    .then(res => fetchJSONData(res))
                    .then(data => {
                        if (data.answer_type == "ok") return data;
                        else if (data.answer_type == "err") {
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
                        }
                        else throw new Error(JSON.stringify(data));
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
                            return user;
                        }
                        else throw new Error(JSON.stringify(data));
                    })
            );
        }
        return Promise.all(promises);
    });
}