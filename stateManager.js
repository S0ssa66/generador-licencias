/**
 * BEATSS - State Manager
 * Centraliza el estado de la aplicación y expone un sistema Pub/Sub
 * para evitar dependencias circulares y la contaminación del scope global.
 * Mantiene retrocompatibilidad transparente redefiniendo propiedades en el objeto 'window'.
 */

class StateManager {
  constructor() {
    this.state = {
      isGlobalCatalogMode: false,
      isPublicStoreMode: false,
      currentUser: null,
      cart: [],
      activeBeat: null,
      isPlaying: false,
      currentView: 'home'
    };
    this.listeners = {};
    
    // Configurar getters y setters en window por retrocompatibilidad y sincronización reactiva bidireccional
    Object.keys(this.state).forEach(key => {
      // Adoptar valor existente si existe en window
      if (window[key] !== undefined) {
        this.state[key] = window[key];
      }
      
      Object.defineProperty(window, key, {
        get: () => this.state[key],
        set: (value) => {
          this.setState(key, value);
        },
        configurable: true,
        enumerable: true
      });
    });
  }

  /**
   * Obtiene un valor del estado.
   * @param {string} key 
   * @returns {*}
   */
  getState(key) {
    return this.state[key];
  }

  /**
   * Actualiza una propiedad del estado y notifica a los suscriptores.
   * @param {string} key 
   * @param {*} value 
   */
  setState(key, value) {
    const oldValue = this.state[key];
    if (oldValue !== value) {
      this.state[key] = value;
      this._notify(key, value, oldValue);
    }
  }

  /**
   * Actualiza múltiples propiedades del estado.
   * @param {Object} updates 
   */
  updateState(updates) {
    Object.keys(updates).forEach(key => {
      this.setState(key, updates[key]);
    });
  }

  /**
   * Se suscribe a los cambios de una propiedad específica.
   * @param {string} key 
   * @param {Function} callback 
   * @returns {Function} Función para cancelar la suscripción (unsubscribe).
   */
  subscribe(key, callback) {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(callback);

    // Retornar función de desuscripción
    return () => {
      this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
    };
  }

  /**
   * Notifica a todos los oyentes de una propiedad.
   * @param {string} key
   * @param {*} newValue
   * @param {*} oldValue
   */
  _notify(key, newValue, oldValue) {
    if (this.listeners[key]) {
      this.listeners[key].forEach(callback => {
        try {
          callback(newValue, oldValue);
        } catch (e) {
          console.error(`Error en listener de state[${key}]:`, e);
        }
      });
    }
  }
}

// Inicializar y exponer una única instancia global en window para consumo de todos los archivos
if (!window.stateManager) {
  window.stateManager = new StateManager();
}

export default window.stateManager;
