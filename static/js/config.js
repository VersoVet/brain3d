/**
 * Brain3D - Configuration
 */

const CONFIG = {
    // Couleurs par statut
    STATUS_COLORS: {
        UP: 0x00ff88,       // Vert
        WORKING: 0xff00ff,  // Magenta
        DOWN: 0x555555,     // Gris
        ERROR: 0xff8800,    // Orange
        UNKNOWN: 0x666666,  // Gris moyen
    },

    // Couleurs par type de machine
    MACHINE_COLORS: {
        heart: 0x00ff88,    // Vert (selon statut)
        network: 0x4488ff,  // Bleu
        core: 0x00d4aa,     // Cyan
        forge: 0xaa44ff,    // Violet
    },

    // Tailles des objets 3D
    SIZES: {
        machine: 2,
        skill: 0.5,
        area: 1.5,
        core: 3,
        forge: 2.5,
    },

    // Physics (force-directed layout)
    PHYSICS: {
        attraction: 0.01,       // Force d'attraction vers le centre
        repulsion: 50,          // Force de repulsion entre nodes
        damping: 0.95,          // Amortissement
        maxVelocity: 2,         // Vitesse max
        centerForce: 0.005,     // Force vers le centre
    },

    // Camera
    CAMERA: {
        fov: 60,
        near: 0.1,
        far: 2000,
        position: { x: 0, y: 30, z: 80 },
    },

    // Scene
    SCENE: {
        background: 0x0a0a0f,
        gridColor: 0x1a1a2e,
        ambientLight: 0x404040,
        ambientIntensity: 0.6,
        directionalLight: 0xffffff,
        directionalIntensity: 0.8,
    },

    // Animations
    ANIMATIONS: {
        pulseSlowSpeed: 0.5,
        pulseFastSpeed: 2,
        blinkSpeed: 3,
        rotationSpeed: 0.001,
    },

    // Message Bus - Types et couleurs (particules x3)
    MESSAGE_TYPES: {
        heartbeat: {
            color: 0x00ff88,      // Vert - Heart → Core
            name: 'Heartbeat',
            speed: 1.5,
            size: 0.9,
        },
        ping: {
            color: 0x00ffff,      // Cyan - Test connectivité
            name: 'Ping',
            speed: 3.0,
            size: 0.75,
        },
        pong: {
            color: 0x00cccc,      // Cyan foncé - Réponse
            name: 'Pong',
            speed: 3.0,
            size: 0.75,
        },
        sync: {
            color: 0xffff00,      // Jaune - Synchronisation
            name: 'Sync',
            speed: 2.0,
            size: 1.2,
        },
        command: {
            color: 0x4488ff,      // Bleu - Commandes
            name: 'Command',
            speed: 2.5,
            size: 1.0,
        },
        broadcast: {
            color: 0xffffff,      // Blanc - Broadcast
            name: 'Broadcast',
            speed: 2.0,
            size: 1.5,
        },
        forge: {
            color: 0xaa44ff,      // Violet - Forge
            name: 'Forge',
            speed: 2.0,
            size: 1.2,
        },
        status: {
            color: 0x00d4aa,      // Teal - Status
            name: 'Status',
            speed: 2.0,
            size: 0.9,
        },
        error: {
            color: 0xff4400,      // Orange/Rouge - Erreurs
            name: 'Error',
            speed: 3.5,
            size: 1.5,
        },
        skill_event: {
            color: 0xff00ff,      // Magenta - Events skills
            name: 'Skill Event',
            speed: 2.5,
            size: 1.0,
        },
    },

    // WebSocket
    WS: {
        reconnectDelay: 3000,
        maxReconnectAttempts: 10,
    },
};

// Helpers
const hexToThreeColor = (hex) => {
    if (typeof hex === 'number') return hex;
    return parseInt(hex.replace('#', ''), 16);
};

const getStatusColor = (status) => {
    return CONFIG.STATUS_COLORS[status?.toUpperCase()] || CONFIG.STATUS_COLORS.UNKNOWN;
};

const getMachineColor = (type, status) => {
    if (type === 'network') {
        return CONFIG.MACHINE_COLORS.network;
    }
    return getStatusColor(status);
};
