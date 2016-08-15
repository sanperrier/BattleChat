﻿function has(object, key) {
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

        function authorize(req, res, next) {
            let PHPSESSID = req.cookies.PHPSESSID || req.query.PHPSESSID;
            let uid = req.cookies.uid || req.query.uid; // TODO: remove it and get uid from auth

            if (!PHPSESSID) {
                return next(new restify.UnauthorizedError("Missing required query param PHPSESSID"));
            }

            if (!uid) {
                return next(new restify.UnauthorizedError("Missing required query param uid"));
            }

            auth('PHPSESSID', PHPSESSID)
                .then(() => {
                    if(!req.user) req.user = {};
                    req.user.uid = uid;

                    console.log(`User [uid=${uid}] authorized with PHPSESSID=${PHPSESSID}`);
                    return next();
                })
                .catch(err => {
                    console.log(req, err);
                    return next(new restify.UnauthorizedError(err));
                })
        }

        function populateUser(req, res, next) {
            if (!req.user || !req.user.uid) {
                return next(new restify.BadRequestError("Missing required query param uid"));
            }

            this.User
                .findOne({ uid: req.user.uid }).exec()
                .then(user => {
                    if (!user) return next(new restify.ResourceNotFoundError(`No such user [uid=${uid}]`));

                    req.user = user;
                    return next();
                })
                .catch(err => next(err));
        }

        function get_users(req, res, next) {
            this.User
                .find({})
                .exec((err, users) => {
                    if (err)
                        return next(err);

                    res.send(users);
                    return next();
                });
        }

        function get_user(req, res, next) {
            if (req.params._id == req.user._id) {
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
            } else {
                this.User
                    .findOne({ _id: req.params._id })
                    .exec()
                    .then(user => {
                        if (!user) return next(new restify.ResourceNotFoundError(`No such user [_id=${req.params._id}]`));

                        res.send(user);
                        return next();
                    })
                    .catch(err => next(err));
            }
        }

        function post_user(req, res, next) {
            console.log(req.body);
            if (!req.body.uid || !req.body.name) {
                return next(new restify.MissingParameterError("Missing required param or attribute"));
            }

            this.User
                .findOne({ uid: req.body.uid }).exec()
                .then(user => {
                    if (user) {
                        user.name = req.body.name;
                        user.avatar = req.body.avatar;

                        user
                            .save()
                            .then(() => {
                                res.send(user);
                                return next();
                            })
                            .catch(err => next(err));

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
        }

        function put_user(req, res, next) {
            if (req.params._id != req.user._id) return next(new restify.InvalidCredentialsError("PUT to another user is forbidden"));
            if (req.body._id && req.body._id != req.user._id) return next(new restify.BadRequestError("_id is not correct"));
            if (req.body.uid && req.body._id != req.user.uid) return next(new restify.BadRequestError("uid is not correct"));

            req.user.name = req.body.name;
            req.user.avatar = req.body.avatar;
            req.user
                .save()
                .then(() => {
                    res.send(user);
                    return next();
                })
                .catch(err => next(err));
        }

        function get_rooms(req, res, next) {
            let condition = {
                users: req.user._id
            };

            if (has(req.query, 'personal')) {
                condition.personal = true;
            }

            this.Room
                .find(condition)
                .populate('users', '_id uid name avatar')
                .exec((err, rooms) => {
                    if (err) {
                        return next(err);
                    }

                    if (rooms) {
                        res.send(rooms);
                        return next();
                    } else {
                        return next(new restify.ResourceNotFoundError("Could not find any such room"));
                    }
                });
        }

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

        function post_room(req, res, next) {
            this.User
                .find({ _id: { $in: req.body.users } })
                .exec((err, users) => {
                    if (err)
                        return next(err);

                    if (!users)
                        return next(new restify.BadRequestError("Empty users specified"));

                    if (req.body.personal) {
                        if (users.length != 2)
                            return next(new restify.BadRequestError("Personal room can be created only with 2 distinct users"));

                        Room
                            .findOne({
                                personal: true,
                                users: { $all: users }
                            })
                            .exec((err, room) => {
                                if (err)
                                    return next(err);

                                if (room) {
                                    res.send(room);
                                    return next();
                                    //return next(new restify.ConflictError("Personal room for these users already exists"));
                                }
                            });
                    }

                    let room = new Room();

                    for (let user of users)
                        room.users.push(user);

                    room.personal = req.body.personal ? true : false;

                    room.save((err) => {
                        if (err)
                            return next(err);

                        for (let user of users) {
                            user.chats.push(room);
                            user.save();
                        }

                        room
                            .populate('messages')
                            .populate('users', '_id uid name avatar', (err) => {
                                if (err)
                                    return next(err);

                                res.send(room);
                                return next();
                            });
                    });
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

        this.server.get('/user/', authorize.bind(this), get_users.bind(this));
        this.server.get('/user/:_id', authorize.bind(this), populateUser.bind(this), get_user.bind(this));
        this.server.post('/user/', authorize.bind(this), post_user.bind(this));
        this.server.put('/user/:_id', authorize.bind(this), populateUser.bind(this), put_user);

        this.server.get('/room/', authorize.bind(this), get_rooms.bind(this));
        this.server.get('/room/:_id', authorize.bind(this), get_room);
        this.server.post('/room/', authorize.bind(this), post_room);

        this.server.post('/room/:room_id/user/', authorize.bind(this), post_room_user);

        this.server.post('/room/:room_id/message/', authorize.bind(this), post_message);

        return this;
    };

    listen(port, cb) {
        return this.server.listen(port, cb);
    };
};