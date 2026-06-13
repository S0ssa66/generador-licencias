// States for the audio player
window.currentPlayingAudio = window.currentPlayingAudio || null;
window.currentPlayingBeatId = window.currentPlayingBeatId || null;
window.currentStoreAudio = window.currentStoreAudio || null;
window.currentStorePlayingBeatId = window.currentStorePlayingBeatId || null;

// Reproducir/Pausar audio de beat en el catálogo
export function togglePlayBeat(beatId, mp3Url) {
    if (!mp3Url) {
        if (typeof window.showToast === 'function') {
            window.showToast("Este beat no tiene archivo MP3 para previsualizar.", true);
        }
        return;
    }

    if (window.currentPlayingBeatId === beatId) {
        if (window.currentPlayingAudio) {
            window.currentPlayingAudio.pause();
            window.currentPlayingAudio = null;
            window.currentPlayingBeatId = null;
            if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
            if (typeof window.showToast === 'function') window.showToast("Audio pausado");
        }
    } else {
        if (window.currentPlayingAudio) {
            window.currentPlayingAudio.pause();
        }
        
        const directLink = typeof window.getGDriveDirectLink === 'function' 
            ? window.getGDriveDirectLink(mp3Url) 
            : mp3Url;
            
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
                if (typeof window.renderBeatsGrid === 'function') window.renderBeatsGrid();
                if (typeof window.showToast === 'function') window.showToast("Fin del preview de 30 segundos");
            }
        });
        
        window.currentPlayingAudio.play().then(() => {
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
    const playBtn = document.getElementById('player-btn-play');
    const volumeSlider = document.getElementById('player-volume');

    if (window.currentStorePlayingBeatId === beatId) {
        if (window.currentStoreAudio.paused) {
            window.currentStoreAudio.play();
            setPlayButtonState(beatId, true);
        } else {
            window.currentStoreAudio.pause();
            setPlayButtonState(beatId, false);
        }
    } else {
        if (window.currentStoreAudio) {
            window.currentStoreAudio.pause();
            setPlayButtonState(window.currentStorePlayingBeatId, false);
        }

        window.currentStorePlayingBeatId = beatId;
        
        const directLink = typeof window.getGDriveDirectLink === 'function' 
            ? window.getGDriveDirectLink(beat.mp3) 
            : beat.mp3;
            
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

        window.currentStoreAudio.addEventListener('timeupdate', updatePlayerProgress);

        document.getElementById('player-btn-buy').onclick = () => {
            if (typeof window.openBeatCheckoutModal === 'function') {
                window.openBeatCheckoutModal(beatId);
            }
        };

        window.currentStoreAudio.play();
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
            setPlayButtonState(window.currentStorePlayingBeatId, false);
            playNextBeat();
            return;
        }
        
        const percent = (window.currentStoreAudio.currentTime / maxDuration) * 100;
        document.getElementById('player-progress-bar').style.width = `${percent}%`;
        document.getElementById('player-time-current').textContent = formatAudioTime(window.currentStoreAudio.currentTime);
        document.getElementById('player-time-duration').textContent = formatAudioTime(maxDuration);
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
window.formatAudioTime = formatAudioTime;
window.updatePlayerProgress = updatePlayerProgress;
window.setPlayButtonState = setPlayButtonState;
