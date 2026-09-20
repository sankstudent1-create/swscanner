import React from 'react';
import { useAppStore } from '../store/AppStore';
import { Camera, Image as ImageIcon, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentView,
    setCurrentView,
    setCurrentImage,
    documents,
    batchPages,
    addPageToBatch,
  } = useAppStore();

  const showNav = currentView === 'camera' || currentView === 'gallery';

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setCurrentImage(dataUrl);
        setCurrentView('crop');
      };
      reader.readAsDataURL(files[0]);
    } else {
      // Multi-file upload batch ingestion
      const promises: Promise<string>[] = Array.from(files).map((f) => {
        return new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target?.result as string);
          reader.readAsDataURL(f);
        });
      });

      const urls = await Promise.all(promises);
      for (let i = 0; i < urls.length; i++) {
        addPageToBatch({
          id: `${Date.now()}_${i}`,
          processedImage: urls[i],
          originalImage: urls[i],
          filter: 'magic_color',
          timestamp: Date.now() + i,
        });
      }
      setCurrentView('gallery');
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-dvh w-full bg-[#121212] text-white overflow-hidden">
      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>

      {/* Bottom Nav */}
      <AnimatePresence>
        {showNav && (
          <motion.nav
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="shrink-0 h-[76px] bg-[#1a1a1a] border-t border-white/10 flex items-center justify-around px-6 z-50"
            style={{ boxShadow: '0 -8px 32px rgba(0,0,0,0.6)' }}
          >
            {/* Gallery */}
            <button
              onClick={() => setCurrentView('gallery')}
              className={`relative flex flex-col items-center justify-center gap-1 w-14 transition-all ${
                currentView === 'gallery' ? 'text-green-400 font-bold' : 'text-white/40 hover:text-white'
              }`}
            >
              <ImageIcon size={22} />
              <span className="text-[10px] font-medium">Gallery</span>
              {documents.length > 0 && (
                <span className="absolute -top-1 right-1 bg-green-400 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {documents.length > 9 ? '9+' : documents.length}
                </span>
              )}
            </button>

            {/* Scan FAB */}
            <button
              onClick={() => setCurrentView('camera')}
              className="relative -top-5 flex items-center justify-center w-[64px] h-[64px] rounded-full bg-gradient-to-br from-green-300 to-green-500 text-black shadow-[0_0_30px_rgba(74,222,128,0.5)] active:scale-95 transition-transform"
            >
              <Camera size={28} strokeWidth={2.5} />
              {batchPages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-black border-2 border-green-400 text-green-400 text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {batchPages.length}
                </span>
              )}
            </button>

            {/* Upload from device */}
            <label className="flex flex-col items-center justify-center gap-1 w-14 cursor-pointer text-white/40 hover:text-white transition-colors">
              <Upload size={22} />
              <span className="text-[10px] font-medium">Upload</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
            </label>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
};
