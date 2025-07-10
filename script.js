document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const cameraSelect = document.getElementById('cameraSelect');
    const filterSelect = document.getElementById('filterSelect');
    const layoutSelect = document.getElementById('layoutSelect');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton'); // NEW: Stop Camera Button
    const captureButton = document.getElementById('captureButton');
    const resetButton = document.getElementById('resetButton');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const livePreviewCanvas = document.getElementById('livePreviewCanvas');
    const countdownDisplay = document.getElementById('countdown-display');

    // Strip Customization Elements
    const finalStripCanvas = document.getElementById('finalStripCanvas');
    const downloadStripButton = document.getElementById('downloadStripButton');
    const stripBgColorInput = document.getElementById('stripBgColor');
    const stripTextColorInput = document.getElementById('stripTextColor');
    const stripFontSelect = document.getElementById('stripFontSelect');
    const stripFontSizeInput = document.getElementById('stripFontSizeInput');
    const headerTextInput = document.getElementById('headerText');
    const footerTextInput = document.getElementById('footerText');
    const stickerPalette = document.getElementById('sticker-palette');
    const clearStickersButton = document.getElementById('clearStickersButton');

    // Custom Text Elements
    const customTextInput = document.getElementById('customTextInput');
    const addCustomTextButton = document.getElementById('addCustomTextButton');
    const clearCustomTextButton = document.getElementById('clearCustomTextButton');

    // Photo Preview Modal Elements
    const photoPreviewModal = document.getElementById('photoPreviewModal');
    const modalImage = document.getElementById('modalImage');
    const closeButton = document.querySelector('.close-button');
    const modalDownloadButton = document.getElementById('modalDownloadButton');

    let currentStream;
    let capturedPhotos = []; // Stores image data URLs for thumbnails and strip generation
    let livePreviewCtx = livePreviewCanvas.getContext('2d');
    let finalStripCtx = finalStripCanvas.getContext('2d');
    let stickersOnStrip = []; // Stores {stickerSrc, x, y, size} objects for final strip
    let customTextsOnStrip = []; // Stores {text, font, size, color, x, y, rotation, width, height} objects
    let loadedStickerImages = {}; // Cache for loaded sticker image objects
    let animationFrameId; // To stop the live preview animation loop

    // Sticker data (CRITICAL: THESE MUST BE PNGS WITH TRANSPARENT BACKGROUNDS)
    const stickerImages = [
        'assets/stickers/heart_1.png',
        'assets/stickers/star_1.png',
        'assets/stickers/bow_1.png',
        'assets/stickers/flower_1.png',
        'assets/stickers/diamond_1.png',
        'assets/stickers/crown_1.png',
        'assets/stickers/sparkle_1.png',
        'assets/stickers/butterfly_1.png',
    ];

    // --- Camera & Stream Management ---

    async function getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            cameraSelect.innerHTML = ''; // Clear previous options
            if (videoDevices.length > 0) {
                videoDevices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
                    cameraSelect.appendChild(option);
                });
                startButton.disabled = false;
                startCamera(videoDevices[0].deviceId); // Auto-start camera on load
            } else {
                console.warn('No video input devices found.');
                startButton.disabled = true;
                stopButton.disabled = true; // Disable stop button
                alert('No camera devices found. Please ensure a camera is connected and allow access in your browser settings.');
            }
        } catch (error) {
            console.error('Error enumerating devices:', error);
            startButton.disabled = true;
            stopButton.disabled = true; // Disable stop button
            alert('Error accessing camera devices. Please check browser permissions and ensure you are on a secure context (like localhost or HTTPS).');
        }
    }

    async function startCamera(deviceId) {
        if (currentStream) {
            stopCamera(); // Stop existing stream before starting a new one
        }

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            video.play();
            captureButton.disabled = false;
            resetButton.disabled = false;
            stopButton.disabled = false; // Enable stop button
            addCustomTextButton.disabled = customTextInput.value.trim() === '';

            video.onloadedmetadata = () => {
                livePreviewCanvas.width = video.videoWidth;
                livePreviewCanvas.height = video.videoHeight;
                video.classList.add('hidden');
                livePreviewCanvas.classList.remove('hidden');
                drawLivePreview(); // Start the animation loop
            };

            drawFinalPhotoStrip(); // Re-draw the final strip after camera starts/changes
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Could not start camera. Please ensure camera access is granted in your browser settings, and no other application is using it. You must be on localhost or HTTPS.');
            captureButton.disabled = true;
            resetButton.disabled = true;
            stopButton.disabled = true; // Disable stop button
            addCustomTextButton.disabled = true;
            video.classList.remove('hidden');
            livePreviewCanvas.classList.add('hidden');
        }
    }

    function stopCamera() { // MODIFIED: Centralized stop logic
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
            video.srcObject = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId); // Stop the live preview animation
        }
        captureButton.disabled = true;
        stopButton.disabled = true; // Disable stop button when stopped
        startButton.disabled = false; // Enable start button when stopped
        addCustomTextButton.disabled = true;
        livePreviewCtx.clearRect(0, 0, livePreviewCanvas.width, livePreviewCanvas.height);
        video.classList.remove('hidden'); // Show the video element (though it will be black)
        livePreviewCanvas.classList.add('hidden'); // Hide the canvas
    }

    // --- Live Preview with Filters ---
    function drawLivePreview() {
        if (!video.srcObject || video.paused || video.ended) {
            animationFrameId = null; // Ensure animation stops if video isn't playing
            return;
        }

        livePreviewCtx.clearRect(0, 0, livePreviewCanvas.width, livePreviewCanvas.height);
        
        const selectedFilter = filterSelect.value;
        
        if (selectedFilter === 'vintage') {
            livePreviewCtx.filter = 'sepia(60%) saturate(150%) brightness(90%) contrast(110%)';
        } else if (selectedFilter === 'polaroid') {
            livePreviewCtx.filter = 'sepia(40%) contrast(120%) brightness(110%) saturate(130%)';
        } else {
            livePreviewCtx.filter = selectedFilter;
        }
        
        livePreviewCtx.save();
        livePreviewCtx.translate(livePreviewCanvas.width, 0);
        livePreviewCtx.scale(-1, 1);
        livePreviewCtx.drawImage(video, 0, 0, livePreviewCanvas.width, livePreviewCanvas.height);
        livePreviewCtx.restore();
        livePreviewCtx.filter = 'none'; 

        animationFrameId = requestAnimationFrame(drawLivePreview); // Keep track of the ID
    }

    // --- Capture Photo ---
    function takePhoto() {
        const layout = layoutSelect.value;
        let maxPhotos;
        if (layout === '1x1') maxPhotos = 1;
        else if (layout === '1x2') maxPhotos = 2;
        else if (layout === '2x2') maxPhotos = 4;
        else if (layout === '1x4') maxPhotos = 4;

        if (capturedPhotos.length >= maxPhotos) {
            alert(`You can only capture ${maxPhotos} photos for the ${layout} layout. Please reset to take new photos.`);
            return;
        }

        captureButton.disabled = true;
        startButton.disabled = true;
        resetButton.disabled = true;
        stopButton.disabled = true; // Disable stop during countdown
        addCustomTextButton.disabled = true;

        let countdown = 3;
        countdownDisplay.textContent = countdown;
        countdownDisplay.classList.remove('hidden');

        // Stop live preview animation during countdown
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownDisplay.textContent = countdown;
            } else {
                clearInterval(countdownInterval);
                countdownDisplay.textContent = 'SMILE!';
                
                livePreviewCanvas.classList.add('hidden'); 

                setTimeout(() => {
                    countdownDisplay.classList.add('hidden');
                    livePreviewCanvas.classList.remove('hidden');
                    capturePhotoAfterCountdown();
                    drawLivePreview(); // Restart live preview after capture
                }, 500);
            }
        }, 1000);
    }

    function capturePhotoAfterCountdown() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');

        const selectedFilter = filterSelect.value;
        
        if (selectedFilter === 'vintage') {
            tempCtx.filter = 'sepia(60%) saturate(150%) brightness(90%) contrast(110%)';
        } else if (selectedFilter === 'polaroid') {
            tempCtx.filter = 'sepia(40%) contrast(120%) brightness(110%) saturate(130%)';
        } else {
            tempCtx.filter = selectedFilter;
        }

        tempCtx.save();
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.restore();
        
        tempCtx.filter = 'none';

        const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
        capturedPhotos.push(imageDataUrl);
        updateThumbnails();
        drawFinalPhotoStrip();

        const layout = layoutSelect.value;
        let maxPhotos;
        if (layout === '1x1') maxPhotos = 1;
        else if (layout === '1x2') maxPhotos = 2;
        else if (layout === '2x2') maxPhotos = 4;
        else if (layout === '1x4') maxPhotos = 4;

        if (capturedPhotos.length < maxPhotos) {
            captureButton.disabled = false;
        } else {
            captureButton.disabled = true;
        }
        startButton.disabled = false;
        stopButton.disabled = false; // Enable stop button after capture
        resetButton.disabled = false;
        addCustomTextButton.disabled = customTextInput.value.trim() === '';
        downloadStripButton.disabled = capturedPhotos.length === 0;
        clearStickersButton.disabled = stickersOnStrip.length === 0;
        clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
    }


    function updateThumbnails() {
        thumbnailsContainer.innerHTML = '';
        capturedPhotos.forEach((dataUrl, index) => {
            const thumbnailItem = document.createElement('div');
            thumbnailItem.classList.add('thumbnail-item');

            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = `Captured Photo ${index + 1}`;

            const downloadBtn = document.createElement('button');
            downloadBtn.classList.add('thumbnail-download-btn');
            downloadBtn.textContent = 'Download';
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                downloadImage(dataUrl, `photo_${index + 1}.jpg`);
            };
            
            thumbnailItem.addEventListener('click', () => {
                showPhotoPreview(dataUrl, `photo_${index + 1}.jpg`);
            });

            thumbnailItem.appendChild(img);
            thumbnailItem.appendChild(downloadBtn);
            thumbnailsContainer.appendChild(thumbnailItem);
        });
        downloadStripButton.disabled = capturedPhotos.length === 0;
        clearStickersButton.disabled = stickersOnStrip.length === 0;
        clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
    }

    // --- Photo Preview Modal Functions ---
    function showPhotoPreview(dataUrl, filename) {
        modalImage.src = dataUrl;
        modalDownloadButton.onclick = () => downloadImage(dataUrl, filename);
        photoPreviewModal.classList.add('visible');
    }

    function hidePhotoPreview() {
        photoPreviewModal.classList.remove('visible');
    }

    // Event listeners for modal
    closeButton.addEventListener('click', hidePhotoPreview);
    photoPreviewModal.addEventListener('click', (e) => {
        if (e.target === photoPreviewModal) {
            hidePhotoPreview();
        }
    });


    function resetBooth() {
        stopCamera(); // Ensure camera is stopped on full reset
        capturedPhotos = [];
        stickersOnStrip = [];
        customTextsOnStrip = [];
        updateThumbnails();
        drawFinalPhotoStrip();
        captureButton.disabled = true;
        startButton.disabled = false; // Enable start button
        stopButton.disabled = true; // Disable stop button
        resetButton.disabled = true;
        downloadStripButton.disabled = true;
        clearStickersButton.disabled = true;
        clearCustomTextButton.disabled = true;
        customTextInput.value = '';

        stripBgColorInput.value = '#ffebf0';
        stripTextColorInput.value = '#880e4f';
        stripFontSelect.value = "'Oleo Script', cursive";
        stripFontSizeInput.value = 40;
        headerTextInput.value = 'MY PHOTO BOOTH!';
        footerTextInput.value = 'FUN MEMORIES!';

        filterSelect.value = 'none';
        layoutSelect.value = '1x4';
        livePreviewCtx.filter = 'none';

        video.classList.remove('hidden');
        livePreviewCanvas.classList.add('hidden');
    }

    function downloadImage(dataUrl, filename) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- Photo Strip Generation ---

    async function drawFinalPhotoStrip() {
        const layout = layoutSelect.value;
        const bgColor = stripBgColorInput.value;
        const textColor = stripTextColorInput.value;
        const selectedFont = stripFontSelect.value;
        const fontSize = parseInt(stripFontSizeInput.value);
        const headerText = headerTextInput.value;
        const footerText = footerTextInput.value;

        let stripWidth, stripHeight, photoWidth, photoHeight;
        const padding = 20;
        const calculatedTextHeight = fontSize * 1.5;

        const numPhotos = capturedPhotos.length;
        
        if (numPhotos === 0) {
            finalStripCanvas.width = 0;
            finalStripCanvas.height = 0;
            downloadStripButton.disabled = true;
            return;
        }

        const loadedCapturedImages = await Promise.all(capturedPhotos.map(src => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => { console.error('Failed to load captured image:', src); reject(); };
                img.src = src;
            });
        })).catch(e => {
            console.error("Error loading captured photos for strip:", e);
            return [];
        });

        if (loadedCapturedImages.length === 0 || !loadedCapturedImages[0]) {
             finalStripCanvas.width = 0;
             finalStripCanvas.height = 0;
             downloadStripButton.disabled = true;
             return;
        }

        const aspectRatio = loadedCapturedImages[0].width / loadedCapturedImages[0].height;

        if (layout === '1x1') {
            photoWidth = 500;
            photoHeight = photoWidth / aspectRatio;
            stripWidth = photoWidth + (padding * 2);
            stripHeight = photoHeight + (padding * 2) + (calculatedTextHeight * 2);
        } else if (layout === '1x2') {
            photoWidth = 300;
            photoHeight = photoWidth / aspectRatio;
            stripWidth = photoWidth + (padding * 2);
            stripHeight = (photoHeight * 2) + (padding * 3) + (calculatedTextHeight * 2);
        } else if (layout === '2x2') {
            photoWidth = 250;
            photoHeight = photoWidth / aspectRatio;
            stripWidth = (photoWidth * 2) + (padding * 3);
            stripHeight = (photoHeight * 2) + (padding * 3) + (calculatedTextHeight * 2);
        } else if (layout === '1x4') {
            photoWidth = 250;
            photoHeight = photoWidth / aspectRatio;
            stripWidth = photoWidth + (padding * 2);
            stripHeight = (photoHeight * 4) + (padding * 5) + (calculatedTextHeight * 2);
        }

        finalStripCanvas.width = stripWidth;
        finalStripCanvas.height = stripHeight;

        finalStripCtx.fillStyle = bgColor;
        finalStripCtx.fillRect(0, 0, stripWidth, stripHeight);

        finalStripCtx.fillStyle = textColor;
        finalStripCtx.font = `bold ${fontSize}px ${selectedFont}`;
        finalStripCtx.textAlign = 'center';
        finalStripCtx.textBaseline = 'middle';
        finalStripCtx.fillText(headerText, stripWidth / 2, padding + (calculatedTextHeight / 2));

        let currentY = padding + calculatedTextHeight + padding;

        for (let i = 0; i < loadedCapturedImages.length; i++) {
            const img = loadedCapturedImages[i];
            if (!img) continue;
            
            let xPos, yPos;

            if (layout === '1x1' || layout === '1x2' || layout === '1x4') {
                xPos = padding;
                yPos = currentY;
                currentY += photoHeight + padding;
            } else if (layout === '2x2') {
                xPos = padding + (i % 2) * (photoWidth + padding);
                yPos = (padding + calculatedTextHeight + padding) + Math.floor(i / 2) * (photoHeight + padding);
            }

            finalStripCtx.drawImage(img, xPos, yPos, photoWidth, photoHeight);
        }

        finalStripCtx.fillStyle = textColor;
        finalStripCtx.font = `bold ${fontSize}px ${selectedFont}`;
        finalStripCtx.textAlign = 'center';
        finalStripCtx.textBaseline = 'middle';
        finalStripCtx.fillText(footerText, stripWidth / 2, stripHeight - padding - (calculatedTextHeight / 2));

        await drawStickersOnCanvas(finalStripCtx);
        drawCustomTextsOnCanvas(finalStripCtx); // Draw custom texts
        downloadStripButton.disabled = false;
        clearStickersButton.disabled = stickersOnStrip.length === 0;
        clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
    }

    async function drawStickersOnCanvas(ctx) {
        for (const sticker of stickersOnStrip) {
            let img = loadedStickerImages[sticker.stickerSrc];
            if (!img) {
                img = new Image();
                await new Promise(resolve => {
                    img.onload = () => {
                        loadedStickerImages[sticker.stickerSrc] = img;
                        resolve();
                    };
                    img.onerror = () => { 
                        console.error('Failed to load sticker:', sticker.stickerSrc); 
                        resolve(); 
                    };
                    img.src = sticker.stickerSrc;
                });
                img = loadedStickerImages[sticker.stickerSrc];
            }
            if (img && img.complete && img.naturalHeight !== 0) {
                ctx.drawImage(img, sticker.x, sticker.y, sticker.size, sticker.size);
            }
        }
    }

    // Helper to calculate text bounding box (approximate)
    function getTextBoundingBox(textObj, ctx) {
        ctx.save();
        ctx.font = `${textObj.size}px ${textObj.font}`;
        const metrics = ctx.measureText(textObj.text);
        const width = metrics.width;
        // A rough estimation for text height, considering padding/line height.
        // For precise height, you might need to render to a temporary canvas and measure pixels.
        const height = textObj.size * 1.2; // 1.2 is a common line-height factor
        ctx.restore();
        return { width, height };
    }

    function drawCustomTextsOnCanvas(ctx) {
        customTextsOnStrip.forEach(textObj => {
            ctx.save(); // Save current context state
            
            // Set text properties
            ctx.fillStyle = textObj.color;
            ctx.font = `${textObj.size}px ${textObj.font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Calculate text metrics to get accurate width for centering/rotation
            const { width: textWidth, height: textHeight } = getTextBoundingBox(textObj, ctx);
            
            // Update textObj's width/height for hit detection later
            textObj.width = textWidth;
            textObj.height = textHeight;
            
            // Translate to the text object's center, rotate, then draw
            // The (x,y) of the textObj is its top-left. For rotation, we need its center.
            const centerX = textObj.x + textWidth / 2;
            const centerY = textObj.y + textHeight / 2;

            ctx.translate(centerX, centerY);
            ctx.rotate(textObj.rotation);
            ctx.fillText(textObj.text, 0, 0); // Draw at (0,0) relative to translated/rotated origin

            ctx.restore(); // Restore context to original state (un-translate, un-rotate)
        });
    }

    // --- Sticker Palette Logic ---
    function initializeStickerPalette() {
        stickerPalette.innerHTML = '';
        stickerImages.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Sticker';
            img.dataset.stickerSrc = src;
            stickerPalette.appendChild(img);

            img.addEventListener('click', () => {
                const currentSelected = stickerPalette.querySelector('.selected');
                if (currentSelected) {
                    currentSelected.classList.remove('selected');
                }
                img.classList.add('selected');
                // Deselect any active custom text for clarity
                activeTextIndex = -1;
            });
        });
    }

    // --- Canvas Interaction (Stickers & Text) ---
    let isDragging = false;
    let isRotating = false;
    let activeItem = null; // Can be a sticker or text object
    let activeItemType = null; // 'sticker' or 'text'
    let activeStickerIndex = -1;
    let activeTextIndex = -1;
    let offsetX, offsetY;
    let initialRotationAngle = 0; // For text rotation
    let startMouseAngle = 0; // For text rotation

    const initialStickerSize = 100;

    finalStripCanvas.addEventListener('mousedown', (e) => {
        if (capturedPhotos.length === 0) {
            return;
        }

        e.preventDefault(); // Prevent default browser drag behaviors

        const rect = finalStripCanvas.getBoundingClientRect();
        const scaleX = finalStripCanvas.width / rect.width;
        const scaleY = finalStripCanvas.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        // Reset active selection
        activeItem = null;
        activeItemType = null;
        activeStickerIndex = -1;
        activeTextIndex = -1;
        isRotating = false; // Reset rotation flag

        // 1. Check for existing custom text click (prioritize text for selection)
        // Iterate in reverse to select topmost item
        for (let i = customTextsOnStrip.length - 1; i >= 0; i--) {
            const textObj = customTextsOnStrip[i];
            // Recalculate width/height as font size or text content might have changed since last draw
            // We use the stored width/height from the last draw, or recalculate if not set.
            const textWidth = textObj.width || getTextBoundingBox(textObj, finalStripCtx).width;
            const textHeight = textObj.height || getTextBoundingBox(textObj, finalStripCtx).height;
            
            // Center of the text for rotation calculations
            const centerX = textObj.x + textWidth / 2;
            const centerY = textObj.y + textHeight / 2;

            // Translate mouse point relative to text center
            const translatedMouseX = mouseX - centerX;
            const translatedMouseY = mouseY - centerY;

            // Rotate mouse point back (inverse rotation)
            const cos = Math.cos(-textObj.rotation);
            const sin = Math.sin(-textObj.rotation);
            const rotatedMouseX = translatedMouseX * cos + translatedMouseY * sin;
            const rotatedMouseY = -translatedMouseX * sin + translatedMouseY * cos;

            // Check if rotated mouse point is within the *unrotated* bounding box centered at (0,0)
            if (rotatedMouseX >= -textWidth / 2 && rotatedMouseX <= textWidth / 2 &&
                rotatedMouseY >= -textHeight / 2 && rotatedMouseY <= textHeight / 2) {
                
                activeItem = textObj;
                activeItemType = 'text';
                activeTextIndex = i;
                offsetX = mouseX - textObj.x;
                offsetY = mouseY - textObj.y;
                isDragging = true;
                finalStripCanvas.style.cursor = 'grabbing';

                // Bring to front
                customTextsOnStrip.splice(activeTextIndex, 1);
                customTextsOnStrip.push(activeItem);
                
                // If Shift is pressed, start rotation
                if (e.shiftKey) {
                    isRotating = true;
                    const dx = mouseX - (textObj.x + textWidth / 2);
                    const dy = mouseY - (textObj.y + textHeight / 2);
                    startMouseAngle = Math.atan2(dy, dx);
                    initialRotationAngle = textObj.rotation;
                    finalStripCanvas.style.cursor = 'crosshair'; // Indicate rotation mode
                }
                drawFinalPhotoStrip();
                return; // Found and handled a text click
            }
        }

        // 2. If no text, check for existing sticker click
        for (let i = stickersOnStrip.length - 1; i >= 0; i--) {
            const sticker = stickersOnStrip[i];
            if (mouseX >= sticker.x && mouseX <= sticker.x + sticker.size &&
                mouseY >= sticker.y && mouseY <= sticker.y + sticker.size) {
                
                activeItem = sticker;
                activeItemType = 'sticker';
                activeStickerIndex = i;
                offsetX = mouseX - sticker.x;
                offsetY = mouseY - sticker.y;
                isDragging = true;
                finalStripCanvas.style.cursor = 'grabbing';

                // Bring to front
                stickersOnStrip.splice(activeStickerIndex, 1);
                stickersOnStrip.push(activeItem);
                drawFinalPhotoStrip();
                return; // Found and handled a sticker click
            }
        }

        // 3. If nothing existing clicked, check if a new sticker is selected in palette
        const paletteSelectedSticker = stickerPalette.querySelector('.selected');
        if (paletteSelectedSticker && activeItemType === null) { // Only if no sticker/text was just picked up
            activeItem = {
                stickerSrc: paletteSelectedSticker.dataset.stickerSrc,
                x: mouseX - initialStickerSize / 2, // Center new sticker on cursor
                y: mouseY - initialStickerSize / 2,
                size: initialStickerSize
            };
            activeItemType = 'sticker';
            stickersOnStrip.push(activeItem);
            activeStickerIndex = stickersOnStrip.length - 1;
            offsetX = mouseX - activeItem.x;
            offsetY = mouseY - activeItem.y;
            isDragging = true;
            finalStripCanvas.style.cursor = 'grabbing';
            drawFinalPhotoStrip();
            return;
        }

        // If no sticker or text was hit, and no new sticker was chosen,
        // and add custom text button was not used, then reset cursor.
        finalStripCanvas.style.cursor = 'grab';
    });

    finalStripCanvas.addEventListener('mousemove', (e) => {
        if (!isDragging || !activeItem) return;

        const rect = finalStripCanvas.getBoundingClientRect();
        const scaleX = finalStripCanvas.width / rect.width;
        const scaleY = finalStripCanvas.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (activeItemType === 'sticker') {
            activeItem.x = mouseX - offsetX;
            activeItem.y = mouseY - offsetY;
        } else if (activeItemType === 'text') {
            if (isRotating) {
                const textObj = activeItem;
                const textWidth = textObj.width || getTextBoundingBox(textObj, finalStripCtx).width;
                const textHeight = textObj.height || getTextBoundingBox(textObj, finalStripCtx).height;

                const centerX = textObj.x + textWidth / 2;
                const centerY = textObj.y + textHeight / 2;

                const dx = mouseX - centerX;
                const dy = mouseY - centerY;
                const currentMouseAngle = Math.atan2(dy, dx);
                
                // Calculate the difference in angle and apply to the initial rotation
                activeItem.rotation = initialRotationAngle + (currentMouseAngle - startMouseAngle);
            } else { // Dragging text
                activeItem.x = mouseX - offsetX;
                activeItem.y = mouseY - offsetY;
            }
        }
        drawFinalPhotoStrip();
    });

    finalStripCanvas.addEventListener('mouseup', () => {
        isDragging = false;
        isRotating = false;
        activeItem = null;
        activeItemType = null;
        activeStickerIndex = -1;
        activeTextIndex = -1;
        finalStripCanvas.style.cursor = 'grab'; // Reset cursor
        drawFinalPhotoStrip();
        clearStickersButton.disabled = stickersOnStrip.length === 0;
        clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
    });

    finalStripCanvas.addEventListener('mouseleave', () => {
        isDragging = false;
        isRotating = false;
        activeItem = null;
        activeItemType = null;
        activeStickerIndex = -1;
        activeTextIndex = -1;
        finalStripCanvas.style.cursor = 'grab';
        drawFinalPhotoStrip();
        clearStickersButton.disabled = stickersOnStrip.length === 0;
        clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
    });

    // --- Delete Sticker & Text (Right-Click/Context Menu) ---
    finalStripCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Prevent default right-click menu

        if (capturedPhotos.length === 0) return;

        const rect = finalStripCanvas.getBoundingClientRect();
        const scaleX = finalStripCanvas.width / rect.width;
        const scaleY = finalStripCanvas.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        // Check for custom text click first
        let clickedTextIndex = -1;
        for (let i = customTextsOnStrip.length - 1; i >= 0; i--) {
            const textObj = customTextsOnStrip[i];
            const textWidth = textObj.width || getTextBoundingBox(textObj, finalStripCtx).width;
            const textHeight = textObj.height || getTextBoundingBox(textObj, finalStripCtx).height; 

            // Center of the text for rotation context
            const centerX = textObj.x + textWidth / 2;
            const centerY = textObj.y + textHeight / 2;

            // Translate mouse point relative to text center
            const translatedMouseX = mouseX - centerX;
            const translatedMouseY = mouseY - centerY;

            // Rotate mouse point back (inverse rotation)
            const cos = Math.cos(-textObj.rotation); // Negative rotation to inverse
            const sin = Math.sin(-textObj.rotation);
            const rotatedMouseX = translatedMouseX * cos + translatedMouseY * sin;
            const rotatedMouseY = -translatedMouseX * sin + translatedMouseY * cos;

            if (rotatedMouseX >= -textWidth / 2 && rotatedMouseX <= textWidth / 2 &&
                rotatedMouseY >= -textHeight / 2 && rotatedMouseY <= textHeight / 2) {
                clickedTextIndex = i;
                break;
            }
        }

        if (clickedTextIndex !== -1) {
            if (confirm('Do you want to delete this custom text?')) {
                customTextsOnStrip.splice(clickedTextIndex, 1);
                drawFinalPhotoStrip();
                clearCustomTextButton.disabled = customTextsOnStrip.length === 0;
            }
            return; // Handled text deletion, don't check stickers
        }

        // If no text, check for sticker
        const clickedStickerIndex = stickersOnStrip.findIndex(s => 
            mouseX >= s.x && mouseX <= s.x + s.size &&
            mouseY >= s.y && mouseY <= s.y + s.size
        );

        if (clickedStickerIndex !== -1) {
            if (confirm('Do you want to delete this sticker?')) {
                stickersOnStrip.splice(clickedStickerIndex, 1);
                drawFinalPhotoStrip();
                clearStickersButton.disabled = stickersOnStrip.length === 0;
            }
        }
    });


    // Clear all stickers
    clearStickersButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all stickers?')) {
            stickersOnStrip = [];
            drawFinalPhotoStrip();
            clearStickersButton.disabled = true;
        }
    });

    // Add Custom Text
    addCustomTextButton.addEventListener('click', () => {
        const text = customTextInput.value.trim();
        if (text && capturedPhotos.length > 0) {
            const newText = {
                text: text,
                font: stripFontSelect.value,
                size: parseInt(stripFontSizeInput.value),
                color: stripTextColorInput.value,
                x: finalStripCanvas.width / 2 - 50, // Default position, roughly center
                y: finalStripCanvas.height / 2 - 20,
                rotation: 0, // Initial rotation in radians (0 degrees)
                width: 0, // Will be calculated when drawn
                height: 0 // Will be calculated when drawn
            };
            customTextsOnStrip.push(newText);
            drawFinalPhotoStrip();
            customTextInput.value = ''; // Clear input after adding
            clearCustomTextButton.disabled = false;
            addCustomTextButton.disabled = true; // Disable until new text typed
        } else if (capturedPhotos.length === 0) {
            alert("Please capture at least one photo before adding custom text.");
        }
    });

    // Enable/disable 'Add Text' button based on input content
    customTextInput.addEventListener('input', () => {
        addCustomTextButton.disabled = customTextInput.value.trim() === '';
    });

    // Clear All Custom Text
    clearCustomTextButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all custom text?')) {
            customTextsOnStrip = [];
            drawFinalPhotoStrip();
            clearCustomTextButton.disabled = true;
        }
    });


    // --- Event Listeners ---
    startButton.addEventListener('click', () => startCamera(cameraSelect.value));
    stopButton.addEventListener('click', stopCamera); // Event listener for Stop Camera button
    cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
    captureButton.addEventListener('click', takePhoto);
    resetButton.addEventListener('click', resetBooth);
    
    filterSelect.addEventListener('change', () => {
        // The drawLivePreview loop will automatically apply the new filter
    });
    layoutSelect.addEventListener('change', drawFinalPhotoStrip);

    // Strip customization inputs (re-draw strip on change)
    stripBgColorInput.addEventListener('input', drawFinalPhotoStrip);
    stripTextColorInput.addEventListener('input', drawFinalPhotoStrip);
    stripFontSelect.addEventListener('change', drawFinalPhotoStrip);
    stripFontSizeInput.addEventListener('input', drawFinalPhotoStrip);
    headerTextInput.addEventListener('input', drawFinalPhotoStrip);
    footerTextInput.addEventListener('input', drawFinalPhotoStrip);

    downloadStripButton.addEventListener('click', () => {
        downloadImage(finalStripCanvas.toDataURL('image/png'), 'photo_strip.png');
    });

    // Initial setup
    getCameras(); // This will try to start the camera automatically on load
    initializeStickerPalette();
    // No need to call resetBooth here, getCameras will handle initial camera state and button disabling.
    // If getCameras fails, buttons will be disabled by it.
});