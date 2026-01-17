const https = require('https');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const csrf = require('csurf');
const socketio = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');

const router = require('./router');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\\\\]\\]/g, '\\\\$&');

const app = express();
const csrfProtection = csrf();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(csrfProtection);
app.use(cookieParser());
app.use(cors({
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use((req, res, next) => {
  res.cookie('secureCookie', 'secureValue', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
  next();
});

app.use(router);

const io = socketio(app, {
  cors: {
    origin: '*',
    credentials: true
  }
});

io.use((socket, next) => {
  const csrfToken = socket.handshake.auth.csrfToken;
  if (csrfToken === socket.request.csrfToken()) {
    next();
  } else {
    next(new Error('CSRF token mismatch'));
  }
});

io.on('connect', (socket) => {
  socket.on('join', ({ name, room }, callback) => {
    if (!name || !room) {
      return callback('Please provide both name and room');
    }

    const escapedName = escapeRegExp(name);
    const escapedRoom = escapeRegExp(room);

    const { error, user } = addUser({ id: socket.id, name: escapedName, room: escapedRoom });

    if(error) return callback(error);

    socket.join(user.room);

    socket.emit('message', { user: 'admin', text: `${user.name}, welcome to room ${user.room}.`});
    socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} has joined!` });

    io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    if (!message) {
      return callback('Please provide a message');
    }

    const escapedMessage = escapeRegExp(message);

    const user = getUser(socket.id);

    io.to(user.room).emit('message', { user: user.name, text: escapedMessage });

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

const tlsKey = process.env.TLS_KEY;
const tlsCert = process.env.TLS_CERT;

let server;
if (tlsKey && tlsCert) {
  server = https.createServer({
    key: fs.readFileSync(tlsKey),
    cert: fs.readFileSync(tlsCert),
  }, app);
} else {
  // TODO: Add TLS files or use a fallback
  server = http.createServer(app);
}

const port = process.env.PORT || 5000;
server.listen(port, () => console.log(`Server has started on port ${port}`));