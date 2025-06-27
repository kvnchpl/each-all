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
                "Content-Type": "application/json",
                "x-api-secret": "your-shared-secret" // Replace with a secure injected value
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