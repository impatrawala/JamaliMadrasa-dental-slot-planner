# Jamali Madrasa Dental Slot Planner

A privacy-first static planner for arranging dental checkup class slots at Jamali Madrasa.

The public app shows only class-level planning details:

- class names
- student counts per class
- slot length
- students per slot
- break length
- class start times

Organizer mode uses Firebase Authentication and Firebase Realtime Database to keep a private student call list at `/students`. Signed-in organizers can import registered students from Excel/CSV, view students by class, add or delete students, and update each student status. Parent contact details, consent details, medical notes, and allergy notes are not imported into the app.

Class-planner Excel, CSV, TSV, and text uploads are parsed locally in the browser. The class planner imports only class names and class counts; student-level columns are ignored there.

The public site syncs the shared schedule through Firebase Realtime Database at `/schedule`. `schedule.json` remains a safe fallback seed if Firebase is unavailable. Schedule editing is locked to signed-in organizers.

Recommended Firebase Realtime Database rules:

```json
{
  "rules": {
    "schedule": {
      ".read": true,
      ".write": "auth != null"
    },
    "students": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

## GitHub Pages

This folder is ready to publish as a static GitHub Pages site. The entry point is `index.html`, with styling in `styles.css` and app logic in `app.js`.
