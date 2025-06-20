const socket = io();

const modeSelect = document.getElementById("modeSelect");
const textModeBtn = document.getElementById("textModeBtn");
const videoModeBtn = document.getElementById("videoModeBtn");

const unifiedBox = document.getElementById("unifiedBox");
const textUI = document.getElementById("textUI");
const videoUI = document.getElementById("videoUI");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const nextBtn = document.getElementById("nextBtn");
const switchToVideoBtn = document.getElementById("switchToVideoBtn");

const videoStatus = document.getElementById("videoStatus");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const switchToChatBtn = document.getElementById("switchToChatBtn");
const nextVideoBtn = document.getElementById("nextVideoBtn");

let currentMode = null;
let localStream;
let remoteStream;
let peer;
let remoteDescSet = false;
let queuedCandidates = [];

// ==== MODE SELECT ====
textModeBtn.onclick = () => {
  currentMode = "chat";
  modeSelect.classList.add("hidden");
  unifiedBox.classList.remove("hidden");
  textUI.classList.remove("hidden");
  videoUI.classList.add("hidden");
  socket.emit("set-mode", "chat");
};

videoModeBtn.onclick = async () => {
  currentMode = "video";
  modeSelect.classList.add("hidden");
  unifiedBox.classList.remove("hidden");
  textUI.classList.add("hidden");
  videoUI.classList.remove("hidden");
  await startVideoStream();
  socket.emit("set-mode", "video");
};

// ==== CHAT SEND ====
sendBtn.onclick = () => {
  const msg = messageInput.value.trim();
  if (msg) {
    appendMessage(msg, "user");
    socket.emit("message", msg);
    messageInput.value = "";
    sendBtn.disabled = true;
    messageInput.style.height = "auto";
  }
};

messageInput.oninput = () => {
  sendBtn.disabled = messageInput.value.trim() === "";
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
};

messageInput.onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
};

// ==== SWITCH CHAT / VIDEO ====
switchToVideoBtn.onclick = async () => {
  stopVideoStream();
  socket.disconnect();
  textUI.classList.add("hidden");
  videoUI.classList.remove("hidden");
  currentMode = "video";
  await startVideoStream();
  socket.connect();
  socket.emit("set-mode", "video");
};

switchToChatBtn.onclick = () => {
  stopVideoStream();
  socket.disconnect();
  videoUI.classList.add("hidden");
  textUI.classList.remove("hidden");
  currentMode = "chat";
  socket.connect();
  socket.emit("set-mode", "chat");
};

// ==== NEXT ====
nextBtn.onclick = () => {
  messages.innerHTML = "";
  appendMessage("🔁 Searching for a new person...", "bot");
  socket.disconnect();
  socket.connect();
  socket.emit("set-mode", "chat");
};

nextVideoBtn.onclick = async () => {
  stopVideoStream();
  socket.disconnect();
  socket.connect();
  await startVideoStream();
  socket.emit("set-mode", "video");
};

// ==== SOCKET EVENTS ====
socket.on("waiting", () => {
  appendMessage("⏳ Waiting for a partner...", "bot");
  if (currentMode === "video") {
    videoStatus.textContent = "⏳ Waiting for a partner...";
  }
});

socket.on("match", async () => {
  appendMessage("✅ Connected to a stranger!", "bot");
  if (currentMode === "video") {
    videoStatus.textContent = "✅ Connected!";
    createPeer();
    if (peer.localDescription) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("webrtc-offer", offer);
  }
});

socket.on("message", (msg) => {
  appendMessage(msg, "bot");
});

socket.on("partner-disconnected", () => {
  appendMessage("❌ Stranger disconnected.", "bot");
  if (currentMode === "video") {
    videoStatus.textContent = "❌ Stranger disconnected.";
  }
  stopVideoStream();
});

// ==== WEBRTC SIGNALING ====
socket.on("webrtc-offer", async (offer) => {
  await startVideoStream();
  createPeer();
  await peer.setRemoteDescription(offer);
  remoteDescSet = true;
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  socket.emit("webrtc-answer", answer);
  // process queued ICE candidates
  for (let c of queuedCandidates) {
    try {
      await peer.addIceCandidate(c);
    } catch (e) {
      console.error("ICE error (queued):", e);
    }
  }
  queuedCandidates = [];
});

socket.on("webrtc-answer", async (answer) => {
  await peer.setRemoteDescription(answer);
  remoteDescSet = true;
  for (let c of queuedCandidates) {
    try {
      await peer.addIceCandidate(c);
    } catch (e) {
      console.error("ICE error (queued):", e);
    }
  }
  queuedCandidates = [];
});

socket.on("webrtc-ice", async (ice) => {
  if (!remoteDescSet) {
    queuedCandidates.push(ice);
  } else {
    try {
      await peer.addIceCandidate(ice);
    } catch (e) {
      console.error("ICE error:", e);
    }
  }
});

// ==== FUNCTIONS ====
function appendMessage(text, type) {
  const msg = document.createElement("div");
  msg.classList.add("message", type);
  msg.textContent = text;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

async function startVideoStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
  } catch (err) {
    console.error("Permission error:", err);
    videoStatus.textContent = "🚫 Please allow camera and mic.";
  }
}

function stopVideoStream() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peer) {
    peer.close();
    peer = null;
  }
  remoteStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteDescSet = false;
  queuedCandidates = [];
}

function createPeer() {
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:numb.viagenie.ca",
        username: "webrtc@live.com",
        credential: "muazkh"
      }
    ]
  });

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

  peer.ontrack = (e) => {
    console.log("✅ ontrack fired with stream:", e.streams[0]);
    e.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  peer.onaddstream = (e) => {
    console.log("⚠️ onaddstream fallback fired");
    remoteVideo.srcObject = e.stream;
  };

  peer.onicecandidate = (e) => {
    if (e.candidate) {
      console.log("ICE candidate:", e.candidate);
      socket.emit("webrtc-ice", e.candidate);
    }
  };
}
