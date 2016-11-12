import apn from 'apn';
import gcm from 'node-gcm';
import config from './config';

var apnProvider, gcmSender;

function getApnProvider() {
    if (apnProvider) return apnProvider;

    apnProvider = new apn.Provider(config.apn);

    return apnProvider;
}

function getGcmSender() {
    if (gcmSender) return gcmSender;

    gcmSender = new gcm.Sender(config.gcm.apiKey);

    return gcmSender;
}

function sendToIOs(token, title, body) {
    var notification = new apn.Notification();
    notification.body = body;
    notification.title = title;
    notification.topic = config.topic;
    return getApnProvider().send(notification, token);
};

function sendToAndroid(token, title, body) {
    let message = new gcm.Message({
        priority: 'high',
        notification: {
            title,
            body
        }
    });

    return new Promise((resolve, reject) =>
        getGcmSender().send(message, { registrationTokens: [token] }, function (err, response) {
            if (err) reject(err);
            else resolve(response);
        })
    );
};

export function sendToIOsNotificationAboutNewMessage(token, author, text) {
    return sendToIOs(token,
        config.strings.newMessageTitle({ author }),
        config.strings.newMessageBody({ text }));
}

export function sendToAndroidNotificationAboutNewMessage(token, author, text) {
    return sendToAndroid(token,
        config.strings.newMessageTitle({ author }),
        config.strings.newMessageBody({ text }));
}