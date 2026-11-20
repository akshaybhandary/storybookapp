// Print-ready interior PDF builder for LumiFables books.
//
// Pure JavaScript, no dependencies. Builds an 8.5" x 8.5" (612 x 612 pt)
// interior PDF padded to a target page count (Lulu's hardcover minimum is
// 24 pages) with real front/back matter:
//
//   cover → endpaper → title → copyright → dedication → story pages →
//   The End → gallery pages (story art as thumbnails) → grown-ups note →
//   activity pages → endpaper → back cover
//
// Input images must be JPEG (data URL or Uint8Array) — PDF embeds JPEG
// directly (DCTDecode). In the browser, convert a PNG data URL with canvas:
//   const c = document.createElement('canvas'); ... c.toDataURL('image/jpeg', 0.9)
//
// Usage:
//   const bytes = buildPrintPdf({ title, childName, coverImage, pages })
//   // pages: [{ image, text }] — image is a JPEG data URL / bytes / null
// Returns a Uint8Array with the complete PDF file.

let PAGE = 612; // 8.5in at 72pt — mutable so Lulu builds can use the bleed size
const MARGIN = 48;

// ---------- small helpers ----------

function jpegDimensions(bytes) {
    // Scan JPEG markers for a Start-Of-Frame segment to read width/height.
    let i = 2;
    while (i < bytes.length - 9) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const h = (bytes[i + 5] << 8) | bytes[i + 6];
            const w = (bytes[i + 7] << 8) | bytes[i + 8];
            return { width: w, height: h };
        }
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (!len) break;
        i += 2 + len;
    }
    return { width: 1000, height: 1000 }; // assume square rather than fail
}

function toBytes(image) {
    if (!image) return null;
    if (image instanceof Uint8Array) return image;
    if (typeof image === 'string') {
        const b64 = image.includes(',') ? image.split(',')[1] : image;
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    return null;
}

function escapeText(s) {
    return String(s || '')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/–/g, '-')
        .replace(/—/g, '-')
        .replace(/…/g, '...')
        .replace(/[^\x20-\x7e]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

// Rough Helvetica character widths (units of em) — good enough for wrapped
// children's-book text with generous margins.
function charWidth(ch) {
    if (ch === ' ') return 0.278;
    if ("iljtf.,:;'!|".includes(ch)) return 0.30;
    if ('mwMW'.includes(ch)) return 0.86;
    if (ch >= 'A' && ch <= 'Z') return 0.68;
    return 0.52;
}

function textWidth(s, size) {
    let w = 0;
    for (const ch of s) w += charWidth(ch);
    return w * size;
}

function wrapText(text, size, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (textWidth(next, size) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// ---------- page content builders ----------
// Each builder returns a PDF content-stream string. `img` maps a page-local
// image key to its XObject name (e.g. /Im3).

function coverPage(book, imgName) {
    let s = '';
    if (imgName) s += drawImageCover(imgName, book._dims.get(imgName));
    // Title block near the top, white bold text with a soft dark shadow pass.
    const title = book.title || 'My Storybook';
    const lines = wrapText(title, 40, PAGE - 2 * MARGIN);
    let y = PAGE - 92;
    s += 'BT /F2 40 Tf 0.15 0.1 0.25 rg 0 Tr ';
    for (const line of lines) {
        const w = textWidth(line, 40);
        s += `1 0 0 1 ${(PAGE - w) / 2 + 2} ${y - 2} Tm (${escapeText(line)}) Tj `;
        y -= 46;
    }
    s += 'ET BT /F2 40 Tf 1 1 1 rg ';
    y = PAGE - 92;
    for (const line of lines) {
        const w = textWidth(line, 40);
        s += `1 0 0 1 ${(PAGE - w) / 2} ${y} Tm (${escapeText(line)}) Tj `;
        y -= 46;
    }
    const sub = `Starring ${book.childName || 'Your Child'}`;
    const sw = textWidth(sub, 20);
    s += `/F1 20 Tf 1 0 0 1 ${(PAGE - sw) / 2} ${y - 6} Tm (${escapeText(sub)}) Tj ET`;
    return s;
}

function drawImageCover(imgName, dims) {
    if (!imgName || !dims) return '';
    // Cover the whole page, centered (crop overflow like CSS object-fit: cover)
    const scale = Math.max(PAGE / dims.width, PAGE / dims.height);
    const w = dims.width * scale;
    const h = dims.height * scale;
    const x = (PAGE - w) / 2;
    const y = (PAGE - h) / 2;
    return `q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} cm /${imgName} Do Q `;
}

function drawImageBox(imgName, dims, x, y, w, h) {
    if (!imgName || !dims) return '';
    const scale = Math.max(w / dims.width, h / dims.height);
    const dw = dims.width * scale;
    const dh = dims.height * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    // Clip to the box so the cover-crop doesn't spill
    return `q ${x} ${y} ${w} ${h} re W n ${dw.toFixed(1)} 0 0 ${dh.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)} cm /${imgName} Do Q `;
}

function centeredText(lines, { size = 16, font = 'F1', y, leading, color = '0.2 0.15 0.3' }) {
    let s = `BT /${font} ${size} Tf ${color} rg `;
    let cy = y;
    for (const line of lines) {
        const w = textWidth(line, size);
        s += `1 0 0 1 ${(PAGE - w) / 2} ${cy} Tm (${escapeText(line)}) Tj `;
        cy -= leading || size * 1.35;
    }
    return s + 'ET';
}

function endpaperPage(book, front) {
    // Soft lavender page with the title small in the middle
    let s = `0.93 0.90 0.98 rg 0 0 ${PAGE} ${PAGE} re f `;
    if (front) {
        s += centeredText([book.title || 'My Storybook'], { size: 18, font: 'F2', y: PAGE / 2 + 10, color: '0.45 0.35 0.6' });
    }
    return s;
}

function titlePage(book) {
    const lines = wrapText(book.title || 'My Storybook', 34, PAGE - 2 * MARGIN);
    let s = centeredText(lines, { size: 34, font: 'F2', y: PAGE - 190, leading: 42 });
    s += centeredText([`Starring ${book.childName || 'Your Child'}`], { size: 18, y: PAGE - 190 - lines.length * 42 - 26 });
    s += centeredText(['A personalized storybook'], { size: 13, y: 120, color: '0.5 0.45 0.55' });
    s += centeredText(['Made with LumiFables'], { size: 13, y: 98, color: '0.5 0.45 0.55' });
    return s;
}

function copyrightPage(book) {
    const year = new Date().getFullYear();
    let s = centeredText([
        `Copyright ${year} LumiFables`,
        'All rights reserved.',
        '',
        'This book was created specially for',
        book.childName || 'your child',
        'with illustrations generated by AI',
        'from a family photo.',
        '',
        'lumifables.com'
    ], { size: 12.5, y: PAGE - 200, leading: 22, color: '0.4 0.35 0.45' });
    return s;
}

function dedicationPage(book) {
    let s = centeredText(['This book belongs to'], { size: 15, y: PAGE - 210, color: '0.5 0.45 0.55' });
    s += centeredText([book.childName || ''], { size: 26, font: 'F2', y: PAGE - 252 });
    s += centeredText(['May your adventures be as bright as you are.'], { size: 13.5, y: PAGE - 320, color: '0.5 0.45 0.55' });
    return s;
}

function storyPage(page, pageNumber, dims) {
    let s = '';
    const imgH = 428;
    if (page._imgName) {
        s += drawImageBox(page._imgName, dims.get(page._imgName), 0, PAGE - imgH, PAGE, imgH);
    } else {
        s += `0.95 0.93 0.99 rg 0 ${PAGE - imgH} ${PAGE} ${imgH} re f `;
    }
    const lines = wrapText(page.text, 15.5, PAGE - 2 * MARGIN);
    let y = PAGE - imgH - 44;
    s += `BT /F1 15.5 Tf 0.16 0.12 0.28 rg `;
    for (const line of lines.slice(0, 6)) {
        const w = textWidth(line, 15.5);
        s += `1 0 0 1 ${(PAGE - w) / 2} ${y} Tm (${escapeText(line)}) Tj `;
        y -= 23;
    }
    s += 'ET';
    const num = String(pageNumber);
    const nw = textWidth(num, 10);
    s += `BT /F1 10 Tf 0.55 0.5 0.6 rg 1 0 0 1 ${(PAGE - nw) / 2} 22 Tm (${num}) Tj ET`;
    return s;
}

function theEndPage() {
    let s = centeredText(['The End'], { size: 36, font: 'F2', y: PAGE / 2 + 40 });
    s += centeredText(['Thanks for reading!'], { size: 15, y: PAGE / 2 - 16, color: '0.5 0.45 0.55' });
    return s;
}

function galleryPage(images, dims, label) {
    // 2x2 grid of story art
    let s = centeredText([label], { size: 17, font: 'F2', y: PAGE - 84 });
    const box = 216;
    const gap = 24;
    const x0 = (PAGE - (box * 2 + gap)) / 2;
    const yTop = PAGE - 140;
    images.slice(0, 4).forEach((name, i) => {
        if (!name) return;
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = x0 + col * (box + gap);
        const y = yTop - (row + 1) * box - row * gap;
        s += drawImageBox(name, dims.get(name), x, y, box, box);
    });
    return s;
}

function grownUpsPage() {
    const lines = [
        'A note for grown-ups',
        '',
        ...wrapText('Reading together is where the magic compounds. Ask your child what they would do on each page, let them "read" the pictures back to you, and revisit favourite pages at bedtime - repetition is how young readers build language and confidence.', 13.5, PAGE - 2 * MARGIN - 40),
        '',
        ...wrapText('This book was illustrated by AI from your photo, then checked page by page. If any page ever looks wrong, tell us at hello@lumifables.com and we will make it right.', 13.5, PAGE - 2 * MARGIN - 40)
    ];
    let s = '';
    let y = PAGE - 150;
    lines.forEach((line, i) => {
        if (i === 0) {
            s += centeredText([line], { size: 19, font: 'F2', y });
            y -= 34;
        } else if (line === '') {
            y -= 14;
        } else {
            const w = textWidth(line, 13.5);
            s += `BT /F1 13.5 Tf 0.25 0.2 0.35 rg 1 0 0 1 ${(PAGE - w) / 2} ${y} Tm (${escapeText(line)}) Tj ET`;
            y -= 21;
        }
    });
    return s;
}

function activityPage(n) {
    const prompts = [
        'Draw your favourite part of the story',
        'Draw yourself on your next adventure',
        'Draw the friends you met in this book'
    ];
    let s = centeredText([prompts[(n - 1) % prompts.length]], { size: 17, font: 'F2', y: PAGE - 96 });
    // Light drawing frame
    s += `0.75 0.7 0.85 RG 1.5 w ${MARGIN} 70 ${PAGE - 2 * MARGIN} ${PAGE - 200} re S `;
    return s;
}

function backCoverPage(book, imgName, dims) {
    let s = `0.96 0.94 0.99 rg 0 0 ${PAGE} ${PAGE} re f `;
    if (imgName) s += drawImageBox(imgName, dims.get(imgName), PAGE / 2 - 110, PAGE - 320, 220, 220);
    s += centeredText(
        wrapText('A storybook starring your child - their face and name woven into every page.', 14.5, PAGE - 2 * MARGIN - 60),
        { size: 14.5, y: PAGE - 360, leading: 22 }
    );
    s += centeredText(['Create yours at lumifables.com'], { size: 14, font: 'F2', y: 110, color: '0.45 0.3 0.6' });
    return s;
}

// ---------- assembly ----------

// options:
//   pageSizePt   page size in points (612 = exact trim; 630 = trim + bleed
//                for Lulu interiors)
//   covers       'included' (default — cover is page 1, back cover is last)
//                or 'lulu' (omit both: Lulu wants a separate cover file)
export function buildPrintPdf(book, targetPages = 24, options = {}) {
    const prevPage = PAGE;
    if (options.pageSizePt) PAGE = options.pageSizePt;
    try {
        return buildPrintPdfInner(book, targetPages, options);
    } finally {
        PAGE = prevPage;
    }
}

function buildPrintPdfInner(book, targetPages = 24, options = {}) {
    const dims = new Map();
    const images = []; // {name, bytes, width, height}
    let imgSeq = 0;

    function registerImage(image) {
        const bytes = toBytes(image);
        if (!bytes) return null;
        const name = `Im${++imgSeq}`;
        const d = jpegDimensions(bytes);
        dims.set(name, d);
        images.push({ name, bytes, ...d });
        return name;
    }

    const coverName = registerImage(book.coverImage);
    const story = (book.pages || []).map((p) => ({ ...p, _imgName: registerImage(p.image) }));
    book._dims = dims;

    // Ordered page builders: {content} — images referenced by name.
    const pages = [];
    if (options.covers !== 'lulu') pages.push(() => coverPage(book, coverName));
    pages.push(() => endpaperPage(book, true));
    pages.push(() => titlePage(book));
    pages.push(() => copyrightPage(book));
    pages.push(() => dedicationPage(book));
    story.forEach((p, i) => pages.push(() => storyPage(p, i + 1, dims)));
    pages.push(() => theEndPage());

    // Gallery pages (4 thumbs each) using story art
    const artNames = story.map((p) => p._imgName).filter(Boolean);
    const galleryBuilders = [];
    for (let i = 0; i < artNames.length; i += 4) {
        const chunk = artNames.slice(i, i + 4);
        galleryBuilders.push(() => galleryPage(chunk, dims, 'Story gallery'));
    }

    const tail = [];
    tail.push(() => grownUpsPage());
    let activityCount = 0;
    const activityBuilder = () => activityPage(++activityCount);
    tail.push(activityBuilder);
    tail.push(() => endpaperPage(book, false));
    if (options.covers !== 'lulu') tail.push(() => backCoverPage(book, story[0]?._imgName, dims));

    // Insert gallery pages, then pad with extra activity/gallery pages
    // until the target page count is reached.
    const assembled = [...pages, ...galleryBuilders, ...tail];
    let padIndex = 0;
    while (assembled.length < targetPages) {
        const filler = padIndex % 2 === 0 && galleryBuilders.length
            ? galleryBuilders[padIndex % galleryBuilders.length]
            : activityBuilder;
        assembled.splice(assembled.length - 2, 0, filler);
        padIndex++;
    }

    // ---- Serialize the PDF ----
    const objects = []; // {body: string | Uint8Array}
    function addObject(body) {
        objects.push(body);
        return objects.length; // 1-based object number
    }

    const fontReg = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    const imageObjNums = new Map();
    for (const img of images) {
        const header = `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`;
        const num = addObject({ streamHeader: header, stream: img.bytes });
        imageObjNums.set(img.name, num);
    }

    const xobjectDict = images.map((img) => `/${img.name} ${imageObjNums.get(img.name)} 0 R`).join(' ');
    const resources = `<< /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> /XObject << ${xobjectDict} >> >>`;

    const pageObjNums = [];
    for (const build of assembled) {
        // Builders concatenate text blocks; guarantee operator separation
        // (an "ET" immediately followed by "BT" is invalid for strict parsers).
        const content = build().replace(/ETBT/g, 'ET BT');
        const contentNum = addObject({ streamHeader: `<< /Length ${content.length} >>`, stream: new TextEncoder().encode(content) });
        const pageNum = addObject(`<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${PAGE} ${PAGE}] /Resources ${resources} /Contents ${contentNum} 0 R >>`);
        pageObjNums.push(pageNum);
    }

    const pagesNum = addObject(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`);
    const catalogNum = addObject(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

    // Fix the parent reference now that we know the Pages object number
    for (const n of pageObjNums) {
        objects[n - 1] = objects[n - 1].replace('PAGES_REF', `${pagesNum} 0 R`);
    }

    // Write out with xref
    const chunks = [];
    let length = 0;
    function push(data) {
        const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        chunks.push(b);
        length += b.length;
    }

    push('%PDF-1.4\n');
    const offsets = [0];
    objects.forEach((obj, idx) => {
        offsets.push(length);
        push(`${idx + 1} 0 obj\n`);
        if (typeof obj === 'string') {
            push(obj);
        } else {
            push(`${obj.streamHeader}\nstream\n`);
            push(obj.stream);
            push('\nendstream');
        }
        push('\nendobj\n');
    });

    const xrefStart = length;
    push(`xref\n0 ${objects.length + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= objects.length; i++) {
        push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    const out = new Uint8Array(length);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

export const PRINT_PAGE_SIZE_PT = PAGE;

// ---------- Lulu cover spread ----------

// Lulu wants the cover as ONE page: back cover + spine + front cover, at an
// exact size that depends on the product and the interior page count (spine
// width). Get the size from the lulu-cover-dims function (Lulu's own
// /cover-dimensions/ endpoint) and pass it in:
//   buildCoverPdf(book, { widthPt, heightPt, spinePt })
// book: { title, childName, coverImage, backImage } — JPEG data URLs/bytes.
export function buildCoverPdf(book, dims) {
    const W = dims.widthPt;
    const H = dims.heightPt;
    const spine = dims.spinePt || 0;
    const panelW = (W - spine) / 2;
    const frontX = panelW + spine;

    const imgDims = new Map();
    const images = [];
    let seq = 0;
    function register(image) {
        const bytes = toBytes(image);
        if (!bytes) return null;
        const name = `Im${++seq}`;
        const d = jpegDimensions(bytes);
        imgDims.set(name, d);
        images.push({ name, bytes, ...d });
        return name;
    }
    const frontName = register(book.coverImage);
    const backName = register(book.backImage || book.coverImage);

    function imageBox(imgName, x, y, w, h) {
        if (!imgName) return '';
        const d = imgDims.get(imgName);
        const scale = Math.max(w / d.width, h / d.height);
        const dw = d.width * scale;
        const dh = d.height * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        return `q ${x} ${y} ${w} ${h} re W n ${dw.toFixed(1)} 0 0 ${dh.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)} cm /${imgName} Do Q `;
    }
    function textCentered(str, size, font, cx, y, color) {
        const w = textWidth(str, size);
        return `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${(cx - w / 2).toFixed(1)} ${y.toFixed(1)} Tm (${escapeText(str)}) Tj ET `;
    }

    let s = '';
    // Base + spine band
    s += `0.93 0.89 0.97 rg 0 0 ${W} ${H} re f `;
    s += `0.45 0.32 0.62 rg ${panelW} 0 ${spine} ${H} re f `;

    // Back cover (left panel): art, blurb, site line
    if (backName) s += imageBox(backName, panelW / 2 - 110, H - 330, 220, 220);
    const blurb = wrapText('A storybook starring your child - their face and name woven into every page.', 14.5, panelW - 90);
    let by = H - 385;
    for (const line of blurb) {
        s += textCentered(line, 14.5, 'F1', panelW / 2, by, '0.25 0.2 0.35');
        by -= 22;
    }
    s += textCentered('Create yours at lumifables.com', 14, 'F2', panelW / 2, 92, '0.45 0.3 0.6');

    // Spine: vertical title when the spine is wide enough to hold it
    if (spine >= 26) {
        const title = (book.title || 'My Storybook').slice(0, 40);
        s += `BT /F2 11 Tf 1 1 1 rg 0 1 -1 0 ${panelW + spine / 2 + 4} ${H / 2 - textWidth(title, 11) / 2} Tm (${escapeText(title)}) Tj ET `;
    }

    // Front cover (right panel): full-bleed art + title block
    if (frontName) s += imageBox(frontName, frontX, 0, panelW, H);
    const titleLines = wrapText(book.title || 'My Storybook', 38, panelW - 80);
    let ty = H - 96;
    for (const pass of ['0.15 0.1 0.25', '1 1 1']) {
        let y = ty;
        for (const line of titleLines) {
            s += textCentered(line, 38, 'F2', frontX + panelW / 2 + (pass === '1 1 1' ? 0 : 2), y - (pass === '1 1 1' ? 0 : 2), pass);
            y -= 44;
        }
        if (pass === '1 1 1') ty = y;
    }
    s += textCentered(`Starring ${book.childName || 'Your Child'}`, 19, 'F1', frontX + panelW / 2, ty - 8, '1 1 1');

    // ---- serialize a one-page PDF (same writer pattern as buildPrintPdf) ----
    const objects = [];
    function addObject(body) { objects.push(body); return objects.length; }
    const fontReg = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const imageObjNums = new Map();
    for (const img of images) {
        const header = `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`;
        imageObjNums.set(img.name, addObject({ streamHeader: header, stream: img.bytes }));
    }
    const xobjectDict = images.map((img) => `/${img.name} ${imageObjNums.get(img.name)} 0 R`).join(' ');
    const resources = `<< /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> /XObject << ${xobjectDict} >> >>`;
    const content = s.replace(/ETBT/g, 'ET BT');
    const contentNum = addObject({ streamHeader: `<< /Length ${content.length} >>`, stream: new TextEncoder().encode(content) });
    const pageNum = addObject(`<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${W} ${H}] /Resources ${resources} /Contents ${contentNum} 0 R >>`);
    const pagesNum = addObject(`<< /Type /Pages /Kids [${pageNum} 0 R] /Count 1 >>`);
    const catalogNum = addObject(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);
    objects[pageNum - 1] = objects[pageNum - 1].replace('PAGES_REF', `${pagesNum} 0 R`);

    const chunks = [];
    let length = 0;
    function push(data) {
        const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        chunks.push(b);
        length += b.length;
    }
    push('%PDF-1.4\n');
    const offsets = [0];
    objects.forEach((obj, idx) => {
        offsets.push(length);
        push(`${idx + 1} 0 obj\n`);
        if (typeof obj === 'string') push(obj);
        else { push(`${obj.streamHeader}\nstream\n`); push(obj.stream); push('\nendstream'); }
        push('\nendobj\n');
    });
    const xrefStart = length;
    push(`xref\n0 ${objects.length + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= objects.length; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
    const out = new Uint8Array(length);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
}
