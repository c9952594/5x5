# 5x5 Workout Tracker

A simple, offline-capable Progressive Web App for tracking 5x5 strength training workouts.

## Features

- 📱 Works offline as a PWA
- 💾 Data stored in browser localStorage
- 📤 Export/Import your data as JSON
- 🏋️ Custom plate calculations for 8.5kg bar
- 📊 Workout history tracking
- ⚡ Zero dependencies, pure HTML/CSS/JS

## Exercises

**Workout A:**
- Squat 5x5
- Bench Press 5x5
- Barbell Row 5x5

**Workout B:**
- Squat 5x5
- Overhead Press 5x5
- Deadlift 1x5

## Usage

1. Click "New Workout"
2. Select Workout A or B
3. Adjust weights as needed (defaults to last successful + 2.5kg)
4. Check off completed sets
5. View plate loading recommendations
6. Save workout

## Deployment

This is designed to be hosted on GitHub Pages at `5x5.craignorton.me`.

### Setup:
1. Push to GitHub
2. Enable GitHub Pages in repo settings
3. Add CNAME DNS record: `5x5.craignorton.me` → `<username>.github.io`
4. Wait for SSL to provision

## Local Development

Just open `index.html` in a browser. No build step required.

## Backup

Use the "Export Data" button regularly to backup your workout history as JSON.
