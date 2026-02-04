// from: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
function requestOrientation() {
    // feature detect
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);

                const h1 = document.querySelector("h1");
                if (h1) h1.style.display = "none";
                const btn = document.querySelector("#requestOrientationButton");
                if (btn) btn.style.display = "none";

                startGame();
            }
        })
        .catch(console.error);
    } else {
        // handle regular non iOS 13+ devices
    }
}
