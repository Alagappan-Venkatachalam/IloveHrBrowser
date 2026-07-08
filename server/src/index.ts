import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createSession, verifyStudentOtp, verifyRecruiterSession } from './controllers/authController';
import { executeCode } from './controllers/executeController';
import { searchMockMcqs } from './controllers/searchController';
import { searchWebQuery } from './controllers/searchWebController';
import { registerSocketHandler } from './sockets/socketHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS - allow requests from frontend (Next.js runs on 3000 by default)
app.use(
  cors({
    origin: ['http://localhost:3000', 'https://ilovexams.com'],
    credentials: true,
  })
);

app.use(express.json());

// --- REST API Endpoints ---
app.post('/api/auth/session', createSession);
app.post('/api/auth/student-verify', verifyStudentOtp);
app.post('/api/auth/recruiter-verify', verifyRecruiterSession);
app.post('/api/execute', executeCode);
app.post('/api/smart-search', searchMockMcqs);
app.post('/api/web-search', searchWebQuery);

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Create HTTP server
const httpServer = createServer(app);

// Attach Socket.io Server
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'https://ilovexams.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});

// Register real-time event handlers
registerSocketHandler(io);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` ilovexams.com REST & WebSockets Server`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
