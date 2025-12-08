import { useState, useEffect } from 'react';
import Hero from './components/Hero';
import StoryCreator from './components/StoryCreator';
import StoryViewer from './components/StoryViewer';
import Library from './components/Library';
import Settings from './components/Settings';
import Navbar from './components/Navbar';
import { getSavedStories } from './services/storageService';
import './index.css';

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [currentStory, setCurrentStory] = useState(null);
  const [libraryCount, setLibraryCount] = useState(0);

  useEffect(() => {
    // Update library count on mount
    updateLibraryCount();
  }, []);

  const updateLibraryCount = () => {
    const stories = getSavedStories();
    setLibraryCount(stories.length);
  };

  const openModal = (modalName) => {
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const handleStoryGenerated = (story) => {
    setCurrentStory(story);
    closeModal();
    openModal('viewer');
  };

  // Called when a page image is generated (for progressive loading)
  const handlePageUpdate = (pageNumber, imageUrl, isComplete = false) => {
    setCurrentStory(prev => {
      if (!prev) return prev;

      const updatedPages = prev.pages.map(page => {
        if (page.pageNumber === pageNumber) {
          return { ...page, image: imageUrl, isLoading: false };
        }
        return page;
      });

      return {
        ...prev,
        pages: updatedPages,
        isGenerating: !isComplete
      };
    });
  };

  const handleStorySaved = () => {
    updateLibraryCount();
  };

  const handleViewStory = (story) => {
    setCurrentStory(story);
    closeModal();
    openModal('viewer');
  };

  return (
    <div className="app">
      <Navbar
        onCreateStory={() => openModal('creator')}
        onOpenLibrary={() => openModal('library')}
        onOpenSettings={() => openModal('settings')}
        libraryCount={libraryCount}
      />

      {/* Show Hero only when no full-page view is active */}
      {(!activeModal || activeModal === 'library' || activeModal === 'settings') && (
        <Hero onCreateStory={() => openModal('creator')} />
      )}

      {activeModal === 'creator' && (
        <StoryCreator
          onClose={closeModal}
          onStoryGenerated={handleStoryGenerated}
          onPageUpdate={handlePageUpdate}
        />
      )}

      {activeModal === 'viewer' && currentStory && (
        <StoryViewer
          story={currentStory}
          onClose={closeModal}
          onStorySaved={handleStorySaved}
          isGenerating={currentStory.isGenerating || false}
        />
      )}

      {activeModal === 'library' && (
        <Library
          onClose={closeModal}
          onViewStory={handleViewStory}
          onStoryDeleted={updateLibraryCount}
        />
      )}

      {activeModal === 'settings' && (
        <Settings onClose={closeModal} />
      )}
    </div>
  );
}

export default App;
