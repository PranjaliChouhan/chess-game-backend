const express = require('express');
const { Server } = require('socket.io');
const { v4: uuidV4 } = require('uuid');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');

const app = express(); // Initialize express
const server = http.createServer(app);

// Set port to value from environment variable or 8080 if null
const port = process.env.PORT || 8080;

// Upgrade HTTP server to WebSocket server
const io = new Server(server, {
  cors: '*', // Allow connection from any origin
});

const rooms = new Map();

// Telegram Bot Initialization
const token = '7927379811:AAEtBJd4jC6bGJtYIXjLxtNHkXSmY50n7Ao'
const bot = new TelegramBot(token, { polling: true });

// Error handling for polling
bot.on("polling_error", (error) => {
  console.error("Polling error:", error.code, error.message);
});

// Telegram Bot Commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Welcome to the bot!');
});

bot.onText(/\/open_webapp/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Opening Web App...', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Open Web App',
            web_app: { url: 'https://your-deployed-url.com' } // Replace with your URL
          }
        ]
      ]
    }
  });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(socket.id, 'connected');

  // Handle username setup
  socket.on('username', (username) => {
    console.log(username);
    socket.data.username = username;
  });

  // Handle move event
  socket.on('move', (data) => {
    socket.to(data.room).emit('move', data.move);
  });

  // Create a room
  socket.on('createRoom', async (callback) => {
    const roomId = uuidV4();
    await socket.join(roomId);

    const roomData = {
      roomId,
      players: [{ id: socket.id, username: socket.data?.username }],
    };
    rooms.set(roomId, roomData);

    callback(roomId);
  });

  // Join a room
  socket.on('joinRoom', async (args, callback) => {
    const room = rooms.get(args.roomId);
    let error, message;

    if (!room) {
      error = true;
      message = 'Room does not exist';
    } else if (room.players.length <= 0) {
      error = true;
      message = 'Room is empty';
    } else if (room.players.length >= 2) {
      error = true;
      message = 'Room is full';
    }

    if (error) {
      if (callback) {
        callback({ error, message });
      }
      return;
    }

    await socket.join(args.roomId);
    room.players.push({ id: socket.id, username: socket.data?.username });
    rooms.set(args.roomId, room);

    callback(room);
    socket.to(args.roomId).emit('opponentJoined', room);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(
        (player) => player.id === socket.id
      );

      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('playerDisconnected', socket.data.username);
        }
      }
    });
  });

  // Handle closing a room
  socket.on('closeRoom', async (data) => {
    socket.to(data.roomId).emit('closeRoom', data);

    const clientSockets = await io.in(data.roomId).fetchSockets();
    clientSockets.forEach((s) => {
      s.leave(data.roomId);
    });

    rooms.delete(data.roomId);
  });
});

server.listen(port, () => {
  console.log(`Listening on *:${port}`);
});
