const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// ✅ Serve index.html for the root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// === Matchmaking Logic ===
let waitingUser = null;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("set-mode", (mode) => {
    socket.mode = mode;

    if (waitingUser && waitingUser.mode === mode) {
      socket.partner = waitingUser;
      waitingUser.partner = socket;

      socket.emit("match");
      waitingUser.emit("match");

      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit("waiting");
    }
  });

  socket.on("message", (msg) => {
    if (socket.partner) {
      socket.partner.emit("message", msg);
    }
  });

  socket.on("webrtc-offer", (offer) => {
    if (socket.partner) socket.partner.emit("webrtc-offer", offer);
  });

  socket.on("webrtc-answer", (answer) => {
    if (socket.partner) socket.partner.emit("webrtc-answer", answer);
  });

  socket.on("webrtc-ice", (ice) => {
    if (socket.partner) socket.partner.emit("webrtc-ice", ice);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
    }
    if (waitingUser === socket) {
      waitingUser = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
