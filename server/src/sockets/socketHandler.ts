import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'ilovexams_super_secret_jwt_key_2026';

interface DecodedToken {
  sessionId: string;
  role: 'RECRUITER' | 'STUDENT';
  name: string;
  email?: string;
  mobileNumber?: string;
}

export const registerSocketHandler = (io: Server) => {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication failed: Token is missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
      socket.data = {
        sessionId: decoded.sessionId,
        role: decoded.role,
        name: decoded.name,
      };
      next();
    } catch (err) {
      return next(new Error('Authentication failed: Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const { sessionId, role, name } = socket.data;

    socket.join(sessionId);
    console.log(`User [${name}] joined room [${sessionId}] as [${role}]`);

    // Notify others in room
    socket.to(sessionId).emit('user_status', {
      event: 'JOINED',
      role,
      name,
      timestamp: new Date(),
    });

    // Check if both recruiter and student are present in the room
    try {
      const activeSockets = await io.in(sessionId).fetchSockets();
      let hasStudent = false;
      let hasRecruiter = false;

      activeSockets.forEach((s) => {
        if (s.data.role === 'STUDENT') hasStudent = true;
        if (s.data.role === 'RECRUITER') hasRecruiter = true;
      });

      if (hasStudent && hasRecruiter) {
        // Broadcast presence status to trigger WebRTC initiation
        io.to(sessionId).emit('peer_present', {
          studentPresent: true,
          recruiterPresent: true,
        });
        console.log(`Both student and recruiter are in room [${sessionId}]. Emitting peer_present.`);
      }
    } catch (err) {
      console.error('Error fetching sockets in room:', err);
    }

    // Send latest database state to the connecting client
    try {
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });
      if (session) {
        socket.emit('session_state', {
          activeMode: session.activeMode,
          codeSnippet: session.codeSnippet,
          codeLanguage: session.codeLanguage,
          mcqQuestion: session.mcqQuestion ? JSON.parse(session.mcqQuestion) : null,
          systemDesignHeadline: session.systemDesignHeadline,
          systemDesignRequirements: session.systemDesignRequirements,
        });
      }
    } catch (err) {
      console.error('Error fetching session state on connect:', err);
    }

    // --- 1. DYNAMIC LAYOUT/MODE SWITCH (RECRUITER ONLY) ---
    socket.on('change_mode', async ({ mode }: { mode: 'CODING' | 'MCQ' | 'SYSTEM_DESIGN' }) => {
      if (role !== 'RECRUITER') {
        return socket.emit('error_message', { message: 'Unauthorized action' });
      }

      try {
        await prisma.interviewSession.update({
          where: { id: sessionId },
          data: { activeMode: mode },
        });

        io.to(sessionId).emit('mode_changed', { mode });
        console.log(`Room [${sessionId}] layout mode updated to: ${mode}`);
      } catch (err) {
        console.error('Failed to change mode in DB:', err);
        socket.emit('error_message', { message: 'Failed to update layout mode' });
      }
    });

    // --- 2. KEYSTROKE / EDITOR SYNCHRONIZATION ---
    socket.on('editor_change', async ({ code, language }: { code: string; language: string }) => {
      socket.to(sessionId).emit('editor_sync', { code, language });

      try {
        await prisma.interviewSession.update({
          where: { id: sessionId },
          data: {
            codeSnippet: code,
            codeLanguage: language,
          },
        });
      } catch (err) {
        console.error('Failed to persist editor content:', err);
      }
    });

    // --- 3. SMART MCQ INSTANT PUSH (RECRUITER ONLY) ---
    socket.on('push_mcq', async (mcqData: { question: string; choices: string[]; correctAnswerIndex: number; explanation: string }) => {
      if (role !== 'RECRUITER') return;

      try {
        await prisma.interviewSession.update({
          where: { id: sessionId },
          data: {
            mcqQuestion: JSON.stringify(mcqData),
          },
        });

        io.to(sessionId).emit('mcq_synced', mcqData);
        console.log(`Recruiter pushed new MCQ to room [${sessionId}]`);
      } catch (err) {
        console.error('Failed to save pushed MCQ:', err);
      }
    });

    // --- 4. LIVE MCQ CHOICE SYNC (STUDENT ONLY) ---
    socket.on('select_mcq_option', ({ choiceIndex }: { choiceIndex: number | null }) => {
      if (role !== 'STUDENT') return;
      socket.to(sessionId).emit('mcq_option_selected', { choiceIndex });
      console.log(`Student in room [${sessionId}] selected MCQ option: ${choiceIndex}`);
    });

    socket.on('blackboard_change', (payload: { text: string }) => {
      socket.to(sessionId).emit('blackboard_sync', payload);
    });

    // --- 5. SYSTEM DESIGN WIZARD TEMPLATE SYNC (RECRUITER ONLY) ---
    socket.on('update_system_design', async (data: { headline: string; requirements: string }) => {
      if (role !== 'RECRUITER') return;

      try {
        await prisma.interviewSession.update({
          where: { id: sessionId },
          data: {
            systemDesignHeadline: data.headline,
            systemDesignRequirements: data.requirements,
          },
        });

        socket.to(sessionId).emit('system_design_synced', data);
        console.log(`Recruiter updated system design prompts in room [${sessionId}]`);
      } catch (err) {
        console.error('Failed to save system design template:', err);
      }
    });

    // --- 6. WebRTC P2P SIGNALING TRANSIT ---
    socket.on('webrtc_offer', (payload: { offer: any }) => {
      socket.to(sessionId).emit('webrtc_offer', {
        senderRole: role,
        offer: payload.offer,
      });
    });

    socket.on('webrtc_answer', (payload: { answer: any }) => {
      socket.to(sessionId).emit('webrtc_answer', {
        senderRole: role,
        answer: payload.answer,
      });
    });

    socket.on('webrtc_ice_candidate', (payload: { candidate: any }) => {
      socket.to(sessionId).emit('webrtc_ice_candidate', {
        senderRole: role,
        candidate: payload.candidate,
      });
    });

    socket.on('webrtc_signal', (payload: { signal: any }) => {
      socket.to(sessionId).emit('webrtc_signal', {
        senderRole: role,
        signal: payload.signal,
      });
    });

    // --- 7. ANTI-CHEATING telemetry events ---
    socket.on('security_warning', async (payload: { eventType: string; detail: string }) => {
      if (role !== 'STUDENT') return;

      const timestamp = new Date();

      try {
        const violation = await prisma.securityViolation.create({
          data: {
            sessionId: sessionId,
            eventType: payload.eventType,
            detail: payload.detail,
            timestamp,
          },
        });

        socket.to(sessionId).emit('security_alert', {
          id: violation.id,
          eventType: payload.eventType,
          detail: payload.detail,
          timestamp,
        });

        console.log(`[ALERT] Cheating event in [${sessionId}]: ${payload.eventType}`);
      } catch (err) {
        console.error('Failed to save security warning:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User [${name}] disconnected from session [${sessionId}]`);
      io.to(sessionId).emit('user_status', {
        event: 'LEFT',
        role,
        name,
        timestamp: new Date(),
      });
    });
  });
};
