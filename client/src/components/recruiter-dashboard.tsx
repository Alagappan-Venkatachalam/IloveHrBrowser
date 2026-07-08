'use client';

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { 
  Code, 
  HelpCircle, 
  Layout, 
  Keyboard,
  Search,
  Plus,
  Lock,
  Unlock,
  Video, 
  AlertTriangle, 
  Users,
  ExternalLink
} from 'lucide-react';
import axios from 'axios';

interface RecruiterDashboardProps {
  socket: Socket;
  sessionId: string;
  recruiterName: string;
}

interface SecurityAlert {
  id: string;
  eventType: string;
  detail: string;
  timestamp: string;
}

interface SurfacedMCQ {
  question: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
}



export default function RecruiterDashboard({ socket, sessionId, recruiterName }: RecruiterDashboardProps) {
  // Tabs and Modes
  const [activeMode, setActiveMode] = useState<'CODING' | 'MCQ' | 'SYSTEM_DESIGN'>('CODING');
  const [rightPanelTab, setRightPanelTab] = useState<'alerts' | 'smartSearch'>('alerts');

  // Editor states
  const [code, setCode] = useState('// Waiting for candidate to start typing...');
  const [language, setLanguage] = useState('javascript');
  const [editorReadOnly, setEditorReadOnly] = useState(false);

  // System Design states
  const [designHeadline, setDesignHeadline] = useState('');
  const [designRequirements, setDesignRequirements] = useState('');

  // Smart MCQ Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SurfacedMCQ[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeMcq, setActiveMcq] = useState<SurfacedMCQ | null>(null);
  const [candidateChoice, setCandidateChoice] = useState<number | null>(null);
  
  // Blackboard State
  const [blackboardText, setBlackboardText] = useState('// Welcome to the Collaborative Blackboard. Paste questions or scratchpad notes here...');
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // Status and logs
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [userStatus, setUserStatus] = useState<string>('Candidate Connecting...');
  const [webrtcStatus, setWebrtcStatus] = useState<string>('Initializing P2P...');

  // Media Streams and WebRTC Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket>(socket);
  const localMediaReadyRef = useRef(false);
  const pendingCallRef = useRef(false);
  const iceCandidateBufferRef = useRef<any[]>([]);

  useEffect(() => {
    socketRef.current = socket;
    // 1. Initial State Sync
    socket.on('session_state', (data: { 
      activeMode: any; 
      codeSnippet: string; 
      codeLanguage: string; 
      mcqQuestion: any;
      systemDesignHeadline: string;
      systemDesignRequirements: string;
    }) => {
      if (data) {
        setActiveMode(data.activeMode);
        if (data.codeSnippet) setCode(data.codeSnippet);
        if (data.codeLanguage) setLanguage(data.codeLanguage);
        if (data.mcqQuestion) setActiveMcq(data.mcqQuestion);
        if (data.systemDesignHeadline) setDesignHeadline(data.systemDesignHeadline);
        if (data.systemDesignRequirements) setDesignRequirements(data.systemDesignRequirements);
      }
    });

    // 2. Mode Change listener
    socket.on('mode_changed', ({ mode }: { mode: 'CODING' | 'MCQ' | 'SYSTEM_DESIGN' }) => {
      setActiveMode(mode);
    });

    // 3. Listen to Keystrokes (from candidate or co-coding updates)
    socket.on('editor_sync', (data: { code: string; language: string }) => {
      setCode(data.code);
      if (data.language) setLanguage(data.language);
    });

    // 4. MCQ sync updates
    socket.on('mcq_synced', (data: SurfacedMCQ) => {
      setActiveMcq(data);
      setCandidateChoice(null); // Reset selection
    });

    // 5. MCQ Live Choice Sync from student selection
    socket.on('mcq_option_selected', (data: { choiceIndex: number | null }) => {
      setCandidateChoice(data.choiceIndex);
    });

    // 6. System Design wizard template sync
    socket.on('system_design_synced', (data: { headline: string; requirements: string }) => {
      setDesignHeadline(data.headline);
      setDesignRequirements(data.requirements);
    });

    socket.on('blackboard_sync', (data: { text: string }) => {
      setBlackboardText(data.text);
    });

    // 7. User Status listener
    socket.on('user_status', (data: { event: string; role: string; name: string }) => {
      if (data.role === 'STUDENT') {
        setUserStatus(data.event === 'JOINED' ? 'Candidate Connected' : 'Candidate Offline');
        if (data.event === 'JOINED') {
          if (localMediaReadyRef.current) {
            initiateWebrtcCall();
          } else {
            pendingCallRef.current = true;
          }
        }
      }
    });

    // 8. Resilient Handshake presence checker
    socket.on('peer_present', (data: { studentPresent: boolean; recruiterPresent: boolean }) => {
      if (data.studentPresent && data.recruiterPresent) {
        setUserStatus('Candidate Connected');
        if (localMediaReadyRef.current) {
          initiateWebrtcCall();
        } else {
          pendingCallRef.current = true;
        }
      }
    });

    // 9. Anti-cheating Telemetry Alert Listener
    socket.on('security_alert', (alert: SecurityAlert) => {
      setAlerts((prev) => [alert, ...prev]);
    });

    // 10. WebRTC Peer Signaling Events
    socket.on('webrtc_offer', async ({ offer }) => {
      try {
        if (!peerConnectionRef.current) startPeerConnection();
        await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current!.createAnswer();
        await peerConnectionRef.current!.setLocalDescription(answer);
        socketRef.current.emit('webrtc_answer', { answer });
        setWebrtcStatus('P2P Feed Active');
      } catch (err: any) {
        console.error('Failed to handle WebRTC offer:', err.message);
      }
    });

    socket.on('webrtc_answer', async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          while (iceCandidateBufferRef.current.length > 0) {
            const c = iceCandidateBufferRef.current.shift();
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(c));
          }
          setWebrtcStatus('P2P Feed Active');
        }
      } catch (err: any) {
        console.error('Failed to handle WebRTC answer:', err.message);
      }
    });

    socket.on('webrtc_ice_candidate', async ({ candidate }) => {
      if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
        iceCandidateBufferRef.current.push(candidate);
      } else {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {}
      }
    });

    // --- High-Fidelity Audio capture constraints ---
    const mediaConstraints = {
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then((stream) => {
          localStreamRef.current = stream;
          localMediaReadyRef.current = true;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          startPeerConnection();
          // If a call was pending, initiate it now
          if (pendingCallRef.current) {
            pendingCallRef.current = false;
            setTimeout(() => initiateWebrtcCall(), 300);
          }
        })
        .catch((err) => {
          console.warn('Camera blocked or unavailable:', err.message);
          setWebrtcStatus('WebRTC (No Video)');
        });
    }

    return () => {
      socket.off('session_state');
      socket.off('mode_changed');
      socket.off('editor_sync');
      socket.off('mcq_synced');
      socket.off('mcq_option_selected');
      socket.off('system_design_synced');
      socket.off('user_status');
      socket.off('peer_present');
      socket.off('security_alert');
      socket.off('webrtc_offer');
      socket.off('webrtc_answer');
      socket.off('webrtc_ice_candidate');
      socket.off('blackboard_sync');
    };
  }, [socket]);

  // Peer Connection Instantiation with STUN/TURN Configurations
  const startPeerConnection = () => {
    if (peerConnectionRef.current) return;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // High Availability TURN Servers
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('webrtc_ice_candidate', { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        // Programmatic play triggers to bypass autoplay policies
        remoteVideoRef.current.play().catch((err) => {
          console.warn('Autoplay audio play blocked by browser policy:', err.message);
        });
      }
    };

    // Attach local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionRef.current = pc;
    bindTracksToPeerConnection();
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const enabled = !cameraEnabled;
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      setCameraEnabled(enabled);
    }
  };

  const bindTracksToPeerConnection = () => {
    if (peerConnectionRef.current && localStreamRef.current) {
      const existingSenders = peerConnectionRef.current.getSenders();
      const localTracks = localStreamRef.current.getTracks();
      
      localTracks.forEach((track) => {
        const existingSender = existingSenders.find(s => s.track?.kind === track.kind);
        if (existingSender) {
          existingSender.replaceTrack(track);
        } else {
          peerConnectionRef.current!.addTrack(track, localStreamRef.current!);
        }
      });
    }
  };

  // Triggers WebRTC offer call
  const initiateWebrtcCall = async () => {
    try {
      if (!peerConnectionRef.current) startPeerConnection();
      bindTracksToPeerConnection();
      const offer = await peerConnectionRef.current!.createOffer();
      await peerConnectionRef.current!.setLocalDescription(offer);
      socketRef.current.emit('webrtc_offer', { offer });
      setWebrtcStatus('P2P Connecting...');
    } catch (err: any) {
      console.warn('Failed to construct WebRTC offer:', err.message);
    }
  };

  // Command Layout Changes
  const handleModeChange = (mode: 'CODING' | 'MCQ' | 'SYSTEM_DESIGN') => {
    setActiveMode(mode);
    socket.emit('change_mode', { mode });
  };

  // Co-coding Editor typing sync
  const handleEditorChange = (value: string | undefined) => {
    const updatedCode = value || '';
    setCode(updatedCode);
    socket.emit('editor_change', { code: updatedCode, language });
  };

  // Smart Search Technical MCQ Lookup
  const handleSmartSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);

    try {
      const response = await axios.post('http://localhost:4000/api/smart-search', {
        query: searchQuery,
      });
      setSearchResults(response.data.questions || []);
    } catch (err) {
      console.error('Smart MCQ Search failed:', err);
    } finally {
      setSearching(false);
    }
  };



  // Push Selected MCQ to Blackboard
  const handlePushMcq = (mcq: SurfacedMCQ) => {
    const formatted = `**Question:**\n${mcq.question}\n\n**Options:**\n${mcq.choices.map((c,i) => `${i+1}. ${c}`).join('\n')}`;
    setBlackboardText(formatted);
    socket.emit('blackboard_change', { text: formatted });
    handleModeChange('MCQ');
  };

  // System Design Form Sync Handler
  const syncSystemDesignTemplate = (headline: string, reqs: string) => {
    setDesignHeadline(headline);
    setDesignRequirements(reqs);
    socket.emit('update_system_design', { headline, requirements: reqs });
  };



  return (
    <div className="h-screen w-screen flex bg-[#060913] text-slate-100 overflow-hidden">
      {/* LEFT SIDEBAR: Layout Controls & WebRTC Camera */}
      <aside className="w-80 border-r border-slate-800/80 flex flex-col justify-between bg-[#080d1a]">
        <div>
          {/* Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
                Control Room
              </h2>
              <p className="text-xs text-slate-500">Session ID: ...{sessionId.slice(-8)}</p>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full ${
              userStatus === 'Candidate Connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
            }`} title={`${userStatus} / ${webrtcStatus}`} />
          </div>

          {/* Mode Switcher */}
          <div className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Workspace Layouts</h3>
            
            <button
              onClick={() => handleModeChange('CODING')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-sm font-medium transition ${
                activeMode === 'CODING'
                  ? 'bg-purple-600/10 border-purple-500/80 text-purple-300'
                  : 'bg-transparent border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2.5"><Code size={16} /> Coding Mode</span>
              {activeMode === 'CODING' && <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
            </button>

            <button
              onClick={() => handleModeChange('MCQ')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-sm font-medium transition ${
                activeMode === 'MCQ'
                  ? 'bg-purple-600/10 border-purple-500/80 text-purple-300'
                  : 'bg-transparent border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2.5"><HelpCircle size={16} /> MCQ Mode</span>
              {activeMode === 'MCQ' && <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
            </button>

            <button
              onClick={() => handleModeChange('SYSTEM_DESIGN')}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-sm font-medium transition ${
                activeMode === 'SYSTEM_DESIGN'
                  ? 'bg-purple-600/10 border-purple-500/80 text-purple-300'
                  : 'bg-transparent border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2.5"><Layout size={16} /> System Design Mode</span>
              {activeMode === 'SYSTEM_DESIGN' && <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
            </button>
          </div>

          <hr className="border-slate-800/80 my-2" />

          {/* WebRTC Video Split Grid */}
          <div className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Interview Feeds</span>
              <span className="text-[10px] text-red-500 flex items-center gap-1 font-mono uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-record" /> {webrtcStatus}
              </span>
            </h3>
            <div className="flex flex-col gap-2">
              <div className="relative aspect-video bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1.5 text-[9px] bg-slate-950/75 px-1.5 py-0.5 rounded text-slate-400">Candidate Feed</span>
              </div>
              <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
              
              <button 
                onClick={toggleCamera}
                className={`py-1.5 px-3 rounded text-xs font-bold transition flex items-center justify-center gap-2 ${cameraEnabled ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-500/50'}`}
              >
                <Video size={14} className={!cameraEnabled ? "opacity-50" : ""} />
                {cameraEnabled ? 'Turn Camera Off' : 'Camera is Off'}
              </button>
            </div>
          </div>
        </div>

        {/* User profile bottom bar */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-purple-600/20 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400">
            R
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">{recruiterName}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Lead Recruiter</p>
          </div>
        </div>
      </aside>

      {/* CENTER: Main Editor Workspace */}
      <main className="flex-grow flex flex-col min-w-0 bg-[#070b14]/30">
        {/* Workspace Header */}
        <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-[#080d1a]/50">
          <div className="flex items-center gap-3">
            <Keyboard className="text-purple-400" size={18} />
            <h2 className="font-semibold text-sm">Interactive Workspace</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Writable Co-Coding Editor Lock Toggle */}
            {activeMode === 'CODING' && (
              <button
                onClick={() => setEditorReadOnly(!editorReadOnly)}
                className={`flex items-center gap-1 py-1.5 px-3 rounded text-xs font-semibold border transition ${
                  editorReadOnly
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-green-500/10 border-green-500/30 text-green-400'
                }`}
                title={editorReadOnly ? 'Locks editor as ReadOnly' : 'Permits recruiter typing'}
              >
                {editorReadOnly ? (
                  <>
                    <Lock size={12} /> Read-Only Locked
                  </>
                ) : (
                  <>
                    <Unlock size={12} /> Co-Coding Active
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => window.open('https://www.google.com', 'GoogleSearch', 'width=420,height=500,scrollbars=yes,resizable=yes')}
              className="flex items-center gap-1.5 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold transition"
              title="Open Google in a small popup window"
            >
              <ExternalLink size={12} />
              Google Search
            </button>
          </div>
        </header>

        {/* Dynamic Center Panel Content */}
        <div className="flex-grow flex flex-col min-h-0 relative">
          {activeMode === 'CODING' && (
            <div className="flex-grow flex flex-col min-h-0">
              {/* Monaco Collaborative Writable Editor */}
              <div className="flex-grow relative min-h-[300px]">
                <Editor
                  height="100%"
                  language={language}
                  theme="vs-dark"
                  value={code}
                  onChange={handleEditorChange}
                  options={{
                    readOnly: editorReadOnly,
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              </div>


            </div>
          )}

          {activeMode === 'MCQ' && (
            <div className="flex-grow flex flex-col min-h-0">
              <div className="p-3 border-b border-slate-800/80 text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-[#070c17] flex justify-between items-center">
                <span>Blackboard (Collaborative Text)</span>
                <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">Synced</span>
              </div>
              <div className="flex-grow relative">
                <Editor
                  height="100%"
                  language="markdown"
                  theme="vs-dark"
                  value={blackboardText}
                  onChange={(val) => {
                    setBlackboardText(val || '');
                    socket.emit('blackboard_change', { text: val || '' });
                  }}
                  options={{
                    readOnly: false,
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    padding: { top: 12 },
                  }}
                />
              </div>
            </div>
          )}

          {activeMode === 'SYSTEM_DESIGN' && (
            <div className="flex-grow overflow-y-auto p-8 flex justify-center bg-[#070c18]/25">
              <div className="max-w-2xl w-full space-y-6">
                <div className="glass-panel p-6 rounded-2xl border-purple-500/25 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">System Design Prompt Wizard</h3>
                    <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                      Syncs Live
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Headline Prompt</label>
                      <input
                        type="text"
                        placeholder="e.g. Design Uber (Ride Hailing Service), Design Netflix (Streaming Engine)"
                        value={designHeadline}
                        onChange={(e) => syncSystemDesignTemplate(e.target.value, designRequirements)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition text-sm font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Requirements / Context Constraints</label>
                      <textarea
                        rows={8}
                        placeholder="* Functional: Passenger requests ride, driver accepts, tracks route.&#10;* Non-Functional: Highly Available, low latency, matches locations under 3s."
                        value={designRequirements}
                        onChange={(e) => syncSystemDesignTemplate(designHeadline, e.target.value)}
                        className="w-full p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR: Telemetry Alerts, MCQ Search & Web Search */}
      <aside className="w-96 border-l border-slate-800/80 bg-[#080d1a] flex flex-col">
        {/* Sidebar Tabs */}
        <div className="flex border-b border-slate-800/80 bg-slate-950/20 text-[10px]">
          <button
            onClick={() => setRightPanelTab('alerts')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center transition ${
              rightPanelTab === 'alerts'
                ? 'text-purple-400 border-b border-purple-500 bg-purple-500/5'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
            }`}
          >
            Security ({alerts.length})
          </button>
          <button
            onClick={() => setRightPanelTab('smartSearch')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center transition ${
              rightPanelTab === 'smartSearch'
                ? 'text-purple-400 border-b border-purple-500 bg-purple-500/5'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
            }`}
          >
            MCQ Bank
          </button>

        </div>

        <div className="flex-grow overflow-y-auto p-4 min-h-0">
          {rightPanelTab === 'alerts' && (
            /* Tab: Security Alerts Log */
            <div className="space-y-3 h-full">
              {alerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center p-4">
                  <Users size={32} className="mb-2 text-slate-700" />
                  <p className="text-xs">No security events triggered. Candidate activity is secure.</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className="p-3.5 rounded-xl border border-red-500/20 bg-red-950/20 space-y-1.5 animate-slide-in"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                        {alert.eventType}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-red-200 leading-relaxed">{alert.detail}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {rightPanelTab === 'smartSearch' && (
            /* Tab: Smart MCQ Search */
            <div className="space-y-4 h-full flex flex-col">
              <form onSubmit={handleSmartSearch} className="flex gap-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    required
                    placeholder="Search keywords (e.g. React hooks)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold transition disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </form>

              <div className="flex-grow overflow-y-auto space-y-3 pr-1 min-h-0">
                {searchResults.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-slate-600 text-center text-xs p-4">
                    <Search size={24} className="mb-2 text-slate-700" />
                    <p>Enter a technical topic to generate exam MCQs instantly.</p>
                  </div>
                ) : (
                  searchResults.map((mcq, idx) => (
                    <div 
                      key={idx} 
                      className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700/60 transition space-y-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-xs font-bold text-slate-200 leading-snug">{mcq.question}</h4>
                        <button
                          onClick={() => handlePushMcq(mcq)}
                          className="flex-shrink-0 p-1.5 rounded-md bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600 hover:text-white transition"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="space-y-1 pl-2">
                        {mcq.choices.map((choice, i) => (
                          <div 
                            key={i} 
                            className={`text-[10px] flex items-center gap-1.5 ${
                              i === mcq.correctAnswerIndex ? 'text-green-400 font-semibold' : 'text-slate-400'
                            }`}
                          >
                            <span className="w-3 text-slate-500">{i + 1}.</span>
                            <span>{choice}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}


        </div>

        {/* Rules info footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/30 text-[10px] text-slate-500 space-y-1.5">
          <p className="font-semibold text-slate-400">Rules Tracked:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Escaping Fullscreen Window</li>
            <li>Loss of Tab Focus (Blur Event)</li>
            <li>Clipboard Copy / Cut / Paste Actions</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
