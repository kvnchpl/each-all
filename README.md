# EACH ALL - A Collective Image Sharing Project

EACH ALL is a collaborative web project where users respond to creative prompts by submitting images and captions. Submissions are displayed in a playful, randomized layout for each prompt.

---

## Features

- **Prompt-based image submissions**  
- **Client-side image resizing and compression**  
- **Randomized, non-linear display of submissions**  
- **GitHub-backed storage via Netlify Functions**  
- **No login required—usernames are generated and stored locally**  

---

## Live Demo

[https://each-all.netlify.app](https://each-all.netlify.app)

---

## Project Structure

- `index.html` – Main web page
- `script.js` – Frontend logic (UI, image handling, API calls)
- `style.css` – Styles
- `prompts.json` – List of prompts
- `prompts/` – Submission data per prompt (JSON)
- `netlify/functions/submitImage.js` – Netlify Function for saving submissions to GitHub

---

## Credits

Created by [kvnchpl](https://kvnchpl.com)