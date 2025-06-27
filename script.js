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

async function resizeAndCompressImage(file) {
    const maxDim = 200;

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
            0.7 // compression quality (can be tuned)
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

    const imageData = await resizeAndCompressImage(file);
    const username = getUsername() || getOrCreateUsername();
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
            alert("Submission successful!");
            fileInput.value = "";
            captionInput.value = "";
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
    document.getElementById("seed-display").textContent = `Seed: ${seed}`;

    currentPromptId = promptId;
    fetch("prompts.json")
        .then(res => res.json())
        .then(prompts => {
            const promptObj = prompts.find(p => p.id === promptId);
            document.getElementById("prompt-text").textContent = promptObj ? promptObj.text : `Prompt ${promptId}`;
        });

    const modal = document.getElementById("submission-modal");
    if (modal) {
        modal.style.display = "block";
    }

    const container = document.getElementById("submissions-container");
    container.innerHTML = "Loading submissions...";

    fetch(`prompts/${promptId}.json`)
        .then(res => res.json())
        .then(submissions => {
            if (!Array.isArray(submissions) || submissions.length === 0) {
                container.innerHTML = "<p>No submissions yet.</p>";
                return;
            }

            container.innerHTML = "";
            container.style.position = "relative";
            container.style.height = "400px"; // or any fixed height

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
                caption.textContent = `${sub.username}: ${sub.caption || "No caption"}`;

                wrapper.appendChild(img);
                wrapper.appendChild(caption);
                container.appendChild(wrapper);
            });
        })
        .catch(err => {
            console.error("Failed to load submissions:", err);
            container.innerHTML = "<p>Error loading submissions.</p>";
        });
}

function closeModal() {
    document.getElementById("submission-modal").style.display = "none";
    const url = new URL(window.location);
    url.searchParams.delete("prompt");
    url.searchParams.delete("seed");
    window.history.pushState({}, "", url);
}

function handleSubmit() {
    const fileInput = document.getElementById("image-input");
    const captionInput = document.getElementById("caption-input");
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
            grid.innerHTML = ""; // Clear placeholder content
            prompts.forEach((prompt) => {
                const button = document.createElement("button");
                button.textContent = `Prompt ${prompt.id}`;
                button.addEventListener("click", () => {
                    const seed = Math.floor(Math.random() * 1000000);
                    const url = new URL(window.location);
                    url.searchParams.set("prompt", prompt.id);
                    url.searchParams.set("seed", seed);
                    window.history.pushState({}, "", url);
                    openPrompt(prompt.id, seed);
                });
                grid.appendChild(button);
            });
        });

    // Attach modal control button listeners
    document.getElementById("submit-button").addEventListener("click", handleSubmit);
    document.getElementById("cancel-button").addEventListener("click", closeModal);
});