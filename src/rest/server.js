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

        function get_room(req, res, next) {
            Room
                .findOne({
                    users: req.user._id,
                    _id: req.params._id
                })
                .populate('messages')
                .populate('users', '_id uid name avatar')
                .exec((err, room) => {
                    if (err) {
                        return next(err);
                    }

                    if (!room)
                        return next(new restify.ResourceNotFoundError("Could not find any such room"));

                    if (room.users) {
                        room.users.sort((a, b) => {
                            return ((a.uid < b.uid) ? -1 : (a.uid > b.uid) ? 1 : 0);
                        });
                    }

                    if (room.messages) {
                        room.messages.sort((a, b) => {
                            return ((a.date_added < b.date_added) ? -1 : (a.date_added > b.date_added) ? 1 : 0);
                        });
                    }

                    res.send(room);
                    return next();
                });
        }

        function post_room_user(req, res, next) {
            if (!req.body._id) {
                return next(new restify.MissingParameterError("Missing required param or attribute"));
            }

            Room
                .findOne({
                    users: req.user,
                    _id: req.params.room_id
                })
                .exec((err, room) => {
                    if (err) {
                        return next(err);
                    }

                    if (!room)
                        return next(new restify.ResourceNotFoundError("Could not find any such room"));

                    this.User
                        .findOne({ _id: req.body._id }, '_id uid name avatar chats')
                        .exec((err, user) => {
                            if (err) {
                                return next(err);
                            }

                            if (!user)
                                return next(new restify.ResourceNotFoundError("Could not find any such user"));

                            if (!room.users.some((userId) => { return userId.equals(user._id); })) {
                                room.users.push(user);
                                room.save((err) => {
                                    if (err)
                                        return next(err);

                                    user.chats.push(room);
                                    user.save((err) => {
                                        if (err)
                                            return next(err);

                                        res.send(user);
                                        return next();
                                    });
                                });
                            } else {
                                res.send(user);
                                return next();
                            }
                        });
                });
        }


        function post_message(req, res, next) {
            if (!req.body.text) {
                return next(new restify.MissingParameterError("Missing required message attribute in request body"));
            }

            //if (req.body.room != req.params.room_id) {
            //    return next(new restify.InvalidArgumentError("Room id param is incompatible with room id argument in request body"));
            //}

            Room
                .findOne({
                    users: req.user._id,
                    _id: req.params.room_id
                })
                .exec((err, room) => {
                    if (err) {
                        return next(err);
                    }

                    if (!room) {
                        return next(new restify.ResourceNotFoundError("Could not find room with id=" + req.body.roomId));
                    }

                    let msg = new Message({
                        user: req.user,
                        room: room,
                        text: req.body.text,
                        date_added: new Date()
                    });

                    msg.save((err) => {
                        if (err)
                            return next(err);

                        room.messages.push(msg);

                        room
                            .populate('messages')
                            .populate('users', '_id uid name avatar', (err) => {
                                if (err)
                                    return next(err);

                                room.save((err) => {
                                    if (err)
                                        return next(err);

                                    msg.room = room;

                                    res.send(msg);
                                    return next();
                                });
                            })

                    });
                });
        }

        this.server = restify.createServer();

        this.server.on('after', restify.auditLogger({
            log: new bunyan({
                name: 'mok',
                streams: [{ level: "info", stream: process.stdout },
                    { level: "info", path: 'server.log' }],
            })
        }));

        this.server.use(restify.acceptParser(this.server.acceptable))
            .use(restify.authorizationParser())
            .use(restify.dateParser())
            .use(restify.queryParser({ mapParams: false }))
            .use(restify.bodyParser({ mapParams: false }))
            .use(cookieParser.parse)
            .use(restify.throttle({
                burst: 10,
                rate: 1,
                ip: false,
                xff: true,
            }));

        this.server.get('/user/', this.authorize.bind(this), this.populateUser.bind(this), this.get_user.bind(this));
        //this.server.put('/user/', this.authorize.bind(this), this.populateUser.bind(this), this.put_user.bind(this));
        //this.server.patch('/user/', this.authorize.bind(this), this.populateUser.bind(this), this.put_user.bind(this));

        this.server.get('/room/', this.authorize.bind(this), this.get_rooms.bind(this));
        this.server.get('/room/:_id', this.authorize.bind(this), get_room);
        this.server.post('/room/', this.authorize.bind(this), this.post_room.bind(this));

        this.server.post('/room/:room_id/user/', this.authorize.bind(this), post_room_user);

        this.server.post('/room/:room_id/message/', this.authorize.bind(this), post_message);

        return this;
    };

    authorize(req, res, next) {
        let sessionKey = req.cookies.sessionKey || req.query.sessionKey;
        let sessionValue = req.cookies.sessionValue || req.query.sessionValue;
        let authDeviceId = req.cookies.authDeviceId || req.query.authDeviceId;

        if (!sessionKey) {
            return next(new restify.UnauthorizedError("Missing required query param sessionKey"));
        }

        if (!sessionValue) {
            return next(new restify.UnauthorizedError("Missing required query param sessionValue"));
        }

        if (!authDeviceId) {
            return next(new restify.UnauthorizedError("Missing required query param authDeviceId"));
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
                console.log(req, err);
                return next(new restify.UnauthorizedError(String(err)));
            })
    };

    populateUser(req, res, next) {
        if (!req.user || !req.user.uid || !req.user.name) {
            return next(new restify.UnauthorizedError("req.user is incorrect"));
        }

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
                    return user;
                }
            })
            .then(user => {
                req.user = user;
                return next();
            })
            .catch(err => next(err));
    };

    //get_users(req, res, next) {
    //    this.User
    //        .find({})
    //        .exec((err, users) => {
    //            if (err)
    //                return next(err);

    //            res.send(users);
    //            return next();
    //        });
    //};

    get_user(req, res, next) {
        req.user
            .populate('chats').execPopulate()
            .then(user => {
                this.Room
                    .populate(user.chats, {
                        path: 'users',
                        select: '_id uid name avatar'
                    })
                    .then(() => {
                        res.send(user);
                        return next();
                    })
                    .catch(err => next(err));
            })
            .catch(err => next(err));
    };

    post_user(req, res, next) {
        if (!req.body.uid || !req.body.name) {
            return next(new restify.MissingParameterError("Missing required param or attribute"));
        }

        this.User
            .findOne({ uid: req.body.uid }).exec()
            .then(user => {
                if (user) {
                    req.user = user;
                    req.params._id = user._id.toString();
                    this.put_user(req, res, next);
                } else {
                    let user = new this.User({
                        uid: req.body.uid,
                        session: req.body.session ? req.body.session : "",
                        name: req.body.name,
                        avatar: req.body.avatar
                    });

                    user
                        .save()
                        .then(() => {
                            res.send(user);
                            return next();
                        })
                        .catch(err => next(err));
                }
            })
            .catch(err => next(err));
    };

    put_user(req, res, next) {
        if (req.params._id != req.user._id) return next(new restify.InvalidCredentialsError("PUT to another user is forbidden"));
        if (req.body._id && req.body._id != req.user._id) return next(new restify.BadRequestError("_id is not correct"));
        if (req.body.uid && req.body.uid != req.user.uid) return next(new restify.BadRequestError("uid is not correct"));

        req.user.name = req.body.name;
        req.user.avatar = req.body.avatar;
        req.user
            .save()
            .then(user => {
                res.send(user);
                return next();
            })
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
            .populate('users', '_id uid name avatar')
            .then(rooms => {
                res.send(rooms);
                return next();
            })
            .catch(err => next(err));
    };

    post_room(req, res, next) {
        this.User
            .find({ _id: { $in: req.body.users } }).exec()
            .then(users => {
                if (!users) return next(new restify.BadRequestError("Empty users specified"));

                if (req.body.personal) {
                    if (users.length != 2) return next(new restify.BadRequestError("Personal room can be created only with 2 distinct users"));

                    this.Room
                        .findOne({ personal: true, users: { $all: users } }).exec()
                        .then(room => {
                            if (room) {
                                room
                                    .populate('messages')
                                    .populate('users', '_id uid name avatar')
                                    .execPopulate()
                                    .then(room => {
                                        res.send(room);
                                        return next();
                                    })
                                    .catch(err => next(err));

                            } else {
                                let room = new room();

                                for (let user of users)
                                    room.users.push(user);

                                room.personal = true;

                                room
                                    .save()
                                    .then(room => {
                                        room
                                            .populate('users', '_id uid name avatar')
                                            .execPopulate()
                                            .then(room => {
                                                res.send(room);
                                                return next();
                                            })
                                            .catch(err => next(err));
                                    })
                                    .catch(err => next(err));
                            }
                        })
                        .catch(err => next(err));
                } else {
                    let room = new Room();

                    for (let user of users)
                        room.users.push(user);

                    room.personal = false;

                    room
                        .save()
                        .then(room => {
                            room
                                .populate('users', '_id uid name avatar')
                                .execPopulate()
                                .then(room => {
                                    res.send(room);
                                    return next();
                                })
                                .catch(err => next(err));
                        })
                        .catch(err => next(err));
                }
            })
            .catch(err => next(err));
    };

    listen(port, cb) {
        return this.server.listen(port, cb);
    };
};