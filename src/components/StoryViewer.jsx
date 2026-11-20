import { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { saveStory, isStorySaved } from '../services/storageService';
import { generateEPUB } from '../utils/epubGenerator';
import { buildPrintPdf, buildPrintPdfWithCount, buildCoverPdf } from '../utils/printPdf';
import { startCheckout } from '../services/checkoutService';
import { usePricing } from '../utils/pricing';

// Convert an image data URL to JPEG (the PDF builder embeds JPEG directly).
async function toJpegDataUrl(src, quality = 0.9) {
    if (!src) return null;
    if (src.startsWith('data:image/jpeg')) return src;
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', quality);
}

// Print images are capped at 1180px / quality 0.82 so a full book's
// interior PDF stays ~2.5 MB — the upload endpoint has a ~6 MB ceiling.
async function toPrintJpeg(src) {
    if (!src) return null;
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
    });
    // Print uploads go through a Netlify Function (~6 MB request cap,
    // base64-inflated). A full 24-page book at 1180px/q0.82 lands ~4.9 MB
    // of PDF — too big once encoded. 1120px/q0.76 keeps the interior
    // near ~3.7 MB with no visible print difference (132 vs 139 dpi).
    const scale = Math.min(1, 1120 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.76);
}

function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

async function uploadBookFile(orderRef, part, bytes) {
    const res = await fetch('/.netlify/functions/book-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef, part, dataBase64: bytesToBase64(bytes) })
    });
    if (!res.ok) throw new Error('Could not upload the print files. Please try again.');
}

export default function StoryViewer({ story, onClose, onStorySaved, isGenerating = false }) {
    const [currentPage, setCurrentPage] = useState(0);
    const [isSaved, setIsSaved] = useState(false);
    const [isGeneratingEbook, setIsGeneratingEbook] = useState(false);
    const [isBuildingPdf, setIsBuildingPdf] = useState(false);
    const [digitalPaid, setDigitalPaid] = useState(false);
    const [orderMessage, setOrderMessage] = useState(null);
    const [isPreparingPrint, setIsPreparingPrint] = useState(false);
    const pricing = usePricing();

    // Digital downloads (PDF + eBook) unlock per-book after the digital
    // checkout. App.jsx records the purchase in localStorage when Stripe
    // redirects back with ?checkout=success.
    useEffect(() => {
        try {
            const paid = JSON.parse(localStorage.getItem('lumifables:paid-digital') || '{}');
            setDigitalPaid(!!paid[story.id]);
        } catch {
            setDigitalPaid(false);
        }
    }, [story.id]);

    // Calculate generation progress for loading indicator
    const totalPages = story.pages?.length || 0;
    const loadedPages = story.pages?.filter(p => !p.isLoading).length || 0;
    const generationProgress = totalPages > 0 ? Math.round((loadedPages / totalPages) * 100) : 0;

    useEffect(() => {
        setIsSaved(isStorySaved(story.id));
    }, [story.id]);

    const handleSave = () => {
        const result = saveStory(story);

        if (result.success) {
            setIsSaved(true);
            onStorySaved();
            alert('Story saved to library!');
        } else if (result.alreadySaved) {
            alert('Story already saved!');
        } else if (result.error === 'QUOTA_EXCEEDED') {
            alert(`❌ Storage Full!\n\n${result.message}\n\nTip: Delete old stories from your library to make space.`);
        } else {
            alert(`Failed to save story: ${result.message}`);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Order a printed copy. Lulu prints from PDFs hosted at public URLs, so
    // the flow is: build the interior + cover PDFs, upload them under a
    // fresh order reference, then start Stripe checkout with that reference
    // attached — the webhook hands it to the print order after payment.
    const handleOrderPrint = async (tier) => {
        setOrderMessage(null);
        setIsPreparingPrint(true);
        try {
            setOrderMessage('Preparing your print files…');
            const orderRef = crypto.randomUUID();
            const cover = story.pages?.find((p) => p.isCover);
            const storyPages = (story.pages || []).filter((p) => !p.isCover);
            const book = {
                title: story.title,
                childName: story.childName,
                coverImage: await toPrintJpeg(cover?.image),
                pages: []
            };
            for (const p of storyPages) {
                book.pages.push({ image: await toPrintJpeg(p.image), text: p.text });
            }
            // Minimum interior counts (Lulu's hardcover minimum is 24;
            // paperback needs 32 for a printable spine). A full 24-page
            // story runs past both on its own — the builder returns the
            // real count, and the cover size and Lulu cost use that.
            const minPages = tier === 'hardcover' ? 24 : 32;
            const { pdf: interior, pageCount } = buildPrintPdfWithCount(book, minPages, { pageSizePt: 630, covers: 'lulu' });
            const dimsRes = await fetch(`/.netlify/functions/lulu-cover-dims?tier=${tier}&pages=${pageCount}`);
            const dims = await dimsRes.json().catch(() => ({}));
            const coverPdf = buildCoverPdf(
                { ...book, backImage: book.pages[0]?.image },
                {
                    widthPt: dims.widthPt || (tier === 'hardcover' ? 1300 : 1247),
                    heightPt: dims.heightPt || (tier === 'hardcover' ? 668 : 630),
                    spinePt: dims.spinePt || (tier === 'hardcover' ? 40 : 6)
                }
            );
            setOrderMessage('Uploading your print files…');
            await uploadBookFile(orderRef, 'interior', interior);
            await uploadBookFile(orderRef, 'cover', coverPdf);
            await uploadBookFile(orderRef, 'meta', new TextEncoder().encode(JSON.stringify({ pageCount })));
            const { url } = await startCheckout(tier, { bookRef: orderRef });
            window.location.href = url;
        } catch (err) {
            if (err.notConfigured) {
                setOrderMessage('Printed books are launching soon! Join the waitlist on the homepage for $5 off your first order. 💌');
            } else {
                setOrderMessage(err.message);
            }
        } finally {
            setIsPreparingPrint(false);
        }
    };

    // Send the reader to Stripe for the digital tier, remembering which book
    // the purchase belongs to so App.jsx can unlock it on return.
    const startDigitalCheckout = async () => {
        setOrderMessage(null);
        try {
            localStorage.setItem('lumifables:pending-digital', story.id);
            const { url } = await startCheckout('digital', { bookRef: story.id });
            window.location.href = url;
        } catch (err) {
            localStorage.removeItem('lumifables:pending-digital');
            if (err.notConfigured) {
                setOrderMessage('Digital downloads are launching soon! Join the waitlist on the homepage for $5 off your first order. 💌');
            } else {
                setOrderMessage(err.message);
            }
        }
    };

    const handleDownloadEbook = async () => {
        if (!digitalPaid) return startDigitalCheckout();
        setIsGeneratingEbook(true);
        try {
            await generateEPUB(story);
            // Success! File will auto-download
        } catch (error) {
            console.error('Failed to generate eBook:', error);
            alert('Failed to create eBook. Please try again.');
        } finally {
            setIsGeneratingEbook(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!digitalPaid) return startDigitalCheckout();
        setIsBuildingPdf(true);
        try {
            const cover = story.pages?.find((p) => p.isCover);
            const storyPages = (story.pages || []).filter((p) => !p.isCover);
            const book = {
                title: story.title,
                childName: story.childName,
                coverImage: await toJpegDataUrl(cover?.image),
                pages: []
            };
            for (const p of storyPages) {
                book.pages.push({ image: await toJpegDataUrl(p.image), text: p.text });
            }
            const bytes = buildPrintPdf(book, 24);
            saveAs(
                new Blob([bytes], { type: 'application/pdf' }),
                `${(story.title || 'storybook').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`
            );
        } catch (error) {
            console.error('Failed to build PDF:', error);
            alert('Failed to create the PDF. Please try again.');
        } finally {
            setIsBuildingPdf(false);
        }
    };

    const themeIcons = ['🌟', '✨', '🎨', '🦄', '🌈', '🎭', '🎪', '🎡', '🎢', '🎠'];

    return (
        <div className="modal active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content story-book-modal">
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="storybook-viewer">
                    <div className="storybook-header">
                        <h2>
                            {story.title}
                            {isGenerating && (
                                <span className="generation-badge">
                                    ✨ Generating images... {generationProgress}%
                                </span>
                            )}
                        </h2>
                        <div className="action-buttons">
                            <button
                                className={`action-btn save-story-btn ${isSaved ? 'saved' : ''}`}
                                onClick={handleSave}
                                disabled={isSaved || isGenerating}
                                title={isGenerating ? 'Wait for images to finish generating' : ''}
                            >
                                {isSaved ? (
                                    <>✓ Saved</>
                                ) : isGenerating ? (
                                    <>⏳ Generating...</>
                                ) : (
                                    <>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path>
                                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                            <polyline points="7 3 7 8 15 8"></polyline>
                                        </svg>
                                        Save Story
                                    </>
                                )}
                            </button>
                            <button className="action-btn" onClick={handlePrint} disabled={isGenerating}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
                                    <path d="M6 14h12v8H6z"></path>
                                </svg>
                                Print
                            </button>
                            <button
                                className="action-btn ebook-btn"
                                onClick={handleDownloadEbook}
                                disabled={isGeneratingEbook || isGenerating}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                </svg>
                                {isGeneratingEbook ? 'Generating...' : digitalPaid ? 'Download eBook' : `Download eBook — ${pricing.symbol}${pricing.prices.digital} ${pricing.label}`}
                            </button>
                            <button
                                className="action-btn ebook-btn"
                                onClick={handleDownloadPdf}
                                disabled={isBuildingPdf || isGenerating}
                                title="High-resolution PDF of the full book"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                {isBuildingPdf ? 'Building...' : digitalPaid ? 'Download PDF' : `Download PDF — ${pricing.symbol}${pricing.prices.digital} ${pricing.label}`}
                            </button>
                            <button
                                className="action-btn order-print-btn"
                                onClick={() => handleOrderPrint('softcover')}
                                disabled={isGenerating || isPreparingPrint}
                                title="Quality 8.5&quot; x 8.5&quot; softcover, shipped to you"
                            >
                                {isPreparingPrint ? 'Preparing print files…' : `🛒 Order Softcover — ${pricing.symbol}${pricing.prices.softcover} ${pricing.label}`}
                            </button>
                            <button
                                className="action-btn order-print-btn"
                                onClick={() => handleOrderPrint('hardcover')}
                                disabled={isGenerating || isPreparingPrint}
                                title="Beautiful 8.5&quot; x 8.5&quot; hardcover, shipped to you"
                            >
                                {isPreparingPrint ? 'Preparing print files…' : `🛒 Order Hardcover — ${pricing.symbol}${pricing.prices.hardcover} ${pricing.label}`}
                            </button>
                        </div>
                        {orderMessage && <div className="order-message">{orderMessage}</div>}
                    </div>

                    {/* Book-style spread layout */}
                    <div className="book-spread">
                        {story.pages.map((page, index) => {
                            // Special rendering for cover page
                            if (page.isCover) {
                                return (
                                    <div
                                        key={page.pageNumber}
                                        className={`book-page-spread cover-spread ${index === currentPage ? 'active' : ''}`}
                                        style={{ display: index === currentPage ? 'flex' : 'none' }}
                                    >
                                        <div className="book-cover-page">
                                            {page.isLoading ? (
                                                <div className="page-loading-spinner">
                                                    <div className="spinner"></div>
                                                    <p>Creating cover illustration...</p>
                                                </div>
                                            ) : page.image ? (
                                                <img src={page.image} alt="Book Cover" className="cover-illustration" />
                                            ) : (
                                                <div className="placeholder-illustration cover-placeholder">
                                                    <div className="placeholder-icon">📚</div>
                                                    <div className="placeholder-label">Cover</div>
                                                </div>
                                            )}
                                            <div className="cover-overlay">
                                                <h1 className="cover-title">{story.title}</h1>
                                                <p className="cover-subtitle">Starring {story.childName}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Regular page rendering
                            const hue1 = (index * 40 + 200) % 360;
                            const hue2 = (hue1 + 80) % 360;
                            const icon = themeIcons[index % themeIcons.length];
                            const isEvenPage = index % 2 === 0;

                            return (
                                <div
                                    key={page.pageNumber}
                                    className={`book-page-spread ${index === currentPage ? 'active' : ''}`}
                                    style={{ display: index === currentPage ? 'flex' : 'none' }}
                                >
                                    {/* Left page - Image */}
                                    <div className={`book-page left-page ${isEvenPage ? 'image-page' : 'text-page'}`}>
                                        {isEvenPage ? (
                                            // Image on left
                                            page.isLoading ? (
                                                <div className="page-loading-spinner">
                                                    <div className="spinner"></div>
                                                    <p>Creating illustration...</p>
                                                </div>
                                            ) : page.image ? (
                                                <img src={page.image} alt={`Page ${page.pageNumber}`} className="book-illustration" />
                                            ) : (
                                                <div className="placeholder-illustration" style={{
                                                    background: `linear-gradient(135deg, hsl(${hue1}, 75%, 70%) 0%, hsl(${hue2}, 75%, 75%) 50%, hsl(${hue1}, 75%, 80%) 100%)`
                                                }}>
                                                    <div className="placeholder-icon">{icon}</div>
                                                    <div className="placeholder-label">Illustration</div>
                                                </div>
                                            )
                                        ) : (
                                            // Text on left for odd pages
                                            <div className="book-text-content">
                                                <span className="page-number">Page {page.pageNumber}</span>
                                                <p className="book-story-text">{page.text}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right page - Text (or Image for odd pages) */}
                                    <div className={`book-page right-page ${isEvenPage ? 'text-page' : 'image-page'}`}>
                                        {isEvenPage ? (
                                            // Text on right
                                            <div className="book-text-content">
                                                <span className="page-number">Page {page.pageNumber}</span>
                                                <p className="book-story-text">{page.text}</p>
                                            </div>
                                        ) : (
                                            // Image on right for odd pages
                                            page.isLoading ? (
                                                <div className="page-loading-spinner">
                                                    <div className="spinner"></div>
                                                    <p>Creating illustration...</p>
                                                </div>
                                            ) : page.image ? (
                                                <img src={page.image} alt={`Page ${page.pageNumber}`} className="book-illustration" />
                                            ) : (
                                                <div className="placeholder-illustration" style={{
                                                    background: `linear-gradient(135deg, hsl(${hue1}, 75%, 70%) 0%, hsl(${hue2}, 75%, 75%) 50%, hsl(${hue1}, 75%, 80%) 100%)`
                                                }}>
                                                    <div className="placeholder-icon">{icon}</div>
                                                    <div className="placeholder-label">Illustration</div>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {/* Book spine/gutter effect */}
                                    <div className="book-spine"></div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="page-navigation">
                        <button
                            className="nav-btn"
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 0}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6"></path>
                            </svg>
                        </button>
                        <span className="page-indicator">Page {currentPage + 1} of {story.pages.length}</span>
                        <button
                            className="nav-btn"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === story.pages.length - 1}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 18l6-6-6-6"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
}
