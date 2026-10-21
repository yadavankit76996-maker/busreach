const cfg = window.LSF_CONFIG || {};

const configured =
    window.supabase &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('PASTE_') &&
    !cfg.SUPABASE_ANON_KEY.includes('PASTE_');

const db = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
    )
    : null;

const form = document.getElementById('suggestForm');
const status = document.getElementById('suggestStatus');
const captureButton = document.getElementById('capture');
const photoInput = document.getElementById('stopPhoto');
const preview = document.getElementById('photoPreview');
const previewWrap = document.getElementById('photoPreviewWrap');
const removePhotoButton = document.getElementById('removePhoto');

const BUCKET = 'bus-stop-photos';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const say = message => {
    status.textContent = message;
};

function validCoordinates(latitude, longitude) {
    return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180;
}

function firstValue(...values) {
    return values.find(value =>
        typeof value === 'string' && value.trim()
    )?.trim() || '';
}

// Get the most useful locality available in the returned map data.
function getLocality(address) {
    return firstValue(
        address.neighbourhood,
        address.suburb,
        address.quarter,
        address.city_district,
        address.village,
        address.town,
        address.city,
        address.county
    );
}

// Get a named place if the map service identifies one.
// This is a best-effort landmark, not a guarantee of the nearest landmark.
function getLandmark(result, address) {
    const resultName = result.name || '';

    const roadOrPlace = firstValue(
        address.amenity,
        address.shop,
        address.tourism,
        address.leisure,
        address.historic,
        address.bus_stop,
        address.building
    );

    return firstValue(resultName, roadOrPlace);
}

function getLocationErrorMessage(error) {
    if (error.code === 1) {
        return 'Location permission was denied. Allow location access in your browser settings and try again.';
    }

    if (error.code === 2) {
        return 'Your location could not be determined. Try again or enter the details manually.';
    }

    if (error.code === 3) {
        return 'Location request timed out. Please try again.';
    }

    return 'Could not get your location. Please try again.';
}

// CURRENT LOCATION + REVERSE GEOCODING
captureButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
        say('This browser does not support location access.');
        return;
    }

    captureButton.disabled = true;
    say('Getting GPS coordinates…');

    navigator.geolocation.getCurrentPosition(
        async position => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            // Coordinates are filled immediately, even if address lookup fails.
            form.elements.latitude.value = latitude.toFixed(7);
            form.elements.longitude.value = longitude.toFixed(7);

            say('Coordinates found. Looking up your address…');

            try {
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    lat: String(latitude),
                    lon: String(longitude),
                    zoom: '18',
                    addressdetails: '1'
                });

                const response = await fetch(
                    'https://nominatim.openstreetmap.org/reverse?' +
                    params.toString(),
                    {
                        headers: {
                            Accept: 'application/json'
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `Address lookup failed: ${response.status}`
                    );
                }

                const result = await response.json();
                const address = result.address || {};

                const fullAddress = result.display_name || '';
                const locality = getLocality(address);
                const landmark = getLandmark(result, address);

                // Fill all address fields when data is available.
                form.elements.address.value = fullAddress;
                form.elements.area.value = locality;
                form.elements.landmark.value = landmark;

                if (fullAddress && locality) {
                    say(
                        'Location filled! Check the address, area and landmark before submitting.'
                    );
                } else {
                    say(
                        'Coordinates filled, but some address details were not found. Please complete the missing fields manually.'
                    );
                }
            } catch (error) {
                console.error('Address lookup error:', error);

                say(
                    'GPS coordinates are filled, but the address lookup failed. Please enter the address and area manually.'
                );
            } finally {
                captureButton.disabled = false;
            }
        },
        error => {
            console.error('Geolocation error:', error);
            say(getLocationErrorMessage(error));
            captureButton.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
});

// OPEN MAP
document.getElementById('mapsHelp').addEventListener('click', () => {
    window.open(
        'https://maps.google.com',
        '_blank',
        'noopener,noreferrer'
    );
});

// PHOTO PREVIEW AND VALIDATION
const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
];

let previewObjectUrl = null;

function clearPhotoPreview() {
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
    }

    preview.removeAttribute('src');
    previewWrap.hidden = true;
}

photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0];

    clearPhotoPreview();

    if (!file) return;

    if (!allowedTypes.includes(file.type)) {
        photoInput.value = '';
        say('Choose a JPG, PNG, WEBP or GIF image.');
        return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
        photoInput.value = '';
        say('Your photo must be 5 MB or smaller.');
        return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    preview.src = previewObjectUrl;
    previewWrap.hidden = false;

    say('Photo selected. It will upload when you submit the form.');
});

removePhotoButton.addEventListener('click', () => {
    photoInput.value = '';
    clearPhotoPreview();
    say('Photo removed.');
});

// UPLOAD PHOTO TO SUPABASE STORAGE
async function uploadPhoto(file) {
    if (!file) return null;

    if (!allowedTypes.includes(file.type)) {
        throw new Error('Choose a supported image file.');
    }

    if (file.size > MAX_PHOTO_SIZE) {
        throw new Error('Your photo must be 5 MB or smaller.');
    }

    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };

    if (!crypto.randomUUID) {
        throw new Error(
            'This browser does not support secure file naming. Please use an up-to-date browser.'
        );
    }

    const filePath =
        `suggestions/${crypto.randomUUID()}.${extensions[file.type]}`;

    say('Uploading your photo…');

    const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filePath, file, {
            contentType: file.type,
            upsert: false
        });

    if (uploadError) {
        console.error('Photo upload error:', uploadError);

        throw new Error(
            'Photo upload failed. Check the Supabase bucket and its upload policies.'
        );
    }

    const { data } = db.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

    if (!data?.publicUrl) {
        throw new Error('Could not retrieve the uploaded photo URL.');
    }

    return data.publicUrl;
}

// SUBMIT SUGGESTION
form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!db) {
        say(
            'The submission system is not configured. Please contact the project administrator.'
        );
        return;
    }

    const submitButton = form.querySelector(
        'button[type="submit"]'
    );

    if (submitButton.disabled) return;

    submitButton.disabled = true;
    captureButton.disabled = true;

    try {
        const values = Object.fromEntries(
            new FormData(form).entries()
        );

        const latitude = values.latitude === ''
            ? null
            : Number(values.latitude);

        const longitude = values.longitude === ''
            ? null
            : Number(values.longitude);

        if ((latitude === null) !== (longitude === null)) {
            say('Enter both coordinates, or leave both blank.');
            return;
        }

        if (
            latitude !== null &&
            !validCoordinates(latitude, longitude)
        ) {
            say('Please enter valid latitude and longitude values.');
            return;
        }

        const name = values.name.trim();
        const address = values.address.trim();
        const area = values.area.trim();
        const sourceDetails = values.source_details.trim();

        if (!name || !address || !area || !sourceDetails) {
            say('Please fill in all required fields.');
            return;
        }

        const photoFile = photoInput.files?.[0] || null;
        const photoUrl = await uploadPhoto(photoFile);

        const row = {
            name,
            address,
            area,
            landmark: values.landmark.trim() || null,
            latitude,
            longitude,
            photo_url: photoUrl,
            accessibility_notes: null,
            source_details: sourceDetails,
            notes: values.notes.trim() || null
        };

        say('Saving your suggestion…');

        const { error } = await db
            .from('bus_stop_suggestions')
            .insert(row);

        if (error) {
            console.error('Suggestion insert error:', error);

            say(
                'The suggestion could not be saved. Check your database permissions and try again.'
            );
            return;
        }

        form.reset();
        clearPhotoPreview();

        say(
            'Suggestion submitted successfully! An administrator must review it before it appears publicly.'
        );
    } catch (error) {
        console.error('Submission error:', error);
        say(error.message || 'Something went wrong. Please try again.');
    } finally {
        submitButton.disabled = false;
        captureButton.disabled = false;
    }
});