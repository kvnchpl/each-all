// script.js
//
// Main script for EACH ALL project.
// Handles image submission, prompt management, and UI interactions.
// This script is designed to work in tandem with a Netlify backend (submitImage.js) for image submission. 

// ==== CONFIGURATION VARIABLES ====

const CONFIG = {
    promptsListPath: "prompts.json",
    promptDataFolder: "prompts",
    maxImageDimension: 100,
    defaultImageQuality: 0.5,
    submitEndpoint: "/.netlify/functions/submitImage",
    positionVariance: 10000,
    seedOffsetX: 0,
    seedOffsetY: 2731,
    seedOffsetZ: 9649,
    maxZIndex: 100,
    seedMax: 1000000
};

const SELECTORS = {
    modalHeader: "modal-header",
    submissionModal: "submission-modal",
    submissionsContainer: "submissions-container",
    submissionWrapper: "submission-wrapper",
    submissionForm: "submission-form",
    usernameInput: "username-input",
    imageInput: "image-input",
    captionInput: "caption-input",
    filenamePreview: "filename-preview",
    submitButton: "submit-button",
    toggleHeader: "toggle-header",
    returnButton: "return-button",
    randomizeButton: "randomize-button",
    promptGrid: "prompt-grid",
    promptText: "prompt-text",
    aboutButton: "about-button",
    aboutModal: "about-modal",
    aboutClose: "about-close",
    caption: "caption",
    promptTile: "interactive-tile",
    sortPopularButton: "sort-popular-button",
    sortIdButton: "sort-id-button"
}

// ==== STATE VARIABLES ====

let currentPromptId = "";
let currentPrompts = [];
let cachedSubmissions = {};
const sortDefaults = {
    id: "ascending",
    popular: "descending"
};
let sortDirections = {
    id: "ascending",
    popular: "descending"
};
let sortIndicators = {};
let lastSortKey = null;

// ==== USERNAME MANAGEMENT ====

// Generate a random username and save it if none exists
function getOrCreateUsername() {
    let username = localStorage.getItem("eachAllUsername");
    if (!username) {
        username = "user_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("eachAllUsername", username);
    }
    return username;
}

// Set the username in localStorage
function setUsername(newUsername) {
    localStorage.setItem("eachAllUsername", newUsername);
}

// Retrieve the username from localStorage
function getUsername() {
    return localStorage.getItem("eachAllUsername");
}

// ==== POPULARITY SORT HELPER ====

// Fetch the submission counts for each prompt for popularity sorting
async function getPromptSubmissionCounts(prompts) {
    const counts = await Promise.all(prompts.map(async (prompt) => {
        try {
            const res = await fetch(`${CONFIG.promptDataFolder}/${prompt.id}.json`);
            if (!res.ok) return {
                id: prompt.id,
                count: 0
            };
            const data = await res.json();

            // Count number of submissions if data is array
            return {
                id: prompt.id,
                count: Array.isArray(data) ? data.length : 0
            };
        } catch {
            return {
                id: prompt.id,
                count: 0
            };
        }
    }));
    return counts;
}

// ==== IMAGE RESIZING & COMPRESSION ====

// Resize and compress the uploaded image file, returning a DataURL
async function resizeAndCompressImage(file, quality = CONFIG.defaultImageQuality, maxDim = CONFIG.maxImageDimension) {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Calculate scale to fit within maxDim
    const scale = Math.min(maxDim / imageBitmap.width, maxDim / imageBitmap.height, 1);
    canvas.width = imageBitmap.width * scale;
    canvas.height = imageBitmap.height * scale;

    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

    // Convert canvas to DataURL asynchronously
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            },
            "image/jpeg",
            quality
        );
    });
}

// ==== IMAGE SUBMISSION HANDLING ====

// Handle image form submission: validate, compress, and send to backend
async function submitImage(promptId, fileInput, captionInput) {
    const file = fileInput.files[0];
    if (!file) {
        alert("oops! you need to choose an image file before submitting.");
        return;
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        alert("that file format isn’t supported. try uploading a jpg, png, or webp image.");
        return;
    }

    // Parse optional quality and dimension params from URL
    const urlParams = new URLSearchParams(window.location.search);
    const qualityParam = parseFloat(urlParams.get("quality"));
    const quality = !isNaN(qualityParam) && qualityParam >= 0 && qualityParam <= 1 ? qualityParam : CONFIG.defaultImageQuality;

    const maxDimParam = parseInt(urlParams.get("maxDim"));
    const maxDim = !isNaN(maxDimParam) && maxDimParam > 0 ? maxDimParam : CONFIG.maxImageDimension;

    // Disable the submit button before starting submission
    const submitBtn = document.getElementById(SELECTORS.submitButton);
    submitBtn.disabled = true;

    try {
        // Resize and compress image
        const imageData = await resizeAndCompressImage(file, quality, maxDim);
        const username = document.getElementById(SELECTORS.usernameInput).value.trim();
        if (!username) {
            alert("hey! make sure to add a username (can be a pseudonym of course).");
            document.getElementById(SELECTORS.usernameInput).focus();
            return;
        }
        const caption = captionInput.value;

        // Prepare payload for submission
        const payload = {
            username,
            promptId,
            caption,
            imageData
        };

        const res = await fetch(CONFIG.submitEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.success) {
            alert("thanks for sharing! your image has been submitted. check back in a minute or so to see it live.");

            // Reset form after successful submission
            fileInput.value = "";
            captionInput.value = "";
            document.getElementById(SELECTORS.filenamePreview).textContent = "";
            const form = document.getElementById(SELECTORS.submissionForm);
            form.reset();
        } else {
            alert("uh oh... something went wrong with your submission. " + (result.error || "please try again later."));
        }
    } catch (error) {
        console.error("Error submitting image:", error);
        alert("something went wrong while submitting. you can try peeking at the console for details, or try again in a bit.");
    } finally {
        // Re-enable the submit button after operation completes
        submitBtn.disabled = false;
    }
}

// Wrapper for form submission event
function handleSubmit() {
    const form = document.getElementById(SELECTORS.submissionForm);
    const fileInput = form.elements[SELECTORS.imageInput];
    const captionInput = form.elements[SELECTORS.captionInput];
    submitImage(currentPromptId, fileInput, captionInput);
}

// ==== PROMPT MODAL HANDLING ====

// Open the submission modal for a prompt and display its submissions
function openPrompt(promptId, seed = Math.floor(Math.random() * CONFIG.seedMax), skipFetch = false) {
    currentPromptId = promptId;

    // Fetch and display prompt text
    if (!skipFetch) {
        fetch(CONFIG.promptsListPath)
            .then(res => res.json())
            .then(prompts => {
                const promptObj = prompts.find(p => p.id === promptId);
                document.getElementById(SELECTORS.promptText).textContent = promptObj ? `${promptId}: ${promptObj.prompt}` : promptId;
            });
    } else {
        // Use currentPrompts if skipping fetch
        const promptObj = currentPrompts.find(p => p.id === promptId);
        document.getElementById(SELECTORS.promptText).textContent = promptObj ? `${promptId}: ${promptObj.prompt}` : promptId;
    }

    const modal = document.getElementById(SELECTORS.submissionModal);
    if (modal) {
        modal.classList.add("visible");
    }

    const container = document.getElementById(SELECTORS.submissionsContainer);
    container.innerHTML = "";

    // Fetch and display submissions for the prompt
    if (!skipFetch) {
        fetch(`${CONFIG.promptDataFolder}/${promptId}.json`)
            .then(res => {
                if (!res.ok) {
                    console.warn(`No submission file yet for prompt ${promptId}.`);
                    return null;
                }
                return res.json();
            })
            .then(submissions => {
                if (submissions === null) return;
                if (!Array.isArray(submissions) || submissions.length === 0) {
                    console.warn(`No submissions found for prompt ${promptId}.`);
                    container.innerHTML = "<div>no submissions yet — be the first to add one!</div>";
                    return;
                }
                cachedSubmissions[promptId] = submissions;
                renderSubmissions(submissions, promptId, seed);
            })
            .catch(err => {
                console.error("Failed to load submissions:", err);
            });
    } else {
        const cached = cachedSubmissions[promptId];
        if (Array.isArray(cached)) {
            renderSubmissions(cached, promptId, seed);
        } else {
            console.warn(`No cached submissions available for prompt ${promptId}.`);
        }
    }
}

function renderSubmissions(submissions, promptId, seed) {
    const container = document.getElementById(SELECTORS.submissionsContainer);
    container.innerHTML = "";

    // Group submissions by username
    const grouped = {};
    submissions.forEach((sub) => {
        if (!grouped[sub.username]) grouped[sub.username] = [];
        grouped[sub.username].push(sub);
    });

    const usernames = Object.keys(grouped);

    usernames.forEach((username, i) => {
        const userSubs = grouped[username];

        // Deterministically select a submission per user
        const randIndex = Math.floor(Math.sin(seed + i) * CONFIG.positionVariance) % userSubs.length;
        const sub = userSubs[Math.abs(randIndex)];

        // Randomize position for each submission
        const randX = Math.floor(Math.sin(seed + i + CONFIG.seedOffsetX) * (container.clientWidth - CONFIG.maxImageDimension)) % (container.clientWidth - CONFIG.maxImageDimension);
        const randY = Math.floor(Math.sin(seed + i + CONFIG.seedOffsetY) * (container.clientHeight - CONFIG.maxImageDimension)) % (container.clientHeight - CONFIG.maxImageDimension);

        const wrapper = document.createElement("div");
        wrapper.className = SELECTORS.submissionWrapper;
        wrapper.style.left = `${Math.abs(randX)}px`;
        wrapper.style.top = `${Math.abs(randY)}px`;
        wrapper.style.zIndex = Math.abs(Math.floor(Math.sin(seed + i + CONFIG.seedOffsetZ) * CONFIG.positionVariance)) % CONFIG.maxZIndex;

        const img = document.createElement("img");
        img.src = sub.imageData;
        img.ondragstart = () => false;
        img.alt = sub.caption || sub.username || "User submission";

        const caption = document.createElement("div");
        caption.className = SELECTORS.caption;
        caption.textContent = sub.caption ? `${sub.username}: ${sub.caption}` : sub.username;

        // Set caption alignment and position based on image position
        const containerMidpoint = container.clientWidth / 2;
        const wrapperX = Math.abs(randX);
        if (wrapperX < containerMidpoint) {
            caption.classList.add("caption-left");
        } else {
            caption.classList.add("caption-right");
        }

        wrapper.appendChild(img);
        wrapper.appendChild(caption);
        container.appendChild(wrapper);

        // Make wrapper draggable (mouse)
        let offsetX, offsetY;

        wrapper.addEventListener("mousedown", (e) => {
            offsetX = e.clientX - wrapper.offsetLeft;
            offsetY = e.clientY - wrapper.offsetTop;

            function onMouseMove(e) {
                wrapper.style.left = `${e.clientX - offsetX}px`;
                wrapper.style.top = `${e.clientY - offsetY}px`;
            }

            function onMouseUp() {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        // Make wrapper draggable (touch)
        wrapper.addEventListener("touchstart", (e) => {
            const touch = e.touches[0];
            offsetX = touch.clientX - wrapper.offsetLeft;
            offsetY = touch.clientY - wrapper.offsetTop;

            function onTouchMove(e) {
                const touch = e.touches[0];
                wrapper.style.left = `${touch.clientX - offsetX}px`;
                wrapper.style.top = `${touch.clientY - offsetY}px`;
            }

            function onTouchEnd() {
                document.removeEventListener("touchmove", onTouchMove);
                document.removeEventListener("touchend", onTouchEnd);
            }

            document.addEventListener("touchmove", onTouchMove);
            document.addEventListener("touchend", onTouchEnd);
        });
    });
}

// Close the submission modal and reset form state
function closeModal() {
    document.getElementById(SELECTORS.submissionModal).classList.remove("visible");
    const url = new URL(window.location);
    url.searchParams.delete("prompt");
    url.searchParams.delete("seed");
    window.history.pushState({}, "", url);
    document.getElementById(SELECTORS.imageInput).value = "";
    document.getElementById(SELECTORS.filenamePreview).textContent = "";
}

// Toggle the modal header between minimized and expanded
function handleToggleHeader(e) {
    e.preventDefault();
    const header = document.getElementById(SELECTORS.modalHeader);
    const isMinimized = header.classList.toggle("minimized");
    const toggleBtn = document.getElementById(SELECTORS.toggleHeader);
    toggleBtn.textContent = isMinimized ? "↓" : "↑";
}

// Randomize the seed for current prompt and reload modal
function handleRandomizeSeed() {
    const url = new URL(window.location);
    const currentPrompt = url.searchParams.get("prompt");
    if (currentPrompt) {
        const newSeed = Math.floor(Math.random() * CONFIG.seedMax);
        url.searchParams.set("seed", newSeed);
        window.history.pushState({}, "", url);
        openPrompt(currentPrompt, newSeed, true);
    }
}

// ==== PROMPT GRID INITIALIZATION ====

// Render prompt tiles in the grid
function renderPromptTiles(promptArray) {
    const grid = document.getElementById(SELECTORS.promptGrid);
    grid.innerHTML = "";
    promptArray.forEach((prompt) => {
        const div = document.createElement("div");
        div.className = SELECTORS.promptTile;
        div.textContent = prompt.id;

        // Clicking a tile opens the prompt modal for that prompt
        div.addEventListener("click", () => {
            const seed = Math.floor(Math.random() * CONFIG.seedMax);
            const url = new URL(window.location);
            url.searchParams.set("prompt", prompt.id);
            url.searchParams.set("seed", seed);
            window.history.pushState({}, "", url);
            openPrompt(prompt.id, seed);
        });
        grid.appendChild(div);
    });
}

// Update sort indicator arrows on sort buttons
function updateSortIndicators(activeKey) {
    Object.keys(sortIndicators).forEach(key => {
        const btn = sortIndicators[key];
        const isDefault = sortDirections[key] === sortDefaults[key];
        if (key === activeKey) {
            btn.textContent = key === "popular" ? "Popular" : "ID";
            btn.textContent += isDefault ? " ↑" : " ↓";
        } else {
            btn.textContent = key === "popular" ? "Popular" : "ID";
        }
    });
}

// Sort prompts by popularity and re-render tiles
async function handleSortByPopularity() {
    if (lastSortKey !== "popular") {
        sortDirections.popular = sortDefaults.popular;
    } else {
        sortDirections.popular = sortDirections.popular === "ascending" ? "descending" : "ascending";
    }
    lastSortKey = "popular";

    const counts = await getPromptSubmissionCounts(currentPrompts);
    const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]));

    const sorted = currentPrompts.slice().sort((a, b) => {
        const diff = (countMap[b.id] || 0) - (countMap[a.id] || 0);
        return sortDirections.popular === "descending" ? diff : -diff;
    });

    updateSortIndicators("popular");
    renderPromptTiles(sorted);
}

// Sort prompts by ID and re-render tiles
function handleSortById() {
    if (lastSortKey !== "id") {
        sortDirections.id = sortDefaults.id;
    } else {
        sortDirections.id = sortDirections.id === "ascending" ? "descending" : "ascending";
    }
    lastSortKey = "id";

    const sorted = currentPrompts.slice().sort((a, b) => {
        return sortDirections.id === "ascending" ?
            a.id.localeCompare(b.id) :
            b.id.localeCompare(a.id);
    });

    updateSortIndicators("id");
    renderPromptTiles(sorted);
}

// ==== INITIALIZATION ====

// Main page initialization logic
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const promptId = urlParams.get("prompt");
    const seed = urlParams.get("seed");
    if (promptId) {
        // Open prompt modal if prompt param is present
        openPrompt(promptId, seed ? parseInt(seed) : undefined);
    }

    // Load prompt data and initialize grid
    fetch(CONFIG.promptsListPath)
        .then((res) => res.json())
        .then((prompts) => {
            currentPrompts = prompts.slice();
            sortIndicators = {
                popular: document.getElementById(SELECTORS.sortPopularButton),
                id: document.getElementById(SELECTORS.sortIdButton)
            };
            handleSortById(); // Activate default sort by ID ascending
        });

    // Prefill username input and save changes
    const usernameInput = document.getElementById(SELECTORS.usernameInput);
    const savedUsername = getUsername() || getOrCreateUsername();
    usernameInput.value = savedUsername;
    usernameInput.addEventListener("input", () => {
        setUsername(usernameInput.value);
    });

    // ==== EVENT LISTENERS ====

    // Handle image submission form
    document.getElementById(SELECTORS.submissionForm).addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmit();
    });

    // Toggle header collapse/expand
    document.getElementById(SELECTORS.toggleHeader).addEventListener("click", handleToggleHeader);

    // Close the prompt modal
    document.getElementById(SELECTORS.returnButton).addEventListener("click", closeModal);

    // Randomize the seed for current prompt view
    document.getElementById(SELECTORS.randomizeButton).addEventListener("click", handleRandomizeSeed);

    // Sort prompts by popularity
    document.getElementById(SELECTORS.sortPopularButton).addEventListener("click", handleSortByPopularity);

    // Sort prompts by ID
    document.getElementById(SELECTORS.sortIdButton).addEventListener("click", handleSortById);

    // Open About modal
    document.getElementById(SELECTORS.aboutButton).addEventListener("click", () => {
        document.getElementById(SELECTORS.aboutModal).classList.add("visible");
    });

    // Close About modal
    document.getElementById(SELECTORS.aboutClose).addEventListener("click", () => {
        document.getElementById(SELECTORS.aboutModal).classList.remove("visible");
    });

    // Show selected file name in preview
    document.getElementById(SELECTORS.imageInput).addEventListener("change", (event) => {
        const file = event.target.files[0];
        const previewContainer = document.getElementById(SELECTORS.filenamePreview);
        previewContainer.textContent = file ? file.name : "";
    });

    // Tap-to-toggle captions on mobile: only one visible at a time, tap outside hides
    if (window.innerWidth <= 768) {
        let currentlyVisibleCaption = null;
        document.querySelectorAll("." + SELECTORS.submissionWrapper).forEach(wrapper => {
            wrapper.addEventListener("click", (event) => {
                event.stopPropagation(); // Prevent the global click from triggering
                const caption = wrapper.querySelector("." + SELECTORS.caption);
                if (!caption) return;

                // Hide the currently visible caption if it's different
                if (currentlyVisibleCaption && currentlyVisibleCaption !== caption) {
                    currentlyVisibleCaption.classList.remove("caption-visible");
                    currentlyVisibleCaption.classList.add("caption-hidden");
                }
                const isVisible = caption.classList.contains("caption-visible");
                caption.classList.toggle("caption-visible", !isVisible);
                caption.classList.toggle("caption-hidden", isVisible);
                currentlyVisibleCaption = isVisible ? null : caption;
            });
        });

        // Hide caption if tapping anywhere else
        document.addEventListener("click", () => {
            if (currentlyVisibleCaption) {
                currentlyVisibleCaption.classList.remove("caption-visible");
                currentlyVisibleCaption.classList.add("caption-hidden");
                currentlyVisibleCaption = null;
            }
        });
    }
});