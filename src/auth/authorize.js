import request from 'request';
import stripBom from 'strip-bom-buf';
import config from './../config';

export default function authorize(sessionId, sessionName) {
    return new Promise((resolve, reject) => {
        request
            .get(config.auth, {
                qs: {
                    [sessionId]: sessionName
                }
            })
            .on('response', response => {
                response.on('data', data => {
                    data = stripBom(data).toString('utf-8');

                    if (/^\(.*\)$/.test(data)) {
                        data = data.slice(1, -1);
                    }
                    try {
                        data = JSON.parse(data);

                        if ((data.answer_type == "ok") ||
                            (data.answer_type == "err" && data.answer && data.answer.error_code == "10001")) {

                            resolve(data);
                        } else {
                            reject(data.answer.error_text);
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
            })
            .on('error', err => {
                reject(err);
            })
    });
}