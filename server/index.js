const http = require('https');
const express = require('express');
const socketio = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const csrf = require('csurf');
const fs = require('fs');

const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');

const router = require('./router');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');

const app = express();
const csrfProtection = csrf();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(csrfProtection);
app.use(cors());

app.use(router);

const server = http.createServer({
  key: fs.readFileSync(process.env.TLS_KEY || 'TODO: Load TLS key'),
  cert: fs.readFileSync(process.env.TLS_CERT || 'TODO: Load TLS cert'),
}, app);

const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connect', (socket) => {
  socket.on('join', ({ name, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room });

    if(error) return callback(error);

    socket.join(user.room);

    socket.emit('message', { user: 'admin', text: `${user.name}, welcome to room ${escapeRegExp(user.room)}. `});
    socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} has joined!` });

    io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);

    io.to(user.room).emit('message', { user: user.name, text: message });

    callback();
  });

  socket.on('disconnect', () => {
    const user = removeUser(socket.id);

    if(user) {
      io.to(user.room).emit('message', { user: 'Admin', text: `${user.name} has left.` });
      io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room)});
    }
  })
});

server.listen(process.env.PORT || 5000, () => console.log(`Server has started.`));