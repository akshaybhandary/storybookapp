// EPUB Generator for Storybook
// Creates EPUB files compatible with Kindle, Kobo, and other e-readers

import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Generate and download an EPUB file from a story
 * @param {Object} story - The story object with title, pages, etc.
 */
export async function generateEPUB(story) {
    const zip = new JSZip();

    // EPUB requires specific structure
    // mimetype must be first, uncompressed
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
    zip.folder('META-INF').file('container.xml', containerXml);

    // OEBPS folder for content
    const oebps = zip.folder('OEBPS');
    const images = oebps.folder('images');

    // Extract and save images
    const pages = story.pages || [];
    const imageManifest = [];

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (page.image) {
            try {
                // Extract base64 data from data URL
                const base64Data = page.image.split(',')[1];
                const mimeType = page.image.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
                const ext = mimeType.split('/')[1];
                const filename = `image${i + 1}.${ext}`;

                // Add image to ZIP
                images.file(filename, base64Data, { base64: true });

                // Track for manifest
                imageManifest.push({
                    id: `img${i + 1}`,
                    href: `images/${filename}`,
                    mediaType: mimeType
                });

                // Update page reference
                pages[i].imageRef = `images/${filename}`;
            } catch (error) {
                console.error(`Failed to process image ${i}:`, error);
            }
        }
    }

    // Generate content.opf (package document)
    const contentOpf = generateContentOpf(story, imageManifest);
    oebps.file('content.opf', contentOpf);

    // Generate toc.ncx (navigation)
    const tocNcx = generateTocNcx(story);
    oebps.file('toc.ncx', tocNcx);

    // Generate CSS
    const css = generateCSS();
    oebps.file('styles.css', css);

    // Title page
    const titlePageHtml = generateTitlePage(story);
    oebps.file('title.xhtml', titlePageHtml);

    // Story pages
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageHtml = generateStoryPage(page, i + 1, story.title);
        oebps.file(`page${i + 1}.xhtml`, pageHtml);
    }

    // Generate the EPUB file
    const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE'
    });

    // Trigger download
    const filename = `${story.title.replace(/[^a-z0-9]/gi, '_')}.epub`;
    saveAs(blob, filename);
}

function generateContentOpf(story, imageManifest = []) {
    const pages = story.pages || [];
    const pageCount = pages.length;

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="bookid">urn:uuid:${generateUUID()}</dc:identifier>
        <dc:title>${escapeXml(story.title)}</dc:title>
        <dc:creator>StoryBook Magic</dc:creator>
        <dc:language>en</dc:language>
        <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
        <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="css" href="styles.css" media-type="text/css"/>
        <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
        ${pages.map((_, i) =>
        `<item id="page${i + 1}" href="page${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n        ')}
        ${imageManifest.map(img =>
        `<item id="${img.id}" href="${img.href}" media-type="${img.mediaType}"/>`
    ).join('\n        ')}
    </manifest>
    <spine toc="ncx">
        <itemref idref="title"/>
        ${pages.map((_, i) => `<itemref idref="page${i + 1}"/>`).join('\n        ')}
    </spine>
</package>`;
}

function generateTocNcx(story) {
    const pages = story.pages || [];

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:${generateUUID()}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>${escapeXml(story.title)}</text>
    </docTitle>
    <navMap>
        <navPoint id="title" playOrder="1">
            <navLabel><text>Title Page</text></navLabel>
            <content src="title.xhtml"/>
        </navPoint>
        ${pages.map((page, i) => `
        <navPoint id="page${i + 1}" playOrder="${i + 2}">
            <navLabel><text>Page ${i + 1}</text></navLabel>
            <content src="page${i + 1}.xhtml"/>
        </navPoint>`).join('')}
    </navMap>
</ncx>`;
}

function generateCSS() {
    return `
body {
    font-family: Georgia, serif;
    line-height: 1.6;
    margin: 0;
    padding: 1em;
    background: #fffef8;
}

h1, h2, h3 {
    font-family: 'Arial', sans-serif;
    color: #333;
    text-align: center;
}

.title-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.story-page {
    page-break-after: always;
    margin-bottom: 2em;
}

.page-image {
    max-width: 100%;
    height: auto;
    margin: 1em auto;
    display: block;
    border-radius: 8px;
}

.page-text {
    font-size: 1.1em;
    text-align: center;
    margin: 1em 2em;
    color: #333;
}

.page-number {
    text-align: center;
    font-size: 0.9em;
    color: #666;
    margin-top: 2em;
}
`;
}

function generateTitlePage(story) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>${escapeXml(story.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
    <div class="title-page">
        <h1>${escapeXml(story.title)}</h1>
        <p style="font-style: italic; color: #666;">Created with StoryBook Magic</p>
    </div>
</body>
</html>`;
}

function generateStoryPage(page, pageNum, storyTitle) {
    // Use imageRef (file path) if available, otherwise fall back to data URL
    const imageSrc = page.imageRef || page.image;
    const imageHtml = imageSrc ?
        `<img class="page-image" src="${imageSrc}" alt="Page ${pageNum} illustration"/>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
    <title>${escapeXml(storyTitle)} - Page ${pageNum}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
    <div class="story-page">
        ${imageHtml}
        <p class="page-text">${escapeXml(page.text)}</p>
        <div class="page-number">Page ${pageNum}</div>
    </div>
</body>
</html>`;
}

// Utility functions
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
