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

async function resizeAndCompressImage(file, quality = 0.5, maxDim = 200) {
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

    const urlParams = new URLSearchParams(window.location.search);
    const qualityParam = parseFloat(urlParams.get("quality"));
    const quality = !isNaN(qualityParam) && qualityParam >= 0 && qualityParam <= 1 ? qualityParam : 0.5;

    const maxDimParam = parseInt(urlParams.get("maxDim"));
    const maxDim = !isNaN(maxDimParam) && maxDimParam > 0 ? maxDimParam : 200;

    const imageData = await resizeAndCompressImage(file, quality, maxDim);
    const username = document.getElementById("username-input").value.trim() || getOrCreateUsername();
    const caption = captionInput.value;

    const payload = {
        username,
        promptId,
        caption,
        imageData
    };

    try {
        const res = await fetch("/.netlify/functions/submitImage", {
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
            document.getElementById("filename-preview").textContent = "";
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
    fetch("prompts.json")
        .then(res => res.json())
        .then(prompts => {
            const promptObj = prompts.find(p => p.id === promptId);
            document.getElementById("prompt-text").textContent = promptObj ? `${promptId}: ${promptObj.prompt}` : promptId;
        });

    const modal = document.getElementById("submission-modal");
    if (modal) {
        modal.style.display = "flex";
    }

    const container = document.getElementById("submissions-container");
    console.log("Loading submissions...");

    fetch(`prompts/${promptId}.json`)
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
                wrapper.className = "submission-wrapper";
                wrapper.style.left = `${Math.abs(randX)}px`;
                wrapper.style.top = `${Math.abs(randY)}px`;

                const img = document.createElement("img");
                img.src = sub.imageData;
                img.alt = sub.caption || "User submission";

                const caption = document.createElement("div");
                caption.className = "caption";
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
            });
        })
        .catch(err => {
            console.error("Failed to load submissions:", err);
        });
}

function closeModal() {
    document.getElementById("submission-modal").style.display = "none";
    const url = new URL(window.location);
    url.searchParams.delete("prompt");
    url.searchParams.delete("seed");
    window.history.pushState({}, "", url);
    document.getElementById("image-input").value = "";
    document.getElementById("filename-preview").textContent = "";
}

function handleSubmit() {
    const form = document.getElementById("submission-form");
    const fileInput = form.elements["image-input"];
    const captionInput = form.elements["caption-input"];
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
    fetch("prompts.json")
        .then((res) => res.json())
        .then((prompts) => {
            const grid = document.getElementById("prompt-grid");
            grid.innerHTML = "";
            prompts.forEach((prompt) => {
                const div = document.createElement("div");
                div.className = "prompt-tile";
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
    const usernameInput = document.getElementById("username-input");
    const savedUsername = getUsername() || getOrCreateUsername();
    usernameInput.value = savedUsername;
    usernameInput.addEventListener("input", () => {
        setUsername(usernameInput.value);
    });

    // Add event listeners for buttons
    document.getElementById("submission-form").addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmit();
    });

    document.getElementById("return-button").addEventListener("click", closeModal);

    document.getElementById("randomize-button").addEventListener("click", () => {
        const url = new URL(window.location);
        const currentPrompt = url.searchParams.get("prompt");
        if (currentPrompt) {
            const newSeed = Math.floor(Math.random() * 1000000);
            url.searchParams.set("seed", newSeed);
            window.history.pushState({}, "", url);
            openPrompt(currentPrompt, newSeed);
        }
    });

    document.getElementById("about-button").addEventListener("click", () => {
        document.getElementById("about-modal").style.display = "flex";
    });

    document.getElementById("about-close").addEventListener("click", () => {
        document.getElementById("about-modal").style.display = "none";
    });

    // Tap-to-toggle captions on mobile (only one visible at a time, tap outside hides)
    if (window.innerWidth <= 768) {
        let currentlyVisibleCaption = null;

        document.querySelectorAll(".submission-wrapper").forEach(wrapper => {
            wrapper.addEventListener("click", (event) => {
                event.stopPropagation(); // Prevent the global click from triggering
                const caption = wrapper.querySelector(".caption");
                if (!caption) return;

                // Hide the currently visible caption if it's different
                if (currentlyVisibleCaption && currentlyVisibleCaption !== caption) {
                    currentlyVisibleCaption.style.visibility = "hidden";
                    currentlyVisibleCaption.style.opacity = "0";
                }

                const isVisible = caption.style.visibility === "visible";
                caption.style.visibility = isVisible ? "hidden" : "visible";
                caption.style.opacity = isVisible ? "0" : "1";

                currentlyVisibleCaption = isVisible ? null : caption;
            });
        });

        // Hide caption if tapping anywhere else
        document.addEventListener("click", () => {
            if (currentlyVisibleCaption) {
                currentlyVisibleCaption.style.visibility = "hidden";
                currentlyVisibleCaption.style.opacity = "0";
                currentlyVisibleCaption = null;
            }
        });
    }
});

// ==== IMAGE PREVIEW HANDLER ====

document.getElementById("image-input").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const previewContainer = document.getElementById("filename-preview");
    previewContainer.textContent = file ? file.name : "";
});