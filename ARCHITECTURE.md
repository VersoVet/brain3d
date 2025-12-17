# Brain3D - Architecture

## Vue d'ensemble

Brain3D est le skill de visualisation 3D temps reel du cerveau Onyx. Il affiche l'etat des skills et aires cerebrales dans une interface Three.js interactive.

## Architecture

```
brain3d/
├── skill.py           # Serveur FastAPI + WebSocket
├── manifest.json      # Metadata du skill
├── run.sh            # Script de lancement
├── static/
│   ├── js/
│   │   ├── brain3d.js    # Vue cerveau 3D
│   │   ├── network3d.js  # Vue reseau machines
│   │   └── three.min.js  # Three.js
│   └── css/
│       └── style.css
├── templates/
│   └── index.html    # Page principale
└── ARCHITECTURE.md   # Ce fichier
```

## Flux de donnees

```
OnyxCore (8000)        Brain3D (8888)        Network (8053)
┌──────────────┐       ┌──────────────┐      ┌──────────────┐
│ /api/skills  │◄──────│              │──────►│ /devices     │
│ /api/machines│       │  skill.py    │       └──────────────┘
│ /status      │──────►│              │
└──────────────┘       └───────┬──────┘
                                          │
                                    WebSocket
                                          │
                                    ┌─────▼─────┐
                                    │  Browser  │
                                    │ Three.js  │
                                    └───────────┘
```

## API Endpoints

### REST

| Methode | Path | Description |
|---------|------|-------------|
| GET | `/` | Page principale Brain3D |
| GET | `/health` | Health check |
| GET | `/architecture` | Architecture 3D complete |
| GET | `/areas/{area_id}` | Detail d'une aire |
| GET | `/states` | Etats caches des skills |
| GET | `/connections` | Stats WebSocket |
| GET | `/machines` | Liste machines OnyxHeart |
| POST | `/status` | Recevoir mise a jour status |

### WebSocket

| Path | Description |
|------|-------------|
| `/ws` | Connexion principale, recoit tous les events |
| `/ws/area/{area_id}` | Filtre par aire cerebrale |

#### Messages WebSocket

**Serveur → Client:**
```json
{"type": "init", "data": {...}}           // Architecture initiale
{"type": "status_update", "data": {...}}  // Mise a jour status
{"type": "refresh", "data": {...}}        // Refresh complet
{"type": "pong"}                          // Reponse ping
```

**Client → Serveur:**
```json
{"type": "set_focus", "view_mode": "area", "area": "hippocampus"}
{"type": "ping"}
{"type": "refresh"}
```

## Configuration

Variables d'environnement:

| Variable | Defaut | Description |
|----------|--------|-------------|
| `BRAIN3D_PORT` | 8888 | Port du serveur |
| `ONYX_CORE_URL` | http://10.0.0.11:8000 | URL API OnyxCore |
| `NETWORK_INVENTORY_URL` | http://10.0.0.11:8053 | URL API Network Inventory |

## Status et Heritage

Le systeme de status utilise un heritage hierarchique:
```
Skill → Aire cerebrale → Machine
```

Quand un skill change de status, l'aire parente et la machine sont automatiquement mises a jour.

### Status des Skills

| Status | Couleur | Animation |
|--------|---------|-----------|
| running/up | #00ff88 (vert) | none |
| off/down | #888888 (gris) | none |
| working | #ff00ff (magenta) | pulse |
| busy | #ff00ff (magenta) | pulse |
| failed | #ff4444 (rouge) | none |

### Status des Aires (agrege)

L'aire herite du status le plus prioritaire de ses skills:
1. **working** (magenta pulsant) - si au moins 1 skill est working/busy
2. **up** (couleur de l'aire) - si au moins 1 skill est running/up
3. **off** (gris, opacity 0.2) - si tous les skills sont off/down

### Status des Machines (agrege)

La machine herite du status de ses aires/skills:
1. **working** (magenta pulsant) - si au moins 1 aire/skill est working
2. **online** (vert #00ff88) - si au moins 1 aire/skill est up
3. **offline** (gris, opacity 0.25) - si tout est off

## Vues 3D

### Vue Reseau (defaut)
- OnyxSoma au centre (dodecaedre)
- **Cercle interieur**: Machines OnyxHeart (cubes) avec connexion solide
- **Cercle exterieur**: Devices reseau sans OnyxHeart (spheres bleues) avec connexion pointillee
- Couleur selon status agrege (vert=online, magenta=working, gris=offline)
- Clic/tap sur machine → vue interieure

### Vue Interieure OnyxSoma
- OnyxCore au centre (icosaedre polymorphe anime)
- OnyxHeart local (octaedre orange)
- Aires cerebrales en orbite (spheres colorees)
- Skills autour de chaque aire (petites spheres)
- Tubes entrants depuis les machines distantes

### Vue Interieure OnyxHeart
- OnyxHeart au centre
- Skills locaux en cercle
- Tube de connexion vers OnyxSoma

## Dependances

- FastAPI + Uvicorn
- httpx (client HTTP async)
- Three.js (3D frontend)
- Jinja2 (templates)

## Lancement

```bash
# Direct
./run.sh

# Avec port custom
BRAIN3D_PORT=9888 ./run.sh

# Avec Core API differente
ONYX_CORE_URL=http://localhost:8000 ./run.sh
```

## Integration Network-Inventory

Brain3D fusionne les donnees de deux sources:

1. **OnyxCore** (`/api/machines`) - Machines avec OnyxHeart
2. **Network-Inventory** (`/devices`) - Tous les appareils reseau

### Types de machines

| Type | Visuel | Cercle | Connexion |
|------|--------|--------|-----------|
| OnyxHeart | Cube orange | Interieur | Tube solide |
| Network device | Sphere bleue | Exterieur | Ligne pointillee |

### Icones de type

Chaque machine affiche une icone selon son type:

| Type | Icone |
|------|-------|
| nas | 💾 |
| server | 🖥️ |
| hpc | ⚡ |
| router/network | 🌐 |
| firewall | 🛡️ |
| windows | 🪟 |
| linux | 🐧 |
| android | 🤖 |
| phone | 📱 |
| printer | 🖨️ |
| onyxheart | 🧡 |

## Support Mobile

- Touch events actifs sur mobile
- Tap sur machine = clic
- Zoom pinch support (via OrbitControls)
