# Jamali Madrasa Dental Slot Planner

A privacy-first static planner for arranging dental checkup class slots at Jamali Madrasa.

The app stores only class-level planning details in the browser:

- class names
- student counts per class
- slot length
- students per slot
- break length
- class start times

It does not store student names, parent contact details, consent details, medical notes, allergy notes, or checkup records.

Excel, CSV, TSV, and text uploads are parsed locally in the browser. The planner imports only class names and class counts; student-level columns are ignored.

The public site syncs the shared schedule through Firebase Realtime Database at `/schedule`. `schedule.json` remains a safe fallback seed if Firebase is unavailable.

## GitHub Pages

This folder is ready to publish as a static GitHub Pages site. The entry point is `index.html`, with styling in `styles.css` and app logic in `app.js`.
