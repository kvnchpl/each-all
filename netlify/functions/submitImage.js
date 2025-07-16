// submitImage.js
//
// Netlify function to handle image submissions to a GitHub repo.
// Parses POST request, validates fields, updates GitHub file, and sends notification email.

// Dynamically import Octokit (GitHub API client)
let Octokit;
(async () => {
    const mod = await import("@octokit/rest");
    Octokit = mod.Octokit;
})();

// Netlify Lambda handler function
exports.handler = async (event) => {
    while (!Octokit) {
        await new Promise((res) => setTimeout(res, 10));
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_USER = process.env.GITHUB_USER;
    const REPO_NAME = process.env.REPO_NAME;

    console.log("Incoming event:", event);

    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: "Method Not Allowed"
        };
    }

    const headers = event.headers;

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        console.error("JSON parse error:", e);
        return {
            statusCode: 400,
            body: "Malformed JSON body."
        };
    }

    // Validate environment variables
    if (!GITHUB_TOKEN || !GITHUB_USER || !REPO_NAME) {
        return {
            statusCode: 500,
            body: "Server misconfiguration: missing environment variables.",
        };
    }

    // Extract submission data from request
    const {
        username,
        promptId,
        caption,
        imageData,
        seed
    } = body;

    if (!username || !promptId || !imageData) {
        return {
            statusCode: 400,
            body: "Missing required fields"
        };
    }

    // Initialize Octokit with authentication
    const octokit = new Octokit({
        auth: GITHUB_TOKEN
    });
    const filePath = `prompts/${promptId}.json`;

    let submissions = [];
    let sha = undefined;

    // Try to load existing submissions file from GitHub
    try {
        const {
            data: existingFile
        } = await octokit.repos.getContent({
            owner: GITHUB_USER,
            repo: REPO_NAME,
            path: filePath,
        });

        const contentJson = Buffer.from(existingFile.content, "base64").toString("utf-8");
        submissions = JSON.parse(contentJson);
        sha = existingFile.sha;
    } catch (error) {
        if (error.status === 404) {
            // File does not exist yet — start with an empty array
            submissions = [];
        } else {
            console.error("Error retrieving prompt file:", error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: error.message || "Failed to retrieve prompt file."
                }),
            };
        }
    }

    try {
        // Create new submission object
        const newSubmission = {
            username,
            caption: caption || "",
            timestamp: new Date().toISOString(),
            imageData,
            seed,
        };

        // Send a notification email about the new submission
        try {
            const {
                Resend
            } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);

            const submittedAt = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York",
                dateStyle: "full",
                timeStyle: "short",
            }).format(new Date()).toLowerCase();

            await resend.emails.send({
                from: process.env.FROM_EMAIL || 'no-reply@resend.dev',
                to: process.env.NOTIFY_EMAIL,
                subject: `EACH ALL: new submission to prompt ${promptId}`,
                html: `
  <p><strong>${username}</strong> submitted an image to prompt 
     <strong><a href="https://each-all.netlify.app/?prompt=${promptId}&seed=${seed}" target="_blank" rel="noopener noreferrer">${promptId}</a></strong>.
  </p>
  ${caption ? `<p>caption: ${caption}</p>` : ""}
  <p>submitted at: ${submittedAt}</p>
  <p><strong>Submitted image:</strong></p>
  <img src="${imageData}" alt="Submitted image by ${username}" style="max-width:200px; height:auto; border:1px solid #ccc;"/>
`,
            });
        } catch (emailError) {
            console.error("Failed to send notification email:", emailError);
        }

        // Add new submission to the array
        submissions.push(newSubmission);

        // Encode updated submissions to base64 and prepare commit
        const updatedContent = Buffer.from(JSON.stringify(submissions, null, 2)).toString("base64");

        const commitMessage = `Add submission by ${username} to prompt ${promptId}`;

        // Commit updated file to GitHub
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_USER,
            repo: REPO_NAME,
            path: filePath,
            message: commitMessage,
            content: updatedContent,
            ...(sha && {
                sha
            }), // only include 'sha' if it exists
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: "Submission saved."
            }),
        };
    } catch (error) {
        console.error("Error updating prompt file:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message || "Failed to update submission."
            }),
        };
    }
};