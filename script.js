// === CONFIGURATION VARIABLES ====

const CONFIG = {
    promptsListPath: "prompts.json",
    promptDataFolder: "prompts",
    maxImageDimension: 100,
    defaultImageQuality: 0.5,
    submitEndpoint: "/.netlify/functions/submitImage"
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
    promptTile: "prompt-tile"
}

// ==== USERNAME MANAGEMENT ====

function getOrCreateUsername() {
    let username = localStorage.getItem("eachAllUsername");
    if (!username) {
        username = "user_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("eachAllUsername", username);
    }
    return username;
}

function setUsername(newUsername) {
    localStorage.setItem("eachAllUsername", newUsername);
}

function getUsername() {
    return localStorage.getItem("eachAllUsername");
}

// ==== IMAGE RESIZING & COMPRESSION ====

async function resizeAndCompressImage(file, quality = CONFIG.defaultImageQuality, maxDim = CONFIG.maxImageDimension) {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const scale = Math.min(maxDim / imageBitmap.width, maxDim / imageBitmap.height, 1);
    canvas.width = imageBitmap.width * scale;
    canvas.height = imageBitmap.height * scale;

    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

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

// ==== FORM SUBMISSION HANDLER ====

async function submitImage(promptId, fileInput, captionInput) {
    const file = fileInput.files[0];
    if (!file) {
        alert("Please select an image file.");
        return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        alert("Unsupported image format. Please upload a JPG, PNG, or WebP.");
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const qualityParam = parseFloat(urlParams.get("quality"));
    const quality = !isNaN(qualityParam) && qualityParam >= 0 && qualityParam <= 1 ? qualityParam : CONFIG.defaultImageQuality;

    const maxDimParam = parseInt(urlParams.get("maxDim"));
    const maxDim = !isNaN(maxDimParam) && maxDimParam > 0 ? maxDimParam : CONFIG.maxImageDimension;

    const imageData = await resizeAndCompressImage(file, quality, maxDim);
    const username = document.getElementById(SELECTORS.usernameInput).value.trim() || getOrCreateUsername();
    const caption = captionInput.value;

    const payload = {
        username,
        promptId,
        caption,
        imageData
    };

    try {
        const res = await fetch(CONFIG.submitEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.success) {
            alert("Submission successful! Please check this page in a few minutes to see your submission.");
            fileInput.value = "";
            captionInput.value = "";
            document.getElementById(SELECTORS.filenamePreview).textContent = "";
            const form = document.getElementById(SELECTORS.submissionForm);
            form.reset();
        } else {
            alert("Submission failed. " + (result.error || "Unknown error"));
        }
    } catch (error) {
        console.error("Error submitting image:", error);
        alert("Submission error. Check the console for details.");
    }
}

// ==== PROMPT MODAL HANDLING ====

let currentPromptId = "";

function openPrompt(promptId, seed = Math.floor(Math.random() * 1000000)) {
    currentPromptId = promptId;
    fetch(CONFIG.promptsListPath)
        .then(res => res.json())
        .then(prompts => {
            const promptObj = prompts.find(p => p.id === promptId);
            document.getElementById(SELECTORS.promptText).textContent = promptObj ? `${promptId}: ${promptObj.prompt}` : promptId;
        });

    const modal = document.getElementById(SELECTORS.submissionModal);
    if (modal) {
        modal.classList.add("visible");
    }

    const container = document.getElementById(SELECTORS.submissionsContainer);

    fetch(`${CONFIG.promptDataFolder}/${promptId}.json`)
        .then(res => {
            if (!res.ok) {
                console.warn(`No submission file yet for prompt ${promptId}.`);
                return [];
            }
            return res.json();
        })
        .then(submissions => {
            if (!Array.isArray(submissions) || submissions.length === 0) {
                console.warn(`No submissions found for prompt ${promptId}.`);
                return;
            }

            container.innerHTML = "";

            function seededRandom(seed) {
                var x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            }

            // Group submissions by username
            const grouped = {};
            submissions.forEach((sub) => {
                if (!grouped[sub.username]) grouped[sub.username] = [];
                grouped[sub.username].push(sub);
            });

            const usernames = Object.keys(grouped);

            usernames.forEach((username, i) => {
                const userSubs = grouped[username];
                const randIndex = Math.floor(Math.sin(seed + i) * 10000) % userSubs.length;
                const sub = userSubs[Math.abs(randIndex)];

                const randX = Math.floor(Math.sin(seed + i) * (container.clientWidth - 100)) % (container.clientWidth - 100);
                const randY = Math.floor(Math.sin(seed + i + 1000) * (container.clientHeight - 100)) % (container.clientHeight - 100);

                const wrapper = document.createElement("div");
                wrapper.className = SELECTORS.submissionWrapper;
                wrapper.style.left = `${Math.abs(randX)}px`;
                wrapper.style.top = `${Math.abs(randY)}px`;

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

                // Make wrapper draggable
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
        })
        .catch(err => {
            console.error("Failed to load submissions:", err);
        });
}

function closeModal() {
    document.getElementById(SELECTORS.submissionModal).classList.remove("visible");
    const url = new URL(window.location);
    url.searchParams.delete("prompt");
    url.searchParams.delete("seed");
    window.history.pushState({}, "", url);
    document.getElementById(SELECTORS.imageInput).value = "";
    document.getElementById(SELECTORS.filenamePreview).textContent = "";
}

function handleSubmit() {
    const form = document.getElementById(SELECTORS.submissionForm);
    const fileInput = form.elements[SELECTORS.imageInput];
    const captionInput = form.elements[SELECTORS.captionInput];
    submitImage(currentPromptId, fileInput, captionInput);
}

// ==== PROMPT GRID INITIALIZATION ====

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const promptId = urlParams.get("prompt");
    const seed = urlParams.get("seed");

    if (promptId) {
        openPrompt(promptId, seed ? parseInt(seed) : undefined);
    }

    // Load prompt data
    fetch(CONFIG.promptsListPath)
        .then((res) => res.json())
        .then((prompts) => {
            const grid = document.getElementById(SELECTORS.promptGrid);
            grid.innerHTML = "";
            prompts.forEach((prompt) => {
                const div = document.createElement("div");
                div.className = SELECTORS.promptTile;
                div.textContent = prompt.id;
                div.addEventListener("click", () => {
                    const seed = Math.floor(Math.random() * 1000000);
                    const url = new URL(window.location);
                    url.searchParams.set("prompt", prompt.id);
                    url.searchParams.set("seed", seed);
                    window.history.pushState({}, "", url);
                    openPrompt(prompt.id, seed);
                });
                grid.appendChild(div);
            });
        });

    // Prefill username input and add listener
    const usernameInput = document.getElementById(SELECTORS.usernameInput);
    const savedUsername = getUsername() || getOrCreateUsername();
    usernameInput.value = savedUsername;
    usernameInput.addEventListener("input", () => {
        setUsername(usernameInput.value);
    });

    // Add event listeners for buttons
    document.getElementById(SELECTORS.submissionForm).addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmit();
    });

    document.getElementById(SELECTORS.toggleHeader).addEventListener("click", (e) => {
        e.preventDefault();
        const header = document.getElementById(SELECTORS.modalHeader);
        const isMinimized = header.classList.toggle("minimized");

        const toggleBtn = document.getElementById(SELECTORS.toggleHeader);
        toggleBtn.textContent = isMinimized ? "↓" : "↑";
    });

    document.getElementById(SELECTORS.returnButton).addEventListener("click", closeModal);

    document.getElementById(SELECTORS.randomizeButton).addEventListener("click", () => {
        const url = new URL(window.location);
        const currentPrompt = url.searchParams.get("prompt");
        if (currentPrompt) {
            const newSeed = Math.floor(Math.random() * 1000000);
            url.searchParams.set("seed", newSeed);
            window.history.pushState({}, "", url);
            openPrompt(currentPrompt, newSeed);
        }
    });

    document.getElementById(SELECTORS.aboutButton).addEventListener("click", () => {
        document.getElementById(SELECTORS.aboutModal).classList.add("visible");
    });

    document.getElementById(SELECTORS.aboutClose).addEventListener("click", () => {
        document.getElementById(SELECTORS.aboutModal).classList.remove("visible");
    });

    // Tap-to-toggle captions on mobile (only one visible at a time, tap outside hides)
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

// ==== IMAGE PREVIEW HANDLER ====

document.getElementById(SELECTORS.imageInput).addEventListener("change", (event) => {
    const file = event.target.files[0];
    const previewContainer = document.getElementById(SELECTORS.filenamePreview);
    previewContainer.textContent = file ? file.name : "";
});