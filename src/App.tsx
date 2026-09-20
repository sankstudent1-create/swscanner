import { AppProvider, useAppStore } from './store/AppStore';
import { Layout } from './components/Layout';
import { CameraView } from './components/CameraView';
import { CropEditor } from './components/CropEditor';
import { FilterPreview } from './components/FilterPreview';
import { DocumentGallery } from './components/DocumentGallery';
import { GeminiOnboardingSplash } from './components/GeminiOnboardingSplash';

const AppContent = () => {
  const { currentView, showOnboarding, setShowOnboarding, cvReady } = useAppStore();

  return (
    <>
      <GeminiOnboardingSplash
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        cvReady={cvReady}
      />
      <Layout>
        {currentView === 'camera' && <CameraView />}
        {currentView === 'crop' && <CropEditor />}
        {currentView === 'filter' && <FilterPreview />}
        {currentView === 'gallery' && <DocumentGallery />}
      </Layout>
    </>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
