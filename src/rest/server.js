function has(object, key) {
    return object ? hasOwnProperty.call(object, key) : false;
}

import restify from 'restify';
import cookieParser from 'restify-cookies';
import bunyan from 'bunyan';

import * as schemas from './../db/schemas';

import auth from './../auth/authorize';

export default class Server {
    constructor(connection) {
        this.Room = connection.model('Room', schemas.Room)
        this.Message = connection.model('Message', schemas.Message);
        this.User = connection.model('User', schemas.User);

        this.server = restify.createServer({
            name: 'Battle chat RESTify server',
        });

        this.server.on('after', restify.auditLogger({
            log: bunyan.createLogger({
                name: 'Battle chat RESTify server',
                streams: [
                    { level: "error", stream: process.stderr },
                    { level: process.env.NODE_ENV == "debug" ? "debug" : "info", stream: process.stdout },
                    { level: process.env.NODE_ENV == "debug" ? "trace" : "debug", type: 'rotating-file', period: '1d', count: 30, path: 'server.log' }]
            }),
            body: true,
        }));

        this.server.use(restify.acceptParser(this.server.acceptable))
            .use(restify.authorizationParser())
            .use(restify.dateParser())
            .use(restify.queryParser({ mapParams: false }))
            .use(restify.bodyParser({ mapParams: false }))
            .use(cookieParser.parse)
            .use(restify.throttle({
                burst: 100,
                rate: 10,
                ip: false,
                xff: true,
            }));

        this.server.get('/user/', this.authorize.bind(this), this.populateUser.bind(this), this.get_user.bind(this));

        this.server.post('/room/', this.authorize.bind(this), this.post_room.bind(this));
        this.server.get('/room/', this.authorize.bind(this), this.populateUser.bind(this), this.get_rooms.bind(this));
        this.server.get('/room/:_id', this.authorize.bind(this), this.populateUser.bind(this), this.get_room.bind(this));

        this.server.post('/room/:room_id/message', this.authorize.bind(this), this.populateUser.bind(this), this.post_room_message.bind(this));
        //this.server.post('/room/:room_id/user/', this.authorize.bind(this), post_room_user);

        return this;
    };

    authorize(req, res, next) {
        let sessionKey = String(req.cookies.sessionKey || req.query.sessionKey);
        let sessionValue = String(req.cookies.sessionValue || req.query.sessionValue);
        let authDeviceId = String(req.cookies.authDeviceId || req.query.authDeviceId);

        if (!sessionKey) {
            return next(new restify.UnauthorizedError("Missing required query param sessionKey"));
        }

        if (!sessionValue) {
            return next(new restify.UnauthorizedError("Missing required query param sessionValue"));
        }

        if (!authDeviceId) {
            return next(new restify.UnauthorizedError("Missing required query param authDeviceId"));
        }

        let re = /^[a-zA-Z0-9]+$/;
        if (!re.test(sessionKey) || !re.test(sessionValue) || !re.test(authDeviceId)) {
            return next(new restify.UnauthorizedError());
        }

        auth({ sessionKey, sessionValue, authDeviceId })
            .then(data => {
                if (!req.user) req.user = {};
                req.user.uid = data.uid;
                req.user.name = data.name;
                req.user.avatar = data.avatar;

                console.log(`User ${data.name} [uid=${data.uid}] authorized with ${sessionKey}=${sessionValue} and authDeviceId=${authDeviceId}`);
                return next();
            })
            .catch(err => {
                return next(new restify.UnauthorizedError(String(err)));
            })
    };

    populateUser(req, res, next) {
        if (!req.user || !req.user.uid || !req.user.name) return next(new restify.UnauthorizedError("req.user is incorrect"));

        this.User
            .findOne({ uid: req.user.uid }).exec()
            .then(user => {
                if (!user) {
                    let user = new this.User({
                        uid: req.user.uid,
                        name: req.user.name,
                        avatar: req.user.avatar
                    });

                    return user.save();
                } else {
                    if (user.name != req.user.name || user.avatar != req.user.avatar) {
                        user.name = req.user.name;
                        user.avatar = req.user.avatar;
                        return user.save();
                    } else {
                        return user;
                    }
                }
            })
            .then(user => req.user = user)
            .then(() => next())
            .catch(err => next(err));
    };

    get_user(req, res, next) {
        req.user
            .populate('chats').execPopulate()
            .then(user => {
                return this.Room
                    .populate(user.chats, {
                        path: 'users',
                        select: 'uid name avatar'
                    })
                    .then(() => res.send(user));
            })
            .then(() => next())
            .catch(err => next(err));
    };

    post_room(req, res, next) {
        let bodyUsers = req.body.users.map(u => String(u)).filter(u => /^[a-zA-Z0-9]+$/.test(u));
        let personal = Boolean(req.body.personal);

        if (!bodyUsers || !bodyUsers.length || bodyUsers.length < 2) return next(new restify.MissingParameterError("Missing required body param users"));
        if (!bodyUsers.find(uid => uid == req.user.uid)) return next(new restify.BadRequestError("Can't create room without self"));

        this.User
            .find({ uid: { $in: bodyUsers } }).exec()
            .then(users => {
                if (!users || users.length < 2 || bodyUsers.length != users.length) throw new restify.BadRequestError(`Incorrect users specified: ${JSON.stringify(bodyUsers)}`);

                return Promise.resolve()
                    .then(() => {
                        if (personal) {
                            if (users.length != 2) throw new restify.BadRequestError("Personal room can be created only with 2 distinct users");
                            return this.Room.findOne({ personal: true, users: { $all: users } }).exec();
                        } else {
                            return false;
                        }
                    })
                    .then(room => {
                        if (room) return room;
                        else {
                            let room = new this.Room();
                            for (let user of users) {
                                room.users.push(user);
                            }
                            room.personal = personal;

                            return room.save().then(room => {
                                let promises = [];
                                for (let user of users) {
                                    user.chats.push(room);
                                    promises.push(user.save());
                                }
                                return Promise.all(promises).then(() => room);
                            });
                        }
                    })
                    .then(room => room.populate('users', 'uid name avatar').execPopulate())
                    .then(room => res.send(room));
            })
            .then(() => next())
            .catch(err => next(err));
    };

    get_rooms(req, res, next) {
        let condition = {
            users: req.user._id
        };

        if (has(req.query, 'personal')) {
            condition.personal = true;
        }

        this.Room
            .find(condition)
            .populate('users', 'uid name avatar')
            .then(rooms => res.send(rooms))
            .then(() => next())
            .catch(err => next(err));
    };

    get_room(req, res, next) {
        let queryRoomId = String(req.params._id);

        if (!/^[a-zA-Z0-9]+$/.test(queryRoomId)) return next(new restify.BadRequestError(`Incorrect _id query param: ${queryRoomId}`));

        this.Room
            .findOne({
                users: { $in: [req.user._id] },
                _id: { $in: [queryRoomId] }
            })
            .populate('messages')
            .populate('users', 'uid name avatar')
            .then(room => {
                if (!room) throw new restify.ResourceNotFoundError(`Could not find any such room: ${queryRoomId}`);

                if (room.users) {
                    room.users.sort((a, b) => ((a.uid < b.uid) ? -1 : (a.uid > b.uid) ? 1 : 0));
                }

                if (room.messages) {
                    room.messages.sort((a, b) => ((a.date_added < b.date_added) ? -1 : (a.date_added > b.date_added) ? 1 : 0));
                }

                res.send(room);
            })
            .then(() => next())
            .catch(err => next(err));
    }

    post_room_message(req, res, next) {
        let queryRoomId = String(req.params.room_id);

        if (!/^[a-zA-Z0-9]+$/.test(queryRoomId)) return next(new restify.BadRequestError(`Incorrect _id query param: ${queryRoomId}`));

        if (!req.body.text) return next(new restify.MissingParameterError("Missing required message attribute in request body"));

        this.Room
            .findOne({
                users: { $in: [req.user._id] },
                _id: { $in: [queryRoomId] }
            }).exec()
            .then(room => {
                if (!room) throw new restify.ResourceNotFoundError("Could not find room with id=" + req.body.roomId);

                let msg = new this.Message({
                    user: req.user._id,
                    room: room,
                    text: req.body.text,
                    date_added: new Date()
                });

                return msg.save()
                    .then(msg => {
                        room.messages.push(msg);
                        return room.save();
                    })
                    .then(room => room.populate('messages').populate('users', 'uid name avatar').execPopulate())
                    .then(room => res.send(msg));
            })
            .then(() => next())
            .catch(err => next(err));
    }

    listen(port, cb) {
        return this.server.listen(port, cb);
    };
};