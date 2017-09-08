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

function sendToIOs(token, title, body, additionalData) {
    var notification = new apn.Notification();
    if (additionalData)
        notification.payload = additionalData;
    notification.body = body;
    notification.title = title;
    notification.topic = config.topic;

    if (config.badgeIsAlwaysOne) {
        notification.badge = 1;
    }

    return getApnProvider().send(notification, token);
};

function sendToAndroid(token, title, body, additionalData) {
    const message = new gcm.Message({
        priority: 'high',
        notification: {
            title,
            body,
            badge: config.badgeIsAlwaysOne ? 1 : undefined,
            msgcnt: config.badgeIsAlwaysOne ? 1 : undefined,
        },
        data: additionalData
    });

    if (config.badgeIsAlwaysOne) {
        message.addData('msgcnt', '1');
        message.addData('badge', '1');
    }

    return new Promise((resolve, reject) =>
        getGcmSender().send(message, { registrationTokens: [token] }, function (err, response) {
            if (err) reject(err);
            else resolve(response);
        })
    );
};

export function sendToIOsNotificationAboutNewMessage(token, author, text, roomId) {
    return sendToIOs(token,
        config.strings.newMessageTitle({ author }),
        config.strings.newMessageBody({ text }),
        { rid: roomId }
    );
}

export function sendToAndroidNotificationAboutNewMessage(token, author, text, roomId) {
    return sendToAndroid(token,
        config.strings.newMessageTitle({ author }),
        config.strings.newMessageBody({ text }),
        { rid: roomId }
    );
}