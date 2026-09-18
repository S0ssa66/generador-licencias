// States for the audio player
window.currentPlayingAudio = window.currentPlayingAudio || null;
window.currentPlayingBeatId = window.currentPlayingBeatId || null;
window.currentStoreAudio = window.currentStoreAudio || null;
window.currentStorePlayingBeatId = window.currentStorePlayingBeatId || null;

// Los previews son masters estéreo ya mezclados. Se conserva margen antes de
// enviarlos a los altavoces para que un archivo masterizado cerca de 0 dBFS no
// clippee al reproducirse desde la tienda.
export const DEFAULT_STORE_PREVIEW_VOLUME = 0.7;
const STORE_PREVIEW_MASTER_HEADROOM = 0.78;

// Helper to update Media Session API metadata and action handlers
export function updateMediaSession(beat, isStore) {
    if (!('mediaSession' in navigator)) return;

    try {
        const producerAka = window.producerConfig ? (window.producerConfig.aka || window.producerConfig.name || 'Productor') : 'Productor';
        const artworkUrl = typeof window.getBeatArtwork === 'function' 
            ? window.getBeatArtwork(beat) 
            : '/logo.png';

        navigator.mediaSession.metadata = new MediaMetadata({
            title: beat.name || 'Beat Preview',
            artist: producerAka,
            album: isStore ? 'BEATSS Tienda' : 'BEATSS Catálogo',
            artwork: [
                { src: artworkUrl || '/logo.png', sizes: '512x512', type: 'image/png' }
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
            initWebAudioMixer(window.currentStoreAudio);
            resumeStoreAudioContext();
            window.currentStoreAudio.play().then(() => {
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
        window.currentStoreAudio.volume = getSafeStorePreviewVolume(volumeSlider?.value);

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
        
        initializeWaveformVisualizer();

        window.currentStoreAudio.addEventListener('timeupdate', updatePlayerProgress);

        document.getElementById('player-btn-buy').onclick = () => {
            if (typeof window.openBeatCheckoutModal === 'function') {
                window.openBeatCheckoutModal(beatId);
            }
        };

        // Conectar el audio antes de iniciar la reproducción evita un primer
        // instante sin el margen de seguridad del reproductor.
        initWebAudioMixer(window.currentStoreAudio);
        resumeStoreAudioContext();
        window.currentStoreAudio.play().then(() => {
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
            window.currentStoreAudio.volume = getSafeStorePreviewVolume(e.target.value);
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

    progressContainer.addEventListener('keydown', (event) => {
        if (!window.currentStoreAudio || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const d = window.currentStoreAudio.duration;
        const maxDuration = (!d || d === Infinity || isNaN(d) || d > 30) ? 30 : d;
        const currentTime = window.currentStoreAudio.currentTime;
        if (event.key === 'Home') window.currentStoreAudio.currentTime = 0;
        else if (event.key === 'End') window.currentStoreAudio.currentTime = maxDuration;
        else {
            const delta = event.key === 'ArrowRight' ? 5 : -5;
            window.currentStoreAudio.currentTime = Math.min(maxDuration, Math.max(0, currentTime + delta));
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
        const progressBar = document.getElementById('player-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        const progressContainer = document.getElementById('player-progress-container');
        if (progressContainer) {
            progressContainer.setAttribute('aria-valuenow', String(Math.floor(window.currentStoreAudio.currentTime)));
            progressContainer.setAttribute('aria-valuetext', `${formatAudioTime(window.currentStoreAudio.currentTime)} de ${formatAudioTime(maxDuration)}`);
        }
        
        // Actualizar el visualizador de barra de progreso en forma de onda (Waveform)
        const visualizer = document.getElementById('player-waveform-visualizer');
        if (visualizer) {
            const isPlaying = !window.currentStoreAudio.paused;
            // Cachear elementos DOM en el visualizador para evitar búsquedas repetitivas
            if (!visualizer._cachedBars) {
                visualizer._cachedBars = Array.from(visualizer.getElementsByClassName('waveform-bar'));
            }
            const bars = visualizer._cachedBars;
            const activeIndex = Math.min(Math.floor((percent / 100) * bars.length), bars.length - 1);

            const lastActiveIndex = visualizer._lastActiveIndex;
            const lastIsPlaying = visualizer._lastIsPlaying;

            // Solo actualizar clases si cambió el índice activo o el estado de reproducción
            if (activeIndex !== lastActiveIndex || isPlaying !== lastIsPlaying) {
                visualizer._lastActiveIndex = activeIndex;
                visualizer._lastIsPlaying = isPlaying;

                for (let i = 0; i < bars.length; i++) {
                    const bar = bars[i];
                    const shouldBeActive = i <= activeIndex;
                    const shouldBePlaying = i === activeIndex && isPlaying;

                    if (shouldBeActive !== bar.classList.contains('active')) {
                        bar.classList.toggle('active', shouldBeActive);
                    }
                    if (shouldBePlaying !== bar.classList.contains('playing')) {
                        bar.classList.toggle('playing', shouldBePlaying);
                    }
                }
            }
        }
        
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

    // Detener animación de rebote si se pausa
    const visualizer = document.getElementById('player-waveform-visualizer');
    if (visualizer) {
        const playingBars = visualizer.querySelectorAll('.waveform-bar.playing');
        if (!isPlaying) {
            playingBars.forEach(bar => bar.classList.remove('playing'));
        }
    }

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

    // Optimización Lucide: limitar escaneo a elementos modificados
    if (window.lucide) {
        window.lucide.createIcons({ root: playBtn });
        if (cardBtn) window.lucide.createIcons({ root: cardBtn });
        if (globalCardBtn) window.lucide.createIcons({ root: globalCardBtn });

        beatsList.forEach(b => {
            if (b.id !== beatId) {
                const otherBtn = document.getElementById(`btn-play-store-${b.id}`);
                if (otherBtn) window.lucide.createIcons({ root: otherBtn });
                const otherGlobalBtn = document.getElementById(`btn-play-global-${b.id}`);
                if (otherGlobalBtn) window.lucide.createIcons({ root: otherGlobalBtn });
            }
        });
    }
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
// RUTA DE ESCUCHA DE PREVIEWS
// ==========================================================================
// Un preview de tienda es una mezcla estéreo, no un juego de stems. La ruta
// debe conservar ese master y no sumar copias filtradas de la misma señal.
let audioCtx = null;
let sourceNode = null;
let masterGain = null;
let peakLimiter = null;
let connectedAudioElement = null;

function getSafeStorePreviewVolume(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return DEFAULT_STORE_PREVIEW_VOLUME;
    return Math.min(1, Math.max(0, parsed));
}

function safelyDisconnect(node) {
    if (!node) return;
    try {
        node.disconnect();
    } catch (_) {
        // Algunos navegadores rechazan desconectar un nodo ya liberado.
    }
}

function disconnectPreviousStoreAudioGraph() {
    safelyDisconnect(sourceNode);
    safelyDisconnect(masterGain);
    safelyDisconnect(peakLimiter);
    sourceNode = null;
    masterGain = null;
    peakLimiter = null;
    connectedAudioElement = null;
    window._currentConnectedAudio = null;
}

function resumeStoreAudioContext() {
    if (!audioCtx || audioCtx.state !== 'suspended') return;
    audioCtx.resume().catch(() => {
        // El siguiente gesto del usuario puede reanudar el contexto.
    });
}

export function initWebAudioMixer(audioElement) {
    if (!audioElement || !(window.AudioContext || window.webkitAudioContext)) return;

    // Al reanudar el mismo preview no se crea un segundo MediaElementSource.
    if (connectedAudioElement === audioElement && sourceNode && masterGain && peakLimiter) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            window.storeAudioCtx = audioCtx;
        }

        disconnectPreviousStoreAudioGraph();

        sourceNode = audioCtx.createMediaElementSource(audioElement);
        masterGain = audioCtx.createGain();
        peakLimiter = audioCtx.createDynamicsCompressor();

        // -2.2 dB de margen antes de la salida. El limitador sólo interviene
        // si el usuario eleva el volumen y aparecen picos anómalos.
        masterGain.gain.value = STORE_PREVIEW_MASTER_HEADROOM;
        peakLimiter.threshold.value = -2;
        peakLimiter.knee.value = 0;
        peakLimiter.ratio.value = 20;
        peakLimiter.attack.value = 0.003;
        peakLimiter.release.value = 0.1;

        sourceNode.connect(masterGain);
        masterGain.connect(peakLimiter);
        peakLimiter.connect(audioCtx.destination);

        connectedAudioElement = audioElement;
        window._currentConnectedAudio = audioElement;
    } catch (error) {
        disconnectPreviousStoreAudioGraph();
        console.warn('No se pudo iniciar la ruta segura de audio del preview:', error);
    }
}

window.initWebAudioMixer = initWebAudioMixer;

export function initializeWaveformVisualizer() {
    const container = document.getElementById('player-progress-container');
    if (!container) return;
    
    // Si ya existe el visualizador, no duplicarlo, solo limpiar las barras
    let visualizer = document.getElementById('player-waveform-visualizer');
    if (!visualizer) {
        visualizer = document.createElement('div');
        visualizer.id = 'player-waveform-visualizer';
        
        // Ocultar la barra de progreso anterior si existe
        const oldBar = document.getElementById('player-progress-bar');
        if (oldBar) {
            oldBar.style.display = 'none';
        }

        container.appendChild(visualizer);
    }

    visualizer.innerHTML = '';

    // Resetear la caché de barras y estados para la nueva reproducción
    visualizer._cachedBars = null;
    visualizer._lastActiveIndex = -1;
    visualizer._lastIsPlaying = null;

    // Generar 65 barras de onda con alturas variables coherentes
    const numBars = 65;
    // Semilla pseudo-aleatoria basada en el ID del beat para que cada beat tenga su propia "huella de audio" visual única
    let seed = window.currentStorePlayingBeatId ? parseInt(String(window.currentStorePlayingBeatId).replace(/[^0-9]/g, '')) || 42 : 42;

    for (let i = 0; i < numBars; i++) {
        // Generar altura pseudo-aleatoria suave
        seed = (seed * 9301 + 49297) % 233280;
        const rand = seed / 233280.0;
        // Altura mínima 20%, máxima 85%
        const height = Math.floor(20 + rand * 65);
        
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.height = `${height}%`;
        visualizer.appendChild(bar);
    }
}

window.initializeWaveformVisualizer = initializeWaveformVisualizer;
