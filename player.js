// States for the audio player
window.currentPlayingAudio = window.currentPlayingAudio || null;
window.currentPlayingBeatId = window.currentPlayingBeatId || null;
window.currentStoreAudio = window.currentStoreAudio || null;
window.currentStorePlayingBeatId = window.currentStorePlayingBeatId || null;

// Helper to update Media Session API metadata and action handlers
export function updateMediaSession(beat, isStore) {
    if (!('mediaSession' in navigator)) return;

    try {
        const producerAka = window.producerConfig ? (window.producerConfig.aka || window.producerConfig.name || 'Productor') : 'Productor';
        const artworkUrl = typeof window.getBeatArtwork === 'function' 
            ? window.getBeatArtwork(beat) 
            : '/logo-sossa.png';

        navigator.mediaSession.metadata = new MediaMetadata({
            title: beat.name || 'Beat Preview',
            artist: producerAka,
            album: isStore ? 'BEATSS Tienda' : 'BEATSS Catálogo',
            artwork: [
                { src: artworkUrl || '/logo-sossa.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Set action handlers
        navigator.mediaSession.setActionHandler('play', () => {
            if (isStore && window.currentStoreAudio) {
                window.currentStoreAudio.play().then(() => {
                    navigator.mediaSession.playbackState = 'playing';
                    setPlayButtonState(beat.id, true);
                });
            } else if (!isStore && window.currentPlayingAudio) {
                window.currentPlayingAudio.play().then(() => {
                    navigator.mediaSession.playbackState = 'playing';
                    if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
                });
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            if (isStore && window.currentStoreAudio) {
                window.currentStoreAudio.pause();
                navigator.mediaSession.playbackState = 'paused';
                setPlayButtonState(beat.id, false);
            } else if (!isStore && window.currentPlayingAudio) {
                window.currentPlayingAudio.pause();
                navigator.mediaSession.playbackState = 'paused';
                if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (isStore) {
                playPrevBeat();
            } else {
                playPrevLocalBeat();
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (isStore) {
                playNextBeat();
            } else {
                playNextLocalBeat();
            }
        });
    } catch (e) {
        console.warn("Error setting media session metadata/handlers:", e);
    }
}

// Reproducir/Pausar audio de beat en el catálogo (Dashboard)
export function togglePlayBeat(beatId, mp3Url) {
    if (!mp3Url) {
        if (typeof window.showToast === 'function') {
            window.showToast("Este beat no tiene archivo MP3 para previsualizar.", true);
        }
        return;
    }

    const beat = (window.localBeats || []).find(b => String(b.id) === String(beatId)) || { id: beatId, name: 'Beat Preview' };

    if (window.currentPlayingBeatId === beatId) {
        if (window.currentPlayingAudio) {
            window.currentPlayingAudio.pause();
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
            window.currentPlayingAudio = null;
            window.currentPlayingBeatId = null;
            if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
            if (typeof window.showToast === 'function') window.showToast("Audio pausado");
        }
    } else {
        if (window.currentPlayingAudio) {
            window.currentPlayingAudio.pause();
        }
        
        let directLink;
        const currentProducerConfig = window.producerConfig || {};
        if (currentProducerConfig.audioTagBase64) {
            directLink = `/api/preview-beat?beatId=${beatId}&user=${window.currentUser || 'sossa'}`;
        } else {
            directLink = typeof window.getGDriveDirectLink === 'function' 
                ? window.getGDriveDirectLink(mp3Url) 
                : mp3Url;
        }
            
        window.currentPlayingAudio = new Audio(directLink);
        window.currentPlayingBeatId = beatId;
        
        window.currentPlayingAudio.addEventListener('error', (e) => {
            const err = window.currentPlayingAudio.error;
            let errMsg = "Error de red o archivo inaccesible";
            if (err) errMsg = `Código ${err.code}: ${err.message || ''}`;
            if (typeof window.showToast === 'function') window.showToast("Error de audio: " + errMsg, true);
        });

        window.currentPlayingAudio.addEventListener('timeupdate', () => {
            if (window.currentPlayingAudio && window.currentPlayingAudio.currentTime >= 30) {
                window.currentPlayingAudio.pause();
                window.currentPlayingAudio = null;
                window.currentPlayingBeatId = null;
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'none';
                }
                if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
                if (typeof window.showToast === 'function') window.showToast("Fin del preview de 30 segundos");
            } else if (window.currentPlayingAudio && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: 30,
                        playbackRate: 1.0,
                        position: window.currentPlayingAudio.currentTime
                    });
                } catch(e) {}
            }
        });
        
        window.currentPlayingAudio.play().then(() => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
                updateMediaSession(beat, false);
            }
            if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
        }).catch(err => {
            console.error("Error al reproducir audio:", err);
            if (typeof window.showToast === 'function') window.showToast("Error al reproducir audio previa", true);
            window.currentPlayingAudio = null;
            window.currentPlayingBeatId = null;
            if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
        });

        window.currentPlayingAudio.addEventListener('ended', () => {
            window.currentPlayingAudio = null;
            window.currentPlayingBeatId = null;
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
            }
            if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
        });
    }
}

// Lógica de Reproducción de Audio en Tienda
export function toggleStorePlay(beatId) {
    const appContainer = document.getElementById('app-container');
    if (appContainer && appContainer.style.display !== 'none') {
        console.warn("Intento de reproducir audio de tienda pública estando en el panel de administración.");
        return;
    }

    const beatsList = window.storeBeats || [];
    const beat = beatsList.find(b => b.id === beatId);
    if (!beat || !beat.mp3) return;

    const player = document.getElementById('store-audio-player');
    const volumeSlider = document.getElementById('player-volume');

    if (window.currentStorePlayingBeatId === beatId) {
        if (window.currentStoreAudio.paused) {
            window.currentStoreAudio.play().then(() => {
                if (window.storeAudioCtx && window.storeAudioCtx.state === 'suspended') {
                    window.storeAudioCtx.resume();
                }
                initWebAudioMixer(window.currentStoreAudio);
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'playing';
                    updateMediaSession(beat, true);
                }
            });
            setPlayButtonState(beatId, true);
        } else {
            window.currentStoreAudio.pause();
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
            setPlayButtonState(beatId, false);
        }
    } else {
        if (window.currentStoreAudio) {
            window.currentStoreAudio.pause();
            setPlayButtonState(window.currentStorePlayingBeatId, false);
        }

        window.currentStorePlayingBeatId = beatId;
        
        let directLink;
        if (window.storeProducerConfig && window.storeProducerConfig.audioTagBase64) {
            directLink = `/api/preview-beat?beatId=${beatId}&user=${window.storeProducerUid || 'sossa'}`;
        } else {
            directLink = typeof window.getGDriveDirectLink === 'function' 
                ? window.getGDriveDirectLink(beat.mp3) 
                : beat.mp3;
        }
            
        window.currentStoreAudio = new Audio(directLink);
        window.currentStoreAudio.volume = parseFloat(volumeSlider.value || 0.8);

        window.currentStoreAudio.addEventListener('error', (e) => {
            const err = window.currentStoreAudio.error;
            let errMsg = "Error de red o archivo inaccesible";
            if (err) {
                switch (err.code) {
                    case 1: errMsg = "Reproducción abortada"; break;
                    case 2: errMsg = "Error de red (CORS/bloqueo de origen)"; break;
                    case 3: errMsg = "Error de decodificación de audio"; break;
                    case 4: errMsg = "Formato de audio no soportado o enlace roto"; break;
                }
                errMsg += ` (Código ${err.code})`;
            }
            console.error("Audio error:", err);
            if (typeof window.showToast === 'function') window.showToast("Error de audio: " + errMsg, true);
        });

        window.currentStoreAudio.addEventListener('loadedmetadata', () => {
            const d = window.currentStoreAudio.duration;
            const maxDuration = (!d || d === Infinity || isNaN(d) || d > 30) ? 30 : d;
            document.getElementById('player-time-duration').textContent = formatAudioTime(maxDuration);
        });
        
        window.currentStoreAudio.addEventListener('ended', () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
            }
            setPlayButtonState(beatId, false);
            playNextBeat();
        });

        document.getElementById('player-title').textContent = beat.name;
        document.getElementById('player-time-duration').textContent = '0:30';
        document.getElementById('player-info').textContent = `${beat.bpm ? beat.bpm + ' BPM' : ''} ${beat.key ? '• ' + beat.key : ''} ${beat.genre ? '• ' + beat.genre : ''}`;
        
        const artworkUrl = typeof window.getBeatArtwork === 'function' 
            ? window.getBeatArtwork(beat) 
            : '';
        document.getElementById('player-artwork').src = artworkUrl;
        player.style.display = 'block';
        document.body.classList.add('player-active');

        window.currentStoreAudio.addEventListener('timeupdate', updatePlayerProgress);

        document.getElementById('player-btn-buy').onclick = () => {
            if (typeof window.openBeatCheckoutModal === 'function') {
                window.openBeatCheckoutModal(beatId);
            }
        };

        window.currentStoreAudio.play().then(() => {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            initWebAudioMixer(window.currentStoreAudio);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
                updateMediaSession(beat, true);
            }
        }).catch(err => {
            console.error("Error al reproducir audio de tienda:", err);
        });
        
        setPlayButtonState(beatId, true);
    }
}

export function setupStoreAudioPlayer() {
    if (window._storeAudioPlayerConfigured) return;
    window._storeAudioPlayerConfigured = true;

    const playBtn = document.getElementById('player-btn-play');
    const prevBtn = document.getElementById('player-btn-prev');
    const nextBtn = document.getElementById('player-btn-next');
    const volumeSlider = document.getElementById('player-volume');
    const progressContainer = document.getElementById('player-progress-container');

    playBtn.addEventListener('click', () => {
        if (window.currentStorePlayingBeatId) {
            toggleStorePlay(window.currentStorePlayingBeatId);
        }
    });

    prevBtn.addEventListener('click', () => {
        playPrevBeat();
    });

    nextBtn.addEventListener('click', () => {
        playNextBeat();
    });

    volumeSlider.addEventListener('input', (e) => {
        if (window.currentStoreAudio) {
            window.currentStoreAudio.volume = parseFloat(e.target.value);
        }
    });

    progressContainer.addEventListener('click', (e) => {
        if (window.currentStoreAudio) {
            const rect = progressContainer.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            const d = window.currentStoreAudio.duration;
            const maxDuration = (!d || d === Infinity || isNaN(d) || d > 30) ? 30 : d;
            window.currentStoreAudio.currentTime = percentage * maxDuration;
        }
    });
}

export function playNextBeat() {
    const beatsList = window.storeBeats || [];
    if (!window.currentStorePlayingBeatId || beatsList.length === 0) return;
    const currentIndex = beatsList.findIndex(b => b.id === window.currentStorePlayingBeatId);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= beatsList.length) nextIndex = 0;
    toggleStorePlay(beatsList[nextIndex].id);
}

export function playPrevBeat() {
    const beatsList = window.storeBeats || [];
    if (!window.currentStorePlayingBeatId || beatsList.length === 0) return;
    const currentIndex = beatsList.findIndex(b => b.id === window.currentStorePlayingBeatId);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = beatsList.length - 1;
    toggleStorePlay(beatsList[prevIndex].id);
}

// Navegación por catálogo local
export function playNextLocalBeat() {
    const beatsList = window.localBeats || [];
    if (!window.currentPlayingBeatId || beatsList.length === 0) return;
    const currentIndex = beatsList.findIndex(b => String(b.id) === String(window.currentPlayingBeatId));
    let nextIndex = currentIndex + 1;
    if (nextIndex >= beatsList.length) nextIndex = 0;
    const nextBeat = beatsList[nextIndex];
    togglePlayBeat(nextBeat.id, nextBeat.mp3);
}

export function playPrevLocalBeat() {
    const beatsList = window.localBeats || [];
    if (!window.currentPlayingBeatId || beatsList.length === 0) return;
    const currentIndex = beatsList.findIndex(b => String(b.id) === String(window.currentPlayingBeatId));
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = beatsList.length - 1;
    const prevBeat = beatsList[prevIndex];
    togglePlayBeat(prevBeat.id, prevBeat.mp3);
}

export function formatAudioTime(secs) {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function updatePlayerProgress() {
    if (window.currentStoreAudio) {
        const d = window.currentStoreAudio.duration;
        const maxDuration = (!d || d === Infinity || isNaN(d) || d > 30) ? 30 : d;
        
        if (window.currentStoreAudio.currentTime >= maxDuration) {
            window.currentStoreAudio.pause();
            window.currentStoreAudio.currentTime = 0;
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
            }
            setPlayButtonState(window.currentStorePlayingBeatId, false);
            playNextBeat();
            return;
        }
        
        const percent = (window.currentStoreAudio.currentTime / maxDuration) * 100;
        document.getElementById('player-progress-bar').style.width = `${percent}%`;
        document.getElementById('player-time-current').textContent = formatAudioTime(window.currentStoreAudio.currentTime);
        document.getElementById('player-time-duration').textContent = formatAudioTime(maxDuration);

        // Update Media Session Position
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: maxDuration,
                    playbackRate: window.currentStoreAudio.playbackRate || 1.0,
                    position: window.currentStoreAudio.currentTime
                });
            } catch(e) {}
        }
    }
}

export function setPlayButtonState(beatId, isPlaying) {
    const playBtn = document.getElementById('player-btn-play');
    const cardBtn = document.getElementById(`btn-play-store-${beatId}`);
    const globalCardBtn = document.getElementById(`btn-play-global-${beatId}`);
    
    const iconHtml = isPlaying 
        ? '<i data-lucide="pause" style="width: 18px; height: 18px; fill: #000; stroke: #000;"></i>'
        : '<i data-lucide="play" style="width: 18px; height: 18px; fill: #000; stroke: #000;"></i>';
    
    playBtn.innerHTML = iconHtml;

    if (cardBtn) {
        cardBtn.innerHTML = isPlaying
            ? '<i data-lucide="pause" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>'
            : '<i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>';
    }

    if (globalCardBtn) {
        globalCardBtn.innerHTML = isPlaying
            ? '<i data-lucide="pause" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>'
            : '<i data-lucide="play" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>';
    }

    // Resetear las demás tarjetas
    const beatsList = window.storeBeats || [];
    beatsList.forEach(b => {
        if (b.id !== beatId) {
            const otherBtn = document.getElementById(`btn-play-store-${b.id}`);
            if (otherBtn) {
                otherBtn.innerHTML = '<i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>';
            }
            const otherGlobalBtn = document.getElementById(`btn-play-global-${b.id}`);
            if (otherGlobalBtn) {
                otherGlobalBtn.innerHTML = '<i data-lucide="play" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>';
            }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

// Bind to window for index.html inline access and compatibility
window.togglePlayBeat = togglePlayBeat;
window.toggleStorePlay = toggleStorePlay;
window.setupStoreAudioPlayer = setupStoreAudioPlayer;
window.playNextBeat = playNextBeat;
window.playPrevBeat = playPrevBeat;
window.playNextLocalBeat = playNextLocalBeat;
window.playPrevLocalBeat = playPrevLocalBeat;
window.formatAudioTime = formatAudioTime;
window.updatePlayerProgress = updatePlayerProgress;
window.setPlayButtonState = setPlayButtonState;
window.updateMediaSession = updateMediaSession;

// ==========================================================================
// PROCESADOR MULTI-PISTA STEMS CON WEB AUDIO API
// ==========================================================================
let audioCtx = null;
let sourceNode = null;
let lowpassFilter = null;
let bandpassFilter = null;
let highpassFilter = null;
let gainNodeLows = null;
let gainNodeMids = null;
let gainNodeHighs = null;
let gainNodeOriginal = null;
let masterGain = null;

// Nodos DSP para efectos
let convolverNode = null;
let reverbGain = null;
let delayNode = null;
let delayFeedback = null;
let delayGain = null;

let reverbEnabled = false;
let delayEnabled = false;
let currentReverbWet = 0.0;
let currentDelayFeedback = 0.0;

const muteStates = { 1: false, 2: false, 3: false, 4: false };
const originalGainValues = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 };

function createReverbImpulseResponse(context, seconds, decay) {
    const rate = context.sampleRate;
    const length = rate * seconds;
    const impulse = context.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const decayValue = Math.exp(-i * decay / rate);
        // Generar ruido blanco con atenuación exponencial
        left[i] = (Math.random() * 2 - 1) * decayValue;
        right[i] = (Math.random() * 2 - 1) * decayValue;
    }
    return impulse;
}

export function initWebAudioMixer(audioElement) {
    if (!audioElement) return;
    
    // Evitar reinicializar si el elemento de audio actual ya está conectado
    if (window._currentConnectedAudio === audioElement) return;
    window._currentConnectedAudio = audioElement;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            window.storeAudioCtx = audioCtx;
        }

        // Si ya había una fuente conectada, desconectarla para evitar fugas de memoria
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch(e){}
        }
        if (masterGain) {
            try { masterGain.disconnect(); } catch(e){}
        }
        if (reverbGain) {
            try { reverbGain.disconnect(); } catch(e){}
        }
        if (delayGain) {
            try { delayGain.disconnect(); } catch(e){}
        }
        if (delayFeedback) {
            try { delayFeedback.disconnect(); } catch(e){}
        }

        sourceNode = audioCtx.createMediaElementSource(audioElement);

        // Crear filtros divisores de frecuencias
        // 1. Lowpass a 250Hz (Graves)
        lowpassFilter = audioCtx.createBiquadFilter();
        lowpassFilter.type = 'lowpass';
        lowpassFilter.frequency.value = 250;

        // 2. Bandpass (Medios)
        bandpassFilter = audioCtx.createBiquadFilter();
        bandpassFilter.type = 'bandpass';
        bandpassFilter.frequency.value = 1500; // Centro en 1.5kHz
        bandpassFilter.Q.value = 0.5;

        // 3. Highpass a 3000Hz (Agudos)
        highpassFilter = audioCtx.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.value = 3000;

        // Crear Nodos de Ganancia para cada canal
        gainNodeLows = audioCtx.createGain();
        gainNodeMids = audioCtx.createGain();
        gainNodeHighs = audioCtx.createGain();
        gainNodeOriginal = audioCtx.createGain();
        masterGain = audioCtx.createGain();

        // Valores iniciales de ganancia
        gainNodeLows.gain.value = muteStates[1] ? 0 : parseFloat(document.getElementById('mixer-fader-1')?.value || 1.0);
        gainNodeMids.gain.value = muteStates[2] ? 0 : parseFloat(document.getElementById('mixer-fader-2')?.value || 1.0);
        gainNodeHighs.gain.value = muteStates[3] ? 0 : parseFloat(document.getElementById('mixer-fader-3')?.value || 1.0);
        gainNodeOriginal.gain.value = muteStates[4] ? 0 : parseFloat(document.getElementById('mixer-fader-4')?.value || 1.0);
        masterGain.gain.value = 1.0;

        // Conectar el grafo de audio
        // Conexiones de entrada
        sourceNode.connect(lowpassFilter);
        sourceNode.connect(bandpassFilter);
        sourceNode.connect(highpassFilter);
        sourceNode.connect(gainNodeOriginal); // Señal original limpia

        // Conectar filtros a sus ganancias
        lowpassFilter.connect(gainNodeLows);
        bandpassFilter.connect(gainNodeMids);
        highpassFilter.connect(gainNodeHighs);

        // Conectar todo al master gain
        gainNodeLows.connect(masterGain);
        gainNodeMids.connect(masterGain);
        gainNodeHighs.connect(masterGain);
        gainNodeOriginal.connect(masterGain);

        // Conectar al destino del contexto (Altavoces)
        masterGain.connect(audioCtx.destination);

        // --- Configuración e Inicialización de Nodos DSP ---
        
        // 1. Reverb (Convolver)
        convolverNode = audioCtx.createConvolver();
        convolverNode.buffer = createReverbImpulseResponse(audioCtx, 2.0, 2.0); // 2s de decaimiento
        reverbGain = audioCtx.createGain();
        reverbGain.gain.value = reverbEnabled ? currentReverbWet : 0.0;

        masterGain.connect(convolverNode);
        convolverNode.connect(reverbGain);
        reverbGain.connect(audioCtx.destination);

        // 2. Eco / Delay
        delayNode = audioCtx.createDelay(1.0); // Máximo 1.0s de retraso
        delayNode.delayTime.value = 0.35; // 350ms
        delayFeedback = audioCtx.createGain();
        delayFeedback.gain.value = delayEnabled ? currentDelayFeedback : 0.0;
        delayGain = audioCtx.createGain();
        delayGain.gain.value = delayEnabled ? (currentDelayFeedback * 0.5) : 0.0;

        masterGain.connect(delayNode);
        delayNode.connect(delayFeedback);
        delayFeedback.connect(delayNode); // Bucle de retroalimentación
        delayNode.connect(delayGain);
        delayGain.connect(audioCtx.destination);

        console.log("🎛️ Web Audio API Mixer & Nodos DSP de Efectos Inicializados con Éxito");

    } catch (e) {
        console.warn("No se pudo iniciar Web Audio API o sus efectos:", e);
    }
}

window.setMixerGain = function(channel, value) {
    const val = parseFloat(value);
    originalGainValues[channel] = val;
    if (muteStates[channel]) return; // Si está muteado, mantener en cero

    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (channel === 1 && gainNodeLows) gainNodeLows.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
    if (channel === 2 && gainNodeMids) gainNodeMids.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
    if (channel === 3 && gainNodeHighs) gainNodeHighs.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
    if (channel === 4 && gainNodeOriginal) gainNodeOriginal.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
};

window.toggleMixerMute = function(channel) {
    const btn = document.getElementById(`mixer-mute-${channel}`);
    if (!btn) return;

    muteStates[channel] = !muteStates[channel];

    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const targetGainValue = muteStates[channel] ? 0 : originalGainValues[channel];

    if (channel === 1 && gainNodeLows) gainNodeLows.gain.linearRampToValueAtTime(targetGainValue, audioCtx.currentTime + 0.05);
    if (channel === 2 && gainNodeMids) gainNodeMids.gain.linearRampToValueAtTime(targetGainValue, audioCtx.currentTime + 0.05);
    if (channel === 3 && gainNodeHighs) gainNodeHighs.gain.linearRampToValueAtTime(targetGainValue, audioCtx.currentTime + 0.05);
    if (channel === 4 && gainNodeOriginal) gainNodeOriginal.gain.linearRampToValueAtTime(targetGainValue, audioCtx.currentTime + 0.05);

    if (muteStates[channel]) {
        btn.classList.add('mute-active');
        btn.innerHTML = '<i data-lucide="volume-x" style="width: 14px; height: 14px;"></i>';
    } else {
        btn.classList.remove('mute-active');
        btn.innerHTML = '<i data-lucide="volume-2" style="width: 14px; height: 14px;"></i>';
    }
    if (window.lucide) window.lucide.createIcons({root: btn});
};

window.toggleMixerPanel = function() {
    const panel = document.getElementById('store-mixer-panel');
    const btn = document.getElementById('player-btn-mixer');
    if (!panel || !btn) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        btn.classList.add('active-mixer');
        
        // Reanudar el AudioContext si es necesario
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active-mixer');
    }
};

window.setMixerEffect = function(effect, value) {
    const val = parseFloat(value);
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (effect === 'reverb') {
        currentReverbWet = val;
        if (val > 0 && !reverbEnabled) {
            reverbEnabled = true;
            const btn = document.getElementById('mixer-reverb-toggle');
            if (btn) {
                btn.classList.add('effect-active');
                btn.style.color = 'var(--accent, #00ccff)';
            }
        }
        if (reverbGain && reverbEnabled) {
            reverbGain.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
        }
    } else if (effect === 'delay') {
        currentDelayFeedback = val;
        if (val > 0 && !delayEnabled) {
            delayEnabled = true;
            const btn = document.getElementById('mixer-delay-toggle');
            if (btn) {
                btn.classList.add('effect-active');
                btn.style.color = 'var(--accent, #00ccff)';
            }
        }
        if (delayFeedback && delayGain && delayEnabled) {
            delayFeedback.gain.linearRampToValueAtTime(val, audioCtx.currentTime + 0.05);
            delayGain.gain.linearRampToValueAtTime(val * 0.5, audioCtx.currentTime + 0.05);
        }
    }
};

window.toggleMixerEffect = function(effect) {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (effect === 'reverb') {
        reverbEnabled = !reverbEnabled;
        if (reverbEnabled && currentReverbWet === 0.0) {
            currentReverbWet = 0.5;
            const slider = document.getElementById('mixer-reverb-wet');
            if (slider) slider.value = 0.5;
        }
        const btn = document.getElementById('mixer-reverb-toggle');
        const targetWet = reverbEnabled ? currentReverbWet : 0.0;
        
        if (reverbGain) {
            reverbGain.gain.linearRampToValueAtTime(targetWet, audioCtx.currentTime + 0.05);
        }

        if (btn) {
            if (reverbEnabled) {
                btn.classList.add('effect-active');
                btn.style.color = 'var(--accent, #00ccff)';
            } else {
                btn.classList.remove('effect-active');
                btn.style.color = '#8a91a6';
            }
        }
    } else if (effect === 'delay') {
        delayEnabled = !delayEnabled;
        if (delayEnabled && currentDelayFeedback === 0.0) {
            currentDelayFeedback = 0.4;
            const slider = document.getElementById('mixer-delay-feedback');
            if (slider) slider.value = 0.4;
        }
        const btn = document.getElementById('mixer-delay-toggle');
        const targetFeedback = delayEnabled ? currentDelayFeedback : 0.0;
        const targetGain = delayEnabled ? (currentDelayFeedback * 0.5) : 0.0;

        if (delayFeedback && delayGain) {
            delayFeedback.gain.linearRampToValueAtTime(targetFeedback, audioCtx.currentTime + 0.05);
            delayGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.05);
        }

        if (btn) {
            if (delayEnabled) {
                btn.classList.add('effect-active');
                btn.style.color = 'var(--accent, #00ccff)';
            } else {
                btn.classList.remove('effect-active');
                btn.style.color = '#8a91a6';
            }
        }
    }
};

window.initWebAudioMixer = initWebAudioMixer;

