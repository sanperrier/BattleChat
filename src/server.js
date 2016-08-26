'use strict'

import config from './config';
import Server from './rest/server';
import mongoose from 'mongoose';

mongoose.Promise = Promise;

let dbConnection = mongoose.connect(config.db);

let server = new Server(dbConnection);

server.listen(config.port, function () {
    console.log('%s listening at %s', server.server.name, server.server.url);
});