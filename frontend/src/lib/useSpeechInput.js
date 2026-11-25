import { useCallback, useEffect, useRef, useState } from 'react';

// Voice search using the browser's Web Speech API (Chrome on Android supports
// en-IN, hi-IN and bn-IN). `supported` is false where the API doesn't exist,
// so the mic button can be hidden instead of failing.
export default function useSpeechInput(speechLang, onResult) {
    const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef(null);
    const onResultRef = useRef(onResult);

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => () => recognitionRef.current?.abort(), []);

    const start = useCallback(() => {
        if (!Recognition) return;
        recognitionRef.current?.abort();
        const recognition = new Recognition();
        recognition.lang = speechLang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const text = event.results?.[0]?.[0]?.transcript;
            if (text) onResultRef.current?.(text);
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);
        recognitionRef.current = recognition;
        setListening(true);
        recognition.start();
    }, [Recognition, speechLang]);

    const stop = useCallback(() => recognitionRef.current?.stop(), []);

    return { supported: Boolean(Recognition), listening, start, stop };
}
