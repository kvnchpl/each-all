let Octokit;
(async () => {
    const mod = await import("@octokit/rest");
    Octokit = mod.Octokit;
})();

exports.handler = async (event) => {
    while (!Octokit) {
        await new Promise((res) => setTimeout(res, 10));
    }

    console.log("Incoming event:", event);

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_USER = process.env.GITHUB_USER;
    const REPO_NAME = process.env.REPO_NAME;

    if (!GITHUB_TOKEN || !GITHUB_USER || !REPO_NAME) {
        return {
            statusCode: 500,
            body: "Server misconfiguration: missing environment variables.",
        };
    }

    const headers = event.headers;
    console.log("Headers:", headers);

    let body;
    try {
        body = JSON.parse(event.body || "{}");
    } catch (e) {
        console.error("JSON parse error:", e);
        return { statusCode: 400, body: "Malformed JSON body." };
    }

    const { username, promptId, caption, imageData } = body;

    if (!username || !promptId || !imageData) {
        return { statusCode: 400, body: "Missing required fields" };
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const filePath = `prompts/${promptId}.json`;

    let submissions = [];
    let sha = undefined;

    try {
        const { data: existingFile } = await octokit.repos.getContent({
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
                body: JSON.stringify({ error: error.message || "Failed to retrieve prompt file." }),
            };
        }
    }

    try {
        const newSubmission = {
            username,
            caption: caption || "",
            timestamp: new Date().toISOString(),
            imageData,
        };

        submissions.push(newSubmission);

        const updatedContent = Buffer.from(JSON.stringify(submissions, null, 2)).toString("base64");

        const commitMessage = `Add submission by ${username} to prompt ${promptId}`;

        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_USER,
            repo: REPO_NAME,
            path: filePath,
            message: commitMessage,
            content: updatedContent,
            ...(sha && { sha }), // only include 'sha' if it exists
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: "Submission saved." }),
        };
    } catch (error) {
        console.error("Error updating prompt file:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || "Failed to update submission." }),
        };
    }
};