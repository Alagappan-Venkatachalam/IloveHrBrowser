'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, ShieldAlert, Cpu, ClipboardCopy, Send } from 'lucide-react';
import axios from 'axios';

export default function LobbyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'recruiter' | 'candidate'>('recruiter');

  // Recruiter form fields
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [recruiterName, setRecruiterName] = useState('');
  const [studentMobile, setStudentMobile] = useState('');
  const [studentName, setStudentName] = useState('');
  const [sessionCreatedData, setSessionCreatedData] = useState<{
    sessionId: string;
    hash: string;
    otpCode: string;
  } | null>(null);

  // Candidate form fields
  const [candidateHash, setCandidateHash] = useState('');
  const [candidateOtp, setCandidateOtp] = useState('');

  // Status/Error tracking
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSessionCreatedData(null);

    try {
      const response = await axios.post('http://localhost:4000/api/auth/session', {
        recruiterEmail,
        recruiterName: recruiterName || 'Recruiter',
        studentMobile,
        studentName,
      });

      setSessionCreatedData({
        sessionId: response.data.sessionId,
        hash: response.data.hash,
        otpCode: response.data.otpCode,
      });

      setSuccess('Session created! OTP sent via textbee (if configured).');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initialize session');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:4000/api/auth/student-verify', {
        hash: candidateHash,
        otp: candidateOtp,
      });

      // Save token to localStorage
      localStorage.setItem(`token_${response.data.sessionId}`, response.data.token);
      localStorage.setItem(`role_${response.data.sessionId}`, 'STUDENT');

      router.push(`/session/${response.data.sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed. Check your Hash and OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterRecruiterSession = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:4000/api/auth/recruiter-verify', {
        sessionId,
        email: recruiterEmail,
      });

      localStorage.setItem(`token_${sessionId}`, response.data.token);
      localStorage.setItem(`role_${sessionId}`, 'RECRUITER');

      router.push(`/session/${sessionId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to authenticate recruiter');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6">
      {/* Navbar */}
      <header className="flex justify-between items-center max-w-7xl w-full mx-auto py-4">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-xl shadow-lg shadow-purple-500/20">
            iL
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-200 bg-clip-text text-transparent">
            ilovexams.com
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldAlert size={15} className="text-purple-400" /> Secure Live Exam Shield</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex items-center justify-center py-12">
        <div className="w-full max-w-2xl">
          {/* Hero text */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
              Technical Interviews,{' '}
              <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                Perfected.
              </span>
            </h1>
            <p className="text-slate-400 max-w-md mx-auto">
              Real-time workspace sync, interactive WebRTC video sidebar, and zero-trust anti-cheat screen locks.
            </p>
          </div>

          {/* Lobby Box */}
          <div className="glass-panel glass-panel-glow rounded-2xl overflow-hidden shadow-2xl">
            {/* Tabs */}
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => { setActiveTab('recruiter'); setError(''); }}
                className={`flex-1 py-4 font-semibold text-center transition ${
                  activeTab === 'recruiter'
                    ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                Recruiter Portal
              </button>
              <button
                onClick={() => { setActiveTab('candidate'); setError(''); }}
                className={`flex-1 py-4 font-semibold text-center transition ${
                  activeTab === 'candidate'
                    ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                Candidate Entrance
              </button>
            </div>

            {/* Form Panels */}
            <div className="p-8">
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-6 p-4 rounded-xl bg-green-950/40 border border-green-500/30 text-green-200 text-sm">
                  {success}
                </div>
              )}

              {activeTab === 'recruiter' ? (
                /* Recruiter Form */
                <form onSubmit={handleCreateSession} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Your Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="recruiter@company.com"
                        value={recruiterEmail}
                        onChange={(e) => setRecruiterEmail(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Your Name
                      </label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={recruiterName}
                        onChange={(e) => setRecruiterName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>
                  </div>

                  <hr className="border-slate-800/80 my-4" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Candidate Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Candidate Name"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Candidate Mobile Number
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+919876543210"
                        value={studentMobile}
                        onChange={(e) => setStudentMobile(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Generating...' : 'Initiate Interview Session'}
                    <Send size={16} />
                  </button>

                  {sessionCreatedData && (
                    <div className="mt-6 p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
                      <h4 className="text-sm font-semibold text-purple-400">DEVELOPER OTP/HASH TRANSMISSION SCREEN</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Normally, this SMS is routed through <strong>textbee.dev</strong>. For local sandbox testing, we print them directly below:
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                          <span className="text-slate-400">Student Connection Hash:</span>
                          <code className="text-indigo-300 font-mono select-all bg-slate-950 px-2 py-0.5 rounded">{sessionCreatedData.hash}</code>
                        </div>
                        <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                          <span className="text-slate-400">One-Time Password (OTP):</span>
                          <code className="text-green-400 font-bold font-mono select-all bg-slate-950 px-2 py-0.5 rounded">{sessionCreatedData.otpCode}</code>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnterRecruiterSession(sessionCreatedData.sessionId)}
                        className="w-full mt-2 py-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-xs font-semibold tracking-wider transition"
                      >
                        Enter Recruiter Control Center
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                /* Candidate Verification Form */
                <form onSubmit={handleVerifyCandidate} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Secure Hash Code
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter the hash code provided in the invite link"
                      value={candidateHash}
                      onChange={(e) => setCandidateHash(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      6-Digit OTP Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="Enter the 6-Digit OTP received on your mobile"
                      value={candidateOtp}
                      onChange={(e) => setCandidateOtp(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-center tracking-widest font-mono text-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold transition duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Unlock Secure Room'}
                    <UserCheck size={16} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl w-full mx-auto py-6 border-t border-slate-900/80 text-center text-xs text-slate-500">
        <p>&copy; 2026 ilovexams.com. Powered by Next.js & WebRTC. All rights reserved.</p>
      </footer>
    </div>
  );
}
