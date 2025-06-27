const { Octokit } = require("@octokit/rest");

exports.handler = async (event) => {
    console.log("Incoming event:", event);

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const API_SECRET = process.env.API_SECRET;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_USER = process.env.GITHUB_USER;
    const REPO_NAME = process.env.REPO_NAME;

    console.log("Env vars:", { API_SECRET: !!API_SECRET, GITHUB_TOKEN: !!GITHUB_TOKEN, GITHUB_USER, REPO_NAME });

    if (!API_SECRET || !GITHUB_TOKEN || !GITHUB_USER || !REPO_NAME) {
        return {
            statusCode: 500,
            body: "Server misconfiguration: missing environment variables.",
        };
    }

    const headers = event.headers;
    console.log("Headers:", headers);

    if (headers["x-api-secret"] !== API_SECRET) {
        return { statusCode: 403, body: "Forbidden" };
    }

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

    try {
        const { data: existingFile } = await octokit.repos.getContent({
            owner: GITHUB_USER,
            repo: REPO_NAME,
            path: filePath,
        });

        const contentJson = Buffer.from(existingFile.content, "base64").toString("utf-8");
        const submissions = JSON.parse(contentJson);

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
            sha: existingFile.sha,
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