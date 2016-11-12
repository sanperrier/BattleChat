import http from 'http';
import stripBom from 'strip-bom-buf';
import config from './config';

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

export default function authorize(params) {
    return request({
        hostname: config.hostname(params),
        port: 80,
        path: config.path(params),
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
        .then(res => fetchJSONData(res))
        .then(data => {
            if (data.client_auth && data.user_id && (data.u_name || data.u_surname || data.u_login || data.is_guest)) {
                return {
                    uid: data.user_id,
                    name: data.u_name ? (data.u_surname ? `${data.u_name} ${data.u_surname}` : data.u_name) : (data.u_login ? data.u_login : `Guest ${data.user_id}`),
                    avatar: data.u_ava || '',
                    iosDeviceId: params.iosDeviceId,
                    androidDeviceId: params.androidDeviceId
                };
            } else {
                throw new Error(JSON.stringify(data));
            }
        });
}