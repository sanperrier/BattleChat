export default {
    apn: {
        cert: "cert.pem",
        key: "key.pem",
        production: false,
    },
    gcm: {
        apiKey: "",
    },
    topic: "",
    strings: {
        newMessageTitle: params => `Message from ${params.author}`,
        newMessageBody: params => params.text,
    }
};