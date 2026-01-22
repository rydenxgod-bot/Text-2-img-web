
import React, { useState, useEffect, useMemo } from 'react';
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
    theme: 'dark', // Switched default to dark
    lastGeneration: 0
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ images: string[], index: number, prompt: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const savedGallery = localStorage.getItem('ryden_gallery');
    const savedStats = localStorage.getItem('ryden_stats');
    const savedSettings = localStorage.getItem('ryden_settings');

    if (savedGallery) setGallery(JSON.parse(savedGallery));
    if (savedStats) setStats(JSON.parse(savedStats));
    
    // Theme initialization
    if (savedSettings) {
      const s = JSON.parse(savedSettings);
      setSettings(s);
      if (s.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      // Default to dark for new users
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
    setStatusText("Preparing...");

    try {
      const resultImages = await fetchImages(prompt, (p, s) => {
        setProgress(p);
        setStatusText(s);
      }, ctrl.signal);

      // We explicitly expect 3 engines in this sequence
      const engineNames = ['Pollination', 'Flux Ai', 'Small Version'];
      const newItem: GalleryItem = {
        id: crypto.randomUUID(),
        images: resultImages,
        prompt: prompt,
        timestamp: Date.now(),
        sources: engineNames.slice(0, resultImages.length)
      };

      setGallery(prev => [newItem, ...prev]);
      
      const words = prompt.toLowerCase().match(/\w+/g) || [];
      const newWordCounts = { ...stats.wordCounts };
      words.forEach(w => { if(w.length > 3) newWordCounts[w] = (newWordCounts[w] || 0) + 1 });

      setStats(prev => ({
        ...prev,
        totalGenerated: prev.totalGenerated + resultImages.length,
        totalPrompts: prev.totalPrompts + 1,
        apiCalls: {
          flux: (prev.apiCalls.flux || 0) + 1,
          smallVersion: (prev.apiCalls.smallVersion || 0) + 1,
          pollination: (prev.apiCalls.pollination || 0) + 1,
        },
        wordCounts: newWordCounts
      }));

      setSettings(prev => ({ ...prev, lastGeneration: Date.now() }));
      showToast(`Generated ${resultImages.length} artwork variations!`, "success");
      setPrompt('');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast("Generation cancelled", "info");
      } else {
        showToast(error.message || "Generation error occurred", "error");
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
      showToast("Fetching image for download...", "info");
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
      console.error("Direct download failed, attempting alternate...", error);
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
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 p-4 lg:p-10 pb-24 lg:pb-10 max-w-[1400px] mx-auto w-full">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
              {activeTab}
            </h2>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="text-xs font-medium text-slate-500">Engines Online: 3/3</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={toggleTheme} className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700">
              {settings.theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>

        <div className="animate-fade-in">
          {activeTab === Tab.GENERATE && (
            <section className="space-y-8">
              <div className="text-center mb-10">
                <h1 className="text-4xl lg:text-5xl font-extrabold mb-4 tracking-tight">
                  <span className="gradient-text">RydenXGod</span> Studio
                </h1>
                <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto italic font-semibold">
                  Pollination • Flux • Small Version
                </p>
              </div>

              <div className="max-w-4xl mx-auto space-y-6">
                <div className="relative glass rounded-3xl p-1 shadow-2xl overflow-hidden group">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your vision (up to 1000 characters)..."
                    disabled={isGenerating}
                    maxLength={MAX_PROMPT_CHARS}
                    className="w-full h-40 lg:h-52 bg-white/50 dark:bg-slate-800/50 p-8 rounded-2xl focus:outline-none text-xl resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 font-medium"
                  />
                  <div className="absolute bottom-6 right-8 text-xs font-bold text-slate-400">
                    {prompt.length} / {MAX_PROMPT_CHARS}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  {!isGenerating ? (
                    <button
                      onClick={handleGenerate}
                      disabled={prompt.length < MIN_PROMPT_CHARS}
                      className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-lg shadow-lg hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest"
                    >
                      ✨ Create Triple Artwork
                    </button>
                  ) : (
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-sm font-bold text-indigo-500 animate-pulse">{statusText}</span>
                        <span className="text-sm font-bold text-slate-400">{progress}%</span>
                      </div>
                      <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-300 progress-bar-fill shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }} />
                      </div>
                      <button onClick={handleCancel} className="w-full py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-red-500 transition-colors">Cancel Request</button>
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLE_PROMPTS.map((p, i) => (
                      <button key={i} onClick={() => setPrompt(p)} className="px-5 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm">
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {gallery.length > 0 && !isGenerating && (
                <div className="mt-16">
                   <h2 className="text-3xl font-black mb-10 flex items-center justify-center">
                     <span className="bg-indigo-500 text-white px-3 py-1 rounded-xl mr-3 text-lg">3</span>
                     Engine Results
                   </h2>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      {gallery[0].images.map((img, i) => (
                        <div key={i} className="group relative rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)] aspect-square bg-slate-200 dark:bg-slate-800 border-4 border-white dark:border-slate-700 transition-all hover:shadow-2xl">
                          <img 
                            src={img} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s] ease-out cursor-zoom-in" 
                            onClick={() => setSelectedImage({ images: gallery[0].images, index: i, prompt: gallery[0].prompt })}
                            alt={`${gallery[0].sources[i]} Generation`}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-8">
                            <div className="flex flex-col space-y-4">
                              <span className="text-white text-xs font-black uppercase tracking-[0.3em]">{gallery[0].sources[i] || `Result ${i + 1}`}</span>
                              <button 
                                onClick={(e) => { e.stopPropagation(); downloadImage(img, `ryden-${gallery[0].sources[i]?.toLowerCase().replace(/\s+/g, '-') || 'ai'}.png`); }}
                                className="w-full py-3 bg-white text-black text-xs font-black rounded-xl hover:bg-slate-100 active:scale-95 transition-all uppercase tracking-widest shadow-xl"
                              >
                                Download Artwork
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
            <section className="space-y-8">
              <div className="flex justify-between items-center">
                <h1 className="text-4xl font-black">History</h1>
                <div className="flex items-center space-x-4">
                  <input 
                    type="text"
                    placeholder="Search gallery..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm outline-none focus:ring-2 ring-indigo-500 w-72 shadow-sm"
                  />
                  <button onClick={clearGallery} className="text-red-500 font-black text-xs uppercase tracking-widest bg-red-50 dark:bg-red-900/10 px-6 py-2.5 rounded-full hover:bg-red-100 transition-colors">Wipe All</button>
                </div>
              </div>
              {filteredGallery.length === 0 ? (
                <div className="text-center py-40 glass rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700">
                  <p className="text-5xl mb-6">🏜️</p>
                  <p className="text-slate-400 font-bold uppercase tracking-widest">No history recorded</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {filteredGallery.map((item) => (
                    <div key={item.id} className="glass rounded-[2.5rem] overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 group transition-all hover:-translate-y-2">
                      <div className="relative aspect-square">
                        <img 
                          src={item.images[0]} 
                          className="w-full h-full object-cover cursor-zoom-in" 
                          onClick={() => setSelectedImage({ images: item.images, index: 0, prompt: item.prompt })} 
                          alt="History Artwork"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-6 space-y-4">
                           <button 
                             onClick={() => downloadImage(item.images[0], 'ryden-gallery.png')}
                             className="w-full py-3 bg-white text-black font-black rounded-xl text-[10px] uppercase tracking-[0.2em] shadow-2xl"
                           >
                             Download
                           </button>
                           <button 
                             onClick={() => setPrompt(item.prompt) || setActiveTab(Tab.GENERATE)}
                             className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase tracking-[0.2em] shadow-2xl"
                           >
                             Reuse Concept
                           </button>
                        </div>
                      </div>
                      <div className="p-5 flex justify-between items-center bg-white/40 dark:bg-slate-800/40">
                         <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</span>
                         <button onClick={() => deleteGalleryItem(item.id)} className="text-red-500 hover:scale-110 transition-transform">
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === Tab.STATS && (
            <section className="space-y-10">
              <h1 className="text-4xl font-black">Studio Intelligence</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Total Artwork", value: stats.totalGenerated, color: "from-blue-500 to-cyan-500" },
                  { label: "Creative Prompts", value: stats.totalPrompts, color: "from-purple-500 to-indigo-500" },
                  { label: "Gallery Sets", value: gallery.length, color: "from-green-500 to-teal-500" },
                  { label: "API Efficiency", value: `${usageLimitPercent}%`, color: "from-orange-500 to-red-500" },
                ].map((s, i) => (
                  <div key={i} className="glass p-8 rounded-3xl border border-slate-200 dark:border-slate-700 relative overflow-hidden transition-all hover:scale-105">
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${s.color} opacity-10 rounded-bl-[100px] -mr-6 -mt-6`}></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">{s.label}</p>
                    <p className="text-4xl font-black">{s.value}</p>
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="glass p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-700">
                  <h3 className="text-xl font-black mb-10 uppercase tracking-[0.2em] flex items-center">
                    <span className="w-2 h-6 bg-indigo-500 rounded-full mr-3"></span>
                    Engine Balance
                  </h3>
                  <div className="space-y-10">
                    {[
                      { label: 'Pollination Real-Time', key: 'pollination', color: 'bg-emerald-500' },
                      { label: 'Flux High Performance', key: 'flux', color: 'bg-blue-500' },
                      { label: 'Small Version AI', key: 'smallVersion', color: 'bg-purple-500' }
                    ].map((engine) => {
                      const count = stats.apiCalls[engine.key as keyof typeof stats.apiCalls] || 0;
                      const percentage = stats.totalPrompts > 0 ? (count / stats.totalPrompts) * 100 : 0;
                      return (
                        <div key={engine.key} className="space-y-4">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                            <span className="text-slate-500">{engine.label}</span>
                            <span>{count} Requests</span>
                          </div>
                          <div className="h-4 w-full bg-slate-100 dark:bg-slate-700/40 rounded-full overflow-hidden p-1">
                            <div className={`h-full ${engine.color} rounded-full transition-all duration-[1.5s] ease-out shadow-[0_0_15px_rgba(0,0,0,0.1)]`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="glass p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                   <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white text-4xl mb-8 shadow-2xl shadow-indigo-500/40 animate-bounce-slow">🚀</div>
                   <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter">Studio Pro Status</h3>
                   <p className="text-slate-400 font-medium max-w-xs mx-auto">You have processed {Object.keys(stats.wordCounts).length} creative tokens across your generation history.</p>
                </div>
              </div>
            </section>
          )}

          {activeTab === Tab.INFO && (
            <section className="max-w-4xl space-y-10">
              <h1 className="text-4xl font-black">Studio Manifesto</h1>
              <div className="glass p-12 rounded-[3.5rem] border border-slate-200 dark:border-slate-700 space-y-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                  <svg className="w-64 h-64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.45L18.91 19H5.09L12 5.45z"/></svg>
                </div>
                
                <div className="space-y-6">
                  <h3 className="text-3xl font-black uppercase tracking-tighter italic">RydenXGod AI Studio v1.6</h3>
                  <p className="text-xl leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                    A multi-brain architectural interface. By linking Pollination, Flux, and Small Version engines, we deliver a curated triple-output for every single prompt.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all hover:bg-white dark:hover:bg-slate-900 shadow-sm">
                    <h4 className="font-black text-xs uppercase tracking-[0.3em] mb-4 text-indigo-600">Secure Vault</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">Local-first storage protocol. Your masterpieces never leave your browser context unless you export them.</p>
                  </div>
                  <div className="p-8 bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 transition-all hover:bg-white dark:hover:bg-slate-900 shadow-sm">
                    <h4 className="font-black text-xs uppercase tracking-[0.3em] mb-4 text-indigo-600">Triple Compute</h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">Concurrent asynchronous processing ensures variety in style, depth, and interpretation for every vision.</p>
                  </div>
                </div>

                <div className="pt-8 flex flex-col sm:flex-row items-center gap-6">
                  <a href="https://t.me/RydenXGod" target="_blank" rel="noreferrer" className="w-full sm:w-auto px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-[0_20px_40px_rgba(79,70,229,0.3)] hover:scale-105 active:scale-95 transition-all text-center uppercase tracking-[0.2em] text-xs">
                    Access Community
                  </a>
                  <a href="https://t.me/PromptVerseX" target="_blank" rel="noreferrer" className="w-full sm:w-auto px-10 py-5 bg-purple-600 text-white rounded-2xl font-black shadow-[0_20px_40px_rgba(147,51,234,0.3)] hover:scale-105 active:scale-95 transition-all text-center uppercase tracking-[0.2em] text-xs">
                    Get Free Prompt
                  </a>
                  <div className="flex flex-col items-center sm:items-start">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-1">Authorization</span>
                    <span className="text-sm font-black text-indigo-500 tracking-widest">VERIFIED-PRO</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Advanced Zoom Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex flex-col items-center justify-center p-4 animate-fade-in backdrop-blur-2xl" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-10 right-10 text-white/40 hover:text-white text-4xl hover:rotate-90 transition-all duration-300">✕</button>
          
          <div className="max-w-5xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative group/modal w-full flex justify-center">
              <img 
                src={selectedImage.images[selectedImage.index]} 
                className="max-h-[75vh] w-auto rounded-[3.5rem] shadow-[0_0_100px_rgba(0,0,0,0.6)] border-[10px] border-white/10 transition-all group-hover/modal:border-white/20" 
                alt="Studio Zoom"
              />
            </div>

            <div className="mt-14 flex flex-col items-center space-y-10 w-full max-w-xl">
              <div className="flex items-center justify-between w-full px-8">
                <button 
                  disabled={selectedImage.index === 0}
                  onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: prev.index - 1 }) : null)}
                  className="p-5 bg-white/5 text-white rounded-full disabled:opacity-5 hover:bg-white/10 transition-all active:scale-90"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                </button>
                
                <div className="flex space-x-4">
                   {selectedImage.images.map((_, i) => (
                     <button 
                       key={i} 
                       onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: i }) : null)}
                       className={`w-4 h-4 rounded-full border-2 transition-all duration-500 ${selectedImage.index === i ? 'bg-indigo-500 border-indigo-500 scale-150 shadow-[0_0_20px_rgba(99,102,241,0.6)]' : 'bg-transparent border-white/20 hover:border-white/50'}`}
                     />
                   ))}
                </div>

                <button 
                  disabled={selectedImage.index === selectedImage.images.length - 1}
                  onClick={() => setSelectedImage(prev => prev ? ({ ...prev, index: prev.index + 1 }) : null)}
                  className="p-5 bg-white/5 text-white rounded-full disabled:opacity-5 hover:bg-white/10 transition-all active:scale-90"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <button 
                onClick={() => downloadImage(selectedImage.images[selectedImage.index], `ryden-pro-master-${Date.now()}.png`)} 
                className="w-full py-6 bg-white text-black rounded-2xl font-black shadow-[0_30px_60px_rgba(255,255,255,0.05)] hover:bg-slate-50 hover:scale-[1.03] active:scale-95 transition-all uppercase tracking-[0.3em] text-xs"
              >
                Export Masterpiece
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
