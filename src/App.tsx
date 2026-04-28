/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Play, Pause, Download, Wand2, Volume2, Settings2, Trash2, Loader2, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as lamejs from 'lamejs';
import { convertToDialectScript, generateEgyptianAudio, DIALECT_CONFIGS } from './lib/gemini';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [egyptianScript, setEgyptianScript] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voice, setVoice] = useState('Kore');
  const [dialect, setDialect] = useState('egyptian');
  const [errorString, setErrorString] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const handleConvert = async () => {
    if (!inputText.trim()) return;
    setIsConverting(true);
    setErrorString(null);
    try {
      const script = await convertToDialectScript(inputText, dialect);
      setEgyptianScript(script || '');
    } catch (error: any) {
      console.error('Conversion failed:', error);
      setErrorString('Failed to convert text. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!egyptianScript.trim()) return;
    setIsGeneratingAudio(true);
    setAudioBase64(null);
    setErrorString(null);
    stopAudio(); // Stop any current playback
    try {
      const base64 = await generateEgyptianAudio(egyptianScript, voice);
      if (base64) {
        setAudioBase64(base64);
        prepareBuffer(base64);
      }
    } catch (error: any) {
      console.error('Audio generation failed:', error);
      setErrorString(error?.message || 'Audio generation failed. The model might be busy.');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const prepareBuffer = async (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    const buffer = audioCtxRef.current.createBuffer(1, bytes.length / 2, 24000);
    const channelData = buffer.getChannelData(0);
    const int16 = new Int16Array(bytes.buffer);
    for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768.0;
    }
    audioBufferRef.current = buffer;
  };

  const playAudio = () => {
    if (!audioBufferRef.current || !audioCtxRef.current) return;
    
    stopAudio(); // Ensure no overlapping playbacks

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioCtxRef.current.destination);
    source.onended = () => setIsPlaying(false);
    sourceNodeRef.current = source;
    source.start(0);
    setIsPlaying(true);
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleDownloadMp3 = async () => {
    if (!audioBase64) return;
    setIsDownloading(true);
    setErrorString(null);
    try {
      // Fix for lamejs MPEGMode missing error
      if (typeof (window as any).Lame === 'undefined') {
        (window as any).MPEGMode = { STEREO: 0, JOINT_STEREO: 1, DUAL_CHANNEL: 2, MONO: 3 };
        (window as any).Lame = { 
          MPEGMode: (window as any).MPEGMode,
          Lame: {} 
        };
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      
      const binaryString = atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const numSamples = Math.floor(bytes.length / 2);
      const samples = new Int16Array(bytes.buffer, 0, numSamples);
      
      let mp3Blob;
      try {
        // @ts-ignore
        const mp3encoder = new (lamejs.Mp3Encoder || (lamejs as any).default.Mp3Encoder)(1, 24000, 128);
        const mp3Data: any[] = [];
        
        const sampleBlockSize = 1152;
        for (let i = 0; i < samples.length; i += sampleBlockSize) {
          const sampleChunk = samples.subarray(i, i + sampleBlockSize);
          const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
          if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
          }
        }
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }
        mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
      } catch (encodeError) {
        console.warn('MP3 Encoding failed, falling back to WAV:', encodeError);
        mp3Blob = encodeWAV(samples, 24000);
      }
      
      const url = URL.createObjectURL(mp3Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `arabia-vo-${Date.now()}.${mp3Blob.type === 'audio/mp3' ? 'mp3' : 'wav'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Final download failed:', error);
      setErrorString(`فشل في معالجة الملف: ${error?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const encodeWAV = (samples: Int16Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (v: DataView, o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
    return new Blob([view], { type: 'audio/wav' });
  };

  useEffect(() => {
    if (audioBase64) {
      // Audio ready
    }
  }, [audioBase64]);

  const DIALECT_LABELS: Record<string, string> = {
    egyptian: 'المصرية',
    gulf: 'الخليجية',
    iraqi: 'العراقية',
    shami: 'الشامية',
    fusha: 'العربية الفصحى'
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Panel: Input & Settings */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-5 flex flex-col gap-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center glow-active">
              <Mic className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Arabia VA <span className="text-red-500">Pro</span></h1>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest text-right">استوديو التعليق الصوتي العربي</p>
            </div>
          </div>

          <div className="studio-card p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Input Script (Arabic/Any)</label>
              <button 
                onClick={() => setInputText('')}
                className="text-gray-500 hover:text-white transition-colors"
                title="Clear input"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              id="input-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="اكتب النص هنا..."
              className="w-full h-40 bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 resize-none transition-all text-right"
              dir="rtl"
            />
            
            <button
              id="convert-btn"
              onClick={handleConvert}
              disabled={isConverting || !inputText.trim()}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg flex items-center justify-center gap-2 font-bold transition-all shadow-lg"
            >
              {isConverting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Wand2 size={20} />
              )}
              {isConverting ? 'تحويل...' : `Convert to ${DIALECT_LABELS[dialect]}`}
            </button>
          </div>

          <div className="studio-card p-6">
            <h2 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Settings2 size={14} /> Dialect Selection
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {Object.entries(DIALECT_LABELS).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setDialect(id)}
                  className={`py-2 px-3 rounded-md text-sm font-medium transition-all border ${
                    dialect === id 
                      ? 'bg-red-500/10 border-red-500 text-red-500' 
                      : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <h2 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Volume2 size={14} /> Voice Model
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].map((v) => (
                <button
                  key={v}
                  onClick={() => setVoice(v)}
                  className={`py-2 rounded-md text-[11px] font-medium transition-all border ${
                    voice === v 
                      ? 'bg-gray-100 text-black border-white' 
                      : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right Panel: Egyptian/Dialect Script & Audio */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-7 flex flex-col gap-6"
        >
          <div className="studio-card p-6 flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Dialect Optimized Script</label>
              <div className="flex gap-2">
                <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {DIALECT_LABELS[dialect]}
                </span>
              </div>
            </div>

            <div 
              className={`flex-grow bg-gray-900/50 border border-gray-800 rounded-lg p-6 text-white min-h-[250px] relative overflow-hidden transition-all text-right leading-relaxed text-xl`}
              dir="rtl"
            >
              <AnimatePresence mode="wait">
                {isConverting ? (
                  <motion.div 
                    key="converting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/80 backdrop-blur-sm z-10"
                  >
                    <Loader2 className="animate-spin text-red-500" size={32} />
                    <p className="text-sm font-mono text-gray-400">Rewriting in {DIALECT_LABELS[dialect]}...</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              
              {egyptianScript ? (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="whitespace-pre-wrap font-serif italic"
                >
                  {egyptianScript}
                </motion.p>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-600 text-base italic">
                  Converted script will appear here...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 mt-auto">
              <button
                id="generate-audio-btn"
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio || !egyptianScript.trim()}
                className="w-full py-4 bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-500 rounded-xl flex items-center justify-center gap-3 font-bold transition-all shadow-xl group"
              >
                {isGeneratingAudio ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <Volume2 className="group-hover:scale-110 transition-transform" size={24} />
                )}
                {isGeneratingAudio ? 'Generating Audio...' : 'Generate Voice Over'}
              </button>

              <AnimatePresence>
                {errorString && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center"
                  >
                    {errorString}
                  </motion.div>
                )}
                {audioBase64 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="bg-gray-800/80 rounded-xl p-4 flex items-center justify-between border border-gray-700 shadow-inner"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex gap-2">
                        <button
                          onClick={isPlaying ? stopAudio : playAudio}
                          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
                            isPlaying ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-400'
                          }`}
                          title={isPlaying ? 'Stop' : 'Play'}
                        >
                          {isPlaying ? (
                            <div className="w-4 h-4 bg-white rounded-sm" />
                          ) : (
                            <Play size={20} className="ml-1" />
                          )}
                        </button>
                        
                        {audioBufferRef.current && (
                          <button
                            onClick={playAudio}
                            className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shadow-lg hover:bg-gray-700 transition-colors"
                            title="Restart"
                          >
                            <Loader2 className={isPlaying ? "animate-spin-slow" : ""} size={18} />
                          </button>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Vocal Output Ready</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] mono-text text-gray-500 uppercase">24kHz / L16 / Mono</p>
                          {isPlaying && <div className="flex gap-0.5"><div className="w-1 h-3 bg-red-500 animate-pulse"/><div className="w-1 h-2 bg-red-500 animate-pulse delay-75"/><div className="w-1 h-4 bg-red-500 animate-pulse delay-150"/></div>}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDownloadMp3}
                      disabled={isDownloading}
                      className="p-3 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                      title="Download MP3"
                    >
                      {isDownloading ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Decorative Elements */}
      <div className="fixed bottom-0 left-0 p-8 pointer-events-none opacity-10">
        <h3 className="text-8xl font-black uppercase tracking-tighter text-gray-900 leading-[0.8]">AR<br/>AB<br/>IA</h3>
      </div>
    </div>
  );
}
