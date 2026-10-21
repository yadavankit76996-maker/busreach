BUSREACH — PUBLIC TRANSPORT ACCESSIBILITY DASHBOARD
Study area: Nallasopara East, Maharashtra

Files
- index.html: public searchable bus-stop dashboard and map
- about.html: website documentation, usage, technology and limitations
- suggest.html: public form for missing bus stops / corrections
- admin.html: restricted admin login, stop records, timetable entries and review queue
- app.js, admin.js, suggest.js: browser behaviour
- style.css: responsive styling
- config.js: browser-safe Supabase project URL and publishable key
- supabase-schema.sql: database tables, permissions and photo storage bucket
- SETUP.md: setup and deployment instructions

Features
- Search stops by name, area, landmark, route code or destination
- Ask for device location and sort stops by approximate straight-line distance
- Interactive map and directions for records with coordinates
- Published bus timetable entries with route, destination, service days, source and last checked date
- Public suggestions held for admin review
- Admin can add/edit/delete stops, upload public place photos, capture coordinates, add/edit/delete timings and publish/unpublish records
- About page documents how the website works and which technologies are used

IMPORTANT DATA RULES
- No sample bus stops or bus timings are included. Enter only field-checked information.
- A scheduled timetable is not live bus tracking. Live arrival estimates need a reliable real-time data feed and have not been connected in this version.
- Distances are approximate straight-line distances, not walking distance or travel time.
- Do not upload sensitive photos or photos that expose private information.

Technologies: HTML, CSS, JavaScript, Supabase, Leaflet, OpenStreetMap. Static hosting such as GitHub Pages can be used.
