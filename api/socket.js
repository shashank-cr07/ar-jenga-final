import { Server } from "socket.io";

let players = {}; // Track connected players and their readiness
let gameState = {}; // Track game state (e.g., block positions)
let io;

const socketHandler = (req, res) => {
  if (!res.socket.server.io) {
    // Initialize Socket.IO
    io = new Server(res.socket.server, {
      cors: {
        origin: "*", // Replace with your production domain for security, e.g., "https://yourdomain.vercel.app"
        methods: ["GET", "POST"],
      },
    });

    res.socket.server.io = io;

    io.on("connection", (socket) => {
      console.log("A user connected:", socket.id);

      // Initialize player data
      players[socket.id] = {
        basePosition: null, // Initial tower position
        ready: false,
      };

      // Listen for base position
      socket.on("set-base-position", (position) => {
        players[socket.id].basePosition = position;
        console.log(`Player ${socket.id} base position set to`, position);
      });

      // Listen for readiness
      socket.on("player-ready", () => {
        players[socket.id].ready = true;
        console.log(`Player ${socket.id} is ready`);

        // Check if all players are ready
        const allReady = Object.values(players).every((player) => player.ready);
        if (allReady) {
          io.emit("start-game", gameState); // Notify all players to start the game
          console.log("All players are ready. Starting the game.");

          // Assign the first turn to the first player
          const playerIds = Object.keys(players);
          if (playerIds.length > 0) {
            const firstPlayerId = playerIds[0];
            io.emit("turn-update", { currentTurn: firstPlayerId });
            console.log(`First turn assigned to player: ${firstPlayerId}`);
          }
        }
      });

      // Listen for block movement
      socket.on("update-block", (data) => {
        const playerBasePosition = players[socket.id]?.basePosition;

        if (!playerBasePosition) {
          console.warn(`Player ${socket.id} has no base position set.`);
          return;
        }

        // Calculate the relative movement
        const relativeChange = {
          id: data.id,
          relativePosition: {
            x: data.position.x - playerBasePosition.x,
            y: data.position.y - playerBasePosition.y,
            z: data.position.z - playerBasePosition.z,
          },
          quaternion: data.quaternion,
        };

        // Update the game state with absolute position for tracking
        gameState[data.id] = {
          id: data.id,
          position: data.position,
          quaternion: data.quaternion,
        };

        // Broadcast the relative change to all other clients
        socket.broadcast.emit("update-block", relativeChange);

        // Rotate turn to the next player
        const playerIds = Object.keys(players);
        const currentIndex = playerIds.indexOf(socket.id);

        if (currentIndex >= 0) {
          const nextPlayerId = playerIds[(currentIndex + 1) % playerIds.length]; // Next player's ID
          io.emit("turn-update", { currentTurn: nextPlayerId });
          console.log(`Turn updated: It's now ${nextPlayerId}'s turn.`);
        }
      });

      // Handle tower collapse
      socket.on("tower-collapsed", ({ playerId, message }) => {
        console.log(`Player ${playerId} caused the tower to collapse.`);

        // Notify the player who caused the collapse that they lost
        io.to(playerId).emit("game-result", {
          message: "You lost! You caused the tower to collapse.",
        });

        // Notify all other players that they won
        for (const [id] of Object.entries(players)) {
          if (id !== playerId) {
            io.to(id).emit("game-result", {
              message: "You won! The other player caused the tower to collapse.",
            });
          }
        }
      });

      // Handle player disconnection
      socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("player-disconnected", socket.id);
      });
    });

    console.log("Socket.io server initialized");
  }

  res.end();
};

export default socketHandler;
