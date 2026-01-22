
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tab, GalleryItem, UserStats, AppSettings } from './types';
import Sidebar from './components/Sidebar';
import Toast, { ToastType } from './components/Toast';
import { EXAMPLE_PROMPTS, RATE_LIMIT_PER_HOUR, MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from './constants';
import { fetchImages } from './services/imageService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.GENERATE);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalGenerated: 0,
    totalPrompts: 0,
    successRate: 0,
    apiCalls: { flux: 0, smallVersion: 0, pollination: 0 },
    wordCounts: {}
  });
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    lastGeneration: 0
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ images: string[], index: number, prompt: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref for auto-scrolling to results
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedGallery = localStorage.getItem('ryden_gallery');
    const savedStats = localStorage.getItem('ryden_stats');
    const savedSettings = localStorage.getItem('ryden_settings');

    if (savedGallery) setGallery(JSON.parse(savedGallery));
    if (savedStats) setStats(JSON.parse(savedStats));
    
    if (savedSettings) {
      const s = JSON.parse(savedSettings);
      setSettings(s);
      if (s.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ryden_gallery', JSON.stringify(gallery));
  }, [gallery]);

  useEffect(() => {
    localStorage.setItem('ryden_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('ryden_settings', JSON.stringify(settings));
  }, [settings]);

  // Auto-scroll logic when gallery updates with new items
  useEffect(() => {
    if (gallery.length > 0 && activeTab === Tab.GENERATE && !isGenerating) {
      const timeoutId = setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [gallery, activeTab, isGenerating]);

  const showToast = (message: string, type: ToastType = 'info') => setToast({ message, type });

  const toggleTheme = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light';
    setSettings(prev => ({ ...prev, theme: newTheme }));
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleGenerate = async () => {
    if (prompt.length < MIN_PROMPT_CHARS) return showToast("Prompt too short", "error");
    if (prompt.length > MAX_PROMPT_CHARS) return showToast(`Prompt exceeds ${MAX_PROMPT_CHARS} characters`, "error");
    if (isGenerating) return;

    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentGens = gallery.filter(item => item.timestamp > oneHourAgo).length;
    
    if (recentGens >= RATE_LIMIT_PER_HOUR) {
      const minutesLeft = Math.ceil((settings.lastGeneration + 3600000 - now) / 60000);
      return showToast(`Rate limit reached! Try again in ${minutesLeft} minutes.`, "error");
    }

    const ctrl = new AbortController();
    setAbortController(ctrl);
    setIsGenerating(true);
    setProgress(0);
    setStatusText("Initializing Engines...");

    try {
      const { images, sources } = await fetchImages(prompt, (p, s) => {
        setProgress(p);
        setStatusText(s);
      }, ctrl.signal);

      const newItem: GalleryItem = {
        id: crypto.randomUUID(),
        images: images,
        prompt: prompt,
        timestamp: Date.now(),
        sources: sources
      };

      setGallery(prev => [newItem, ...prev]);
      
      const words = prompt.toLowerCase().match(/\w+/g) || [];
      const newWordCounts = { ...stats.wordCounts };
      words.forEach(w => { if(w.length > 3) newWordCounts[w] = (newWordCounts[w] || 0) + 1 });

      setStats(prev => ({
        ...prev,
        totalGenerated: prev.totalGenerated + images.length,
        totalPrompts: prev.totalPrompts + 1,
        apiCalls: {
          flux: prev.apiCalls.flux + (sources.includes('Flux Ai') ? 1 : 0),
          smallVersion: prev.apiCalls.smallVersion + (sources.includes('Small Version') ? 1 : 0),
          pollination: prev.apiCalls.pollination + (sources.includes('Pollination') ? 1 : 0),
        },
        wordCounts: newWordCounts
      }));

      setSettings(prev => ({ ...prev, lastGeneration: Date.now() }));
      showToast(`Studio set generated successfully!`, "success");
      setPrompt('');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast("Generation cancelled", "info");
      } else {
        showToast(error.message || "Engine failure", "error");
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    if (abortController) abortController.abort();
  };

  const deleteGalleryItem = (id: string) => {
    if (confirm("Delete this artwork?")) {
      setGallery(prev => prev.filter(item => item.id !== id));
    }
  };

  const clearGallery = () => {
    if (confirm("Permanently delete ALL gallery history?")) {
      setGallery([]);
      showToast("Gallery cleared", "success");
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      showToast("Downloading...", "info");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || `ryden-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      showToast("Download started!", "success");
    } catch (error) {
      console.error("Direct download failed", error);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  };

  const filteredGallery = useMemo(() => {
    return gallery.filter(item => 
      item.prompt.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [gallery, searchQuery]);

  const usageLimitPercent = useMemo(() => {
    const oneHourAgo = Date.now() - 3600000;
    const recentCount = gallery.filter(i => i.timestamp > oneHourAgo).length;
    return Math.round((recentCount / RATE_LIMIT_PER_HOUR) * 100);
  }, [gallery]);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen selection:bg-indigo-500 selection:text-white">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 p-4 lg:p-10 pb-24 lg:pb-10 max-w-[1400px] mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-1">
              {activeTab}
            </h2>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Intelligent Engine Control</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 hover:scale-110 active:scale-90 transition-all">
              {settings.theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        <div className="animate-fade-in">
          {activeTab === Tab.GENERATE && (
            <section className="space-y-12">
              <div className="text-center mb-12">
                <h1 className="text-5xl lg:text-7xl font-black mb-6 tracking-tighter">
                  <span className="gradient-text">RydenXGod</span> Studio
                </h1>
                <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto italic font-bold tracking-wide uppercase text-xs">
                  Pro Engine Distribution • Vercel v1.6.2
                </p>
              </div>

              <div className="max-w-4xl mx-auto space-y-8">
                <div className="relative glass rounded-[2.5rem] p-1.5 shadow-2xl overflow-hidden group border border-white/20 dark:border-slate-700">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your vision..."
                    disabled={isGenerating}
                    maxLength={MAX_PROMPT_CHARS}
                    className="w-full h-44 lg:h-60 bg-white/40 dark:bg-slate-800/40 p-10 rounded-[2rem] focus:outline-none text-2xl lg:text-3xl font-medium resize-none placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
                  />
                  <div className="absolute bottom-8 right-10 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                    {prompt.length} / {MAX_PROMPT_CHARS}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-5">
                  {!isGenerating ? (
                    <button
                      onClick={handleGenerate}
                      disabled={prompt.length < MIN_PROMPT_CHARS}
                      className="flex-1 py-6 rounded-[1.5rem] bg-gradient-to-br from-indigo-600 to-purple-700 text-white font-black text-xl shadow-[0_20px_40px_rgba(79,70,229,0.4)] hover:-translate-y-1.5 active:scale-95 transition-all disabled:opacity-30 uppercase tracking-[0.2em]"
                    >
                      🚀 Generate Studio Set
                    </button>
                  ) : (
                    <div className="flex-1 space-y-6 bg-white/5 dark:bg-slate-800/20 p-8 rounded-[2rem] border border-white/10 dark:border-slate-700">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-black text-indigo-500 uppercase tracking-[0.3em] animate-pulse">{statusText}</span>
                        <span className="text-xs font-black text-slate-400">{progress}%</span>
                      </div>
                      <div className="h-3 w-full bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden p-0.5">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 progress-bar-fill shadow-[0_0_20px_rgba(99,102,241,0.6)]" style={{ width: `${progress}%` }} />
                      </div>
                      <button onClick={handleCancel} className="w-full py-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-red-500 transition-colors">Abort Task</button>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <div className="flex flex-wrap gap-3 justify-center">
                    {EXAMPLE_PROMPTS.map((p, i) => (
                      <button key={i} onClick={() => setPrompt(p)} className="px-6 py-2.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wider hover:border-indigo-500 hover:text-indigo-500 hover:scale-105 active:scale-95 transition-all shadow-sm">
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {gallery.length > 0 && !isGenerating && (
                <div ref={resultsRef} className="mt-20 scroll-mt-20">
                   <h2 className="text-4xl font-black mb-12 flex items-center justify-center tracking-tighter uppercase italic">
                     <span className="bg-indigo-600 text-white w-10 h-10 flex items-center justify-center rounded-2xl mr-4 text-xl not-italic shadow-lg">
                       {gallery[0].images.length}
                     </span>
                     Engine Results
                   </h2>
                   <div className={`grid grid-cols-1 ${gallery[0].images.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-10 max-w-6xl mx-auto`}>
                      {gallery[0].images.map((img, i) => (
                        <div key={i} className="group relative rounded-[3rem] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,0.2)] aspect-square bg-slate-200 dark:bg-slate-800 border-[6px] border-white dark:border-slate-700 transition-all hover:shadow-2xl">
                          <img 
                            src={img} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2.5s] ease-out cursor-zoom-in" 
                            onClick={() => setSelectedImage({ images: gallery[0].images, index: i, prompt: gallery[0].prompt })}
                            alt={`Engine: ${gallery[0].sources[i]}`}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700 flex flex-col justify-end p-10">
                            <div className="flex flex-col space-y-5 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                              <span className="text-white text-[10px] font-black uppercase tracking-[0.5em] text-center opacity-70">{gallery[0].sources[i] || `Source ${i + 1}`}</span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); downloadImage(img, `ryden-${gallery[0].sources[i]?.toLowerCase().replace(/\s+/g, '-') || 'ai'}.png`); }}
                                className="w-full py-4 bg-white text-black text-[10px] font-black rounded-2xl hover:bg-slate-100 active:scale-95 transition-all uppercase tracking-[0.3em] shadow-2xl"
                              >
                                Download Pro
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </section>
          )}

          {activeTab === Tab.GALLERY && (
            <section className="space-y-10">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <h1 className="text-5xl font-black tracking-tighter uppercase">Archives</h1>
                <div className="flex items-center space-x-4 w-full md:w-auto">
                  <input 
                    type="text"
                    placeholder="Search archives..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 md:w-80 px-8 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 ring-indigo-500/20 shadow-sm"
                  />
                  <button onClick={clearGallery} className="text-red-500 font-black text-[10px] uppercase tracking-[0.3em] bg-red-50 dark:bg-red-900/10 px-8 py-4 rounded-[1.5rem] hover:bg-red-100 transition-all">Clear All</button>
                </div>
              </div>
              {filteredGallery.length === 0 ? (
                <div className="text-center py-48 glass rounded-[3.5rem] border-4 border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-7xl mb-8">🏜️</p>
                  <p className="text-slate-400 font-black uppercase tracking-[0.4em] text-sm">Void Detected</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                  {filteredGallery.map((item) => (
                    <div key={item.id} className="glass rounded-[3rem] overflow-hidden shadow-xl border border-slate-200 dark:border-slate-700 group transition-all hover:-translate-y-3 hover:shadow-2xl">
                      <div className="relative aspect-square">
                        <img 
                          src={item.images[0]} 
                          className="w-full h-full object-cover cursor-zoom-in" 
                          onClick={() => setSelectedImage({ images: item.images, index: 0, prompt: item.prompt })} 
                          alt="Archive Art"
                        />
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center p-8 space-y-4">
                           <button 
                             onClick={() => downloadImage(item.images[0], 'ryden-archive.png')}
                             className="w-full py-4 bg-white text-black font-black text-[9px] uppercase tracking-[0.3em] rounded-2xl shadow-2xl"
                           >
                             Download
                           </button>
                           <button 
                             onClick={() => setPrompt(item.prompt) || setActiveTab(Tab.GENERATE)}
                             className="w-full py-4 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-[0.3em] rounded-2xl shadow-2xl"
                           >
                             Reuse
                           </button>
                        </div>
                      </div>
                      <div className="p-6 flex justify-between items-center bg-white/40 dark:bg-slate-800/40">
                         <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{new Date(item.timestamp).toLocaleDateString()}</span>
                         <button onClick={() => deleteGalleryItem(item.id)} className="text-red-500 hover:scale-125 transition-transform p-2">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === Tab.STATS && (
            <section className="space-y-12">
              <h1 className="text-5xl font-black tracking-tighter uppercase">Intelligence</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: "Neural Output", value: stats.totalGenerated, color: "from-blue-600 to-indigo-600" },
                  { label: "Creative Cycles", value: stats.totalPrompts, color: "from-purple-600 to-pink-600" },
                  { label: "Archive Nodes", value: gallery.length, color: "from-emerald-600 to-teal-600" },
                  { label: "Efficiency", value: `${usageLimitPercent}%`, color: "from-orange-600 to-rose-600" },
                ].map((s, i) => (
                  <div key={i} className="glass p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 relative overflow-hidden transition-all hover:scale-[1.03]">
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${s.color} opacity-10 rounded-bl-[120px] -mr-8 -mt-8`}></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-3">{s.label}</p>
                    <p className="text-5xl font-black tracking-tighter">{s.value}</p>
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="glass p-12 rounded-[3.5rem] border border-slate-200 dark:border-slate-700">
                  <h3 className="text-2xl font-black mb-12 uppercase tracking-[0.3em] flex items-center">
                    <span className="w-3 h-8 bg-indigo-600 rounded-full mr-4"></span>
                    Neural Distribution
                  </h3>
                  <div className="space-y-12">
                    {[
                      { label: 'Pollination Core', key: 'pollination', color: 'bg-emerald-500' },
                      { label: 'Flux High Definition', key: 'flux', color: 'bg-indigo-500' },
                      { label: 'Small Version Lite', key: 'smallVersion', color: 'bg-purple-500' }
                    ].map((engine) => {
                      const count = stats.apiCalls[engine.key as keyof typeof stats.apiCalls] || 0;
                      const percentage = stats.totalPrompts > 0 ? (count / stats.totalPrompts) * 100 : 0;
                      return (
                        <div key={engine.key} className="space-y-5">
                          <div className="flex justify-between text-[11px] font-black uppercase tracking-[0.3em]">
                            <span className="text-slate-500">{engine.label}</span>
                            <span>{count} Ops</span>
                          </div>
                          <div className="h-5 w-full bg-slate-100 dark:bg-slate-700/40 rounded-full overflow-hidden p-1.5 shadow-inner">
                            <div className={`h-full ${engine.color} rounded-full transition-all duration-[2s] ease-out shadow-[0_0_20px_rgba(0,0,0,0.15)]`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="glass p-12 rounded-[3.5rem] border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                   <div className="w-28 h-28 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white text-5xl mb-10 shadow-[0_30px_60px_rgba(79,70,229,0.4)] animate-pulse">🌌</div>
                   <h3 className="text-4xl font-black mb-5 uppercase tracking-tighter">Studio Pro v1.6.2</h3>
                   <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs max-w-xs leading-loose">Optimized Logic: Priority Engines First.</p>
                </div>
              </div>
            </section>
          )}

          {activeTab === Tab.INFO && (
            <section className="max-w-5xl mx-auto space-y-12">
              <h1 className="text-5xl font-black tracking-tighter uppercase">Manifesto</h1>
              <div className="glass p-14 rounded-[4rem] border border-slate-200 dark:border-slate-700 space-y-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-16 opacity-[0.05] pointer-events-none">
                  <svg className="w-80 h-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.45L18.91 19H5.09L12 5.45z"/></svg>
                </div>
                
                <div className="space-y-8">
                  <h3 className="text-4xl font-black uppercase tracking-tighter italic">RydenXGod AI Studio PRO</h3>
                  <p className="text-2xl leading-relaxed text-slate-500 dark:text-slate-400 font-medium tracking-tight">
                    Optimized multi-engine architecture. Parallelized generation across Pollination and Flux with emergency fallback protocol.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="p-10 bg-white/50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 transition-all hover:bg-white dark:hover:bg-slate-900 shadow-sm">
                    <h4 className="font-black text-[11px] uppercase tracking-[0.4em] mb-5 text-indigo-600">Dynamic Scaling</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-bold uppercase tracking-wide opacity-80">Automatically activates Small Version AI only in failed primary scenarios to conserve resource bandwidth.</p>
                  </div>
                  <div className="p-10 bg-white/50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 transition-all hover:bg-white dark:hover:bg-slate-900 shadow-sm">
                    <h4 className="font-black text-[11px] uppercase tracking-[0.4em] mb-5 text-indigo-600">Vercel Edge Integration</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-bold uppercase tracking-wide opacity-80">Full SPA support for persistent high-performance deployment on Vercel infrastructure.</p>
                  </div>
                </div>

                <div className="pt-10 flex flex-col sm:flex-row items-center gap-8">
                  <a href="https://t.me/RydenXGod" target="_blank" rel="noreferrer" className="w-full sm:w-auto px-12 py-7 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-[0_25px_50px_rgba(79,70,229,0.4)] hover:scale-105 active:scale-95 transition-all text-center uppercase tracking-[0.3em] text-[10px]">
                    Access Telegram
                  </a>
                  <a href="https://t.me/PromptVerseX" target="_blank" rel="noreferrer" className="w-full sm:w-auto px-12 py-7 bg-purple-600 text-white rounded-[1.5rem] font-black shadow-[0_25px_50px_rgba(147,51,234,0.4)] hover:scale-105 active:scale-95 transition-all text-center uppercase tracking-[0.3em] text-[10px]">
                    Get Free Prompts
                  </a>
                  <div className="flex flex-col items-center sm:items-start ml-auto">
                    <span className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400 mb-1">Deployment Status</span>
                    <span className="text-base font-black text-indigo-500 tracking-[0.2em] uppercase">Vercel Ready v1.6.2</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Extreme Zoom Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex flex-col items-center justify-center p-6 animate-fade-in backdrop-blur-3xl" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-12 right-12 text-white/30 hover:text-white text-5xl hover:rotate-90 transition-all duration-500">✕</button>
          
          <div className="max-w-6xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative group/modal w-full flex justify-center">
              <img 
                src={selectedImage.images[selectedImage.index]} 
                className="max-h-[70vh] w-auto rounded-[4rem] shadow-[0_0_120px_rgba(0,0,0,0.7)] border-[12px] border-white/10 transition-all group-hover/modal:border-white/20" 
                alt="High-Def Zoom"
              />
            </div>

            <div className="mt-16 flex flex-col items-center space-y-12 w-full max-w-2xl">
              <div className="flex items-center justify-between w-full px-12">
                <button 
                  disabled={selectedImage.index === 0}
                  onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: prev.index - 1 }) : null)}
                  className="p-6 bg-white/5 text-white rounded-full disabled:opacity-5 hover:bg-white/10 transition-all active:scale-90 shadow-2xl"
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                </button>
                
                <div className="flex space-x-5">
                   {selectedImage.images.map((_, i) => (
                     <button 
                       key={i} 
                       onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: i }) : null)}
                       className={`w-5 h-5 rounded-full border-2 transition-all duration-700 ${selectedImage.index === i ? 'bg-indigo-500 border-indigo-500 scale-[1.7] shadow-[0_0_30px_rgba(99,102,241,0.8)]' : 'bg-transparent border-white/20 hover:border-white/50'}`}
                     />
                   ))}
                </div>

                <button 
                  disabled={selectedImage.index === selectedImage.images.length - 1}
                  onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: prev.index + 1 }) : null)}
                  className="p-6 bg-white/5 text-white rounded-full disabled:opacity-5 hover:bg-white/10 transition-all active:scale-90 shadow-2xl"
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <button 
                onClick={() => downloadImage(selectedImage.images[selectedImage.index], `ryden-ultra-export-${Date.now()}.png`)} 
                className="w-full py-8 bg-white text-black rounded-[2rem] font-black shadow-[0_40px_80px_rgba(255,255,255,0.08)] hover:bg-slate-50 hover:scale-[1.03] active:scale-95 transition-all uppercase tracking-[0.4em] text-[11px]"
              >
                Export Masterpiece Set
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default App;
