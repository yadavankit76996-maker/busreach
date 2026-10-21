# BusReach setup guide

## 1. Supabase database
1. Open the existing Supabase project for Local Service Finder.
2. Open **SQL Editor** and create a new query.
3. Open `supabase-schema.sql`, copy the entire file into the SQL editor and run it.
4. The script creates the BusReach-specific tables (`bus_stops`, `bus_timings`, `bus_stop_suggestions`), access policies and the `bus-stop-photos` Storage bucket. It leaves the old Theme 9 tables in place.
5. Check that your admin account exists in `auth.users`. If the existing `admin_users` row for your account remains, it will authorize you in this project. If not, insert your own authenticated user UUID into `public.admin_users` as the project owner. Never publish a service-role key or database password.

## 2. Configuration
`config.js` already contains the browser-safe Supabase project URL and publishable key from the existing project. Do not replace the publishable key with a secret/service-role key. If you use a different Supabase project, update both values with that project's URL and publishable key.

## 3. Test locally
From the project folder run:

```powershell
py -m http.server 8000
```

Open `http://localhost:8000`. Location access works on localhost and secure HTTPS websites; allow permission when prompted. Map tiles need an internet connection.

## 4. Admin use
1. Open `admin.html` and sign in with the authorized Supabase Auth account.
2. Add a bus stop. Use **Capture current location** while physically at the stop, or enter verified coordinates manually.
3. Optionally upload a JPG, PNG or WebP image up to 5 MB. The image is stored in the public `bus-stop-photos` bucket.
4. Enter verification notes and the survey date. Do not publish a record marked **Needs recheck**.
5. Add a timing entry: select the stop, route code, destination, scheduled time, service days, source and date last checked. Publish only after checking the source.
6. Review suggestions. Copy a suggestion into the stop form, verify it independently, and save it before approval.

## 5. Publish the website
Upload the updated project files to the same GitHub repository / GitHub Pages branch used by the old project. Keep `config.js` in the same folder as the HTML pages. Confirm the public page, suggestion form and admin page on the deployed HTTPS site.

## Data integrity and limitations
- The database starts without invented bus stops or timings. Add your surveyed records only.
- The timing form stores scheduled times. It does not automatically track buses or calculate real-time arrival estimates.
- Distances are approximate straight-line distances from the device location.
- Public suggestions are not visible to other visitors until an administrator reviews and publishes the record.
- Only upload public-location photos that are appropriate to share.
