import mongoose from 'mongoose';

let User = new mongoose.Schema(),
    Room = new mongoose.Schema(),
    Message = new mongoose.Schema();

User.add({
    uid: String,
    name: String,
    avatar: String,
    chats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
    iosDeviceId: String,
    androidDeviceId: String,
});

User.methods.toJSON = function () {
    var obj = this.toObject()
    delete obj.iosDeviceId;
    delete obj.androidDeviceId;
    return obj;
};

Room.add({
    personal: Boolean,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    updated_at: Date
});

Message.add({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    text: String,
    date_added: Date
});

export { User, Room, Message };