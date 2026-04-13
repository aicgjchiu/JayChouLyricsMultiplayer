import { io } from 'socket.io-client';
import { getPlayerId } from './playerId.js';

const socket = io({
  auth: { playerId: getPlayerId() },
});
export default socket;
