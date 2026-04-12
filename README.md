# JayChouLyricsMultiplayer

A real-time multiplayer web game with two music game modes, featuring Jay Chou (周杰倫) and other popular Chinese/English songs.

**Play now:** https://jay-chou-lyrics-game.fly.dev/

## Game Modes

### 周杰倫猜歌 (Lyrics Guess)

Listen to audio clips of Jay Chou songs and type the correct lyrics. Players are scored on accuracy and speed.

- 2-8 players
- Configurable: 5/10/15/20 questions, 15/30/45 second time limit
- Real-time draft auto-submit — even if you don't hit submit, your typed answer counts
- Host controls pacing between questions

### 音樂傳聲筒 (Musical Telephone)

A party game inspired by the telephone game, but with music:

1. Each player listens to a YouTube clip of a song
2. Players record themselves singing **different lyrics** using the melody they heard
3. Recordings are passed to the next player, who sings new lyrics to the melody they hear
4. After N-1 rounds of singing, the last player guesses which song it was
5. Everyone watches the chain playback to see how the melody degraded

- 3-8 players
- 21 songs including Jay Chou hits and popular Chinese/English songs
- Configurable phase duration: 60/90/120 seconds
- Microphone test in lobby before game starts
- Host-controlled step-by-step results review (original → each recording → answer reveal → free-play)
- Full game-over recap with all songs and recordings
- No scoring — the fun is in the degradation and the guesses

## How to Play

1. Open the game URL
2. Enter a nickname
3. Create a lobby (choose game mode and settings) or join an existing one
4. Wait for the host to start the game

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js, Express, Socket.IO
- **Audio:** MediaRecorder API (browser recording), YouTube IFrame Player API
- **Tests:** Vitest
- **Deployment:** Fly.io

## Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Run server tests
cd server && npm test

# Build client
cd client && npm run build

# Start server (serves built client + API on port 3000)
cd server && node src/index.js
```

## Project Structure

```
├── server/
│   ├── src/
│   │   ├── index.js            # Express + Socket.IO server
│   │   ├── gameManager.js      # Lobby lifecycle, mode dispatch
│   │   ├── scoring.js          # Score calculation
│   │   ├── rotation.js         # Telephone mode assignment algorithm
│   │   └── modes/
│   │       ├── lyricsGuess.js  # Lyrics guess game logic
│   │       └── telephone.js    # Telephone mode state machine
│   └── tests/
├── client/
│   ├── src/
│   │   ├── App.jsx             # Page routing
│   │   ├── socket.js           # Socket.IO client
│   │   ├── pages/              # Game pages (MainMenu, Lobby, Game, etc.)
│   │   └── components/         # Reusable components (YouTubePlayer)
│   └── dist/                   # Built client (committed for deployment)
├── audio/                      # MP3 clips for lyrics-guess mode
├── questions.json              # Lyrics-guess question data
├── songs.json                  # Song metadata with YouTube IDs (telephone mode)
├── lyrics.json                 # Lyric pool for telephone mode
├── Dockerfile
└── fly.toml
```

## Data Files

To add new songs or lyrics, edit the JSON files directly:

- **`questions.json`** — Lyrics-guess questions (song, hint, audio path, answer)
- **`songs.json`** — 21 songs for telephone mode (name, YouTube video ID, start/end timestamps)
- **`lyrics.json`** — 23 lyric phrases for telephone mode (text + source songName for mismatch filtering)

## Deployment

```bash
fly deploy
```

Deployed on Fly.io as a single machine with in-memory state. All game state is lost on restart.
