import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GameManager } from './gameManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const manager = new GameManager();

function broadcastLobbyList() {
  io.emit('lobby-list', manager.getLobbies());
}

// Serve audio files
app.use('/audio', express.static(join(__dirname, '../../audio')));

// Serve React production build
app.use(express.static(join(__dirname, '../../client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../../client/dist/index.html'));
});

io.on('connection', (socket) => {
  socket.on('get-lobbies', () => {
    socket.emit('lobby-list', manager.getLobbies());
  });

  socket.on('create-lobby', (data) => {
    const lobby = manager.createLobby(socket.id, data);
    socket.join(lobby.id);
    socket.emit('joined-lobby', { code: lobby.id });
    io.to(lobby.id).emit('lobby-updated', manager.lobbyPayload(lobby));
    broadcastLobbyList();
  });

  socket.on('join-lobby', (data) => {
    const result = manager.joinLobby(socket.id, data);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(result.lobby.id);
    socket.emit('joined-lobby', { code: result.lobby.id });
    io.to(result.lobby.id).emit('lobby-updated', manager.lobbyPayload(result.lobby));
    broadcastLobbyList();
  });

  socket.on('start-game', () => manager.startGame(socket.id, io));

  socket.on('submit-answer', (data) => manager.submitAnswer(socket.id, data, io));

  socket.on('restart-lobby', () => manager.restartLobby(socket.id, io));
  socket.on('update-settings', (data) => manager.updateSettings(socket.id, data, io));

  socket.on('leave-lobby', () => {
    manager.leaveLobby(socket.id, io);
    broadcastLobbyList();
  });

  socket.on('disconnect', () => {
    manager.handleDisconnect(socket.id, io);
    broadcastLobbyList();
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
