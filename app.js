let model, webcam, ctx, labelContainer, maxPredictions;
const poseImages = new Map();
let currentPoseImage = null;
let currentPoseIndex = 0;
let poseHoldTimer = 3;
let lastPoseTime = 0;
let isTransitioning = false;
let isRecognitionRunning = false;
let confidenceScore = 0;
let activePoses = [];

// Define all 7 poses
const poses = [
    { name: "Mountain Pose\n(Tadasana)", image: "mountain.jpg" },
    { name: "Tree Pose\n(Vrikshasana)", image: "tree.jpg" },
    { name: "Warrior I\n(Virabhadrasana I)", image: "warrior1.jpg" },
    { name: "Warrior II\n(Virabhadrasana II)", image: "warrior2.jpg" },
    { name: "Triangle Pose\n(Trikonasana)", image: "triangle.jpg" },
    { name: "Child's Pose\n(Balasana)", image: "child.jpg" },
    { name: "Downward Dog\n(Adho Mukha Svanasana)", image: "downward.jpg" }
];

// Pose cycle for alternating between poses
let poseSequence = []; // Will be populated with active poses
let sequenceIndex = 0;

// Model file storage
let localModelFiles = {
    modelJson: null,
    metadataJson: null,
    weightsBin: null
};

// Settings management
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('yogaAppSettings') || '{}');
    const defaultSettings = {
        modelUrl: 'https://teachablemachine.withgoogle.com/models/BmWV2_mfv/',
        modelSource: 'online',
        audioEnabled: true,
        recognitionDelay: 3,
        accuracyThreshold: 0.5,
        activePoses: [true, true, true, true, true, true, true],
        poseNames: poses.map(pose => pose.name) // Initialize with default pose names
    };
    return { ...defaultSettings, ...settings };
}

function saveSettings(settings) {
    localStorage.setItem('yogaAppSettings', JSON.stringify(settings));
}

// IndexedDB functions for storing large files (weights.bin and images)
function openWeightsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('YogaModelData', 2);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('weights')) {
                db.createObjectStore('weights');
            }
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images');
            }
        };
    });
}

async function saveWeightsToDB(weightsData) {
    try {
        const db = await openWeightsDB();
        const transaction = db.transaction(['weights'], 'readwrite');
        const store = transaction.objectStore('weights');

        await new Promise((resolve, reject) => {
            const request = store.put(weightsData, 'weights.bin');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        console.log('Weights.bin saved to IndexedDB successfully');
        return true;
    } catch (error) {
        console.error('Failed to save weights to IndexedDB:', error);
        return false;
    }
}

async function loadWeightsFromDB() {
    try {
        const db = await openWeightsDB();
        const transaction = db.transaction(['weights'], 'readonly');
        const store = transaction.objectStore('weights');

        return new Promise((resolve, reject) => {
            const request = store.get('weights.bin');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                if (request.result) {
                    console.log('Weights.bin loaded from IndexedDB');
                    resolve(request.result);
                } else {
                    resolve(null);
                }
            };
        });
    } catch (error) {
        console.error('Failed to load weights from IndexedDB:', error);
        return null;
    }
}

// Image storage functions using IndexedDB
async function saveImageToDB(imageData, poseIndex) {
    try {
        const db = await openWeightsDB();
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');

        await new Promise((resolve, reject) => {
            const request = store.put(imageData, `pose-${poseIndex}`);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        console.log(`Pose ${poseIndex} image saved to IndexedDB successfully`);
        return true;
    } catch (error) {
        console.error(`Failed to save pose ${poseIndex} image to IndexedDB:`, error);
        return false;
    }
}

async function loadImageFromDB(poseIndex) {
    try {
        const db = await openWeightsDB();
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');

        return new Promise((resolve, reject) => {
            const request = store.get(`pose-${poseIndex}`);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                if (request.result) {
                    console.log(`Pose ${poseIndex} image loaded from IndexedDB`);
                    resolve(request.result);
                } else {
                    resolve(null);
                }
            };
        });
    } catch (error) {
        console.error(`Failed to load pose ${poseIndex} image from IndexedDB:`, error);
        return null;
    }
}

// Compress image to reduce storage size
function compressImage(file, maxWidth = 300, quality = 0.6) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            // Calculate new dimensions while maintaining aspect ratio
            let { width, height } = img;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

            // Check if compressed image is still too large (over 500KB)
            const imageSizeKB = (compressedDataUrl.length * 0.75) / 1024;
            if (imageSizeKB > 500) {
                // Further compress if still too large
                const furtherCompressed = canvas.toDataURL('image/jpeg', 0.4);
                resolve(furtherCompressed);
            } else {
                resolve(compressedDataUrl);
            }
        };

        img.src = URL.createObjectURL(file);
    });
}

async function saveLocalModelFiles() {
    try {
        if (localModelFiles.modelJson) {
            localStorage.setItem('localModelJson', JSON.stringify(localModelFiles.modelJson));
        }
        if (localModelFiles.metadataJson) {
            localStorage.setItem('localMetadataJson', JSON.stringify(localModelFiles.metadataJson));
        }

        // Save weights.bin to IndexedDB for large file storage
        if (localModelFiles.weightsBin) {
            const saved = await saveWeightsToDB(localModelFiles.weightsBin);
            if (saved) {
                console.log('Model JSON, metadata saved to localStorage, weights saved to IndexedDB');
            } else {
                console.log('Model JSON and metadata saved to localStorage, but weights failed to save');
            }
        } else {
            console.log('Model JSON and metadata saved to localStorage');
        }
    } catch (error) {
        console.warn('Could not save model files:', error);
    }
}

async function loadLocalModelFiles() {
    try {
        const modelJson = localStorage.getItem('localModelJson');
        const metadataJson = localStorage.getItem('localMetadataJson');

        if (modelJson) {
            localModelFiles.modelJson = JSON.parse(modelJson);
            const modelLabel = document.getElementById('model-json')?.nextElementSibling;
            if (modelLabel) {
                modelLabel.classList.add('file-loaded');
                modelLabel.textContent = '[OK] model.json (saved)';
            }
        }
        if (metadataJson) {
            localModelFiles.metadataJson = JSON.parse(metadataJson);
            const metadataLabel = document.getElementById('metadata-json')?.nextElementSibling;
            if (metadataLabel) {
                metadataLabel.classList.add('file-loaded');
                metadataLabel.textContent = '[OK] metadata.json (saved)';
            }
        }

        // Load weights.bin from IndexedDB
        const weightsData = await loadWeightsFromDB();
        if (weightsData) {
            localModelFiles.weightsBin = weightsData;
            const weightsLabel = document.getElementById('weights-bin')?.nextElementSibling;
            if (weightsLabel) {
                weightsLabel.classList.add('file-loaded');
                weightsLabel.textContent = '[OK] weights.bin (saved)';
            }
            console.log('All local model files loaded successfully from storage');
        }
    } catch (error) {
        console.error('Error loading saved model files:', error);
    }
}

function savePoseSelection() {
    const settings = loadSettings();
    settings.activePoses = [];
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        settings.activePoses[i] = checkbox ? checkbox.checked : false;
    }
    saveSettings(settings);
}

function saveAllData() {
    // Save current settings
    const settings = {
        modelUrl: document.getElementById('model-url').value,
        modelSource: document.querySelector('input[name="model-source"]:checked').value,
        audioEnabled: document.getElementById('audio-enabled').checked,
        recognitionDelay: parseInt(document.getElementById('recognition-delay').value),
        accuracyThreshold: parseFloat(document.getElementById('accuracy-threshold').value),
        activePoses: [],
        poseNames: []
    };

    // Save active poses state and custom names
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        settings.activePoses[i] = checkbox ? checkbox.checked : false;

        // Save custom pose names from labels
        const label = document.querySelector(`label[for="pose-${i + 1}-enabled"]`);
        if (label) {
            settings.poseNames[i] = label.textContent;
        }
    }

    saveSettings(settings);

    // Save local model files (except weights.bin due to size limits)
    saveLocalModelFiles();

    // Pose images are automatically saved to IndexedDB when uploaded

    alert('Settings and model data saved successfully!\n\nAll files including weights.bin and pose images are now saved locally and will persist between sessions.');
}

function getActivePoses() {
    activePoses = [];
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        if (checkbox && checkbox.checked) {
            activePoses.push(i);
        }
    }
    // Update pose sequence with active poses
    poseSequence = [...activePoses];
    return activePoses;
}

// Initialize settings on page load
document.addEventListener('DOMContentLoaded', async function() {
    const settings = loadSettings();
    console.log('Settings loaded:', settings);

    // Apply settings to form
    document.getElementById('model-url').value = settings.modelUrl;
    document.getElementById('audio-enabled').checked = settings.audioEnabled;
    document.getElementById('recognition-delay').value = settings.recognitionDelay;
    document.getElementById('accuracy-threshold').value = settings.accuracyThreshold;

    // Set model source
    document.querySelector(`input[name="model-source"][value="${settings.modelSource}"]`).checked = true;
    toggleModelSource();

    // Load pose checkboxes state
    if (settings.activePoses) {
        for (let i = 0; i < 7; i++) {
            const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
            if (checkbox) {
                checkbox.checked = settings.activePoses[i] || false;
            }
        }
    }

    // Load custom pose names
    if (settings.poseNames && settings.poseNames.length > 0) {
        for (let i = 0; i < 7; i++) {
            const label = document.querySelector(`label[for="pose-${i + 1}-enabled"]`);
            if (label && settings.poseNames[i]) {
                label.textContent = settings.poseNames[i];
            }
        }
    } else {
        // Initialize with default pose names if none saved
        for (let i = 0; i < 7; i++) {
            const label = document.querySelector(`label[for="pose-${i + 1}-enabled"]`);
            if (label && poses[i]) {
                label.textContent = poses[i].name;
            }
        }
    }

    // Update accuracy display
    document.getElementById('accuracy-value').textContent = settings.accuracyThreshold;

    // Add event listeners
    document.querySelectorAll('input[name="model-source"]').forEach(radio => {
        radio.addEventListener('change', toggleModelSource);
    });

    // Add pose checkbox listeners to save selection
    for (let i = 1; i <= 7; i++) {
        const checkbox = document.getElementById(`pose-${i}-enabled`);
        if (checkbox) {
            checkbox.addEventListener('change', savePoseSelection);
        }
    }

    // Add local file handlers
    document.getElementById('model-json').addEventListener('change', (e) => handleLocalFile(e, 'modelJson'));
    document.getElementById('metadata-json').addEventListener('change', (e) => handleLocalFile(e, 'metadataJson'));
    document.getElementById('weights-bin').addEventListener('change', (e) => handleLocalFile(e, 'weightsBin'));

    // Load pose images and local model files
    await loadPoseImages();
    await loadLocalModelFiles();

    console.log('App initialization complete. All saved settings and model files have been restored.');
});

async function loadPoseImages() {
    // First, clean up any old localStorage image data to free space
    for (let i = 1; i <= 7; i++) {
        const oldKey = `pose-${i}-image`;
        if (localStorage.getItem(oldKey)) {
            localStorage.removeItem(oldKey);
            console.log(`Removed old localStorage data for pose ${i}`);
        }
    }

    for (let index = 0; index < poses.length; index++) {
        const preview = document.getElementById(`pose-${index + 1}-preview`);
        const fileLabel = document.querySelector(`label[for="pose-${index + 1}-image"]`);

        // Try to load from IndexedDB first
        let savedImage = await loadImageFromDB(index + 1);

        // Fallback to localStorage for backward compatibility (but clean it up)
        if (!savedImage) {
            savedImage = localStorage.getItem(`pose-${index + 1}-image`);
            if (savedImage) {
                // Migrate from localStorage to IndexedDB
                const migrated = await saveImageToDB(savedImage, index + 1);
                if (migrated) {
                    // Remove from localStorage to free space
                    localStorage.removeItem(`pose-${index + 1}-image`);
                    console.log(`Migrated pose ${index + 1} image from localStorage to IndexedDB`);
                }
            }
        }

        if (savedImage) {
            preview.src = savedImage;
            preview.style.display = 'block';
            poseImages.set(index, savedImage);

            // Add visual indicator that image is uploaded
            const poseItem = document.querySelector(`.pose-item:nth-child(${index + 1})`);
            if (poseItem) {
                poseItem.classList.add('has-image');
            }

            // Update file label to show image is loaded
            if (fileLabel) {
                fileLabel.textContent = 'Image Loaded';
                fileLabel.style.background = '#d4edda';
                fileLabel.style.color = '#155724';
            }
        } else {
            // Ensure label shows default text if no image
            if (fileLabel) {
                fileLabel.textContent = 'Choose File';
                fileLabel.style.background = '#e9ecef';
                fileLabel.style.color = '#495057';
            }
        }
    }
}

async function handleImageUpload(event, poseIndex) {
    const file = event.target.files[0];
    const preview = document.getElementById(`pose-${poseIndex}-preview`);
    const poseItem = event.target.closest('.pose-item');
    const fileLabel = event.target.nextElementSibling;

    if (file) {
        try {
            // Compress image to reduce storage size
            const compressedImageData = await compressImage(file);

            preview.src = compressedImageData;
            preview.style.display = 'block';
            poseImages.set(poseIndex - 1, compressedImageData);

            // Add visual indicator that image is uploaded
            poseItem.classList.add('has-image');

            // Update file label to show file name
            if (fileLabel) {
                fileLabel.textContent = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
                fileLabel.style.background = '#d4edda';
                fileLabel.style.color = '#155724';
            }

            // Save to IndexedDB instead of localStorage
            const saved = await saveImageToDB(compressedImageData, poseIndex);

            if (saved) {
                console.log(`Pose ${poseIndex} image uploaded and saved successfully`);
            } else {
                console.warn(`Pose ${poseIndex} image uploaded but failed to save to IndexedDB`);
                // Don't fallback to localStorage to avoid quota issues
                alert(`Warning: Could not save pose ${poseIndex} image due to storage limitations. The image will work for this session but may not persist. Try using smaller images or clearing browser storage.`);
            }
        } catch (error) {
            console.error(`Error processing pose ${poseIndex} image:`, error);
            alert(`Error uploading pose ${poseIndex} image. Please try again.`);
        }
    } else {
        // Reset label if no file selected
        if (fileLabel) {
            fileLabel.textContent = 'Choose File';
            fileLabel.style.background = '#e9ecef';
            fileLabel.style.color = '#495057';
        }
    }
}

function updatePoseName(labelElement, poseIndex) {
    const settings = loadSettings();
    settings.poseNames[poseIndex - 1] = labelElement.textContent;
    saveSettings(settings);
    console.log(`Updated pose ${poseIndex} name to: ${labelElement.textContent}`);
}

function updateAccuracyDisplay() {
    const slider = document.getElementById('accuracy-threshold');
    const display = document.getElementById('accuracy-value');
    display.textContent = slider.value;
}

function toggleModelSource() {
    const modelSource = document.querySelector('input[name="model-source"]:checked').value;
    const onlineGroup = document.getElementById('online-model-group');
    const localGroup = document.getElementById('local-model-group');

    if (modelSource === 'online') {
        onlineGroup.style.display = 'block';
        localGroup.style.display = 'none';
    } else {
        onlineGroup.style.display = 'none';
        localGroup.style.display = 'block';
    }
}

function handleLocalFile(event, fileType) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            if (fileType === 'weightsBin') {
                localModelFiles[fileType] = e.target.result;

                // Automatically save weights.bin to IndexedDB
                const saved = await saveWeightsToDB(e.target.result);
                if (!saved) {
                    console.warn('Failed to save weights.bin to IndexedDB');
                }
            } else {
                try {
                    localModelFiles[fileType] = JSON.parse(e.target.result);
                } catch (error) {
                    alert(`Invalid JSON file: ${file.name}`);
                    return;
                }
            }

            // Update label to show file is loaded
            const label = event.target.nextElementSibling;
            label.classList.add('file-loaded');
            label.textContent = `[OK] ${file.name}`;

            console.log(`Loaded ${fileType}:`, file.name);

            // Save to appropriate storage
            if (fileType === 'weightsBin') {
                // Already saved to IndexedDB above
            } else {
                saveLocalModelFiles();
            }
        };

        if (fileType === 'weightsBin') {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }
}

async function validateLocalFiles() {
    const errors = [];

    // Try to load weights from IndexedDB if not already loaded
    if (!localModelFiles.weightsBin) {
        const weightsData = await loadWeightsFromDB();
        if (weightsData) {
            localModelFiles.weightsBin = weightsData;
            console.log('Loaded weights.bin from IndexedDB during validation');
        }
    }

    if (!localModelFiles.modelJson) {
        errors.push('❌ model.json file is missing - please upload');
    }
    if (!localModelFiles.metadataJson) {
        errors.push('❌ metadata.json file is missing - please upload');
    }
    if (!localModelFiles.weightsBin) {
        errors.push('❌ weights.bin file is missing - please upload');
    }

    if (errors.length > 0) {
        console.error('Local model validation failed:', errors.join(', '));
        return false;
    }

    // Additional validation for file structure
    try {
        if (localModelFiles.modelJson && !localModelFiles.modelJson.weightsManifest) {
            errors.push('❌ model.json does not contain weightsManifest - invalid file format');
        }
        if (localModelFiles.metadataJson && !localModelFiles.metadataJson.labels) {
            errors.push('❌ metadata.json does not contain labels - invalid file format');
        }
    } catch (e) {
        errors.push('❌ Invalid JSON structure in model files');
    }

    if (errors.length > 0) {
        console.error('Local model structure validation failed:', errors.join(', '));
        return false;
    }

    return true;
}

function resetRecognitionState() {
    isRecognitionRunning = false;
    sequenceIndex = 0;
    lastPoseTime = 0;
    isTransitioning = false;
    confidenceScore = 0;

    // Reset UI elements
    document.getElementById('timer-display').style.display = 'none';

    // Reset confidence display
    const confidenceBar = document.querySelector('.confidence-bar');
    const confidenceText = document.querySelector('.confidence-text');
    if (confidenceBar && confidenceText) {
        confidenceBar.style.width = '0%';
        confidenceBar.classList.remove('correct');
        confidenceText.textContent = 'Confidence: 0%';
    }

    // Reset pose compare image
    const poseCompare = document.getElementById('pose-compare');
    if (poseCompare) {
        poseCompare.className = 'pose-compare waiting';
    }
}

function refreshRecognition() {
    console.log('Refreshing recognition - restarting from pose 1');

    // Reset to first pose
    sequenceIndex = 0;
    lastPoseTime = 0;
    isTransitioning = false;
    confidenceScore = 0;

    // Update current pose display
    updateCurrentPose();

    // Reset timer and confidence displays
    document.getElementById('timer-display').style.display = 'none';
    const confidenceBar = document.querySelector('.confidence-bar');
    const confidenceText = document.querySelector('.confidence-text');
    if (confidenceBar && confidenceText) {
        confidenceBar.style.width = '0%';
        confidenceBar.classList.remove('correct');
        confidenceText.textContent = 'Confidence: 0%';
    }

    // Reset pose compare image
    const poseCompare = document.getElementById('pose-compare');
    if (poseCompare) {
        poseCompare.className = 'pose-compare waiting';
    }
}

async function startRecognition() {
    const modelSource = document.querySelector('input[name="model-source"]:checked').value;

    // Get active poses
    const activePosesList = getActivePoses();
    if (activePosesList.length === 0) {
        alert('❌ Cannot Start Recognition\n\nPlease select at least one pose to practice.');
        return;
    }

    // Validate pose images for active poses
    const missingPoseImages = [];
    for (const poseIndex of activePosesList) {
        const savedImage = poseImages.get(poseIndex);
        if (!savedImage) {
            // Always use the original pose name from poses array
            const poseName = poses[poseIndex].name;
            missingPoseImages.push(`• ${poseName}`);
        }
    }

    if (missingPoseImages.length > 0) {
        alert(`❌ Cannot Start Recognition\n\nMissing pose images for selected poses:\n${missingPoseImages.join('\n')}\n\nPlease upload images for all selected poses before starting recognition.`);
        return;
    }

    // Save current settings
    const settings = {
        modelUrl: document.getElementById('model-url').value,
        modelSource: modelSource,
        audioEnabled: document.getElementById('audio-enabled').checked,
        recognitionDelay: parseInt(document.getElementById('recognition-delay').value),
        accuracyThreshold: parseFloat(document.getElementById('accuracy-threshold').value),
        activePoses: [],
        poseNames: []
    };

    // Save active poses state and custom names
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        settings.activePoses[i] = checkbox ? checkbox.checked : false;

        // Save custom pose names from labels
        const label = document.querySelector(`label[for="pose-${i + 1}-enabled"]`);
        if (label) {
            settings.poseNames[i] = label.textContent;
        }
    }

    saveSettings(settings);

    // Validate based on model source
    if (modelSource === 'online') {
        if (!settings.modelUrl || settings.modelUrl.trim() === '') {
            alert('❌ Cannot Start Recognition\n\nPlease enter a valid Teachable Machine model URL.');
            return;
        }
    } else {
        // For local files, ensure all saved files are loaded first
        await loadLocalModelFiles();

        const missingFiles = [];

        // Check if files are loaded in memory or available in storage
        if (!localModelFiles.modelJson) {
            const savedModelJson = localStorage.getItem('localModelJson');
            if (savedModelJson) {
                try {
                    localModelFiles.modelJson = JSON.parse(savedModelJson);
                } catch (e) {
                    missingFiles.push('• model.json (corrupted)');
                }
            } else {
                missingFiles.push('• model.json');
            }
        }

        if (!localModelFiles.metadataJson) {
            const savedMetadataJson = localStorage.getItem('localMetadataJson');
            if (savedMetadataJson) {
                try {
                    localModelFiles.metadataJson = JSON.parse(savedMetadataJson);
                } catch (e) {
                    missingFiles.push('• metadata.json (corrupted)');
                }
            } else {
                missingFiles.push('• metadata.json');
            }
        }

        if (!localModelFiles.weightsBin) {
            // Try to load from IndexedDB
            const weightsData = await loadWeightsFromDB();
            if (weightsData) {
                localModelFiles.weightsBin = weightsData;
            } else {
                missingFiles.push('• weights.bin');
            }
        }

        if (missingFiles.length > 0) {
            alert(`❌ Cannot Start Recognition\n\nMissing required model files:\n${missingFiles.join('\n')}\n\nPlease upload all 3 model files before starting recognition.`);
            return;
        }

        // Additional validation for file structure
        const isValid = await validateLocalFiles();
        if (!isValid) {
            alert('❌ Cannot Start Recognition\n\nInvalid model files detected. Please ensure you have uploaded valid Teachable Machine pose model files:\n• model.json\n• metadata.json\n• weights.bin');
            return;
        }
    }

    // Show loading and switch to recognition page
    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('recognition-page').classList.add('active');

    try {
        if (modelSource === 'online') {
            await init(settings.modelUrl);
        } else {
            await initLocal();
        }
        await startCameraRecognition();
    } catch (error) {
        console.error('Failed to start recognition:', error);
        let errorMessage = 'Failed to start recognition. ';

        if (modelSource === 'local') {
            errorMessage += 'Please ensure your model files are valid Teachable Machine pose model files (model.json, metadata.json, weights.bin) and try again.';
        } else {
            errorMessage += 'Please check your model URL and internet connection, then try again.';
        }

        alert(errorMessage);
        showSettingsPage();
    }
}

async function init(modelURL) {
    console.log('Loading model from:', modelURL);

    try {
        // Load the model
        model = await tmPose.load(modelURL + 'model.json', modelURL + 'metadata.json');
        maxPredictions = model.getTotalClasses();
        console.log('Model loaded successfully. Classes:', maxPredictions);

        await setupCamera();

    } catch (error) {
        console.error('Failed to initialize:', error);
        throw error;
    }
}

async function initLocal() {
    console.log('Loading local model files...');

    try {
        // Validate files are loaded
        if (!localModelFiles.modelJson || !localModelFiles.metadataJson || !localModelFiles.weightsBin) {
            throw new Error('Missing required model files');
        }

        console.log('Creating model blob URLs...');

        // Create metadata blob first
        const metadataBlob = new Blob([JSON.stringify(localModelFiles.metadataJson)], {type: 'application/json'});
        const metadataUrl = URL.createObjectURL(metadataBlob);
        console.log('Metadata URL created:', metadataUrl);

        // Create weights blob with proper binary data
        let weightsData;
        if (localModelFiles.weightsBin instanceof ArrayBuffer) {
            weightsData = localModelFiles.weightsBin;
        } else {
            throw new Error('Weights data is not in the correct format (should be ArrayBuffer)');
        }

        const weightsBlob = new Blob([weightsData], {type: 'application/octet-stream'});
        const weightsUrl = URL.createObjectURL(weightsBlob);
        console.log('Weights URL created:', weightsUrl);

        // Create a modified model.json that points to our blob URL for weights
        const modifiedModelJson = JSON.parse(JSON.stringify(localModelFiles.modelJson));

        // Update the weights manifest to point to our blob URL
        if (modifiedModelJson.weightsManifest && modifiedModelJson.weightsManifest.length > 0) {
            // Replace the weights path with our blob URL
            modifiedModelJson.weightsManifest[0].paths = ['./weights.bin'];
            console.log('Updated weightsManifest paths');
        } else {
            throw new Error('Model file does not contain valid weightsManifest');
        }

        // Create model blob
        const modelBlob = new Blob([JSON.stringify(modifiedModelJson)], {type: 'application/json'});
        const modelUrl = URL.createObjectURL(modelBlob);
        console.log('Model URL created:', modelUrl);

        // Create a custom fetch function that intercepts requests for weights.bin
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            if (typeof url === 'string' && url.includes('weights.bin')) {
                console.log('Intercepting weights.bin request, returning local blob');
                return Promise.resolve(new Response(weightsBlob));
            }
            return originalFetch.call(this, url, options);
        };

        try {
            // Load the model with local files
            console.log('Loading model with URLs:', { modelUrl, metadataUrl });
            model = await tmPose.load(modelUrl, metadataUrl);
            maxPredictions = model.getTotalClasses();
            console.log('Local model loaded successfully. Classes:', maxPredictions);
        } finally {
            // Restore original fetch
            window.fetch = originalFetch;

            // Clean up blob URLs
            URL.revokeObjectURL(modelUrl);
            URL.revokeObjectURL(metadataUrl);
            URL.revokeObjectURL(weightsUrl);
        }

        await setupCamera();

    } catch (error) {
        console.error('Failed to initialize local model:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            modelJsonLoaded: !!localModelFiles.modelJson,
            metadataJsonLoaded: !!localModelFiles.metadataJson,
            weightsBinLoaded: !!localModelFiles.weightsBin,
            weightsBinType: localModelFiles.weightsBin ? localModelFiles.weightsBin.constructor.name : 'undefined'
        });
        throw error;
    }
}

async function setupCamera() {
    // Set up webcam
    const flip = true;
    webcam = new tmPose.Webcam(640, 480, flip);
    await webcam.setup();

    // Clear previous webcam if exists
    const container = document.getElementById('webcam-container');
    if (!container) {
        // Create webcam container if it doesn't exist
        const videoContainer = document.querySelector('.video-container');
        const webcamContainer = document.createElement('div');
        webcamContainer.id = 'webcam-container';
        videoContainer.appendChild(webcamContainer);
    }

    // Clear existing webcam canvas
    container.innerHTML = '';
    container.appendChild(webcam.canvas);

    // Set up canvas for drawing
    const canvas = document.getElementById('output');
    canvas.width = 640;
    canvas.height = 480;
    ctx = canvas.getContext('2d');

    console.log('Webcam and canvas set up successfully');
}

function showSettingsPage() {
    // Stop any ongoing recognition
    stopCameraRecognition();

    // Switch pages
    document.getElementById('recognition-page').classList.remove('active');
    document.getElementById('settings-page').classList.add('active');

    console.log('Returned to settings page');
}

async function startCameraRecognition() {
    try {
        console.log('Starting camera recognition...');

        // Get active poses and ensure we have at least one
        getActivePoses();
        if (poseSequence.length === 0) {
            alert('Please select at least one pose to practice.');
            return;
        }

        // Reset state
        isRecognitionRunning = true;
        sequenceIndex = 0;
        lastPoseTime = 0;
        isTransitioning = false;
        confidenceScore = 0;

        // Ensure webcam is properly initialized
        if (!webcam || !model) {
            throw new Error('Webcam or model not initialized');
        }

        await webcam.play();
        updateCurrentPose();
        requestAnimationFrame(loop);

    } catch (error) {
        console.error('Error starting camera recognition:', error);
        alert('Failed to start camera. Please ensure camera permissions are granted.');
        isRecognitionRunning = false;
    }
}

function stopCameraRecognition() {
    console.log('Stopping camera recognition...');

    // Stop webcam properly
    if (webcam) {
        webcam.stop();
    }

    // Clear canvas
    if (ctx) {
        ctx.clearRect(0, 0, 640, 480);
    }

    // Reset all state
    resetRecognitionState();

    console.log('Camera recognition stopped');
}

function updateCurrentPose() {
    if (poseSequence.length === 0) return;

    const currentPoseIndex = poseSequence[sequenceIndex];
    const settings = loadSettings();
    const poseName = settings.poseNames[currentPoseIndex]; // Get the saved pose name
    document.getElementById('pose-name').textContent = `Current Pose: ${poseName}`;

    const poseCompare = document.getElementById('pose-compare');
    const savedImage = poseImages.get(currentPoseIndex);

    if (savedImage) {
        poseCompare.src = savedImage;
        poseCompare.style.display = 'block';
    } else {
        poseCompare.style.display = 'none';
    }

    // Reset pose state
    poseCompare.className = 'pose-compare waiting';
}

async function loop() {
    if (!isRecognitionRunning) return;

    try {
        webcam.update();
        await predict();
        requestAnimationFrame(loop);
    } catch (error) {
        console.error('Error in recognition loop:', error);
        stopCameraRecognition();
    }
}

async function predict() {
    if (!model || !webcam.canvas) return;

    try {
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        const prediction = await model.predict(posenetOutput);

        // Clear canvas
        ctx.clearRect(0, 0, 640, 480);

        // Draw pose if detected
        if (pose) {
            drawPose(pose);
        }

        // Get current pose in sequence
        if (poseSequence.length === 0) return;
        const currentPoseIndex = poseSequence[sequenceIndex];

        // Get current pose prediction
        if (prediction && prediction.length > currentPoseIndex) {
            confidenceScore = prediction[currentPoseIndex].probability;
            updateConfidenceDisplay();

            const settings = loadSettings();
            const threshold = settings.accuracyThreshold;

            if (confidenceScore >= threshold) {
                handleCorrectPose();
            } else {
                resetPoseTimer();
            }
        }

    } catch (error) {
        console.error('Prediction error:', error);
    }
}

function updateConfidenceDisplay() {
    const confidenceBar = document.querySelector('.confidence-bar');
    const confidenceText = document.querySelector('.confidence-text');
    const poseCompare = document.getElementById('pose-compare');

    if (confidenceBar && confidenceText) {
        const percentage = Math.round(confidenceScore * 100);
        confidenceBar.style.width = percentage + '%';
        confidenceText.textContent = `Confidence: ${percentage}%`;

        const settings = loadSettings();
        const threshold = settings.accuracyThreshold;

        if (confidenceScore >= threshold) {
            confidenceBar.classList.add('correct');
            poseCompare.className = 'pose-compare correct';
        } else {
            confidenceBar.classList.remove('correct');
            poseCompare.className = 'pose-compare waiting';
        }
    }
}

function handleCorrectPose() {
    const settings = loadSettings();
    const currentTime = Date.now();

    if (lastPoseTime === 0) {
        lastPoseTime = currentTime;
        showTimer(settings.recognitionDelay);
    }

    const elapsed = (currentTime - lastPoseTime) / 1000;
    const remaining = Math.max(0, settings.recognitionDelay - elapsed);

    if (remaining <= 0) {
        moveToNextPose();
    } else {
        showTimer(Math.ceil(remaining));
    }
}

function resetPoseTimer() {
    lastPoseTime = 0;
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }
}

function showTimer(seconds) {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.textContent = seconds;
        timerDisplay.style.display = 'block';
    }
}

function moveToNextPose() {
    const settings = loadSettings();

    if (settings.audioEnabled) {
        playSuccessSound();
    }

    lastPoseTime = 0;
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }

    // Get the completed pose name before moving to next
    const completedPoseIndex = poseSequence[sequenceIndex];
    const completedPoseName = settings.poseNames[completedPoseIndex];

    // Move to next pose in sequence
    sequenceIndex = (sequenceIndex + 1) % poseSequence.length;
    updateCurrentPose();

    // Show congratulations message without popup
    console.log(`Great! You completed ${completedPoseName}. Now try the next pose!`);
}

function playSuccessSound() {
    try {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.error('Audio not supported or blocked:', error);
    }
}

function drawPose(pose) {
    // Define the skeleton connections (pairs of keypoint indices)
    const connections = [
        [0, 1], [0, 2], [1, 3], [2, 4],
        [5, 6], [5, 7], [6, 8], [7, 9], [8, 10],
        [5, 11], [6, 12], [11, 12],
        [7, 9], [9, 11],
        [8, 10], [10, 12],
        [11, 13], [13, 15],
        [12, 14], [14, 16]
    ];

    // Draw skeleton lines
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 3;

    for (let connection of connections) {
        const [pointA, pointB] = connection;
        const keypointA = pose.keypoints[pointA];
        const keypointB = pose.keypoints[pointB];

        if (keypointA && keypointB && keypointA.score > 0.2 && keypointB.score > 0.2) {
            ctx.beginPath();
            ctx.moveTo(keypointA.position.x, keypointA.position.y);
            ctx.lineTo(keypointB.position.x, keypointB.position.y);
            ctx.stroke();
        }
    }

    // Draw keypoints
    for (let keypoint of pose.keypoints) {
        if (keypoint.score > 0.2) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF6B6B';
            ctx.fill();
        }
    }
}