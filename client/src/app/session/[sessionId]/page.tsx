'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import RecruiterDashboard from '@/components/recruiter-dashboard';
import StudentDashboard from '@/components/student-dashboard';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface UserSessionInfo {
  role: 'RECRUITER' | 'STUDENT';
  name: string;
  token: string;
}

export default function SessionRoomPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userInfo, setUserInfo] = useState<UserSessionInfo | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // 1. Retrieve session keys from localStorage
    const token = localStorage.getItem(`token_${sessionId}`);
    const role = localStorage.getItem(`role_${sessionId}`) as 'RECRUITER' | 'STUDENT' | null;

    if (!token || !role) {
      setError('Unauthorized access: Authentication token or role info is missing.');
      setLoading(false);
      return;
    }

    // Decode minimal JWT fields for display
    let name = role === 'RECRUITER' ? 'Recruiter' : 'Candidate';
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const decoded = JSON.parse(jsonPayload);
      if (decoded.name) name = decoded.name;
    } catch (err) {
      console.warn('Failed to parse JWT payload local representation');
    }

    setUserInfo({ role, name, token });

    // 2. Connect to the Node/Express Socket Server
    const socketConnection = io('http://localhost:4000', {
      auth: { token },
      transports: ['websocket'], // force pure websocket connection
    });

    socketConnection.on('connect', () => {
      console.log('Successfully connected to WebSocket session channel');
      setSocket(socketConnection);
      setLoading(false);
    });

    socketConnection.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setError(`Failed to connect to real-time sync channel: ${err.message}`);
      setLoading(false);
    });

    return () => {
      if (socketConnection) {
        socketConnection.disconnect();
      }
    };
  }, [sessionId]);

  // Loading screen
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#060913] space-y-4">
        <Loader2 className="animate-spin text-purple-500 h-10 w-10" />
        <p className="text-sm font-semibold tracking-wide text-slate-400">
          Entering secure interview chamber...
        </p>
      </div>
    );
  }

  // Error screen
  if (error || !socket || !userInfo) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#060913] p-6">
        <div className="max-w-md w-full glass-panel border-red-500/20 rounded-2xl p-8 text-center space-y-6">
          <ShieldAlert size={48} className="mx-auto text-red-500" />
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-200">Access Denied</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{error || 'Session error occured'}</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 font-semibold transition text-xs"
          >
            Return to Lobby Entrance
          </button>
        </div>
      </div>
    );
  }

  // Render role dashboard
  return userInfo.role === 'RECRUITER' ? (
    <RecruiterDashboard 
      socket={socket} 
      sessionId={sessionId} 
      recruiterName={userInfo.name} 
    />
  ) : (
    <StudentDashboard 
      socket={socket} 
      sessionId={sessionId} 
      studentName={userInfo.name} 
    />
  );
}
