# iLoveXams - Live Technical Interviewing Platform

![WebRTC](https://img.shields.io/badge/WebRTC-P2P-blue) ![Socket.io](https://img.shields.io/badge/Socket.io-Real--Time-black) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![Node.js](https://img.shields.io/badge/Node.js-Backend-green)

A cutting-edge, real-time technical interviewing platform engineered to provide a seamless, zero-latency experience for technical hiring. Built with a sophisticated **WebRTC Peer-to-Peer** mesh network and **WebSocket** state synchronization, this platform enables recruiters to assess candidates through collaborative coding, interactive system design, and live behavioral evaluation.

## 🚀 Key Features

- **P2P WebRTC Video & Audio Engine**: Built from the ground up with robust ICE candidate buffering and deferred call resolution to ensure guaranteed sub-second latency video/audio pairing without overlapping connection drops.
- **Live Collaborative Code Editor**: Integrated Monaco Editor (VS Code engine) with real-time keystroke synchronization and syntax highlighting.
- **Interactive System Design Canvas**: A synced, draggable whiteboard engine that parses text into magnetic nodes and arrows for live architecture planning.
- **Live Blackboard & Question Push**: Recruiters can instantly push questions from the web directly into a shared Markdown blackboard, allowing candidates to type, sketch, and brainstorm their answers collaboratively.
- **Automated Anti-Cheat Proctoring**: Silently tracks and alerts the recruiter if the candidate attempts to blur the tab, exit full-screen, or switch windows during the interview.

## 🧠 System Architecture

The application utilizes a hybrid topology: a **Signaling Server (Socket.io)** for state management and an **SFU/P2P Mesh (WebRTC)** for heavy media streaming.

```mermaid
graph TD
    subgraph Client: Candidate
        C_UI[Next.js Interface]
        C_RTC[WebRTC Media Engine]
        C_Sock[Socket.io Client]
    end

    subgraph Client: Recruiter
        R_UI[Next.js Interface]
        R_RTC[WebRTC Media Engine]
        R_Sock[Socket.io Client]
    end

    subgraph Backend Infrastructure
        SigServer[Node.js / Express Signaling Server]
        Redis[(Redis State Sync)]
        STUNTURN[Google STUN / Metered TURN Servers]
    end

    %% Signaling & State Flow
    C_Sock <-->|SDP Offers, Answers, ICE| SigServer
    R_Sock <-->|SDP Offers, Answers, ICE| SigServer
    SigServer <--> Redis

    %% Media Flow
    C_RTC <..>|UDP/TCP Hole Punching| STUNTURN
    R_RTC <..>|UDP/TCP Hole Punching| STUNTURN
    C_RTC <======>|P2P Video / Audio Track| R_RTC
    
    %% Editor Sync Flow
    C_Sock <-->|Keystrokes / Canvas Node Updates| SigServer
    SigServer <-->|Broadcast State| R_Sock
```

## 💻 Technology Stack

- **Frontend:** Next.js 14, React 18, TailwindCSS, Lucide Icons
- **Backend:** Node.js, Express.js, TypeScript
- **Real-Time Engines:** Socket.io (Signaling & Sync), WebRTC API (Media)
- **Editor:** `@monaco-editor/react`

## 🛠️ Installation & Deployment

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alagappan-Venkatachalam/IloveHrBrowser.git
   cd IloveHrBrowser
   ```

2. **Start the Signaling Server (Backend):**
   ```bash
   cd server
   npm install
   npm run dev
   ```
   *The server will run on `http://localhost:4000`*

3. **Start the Client App (Frontend):**
   ```bash
   cd ../client
   npm install
   npm run dev
   ```
   *The client will run on `http://localhost:3000`*

### 🌐 Deploying to Hostinger (VPS / Shared)

To deploy this split architecture to a standard hosting environment:

1. **Backend (Node.js App):**
   - In your Hostinger control panel, create a new Node.js application.
   - Set the application startup file to `src/index.js` (after building your TypeScript files with `tsc`).
   - Ensure you bind your environment variables, specifically setting `PORT` to the assigned Hostinger port.
   - Upload the `/server` directory and run `npm install --production`.

2. **Frontend (Next.js App):**
   - Build the Next.js app locally or in the CI pipeline: `cd client && npm run build`.
   - Next.js can be exported statically (`output: 'export'`) if you only need the static UI, or run as a Node app.
   - Map your Hostinger domain to the frontend deployment folder.

## 🔐 WebRTC Connection Lifecycle

To achieve a flawless zero-latency stream, the connection lifecycle strictly adheres to:
1. **Presence Verification**: Socket confirms both peers are in the room.
2. **Hardware Initialization**: `getUserMedia` locks the local camera/mic.
3. **Offer Generation**: The Recruiter acts as the caller, wrapping the media tracks in the initial SDP offer.
4. **Candidate Buffering**: ICE candidates are buffered in an internal queue until the Remote Description is fully verified, preventing silent routing drops.
5. **Answer Generation**: The Candidate answers the SDP, securing the bidirectional media feed.

---
*Built with ❤️ for next-generation technical hiring.*
