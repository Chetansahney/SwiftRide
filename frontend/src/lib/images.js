// Client-side photo shrinking so uploads stay small on slow mobile data.
const MAX_CHARS = 650000; // server accepts up to ~700k characters per photo

function encode(source, width, height, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    let q = quality;
    let data = canvas.toDataURL('image/jpeg', q);
    while (data.length > MAX_CHARS && q > 0.4) {
        q -= 0.1;
        data = canvas.toDataURL('image/jpeg', q);
    }
    return data;
}

export function compressFile(file, { maxSide = 720, quality = 0.8 } = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => resolve(encode(img, img.width, img.height, maxSide, quality));
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

export function captureVideo(video, { maxSide = 720, quality = 0.8 } = {}) {
    return encode(video, video.videoWidth, video.videoHeight, maxSide, quality);
}
