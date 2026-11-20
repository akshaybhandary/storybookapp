import { useState, useEffect } from 'react';
import Hero from './components/Hero';
import StoryCreator from './components/StoryCreator';
import StoryViewer from './components/StoryViewer';
import Library from './components/Library';
import Navbar from './components/Navbar';
import { getSavedStories } from './services/storageService';
import './index.css';

function App() {
  const [activeModal, setActiveModal] = useState(null);
  const [currentStory, setCurrentStory] = useState(null);
  const [libraryCount, setLibraryCount] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [checkoutNotice, setCheckoutNotice] = useState(null); // 'success' | 'cancelled'

  // Stripe Checkout returns the visitor to /?checkout=success|cancelled.
  // Show a notice once, then clean the URL so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success' || checkout === 'cancelled') {
      setCheckoutNotice(checkout);
      params.delete('checkout');
      params.delete('session_id');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
        libraryCount={libraryCount}
        theme={theme}
        onToggleTheme={toggleTheme}
        showNavLinks={!activeModal}
      />

      {checkoutNotice && (
        <div className={`checkout-banner ${checkoutNotice}`} role="status">
          <span>
            {checkoutNotice === 'success'
              ? '🎉 Payment received — thank you! Your order is in our queue and we\'ll follow up by email with delivery details.'
              : 'Checkout cancelled — no charge was made. Your book is still here whenever you\'re ready.'}
          </span>
          <button className="checkout-banner-close" onClick={() => setCheckoutNotice(null)} aria-label="Dismiss">&times;</button>
        </div>
      )}

      {/* Show Hero only when no full-page view is active */}
      {(!activeModal || activeModal === 'library') && (
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


    </div>
  );
}

export default App;
