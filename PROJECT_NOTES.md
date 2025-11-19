# 5x5 Workout Tracker - Project Summary

## Decision Making Process

### Initial Requirements
- Need to track 5x5 workout program (Stronglifts-style)
- Commercial apps too expensive for simple needs
- Google Sheets good for data but poor mobile experience
- Custom requirement: 8.5kg bar (not standard 20kg Olympic bar)
- Need automated plate loading calculations

### Technology Choices Discussed

**Storage Options:**
1. ❌ **Hosted website with database** - Too expensive
2. ❌ **Google Drive API integration** - Medium-hard complexity (2-3 days work), OAuth overhead, token management
3. ✅ **localStorage + JSON export/import** - Simple, free, 90% of benefits with 10% of complexity

**Hosting Options:**
1. ✅ **GitHub Pages** (CHOSEN) - Free, simple, includes SSL, perfect for static files
2. ⚠️ **Cloudflare Pages** - Also free and fast, but GitHub Pages sufficient
3. ⚠️ **AWS S3 + CloudFront** - $0.50-2/month, more complex, unnecessary cost
4. ⚠️ **Netlify/Vercel** - Overkill for single HTML file

**Technology Stack:**
- ✅ **Vanilla HTML/CSS/JavaScript** - No frameworks needed, no build tools, simple maintenance
- Progressive Web App (PWA) - Installable on mobile
- localStorage for data persistence
- JSON export/import for backups

### DNS Setup
- Subdomain only: `5x5.craignorton.me`
- Main domain `craignorton.me` unaffected
- CNAME record: `5x5` → `<username>.github.io`
- GitHub handles SSL automatically

## Project Structure

```
5x5-workout/
├── index.html          # Main HTML structure
├── app.js              # Application logic
├── styles.css          # Styling
├── manifest.json       # PWA configuration
├── service-worker.js   # Offline support
├── CNAME              # GitHub Pages custom domain
├── .gitignore         # Git ignores
└── README.md          # Documentation
```

## Features Implemented

### Core Functionality
- ✅ Track Workout A (Squat, Bench, Row - 5x5 each)
- ✅ Track Workout B (Squat, OHP 5x5, Deadlift 1x5)
- ✅ Custom plate calculations for 8.5kg bar
- ✅ Per-set tracking with checkboxes
- ✅ Automatic weight progression (+2.5kg when all sets completed)
- ✅ Workout history display
- ✅ localStorage persistence
- ✅ JSON export for backups
- ✅ JSON import to restore data
- ✅ Mobile-responsive design
- ✅ PWA-ready (installable on phone)

### Technical Details

**Bar Weight:** 8.5kg (non-Olympic)

**Available Plates (per side):** 20kg, 15kg, 10kg, 5kg, 2.5kg, 1.25kg, 0.5kg

**Default Starting Weights:**
- Squat: 60kg
- Bench Press: 40kg
- Barbell Row: 40kg
- Overhead Press: 30kg
- Deadlift: 60kg

**Data Storage:**
- Key: `5x5-data`
- Format: JSON in localStorage
- Structure: `{ exercises: {...}, workouts: [...] }`

## Next Steps

1. ✅ Files created and split into separate CSS/JS
2. ⏳ Create 512x512px icon.png (or remove icon reference from manifest.json)
3. ⏳ Push to GitHub repository
4. ⏳ Enable GitHub Pages in repo settings
5. ⏳ Add DNS CNAME record for `5x5.craignorton.me`
6. ⏳ Test PWA installation on mobile

## Key Design Decisions

**Why localStorage over Google Drive?**
- No authentication complexity
- Works offline immediately
- Zero setup friction for users
- Manual JSON backups simple enough for occasional use

**Why vanilla JS over React/Vue?**
- App is simple enough
- No build step needed
- Faster initial load
- Easier to maintain
- No dependency updates required

**Why GitHub Pages over AWS?**
- Completely free
- Automatic SSL
- Simple deployment (just push)
- Good enough performance for personal use

## Repository
- GitHub: `c9952594/5x5`
- Custom domain: `5x5.craignorton.me`
- CNAME file already configured

## Testing Checklist

- [ ] Open index.html locally to test functionality
- [ ] Create new workout (A and B)
- [ ] Verify plate calculations for 8.5kg bar
- [ ] Check localStorage persistence (refresh page)
- [ ] Test export/import functionality
- [ ] Test on mobile browser
- [ ] Install as PWA on phone
- [ ] Verify offline functionality
