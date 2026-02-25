/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { Play, Pause, SkipForward, Link as LinkIcon, Users, Tv, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SyncState {
  videoId: string;
  playing: boolean;
  currentTime: number;
  lastUpdated: number;
}

const Player = ReactPlayer as any;

export default function App() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<SyncState | null>(null);
  const [connected, setConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const playerRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const isInternalUpdate = useRef(false);
  const lastTimeRef = useRef(0);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      setError(null);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received message:', message.type);

      if (message.type === 'INIT' || message.type === 'VIDEO_CHANGED' || message.type === 'PLAYED' || message.type === 'PAUSED' || message.type === 'SEEKED' || message.type === 'SYNC_RESPONSE') {
        const newState = message.state;
        setState(newState);

        // Handle synchronization
        if (playerRef.current && isReady) {
          isInternalUpdate.current = true;
          
          // Calculate expected time based on drift
          let targetTime = newState.currentTime;
          if (newState.playing) {
            const drift = (Date.now() - newState.lastUpdated) / 1000;
            targetTime += drift;
          }

          const currentTime = playerRef.current.getCurrentTime();
          if (Math.abs(currentTime - targetTime) > 2) {
            playerRef.current.seekTo(targetTime, 'seconds');
            lastTimeRef.current = targetTime;
          }
          
          setTimeout(() => {
            isInternalUpdate.current = false;
          }, 500);
        }
      }
    };

    socket.onclose = () => {
      setConnected(false);
      setError('Disconnected from server. Retrying...');
      // Simple reconnect logic
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    return () => {
      socket.close();
    };
  }, [isReady]);

  const handlePlay = () => {
    if (isInternalUpdate.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN && state) {
      socketRef.current.send(JSON.stringify({
        type: 'PLAY',
        currentTime: playerRef.current?.getCurrentTime() || 0
      }));
    }
  };

  const handlePause = () => {
    if (isInternalUpdate.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN && state) {
      socketRef.current.send(JSON.stringify({
        type: 'PAUSE',
        currentTime: playerRef.current?.getCurrentTime() || 0
      }));
    }
  };

  const handleSeek = (seconds: number) => {
    if (isInternalUpdate.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN && state) {
      socketRef.current.send(JSON.stringify({
        type: 'SEEK',
        currentTime: seconds
      }));
    }
  };

  const handleProgress = (progress: { playedSeconds: number }) => {
    if (isInternalUpdate.current) {
      lastTimeRef.current = progress.playedSeconds;
      return;
    }
    
    // Detect seek by checking if the time jumped significantly
    if (Math.abs(progress.playedSeconds - lastTimeRef.current) > 2) {
      handleSeek(progress.playedSeconds);
    }
    lastTimeRef.current = progress.playedSeconds;
  };

  const handleChangeVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    // Extract video ID from URL if possible
    let videoId = url;
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtube.com')) {
        videoId = urlObj.searchParams.get('v') || url;
      } else if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1);
      }
    } catch (e) {
      // Not a full URL, assume it's an ID
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CHANGE_VIDEO',
        videoId
      }));
      setUrl('');
    }
  };

  const videoUrl = state ? `https://www.youtube.com/watch?v=${state.videoId}` : '';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Tv className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">SyncStream</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
                  {connected ? 'Live Session' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangeVideo} className="flex-1 max-w-md mx-8 hidden md:flex">
            <div className="relative w-full group">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube link here..."
                className="w-full bg-zinc-900/50 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-zinc-600"
              />
            </div>
          </form>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-white/5">
              <Users className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-300">Shared View</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Player Section */}
          <div className="lg:col-span-9 space-y-6">
            <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-white/5 shadow-2xl group">
              {!state && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                    <p className="text-zinc-500 text-sm font-medium">Initializing stream...</p>
                  </div>
                </div>
              )}
              
              {state && (
                <Player
                  ref={playerRef}
                  url={videoUrl}
                  width="100%"
                  height="100%"
                  playing={state.playing}
                  controls={true}
                  onReady={() => setIsReady(true)}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onProgress={handleProgress}
                  config={{
                    youtube: {
                      rel: 0
                    }
                  }}
                />
              )}

              {error && (
                <div className="absolute bottom-6 left-6 right-6">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xl"
                  >
                    <Info className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </motion.div>
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-zinc-900/50 rounded-3xl border border-white/5">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Now Playing</h2>
                <p className="text-zinc-500 text-sm mt-1">Everyone on this page is watching this video in sync.</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => socketRef.current?.send(JSON.stringify({ type: 'SYNC_REQUEST' }))}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Force Sync
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar / Controls */}
          <div className="lg:col-span-3 space-y-6">
            <div className="p-6 bg-zinc-900/50 rounded-3xl border border-white/5 space-y-6">
              <div className="flex items-center gap-2 text-emerald-500">
                <Info className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-widest">How it works</h3>
              </div>
              
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">Paste any YouTube URL in the search bar above.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">The video will change for everyone currently on the site.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">Play, pause, and seek actions are synchronized in real-time.</p>
                </li>
              </ul>
            </div>

            <div className="md:hidden">
              <form onSubmit={handleChangeVideo} className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Change Video</label>
                <div className="relative group">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste YouTube link..."
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                >
                  Update Stream
                </button>
              </form>
            </div>

            <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Pro Tip</p>
              <p className="text-xs text-emerald-200/60 leading-relaxed">
                If the video gets out of sync, click the "Force Sync" button to realign with the server's master clock.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-white/5 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-40">
            <Tv className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tighter">SyncStream</span>
          </div>
          <p className="text-xs text-zinc-600 font-medium tracking-wide uppercase">
            Built for real-time collaborative viewing
          </p>
        </div>
      </footer>
    </div>
  );
}
