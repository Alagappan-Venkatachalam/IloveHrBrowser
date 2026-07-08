'use client';

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { useExamSecurity } from '../hooks/useExamSecurity';
import { 
  Lock, 
  Video, 
  HelpCircle, 
  FileCode, 
  Maximize2,
  ShieldAlert,
  Plus,
  Trash2,
  Network,
  Link2
} from 'lucide-react';


interface StudentDashboardProps {
  socket: Socket;
  sessionId: string;
  studentName: string;
}

interface SurfacedMCQ {
  question: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface CanvasNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface CanvasLink {
  from: string;
  to: string;
  direction: 'forward' | 'backward' | 'bidirectional' | 'none';
}

export default function StudentDashboard({ socket, sessionId, studentName }: StudentDashboardProps) {
  const [activeMode, setActiveMode] = useState<'CODING' | 'MCQ' | 'SYSTEM_DESIGN'>('CODING');
  const [code, setCode] = useState('// Type your solution here...\n\nfunction solve() {\n  \n}');
  const [language, setLanguage] = useState('javascript');
  const [sessionActive, setSessionActive] = useState(false);

  // MCQ state
  const [activeMcq, setActiveMcq] = useState<SurfacedMCQ | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  
  // Blackboard State
  const [blackboardText, setBlackboardText] = useState('// Welcome to the Collaborative Blackboard. Wait for the recruiter to paste a question...');
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // System Design Wizard state
  const [designHeadline, setDesignHeadline] = useState('Standard System Design Task');
  const [designRequirements, setDesignRequirements] = useState('* Click workspace elements to interact.');

  // Text-to-Shape interactive states
  const [canvasText, setCanvasText] = useState(
    '// Describe your system architecture here.\n// Typing triggers boxes on the right canvas.\n\nclient -> load balancer\nload balancer -> web server\nweb server -> cache\nweb server -< database'
  );
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [links, setLinks] = useState<CanvasLink[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [customNodeText, setCustomNodeText] = useState('');

  // Interactive canvas connection linkage mode
  const [isLinking, setIsLinking] = useState(false);
  const [activeLinkPopupIndex, setActiveLinkPopupIndex] = useState<number | null>(null);
  const [justConnected, setJustConnected] = useState(false);


  // WebRTC
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<any>(null);
  const iceCandidateBufferRef = useRef<any[]>([]);
  const canvasRef = useRef<SVGSVGElement>(null);
  const socketRef = useRef<Socket>(socket);

  // Hook up anti-cheating controls
  const { isFullscreen, requestFullscreen } = useExamSecurity({
    isEnabled: sessionActive,
    onViolation: (eventType, detail) => {
      socket.emit('security_warning', { eventType, detail });
    },
  });

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

    // 3. Receive sync updates (from recruiter editing code)
    socket.on('editor_sync', (data: { code: string; language: string }) => {
      setCode(data.code);
      if (data.language) setLanguage(data.language);
    });

    // 4. MCQ sync updates
    socket.on('mcq_synced', (data: SurfacedMCQ) => {
      setActiveMcq(data);
      setSelectedChoice(null);
    });

    socket.on('blackboard_sync', (data: { text: string }) => {
      setBlackboardText(data.text);
    });

    // 5. System Design wizard template sync
    socket.on('system_design_synced', (data: { headline: string; requirements: string }) => {
      setDesignHeadline(data.headline);
      setDesignRequirements(data.requirements);
    });

    socket.on('webrtc_offer', async ({ offer }) => {
      if (!localStreamRef.current) {
        pendingOfferRef.current = offer;
        return;
      }
      await processOffer(offer);
    });

    const processOffer = async (offer: any) => {
      try {
        if (!peerConnectionRef.current) startPeerConnection();
        await peerConnectionRef.current!.setRemoteDescription(new RTCSessionDescription(offer));
        
        while (iceCandidateBufferRef.current.length > 0) {
          const c = iceCandidateBufferRef.current.shift();
          await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
        }

        const answer = await peerConnectionRef.current!.createAnswer();
        await peerConnectionRef.current!.setLocalDescription(answer);
        socketRef.current.emit('webrtc_answer', { answer });
      } catch (err: any) {
        console.error('Failed to handle WebRTC offer:', err.message);
      }
    };

    socket.on('webrtc_answer', async ({ answer }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
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

    socket.on('peer_present', () => {
      // Student doesn't initiate — just ensures peer connection is ready
      if (!peerConnectionRef.current) startPeerConnection();
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
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          if (!peerConnectionRef.current) {
            startPeerConnection();
          } else {
            bindTracksToPeerConnection();
          }
          
          if (pendingOfferRef.current) {
            processOffer(pendingOfferRef.current);
            pendingOfferRef.current = null;
          }
        })
        .catch((err) => console.log('Camera permission denied or unavailable:', err.message));
    }

    return () => {
      socket.off('session_state');
      socket.off('mode_changed');
      socket.off('editor_sync');
      socket.off('mcq_synced');
      socket.off('system_design_synced');
      socket.off('webrtc_offer');
      socket.off('webrtc_answer');
      socket.off('webrtc_ice_candidate');
      socket.off('blackboard_sync');
      socket.off('peer_present');
    };
  }, [socket]);

  // Peer Connection Instantiation with STUN/TURN configurations
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

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const enabled = !cameraEnabled;
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      setCameraEnabled(enabled);
    }
  };

  // --- TEXT-TO-SHAPE CANVAS ENGINE ---
  useEffect(() => {
    if (activeMode !== 'SYSTEM_DESIGN') return;

    const KEYWORD_MAP = ['client', 'load balancer', 'cache', 'database', 'queue', 'worker', 'api gateway', 'web server', 'cdn', 'server'];

    const lines = canvasText.split('\n');
    const detectedLabels = new Set<string>();
    const parsedLinks: { from: string; to: string; direction: 'forward' | 'backward' }[] = [];

    lines.forEach((line) => {
      const cleanLine = line.replace(/^\/\/.*$/, '').trim();
      if (!cleanLine) return;

      if (cleanLine.includes('->')) {
        const parts = cleanLine.split('->').map((p) => p.trim().toLowerCase());
        if (parts.length >= 2) {
          const fromLabel = parts[0];
          const toLabel = parts[1];
          if (fromLabel && toLabel) {
            detectedLabels.add(fromLabel);
            detectedLabels.add(toLabel);
            parsedLinks.push({ from: fromLabel, to: toLabel, direction: 'forward' });
          }
        }
      } else if (cleanLine.includes('-<')) {
        const parts = cleanLine.split('-<').map((p) => p.trim().toLowerCase());
        if (parts.length >= 2) {
          const fromLabel = parts[0];
          const toLabel = parts[1];
          if (fromLabel && toLabel) {
            detectedLabels.add(fromLabel);
            detectedLabels.add(toLabel);
            parsedLinks.push({ from: fromLabel, to: toLabel, direction: 'backward' });
          }
        }
      } else {
        KEYWORD_MAP.forEach((kw) => {
          if (cleanLine.toLowerCase().includes(kw)) {
            detectedLabels.add(kw);
          }
        });
      }
    });

    // Update nodes state
    setNodes((prevNodes) => {
      const nodeMap = new Map(prevNodes.map((n) => [n.id, n]));
      const nextNodes: CanvasNode[] = [];

      Array.from(detectedLabels).forEach((label) => {
        const id = label.replace(/\s+/g, '_');
        if (nodeMap.has(id)) {
          nextNodes.push(nodeMap.get(id)!);
        } else {
          nextNodes.push({
            id,
            label: label.charAt(0).toUpperCase() + label.slice(1),
            x: 100 + Math.random() * 250,
            y: 80 + Math.random() * 180,
          });
        }
      });

      return nextNodes;
    });

    // Update links state, respecting parsed direction (-> vs -<)
    setLinks((prevLinks) => {
      const linkMap = new Map(prevLinks.map((l) => [`${l.from}->${l.to}`, l]));
      const nextLinks: CanvasLink[] = [];
      let newLinkDetected = false;

      parsedLinks.forEach((parsed) => {
        const fromId = parsed.from.replace(/\s+/g, '_');
        const toId = parsed.to.replace(/\s+/g, '_');
        const key = `${fromId}->${toId}`;

        if (linkMap.has(key)) {
          // Retain link direction unless overridden by text change
          nextLinks.push({
            ...linkMap.get(key)!,
            direction: parsed.direction
          });
        } else {
          nextLinks.push({
            from: fromId,
            to: toId,
            direction: parsed.direction,
          });
          newLinkDetected = true;
        }
      });

      if (newLinkDetected && nextLinks.length > 0) {
        setTimeout(() => {
          setActiveLinkPopupIndex(nextLinks.length - 1);
          setJustConnected(true);
        }, 100);
      }

      return nextLinks;
    });
  }, [canvasText, activeMode]);

  // Drag and Drop Node Handler
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setDraggedNodeId(nodeId);

    // If linking mode is active and we click a target node, connect them!
    if (isLinking && selectedNodeId && selectedNodeId !== nodeId) {
      const fromNode = nodes.find(n => n.id === selectedNodeId);
      const toNode = nodes.find(n => n.id === nodeId);

      if (fromNode && toNode) {
        // 1. Add link locally
        const newLink: CanvasLink = {
          from: selectedNodeId,
          to: nodeId,
          direction: 'forward'
        };
        setLinks(prev => [...prev, newLink]);

        // 2. Sync connection string back to the text area
        setCanvasText(prev => {
          const lines = prev.split('\n');
          lines.push(`${fromNode.label.toLowerCase()} -> ${toNode.label.toLowerCase()}`);
          return lines.join('\n');
        });

        // Open popup selector for this connection
        setActiveLinkPopupIndex(links.length);
        setJustConnected(true);
      }

      setIsLinking(false);
      return;
    }

    setSelectedNodeId(nodeId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNodeId || !canvasRef.current) return;
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setNodes((prev) =>
      prev.map((n) => (n.id === draggedNodeId ? { ...n, x, y } : n))
    );
  };

  const handleMouseUp = () => {
    setDraggedNodeId(null);
  };

  // Add Custom Node manually
  const handleAddCustomNode = () => {
    if (!customNodeText.trim()) return;
    const id = customNodeText.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    setNodes((prev) => [
      ...prev,
      {
        id,
        label: customNodeText.trim(),
        x: 150 + Math.random() * 100,
        y: 150 + Math.random() * 100,
      },
    ]);
    setCustomNodeText('');
  };

  // Delete Selected Node
  const handleDeleteNode = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setLinks((prev) => prev.filter((l) => l.from !== selectedNodeId && l.to !== selectedNodeId));
    setSelectedNodeId(null);
    setActiveLinkPopupIndex(null);
    setIsLinking(false);
  };

  // --- MAGNETIC ARROW ANCHOR COORDINATES ---
  const getSnapPoints = (from: CanvasNode, to: CanvasNode) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    let fromX = from.x;
    let fromY = from.y;
    let toX = to.x;
    let toY = to.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        fromX = from.x + 60;
        toX = to.x - 60;
      } else {
        fromX = from.x - 60;
        toX = to.x + 60;
      }
    } else {
      if (dy > 0) {
        fromY = from.y + 20;
        toY = to.y - 20;
      } else {
        fromY = from.y - 20;
        toY = to.y + 20;
      }
    }

    return { fromX, fromY, toX, toY };
  };

  // Co-coding Monaco Editor typings
  const handleEditorChange = (value: string | undefined) => {
    const updatedCode = value || '';
    setCode(updatedCode);
    socket.emit('editor_change', { code: updatedCode, language });
  };



  const handleStartExam = async () => {
    setSessionActive(true);
    await requestFullscreen();
  };

  const selectCandidateMcqChoice = (idx: number) => {
    setSelectedChoice(idx);
    socket.emit('select_mcq_option', { choiceIndex: idx });
  };

  return (
    <div className="h-screen w-screen flex bg-[#060913] text-slate-100 overflow-hidden relative">
      {/* LOBBY ACCESS COVER OVERLAY */}
      {!sessionActive && (
        <div className="absolute inset-0 bg-[#060913]/98 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-panel glass-panel-glow rounded-2xl p-8 text-center space-y-6">
            <Lock size={48} className="mx-auto text-purple-400" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Security System Authorization</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Hello <strong>{studentName}</strong>. To guarantee test integrity, this exam requires strict fullscreen enforcement, clipboard blocking, and active focus tracking.
              </p>
            </div>
            <button
              onClick={handleStartExam}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition flex items-center justify-center gap-2"
            >
              Authorization & Start Exam
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      )}

      {/* FULLSCREEN EXIT WARN COVER */}
      {sessionActive && !isFullscreen && (
        <div className="absolute inset-0 bg-red-950/80 backdrop-blur-xl z-40 flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-panel border-red-500/50 rounded-2xl p-8 text-center space-y-6">
            <ShieldAlert size={48} className="mx-auto text-red-500 animate-pulse" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-red-200">Security Breach</h2>
              <p className="text-sm text-red-100/70 mt-2 leading-relaxed">
                You have exited Fullscreen mode! The recruiter has been notified. Click below to return to fullscreen and unlock your exam.
              </p>
            </div>
            <button
              onClick={requestFullscreen}
              className="w-full py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition"
            >
              Restore Fullscreen Mode
            </button>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR: Video stream feeds */}
      <aside className="w-80 border-r border-slate-800/80 flex flex-col justify-between bg-[#080d1a]">
        <div>
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg text-slate-200">ilovexams Shield</h2>
              <p className="text-xs text-slate-500">Exam Mode: {activeMode}</p>
            </div>
            <span className="flex items-center gap-1 text-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-400 px-2 py-0.5 rounded-full font-bold">
              Protected
            </span>
          </div>

          {/* WebRTC Video Feeds */}
          <div className="p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Live Video Feed</h3>
            
            <div className="flex flex-col gap-2">
              <div className="relative aspect-video bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1.5 text-[9px] bg-slate-950/75 px-1.5 py-0.5 rounded text-slate-400">Interviewer Feed</span>
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

        {/* User Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
            S
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">{studentName}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Candidate</p>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <main className="flex-grow flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-[#080d1a]/50">
          <div className="flex items-center gap-3">
            <FileCode className="text-purple-400" size={18} />
            <h2 className="font-semibold text-sm">Workspace</h2>
            {activeMode === 'CODING' && (
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  socket.emit('editor_change', { code, language: e.target.value });
                }}
                className="text-xs bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-300 outline-none"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
                <option value="go">Go</option>
              </select>
            )}
          </div>

          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Mode: {activeMode}</span>
        </header>

        {/* Dynamic Inner Layout */}
        <div className="flex-grow flex flex-col min-h-0 relative">
          {activeMode === 'CODING' && (
            <div className="flex-grow flex flex-col min-h-0">
              <div className="flex-grow relative min-h-[300px]">
                <Editor
                  height="100%"
                  language={language}
                  theme="vs-dark"
                  value={code}
                  onChange={handleEditorChange}
                  options={{
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
            /* Split Screen System Design Mode with Text-to-Shape Engine */
            <div className="flex-grow flex flex-col min-h-0 bg-[#070c18]/10">
              {/* Wizard Prompt Bar */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 space-y-1">
                <h3 className="text-sm font-bold text-purple-400">{designHeadline}</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono whitespace-pre-wrap">{designRequirements}</p>
              </div>

              {/* Dynamic Split Grid */}
              <div className="flex-grow flex min-h-0">
                {/* Left Panel: Markdown spec sheet */}
                <div className="w-2/5 border-r border-slate-800/80 flex flex-col bg-[#070c17]">
                  <div className="p-3 border-b border-slate-800/80 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    System Architecture Editor
                  </div>
                  <textarea
                    value={canvasText}
                    onChange={(e) => setCanvasText(e.target.value)}
                    className="flex-grow p-4 bg-slate-950/40 text-xs font-mono text-slate-300 border-none outline-none resize-none focus:ring-0 leading-relaxed"
                  />
                </div>

                {/* Right Panel: Interactive Drawing Canvas */}
                <div className="flex-grow flex flex-col min-w-0 bg-[#060a15] relative">
                  {/* Floating Canvas Toolbar */}
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-2 p-1.5 rounded-lg bg-slate-900 border border-slate-800 shadow-xl">
                    <input
                      type="text"
                      placeholder="Add Node..."
                      value={customNodeText}
                      onChange={(e) => setCustomNodeText(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 w-24 outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={handleAddCustomNode}
                      className="p-1 rounded bg-purple-600 text-white hover:bg-purple-500 transition"
                      title="Add shape to canvas"
                    >
                      <Plus size={12} />
                    </button>
                    {selectedNodeId && (
                      <button
                        onClick={() => setIsLinking(!isLinking)}
                        className={`p-1 rounded transition flex items-center gap-1 text-[10px] ${
                          isLinking 
                            ? 'bg-amber-500 text-white hover:bg-amber-400' 
                            : 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white'
                        }`}
                        title="Click to link node to another element"
                      >
                        <Link2 size={12} /> {isLinking ? 'Cancel Link' : 'Link Node'}
                      </button>
                    )}
                    {selectedNodeId && (
                      <button
                        onClick={handleDeleteNode}
                        className="p-1 rounded bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition"
                        title="Delete selected element"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    <span className="h-4 w-px bg-slate-800 mx-1" />
                    <span className="text-[9px] text-slate-500 flex items-center gap-1 font-mono">
                      <Network size={10} className="text-indigo-400" /> Click arrow to select direction
                    </span>
                  </div>

                  {/* DIRECTION ARROW PICKER MICRO-POPUP OVERLAY */}
                  {activeLinkPopupIndex !== null && links[activeLinkPopupIndex] && (
                    (() => {
                      const link = links[activeLinkPopupIndex];
                      const fromNode = nodes.find((n) => n.id === link.from);
                      const toNode = nodes.find((n) => n.id === link.to);

                      if (!fromNode || !toNode) return null;

                      const { fromX, fromY, toX, toY } = getSnapPoints(fromNode, toNode);
                      const midX = (fromX + toX) / 2;
                      const midY = (fromY + toY) / 2;

                      return (
                        <div 
                          className="absolute z-20 flex flex-col p-2.5 rounded-lg bg-slate-900 border border-purple-500/50 shadow-2xl text-[10px] space-y-1.5"
                          style={{
                            left: `${Math.max(10, Math.min(midX - 70, 500))}px`,
                            top: `${Math.max(10, Math.min(midY - 45, 450))}px`,
                          }}
                        >
                          <span className="font-semibold text-slate-400 text-center uppercase tracking-wider text-[8px]">
                            {justConnected ? 'Connection Established!' : 'Data Flow Direction'}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                setLinks(prev => prev.map((l, i) => i === activeLinkPopupIndex ? { ...l, direction: 'forward' } : l));
                                setActiveLinkPopupIndex(null);
                                setJustConnected(false);
                              }}
                              className={`py-1 px-2 rounded border text-slate-200 transition ${
                                link.direction === 'forward' ? 'bg-purple-600 border-purple-400' : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                              }`}
                              title="Forward Flow (➡)"
                            >
                              ➡
                            </button>
                            <button
                              onClick={() => {
                                setLinks(prev => prev.map((l, i) => i === activeLinkPopupIndex ? { ...l, direction: 'backward' } : l));
                                setActiveLinkPopupIndex(null);
                                setJustConnected(false);
                              }}
                              className={`py-1 px-2 rounded border text-slate-200 transition ${
                                link.direction === 'backward' ? 'bg-purple-600 border-purple-400' : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                              }`}
                              title="Backward Flow (⬅)"
                            >
                              ⬅
                            </button>
                            <button
                              onClick={() => {
                                setLinks(prev => prev.map((l, i) => i === activeLinkPopupIndex ? { ...l, direction: 'bidirectional' } : l));
                                setActiveLinkPopupIndex(null);
                                setJustConnected(false);
                              }}
                              className={`py-1 px-2 rounded border text-slate-200 transition ${
                                link.direction === 'bidirectional' ? 'bg-purple-600 border-purple-400' : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                              }`}
                              title="Bi-directional (⬅➡)"
                            >
                              ⬅➡
                            </button>
                            <button
                              onClick={() => {
                                setLinks(prev => prev.map((l, i) => i === activeLinkPopupIndex ? { ...l, direction: 'none' } : l));
                                setActiveLinkPopupIndex(null);
                                setJustConnected(false);
                              }}
                              className={`py-1 px-2 rounded border text-slate-200 transition ${
                                link.direction === 'none' ? 'bg-purple-600 border-purple-400' : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                              }`}
                              title="Static Link"
                            >
                              Static
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {/* SVG Drawing Board */}
                  <svg
                    ref={canvasRef}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className="flex-grow w-full h-full cursor-grab active:cursor-grabbing select-none"
                  >
                    {/* SVG Definitions for Arrow Heads */}
                    <defs>
                      <marker
                        id="arrow-end"
                        viewBox="0 0 10 10"
                        refX="10" // Snaps perfectly to node borders (tip at x=10)
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
                      </marker>
                      <marker
                        id="arrow-start"
                        viewBox="0 0 10 10"
                        refX="0" // Snaps perfectly to node borders (tip at x=0)
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto"
                      >
                        <path d="M 10 0 L 0 5 L 10 10 z" fill="#818cf8" />
                      </marker>
                    </defs>

                    {/* Render Snap-snapped Links */}
                    {links.map((link, idx) => {
                      const fromNode = nodes.find((n) => n.id === link.from);
                      const toNode = nodes.find((n) => n.id === link.to);

                      if (!fromNode || !toNode) return null;

                      const { fromX, fromY, toX, toY } = getSnapPoints(fromNode, toNode);

                      let markerEnd = undefined;
                      let markerStart = undefined;

                      if (link.direction === 'forward') markerEnd = 'url(#arrow-end)';
                      if (link.direction === 'backward') markerStart = 'url(#arrow-start)';
                      if (link.direction === 'bidirectional') {
                        markerEnd = 'url(#arrow-end)';
                        markerStart = 'url(#arrow-start)';
                      }

                      return (
                        <g key={idx}>
                          {/* Thicker click target line */}
                          <line
                            x1={fromX}
                            y1={fromY}
                            x2={toX}
                            y2={toY}
                            stroke="transparent"
                            strokeWidth="10"
                            className="cursor-pointer"
                            onClick={() => {
                              setActiveLinkPopupIndex(idx);
                              setJustConnected(false);
                            }}
                          />
                          <line
                            x1={fromX}
                            y1={fromY}
                            x2={toX}
                            y2={toY}
                            stroke="#818cf8"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            markerEnd={markerEnd}
                            markerStart={markerStart}
                            className="pointer-events-none"
                          />
                        </g>
                      );
                    })}

                    {/* Render Node Shapes */}
                    {nodes.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      
                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          onMouseDown={(e) => handleMouseDown(e, node.id)}
                          className="cursor-pointer group"
                        >
                          <rect
                            x="-60"
                            y="-20"
                            width="120"
                            height="40"
                            rx="8"
                            fill={isSelected ? (isLinking ? '#d97706' : '#7c3aed') : '#0f172a'}
                            stroke={isSelected ? (isLinking ? '#fbbf24' : '#a78bfa') : '#312e81'}
                            strokeWidth={isSelected ? '2.5' : '1.5'}
                            className="transition shadow-lg shadow-purple-500/10 group-hover:stroke-purple-500"
                          />
                          <text
                            textAnchor="middle"
                            y="4"
                            fill={isSelected ? '#ffffff' : '#cbd5e1'}
                            fontSize="11"
                            fontWeight="600"
                            className="pointer-events-none font-sans tracking-wide"
                          >
                            {node.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
