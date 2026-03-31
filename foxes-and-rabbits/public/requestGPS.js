// ============================================================
//  requestGPS.js
//  Handles GPS permission + continuous position watching.
//  handleNewPosition() is defined in sketch.js and called here.
// ============================================================

let GPS_GRANTED = false;
let GPS_options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 10000,
};

function requestGPS() {
    console.log('[GPS] requestGPS() called');
    showToast('Requesting GPS...');

    if (!navigator.geolocation) {
        console.log('[GPS] navigator.geolocation not available!');
        showToast('GPS: not supported on this device');
        return;
    }

    // Try the Permissions API first (iOS 16+, Chrome, Firefox).
    // If it's unavailable or throws, fall back to calling watchPosition directly —
    // the browser will show its own permission prompt automatically.
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
            .then((result) => {
                console.log('[GPS] permission state:', result.state);
                showToast('GPS permission: ' + result.state);
                if (result.state === 'denied') {
                    showToast('GPS denied — allow in phone Settings');
                    return;
                }
                // 'granted' or 'prompt' — start watching
                GPS_GRANTED = true;
                navigator.geolocation.watchPosition(
                    handleNewPosition, handleGPSError, GPS_options
                );
                result.addEventListener('change', () => {
                    console.log('[GPS] permission changed to:', result.state);
                    showToast('GPS permission changed: ' + result.state);
                });
            })
            .catch((err) => {
                // Permissions API threw (can happen on some iOS builds)
                console.log('[GPS] permissions.query failed, using watchPosition directly:', err);
                showToast('GPS: starting directly...');
                GPS_GRANTED = true;
                navigator.geolocation.watchPosition(
                    handleNewPosition, handleGPSError, GPS_options
                );
            });
    } else {
        // No Permissions API (older iOS Safari) — call watchPosition directly.
        // The browser will show its own prompt.
        console.log('[GPS] no Permissions API, calling watchPosition directly');
        showToast('GPS: starting (no permissions API)...');
        GPS_GRANTED = true;
        navigator.geolocation.watchPosition(
            handleNewPosition, handleGPSError, GPS_options
        );
    }
}

function handleGPSError(error) {
    const msgs = {
        1: 'GPS DENIED — allow in Settings > Privacy > Location',
        2: 'GPS UNAVAILABLE — check signal',
        3: 'GPS TIMED OUT — try again',
    };
    const msg = msgs[error.code] || ('GPS error: ' + error.message);
    console.log('[GPS] error code', error.code, ':', msg);
    showToast(msg);
}

function report(state) {
    console.log('[GPS] permission state reported:', state);
}


// ── WGS-84 → GCJ-02 coordinate conversion ─────────────────
// Required when playing in China — Autonavi tiles use GCJ-02.
// If playing outside China, outOfChina() returns early and coords pass through.

function fixForChineseMap(pos) {
    let lat = pos.coords.latitude;
    let lon = pos.coords.longitude;
    return wgs84togcj02(lon, lat);
}

function wgs84togcj02(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    const a = 6378245.0, ee = 0.00669342162296594323;
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180 * Math.PI;
    let magic = 1 - ee * Math.sin(radLat) ** 2;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lng + dLng, lat + dLat];
}

function outOfChina(lng, lat) {
    return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}
