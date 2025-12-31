# Brain3D v3.0.0 - Architecture

## Vue d'ensemble

Brain3D est le skill de visualisation 3D temps reel de l'ecosysteme Onyx. Il affiche l'etat des machines, skills et aires cerebrales dans une interface Three.js interactive avec mise a jour temps reel via Redis Message Bus.

## Architecture v3.0.0

```
brain3d/
├── src/                      # Backend Python (FastAPI)
│   ├── main.py              # Point d'entree FastAPI + routes
│   ├── config.py            # Configuration centralisee
│   ├── models.py            # Modeles Pydantic (Machine, Skill, Area, etc.)
│   ├── redis_client.py      # Subscriber Redis (onyx:events)
│   ├── core_client.py       # Client HTTP vers OnyxCore
│   ├── websocket_manager.py # Gestion connexions WebSocket
│   └── state_manager.py     # Cache etat + heritage des statuts
├── static/
│   ├── js/
│   │   ├── app.js           # Point d'entree frontend
│   │   ├── config.js        # Configuration (couleurs, tailles, etc.)
│   │   ├── scene.js         # Setup Three.js (camera, lumieres, renderer)
│   │   ├── physics.js       # Layout force-directed (attraction/repulsion)
│   │   ├── machines.js      # Rendu machines (Cube/Sphere/Dodeca/Icosa)
│   │   ├── connections.js   # Lignes de connexion elastiques
│   │   ├── animations.js    # Animations par statut (pulse, blink)
│   │   ├── navigation.js    # Selection, focus, drill-down
│   │   ├── ui.js            # Panel info, stats
│   │   └── websocket.js     # Client WebSocket
│   └── css/
│       └── style.css
├── templates/
│   └── index.html           # Template Jinja2
├── _old/                    # Ancienne version archivee
├── manifest.json
├── requirements.txt
└── ARCHITECTURE.md
```

## Flux de Donnees

```
                    REDIS (10.0.0.44:6379)
                           │
                    onyx:events
                           │
                           ▼
   ┌─────────────────────────────────────────────────────────┐
   │                    BRAIN3D (port 8888)                  │
   │                                                         │
   │  ┌─────────────┐    ┌────────────────┐                 │
   │  │   Redis     │───►│ StateManager   │                 │
   │  │ Subscriber  │    │  (cache+herit) │                 │
   │  └─────────────┘    └───────┬────────┘                 │
   │                             │                           │
   │  ┌─────────────┐            │                           │
   │  │ CoreClient  │────────────┤                           │
   │  │ (HTTP→Core) │            │                           │
   │  └─────────────┘            ▼                           │
   │                     ┌────────────────┐                  │
   │                     │  WebSocket     │                  │
   │                     │   Manager      │                  │
   │                     └───────┬────────┘                  │
   └─────────────────────────────┼───────────────────────────┘
                                 │
                           WebSocket /ws
                                 │
                                 ▼
                         ┌─────────────────┐
                         │    Browser      │
                         │   Three.js      │
                         │   Frontend      │
                         └─────────────────┘
```

## Representation Visuelle

### Types de Machines

| Type | Forme | Description |
|------|-------|-------------|
| `core` | **Dodecaedre** | Machine principale (OnyxSoma avec Core+Heart) |
| `forge` | **Icosaedre** | Machine de dev (OnyxLab avec Forge+Heart) |
| `heart` | **Cube** | Machine avec Heart uniquement |
| `network` | **Sphere** | Device reseau sans Heart |

### Couleurs par Statut

| Statut | Couleur | Hex | Animation |
|--------|---------|-----|-----------|
| UP | Vert | `#00ff88` | pulse-slow |
| WORKING | Magenta | `#ff00ff` | pulse-fast |
| DOWN | Gris | `#555555` | none |
| ERROR | Orange | `#ff8800` | blink |
| UNKNOWN | Bleu | `#4488ff` | none |

### Heritage des Statuts

```
Priorite (haute → basse): ERROR > WORKING > UP > DOWN > UNKNOWN

Machine ◄─── Heart ◄─── Aire ◄─── Skills
   │           │          │          │
   │           │          │          └─ Statut individuel
   │           │          └─ MAX(statuts skills)
   │           └─ MAX(statuts aires)
   └─ Herite du statut du Heart
```

**Regles:**
1. Si 1+ skill ERROR → Aire ERROR → Machine ERROR
2. Si 1+ skill WORKING (et 0 ERROR) → Aire WORKING → Machine WORKING
3. Si 1+ skill UP (et 0 ERROR/WORKING) → Aire UP → Machine UP
4. Si tous skills DOWN → Aire DOWN → Machine DOWN

## Backend (src/)

### main.py - FastAPI Application

Routes REST:
| Methode | Path | Description |
|---------|------|-------------|
| GET | `/` | Page principale |
| GET | `/health` | Health check |
| GET | `/status` | Statut detaille (Redis, WS clients) |
| GET | `/api/state` | Etat complet du reseau |
| GET | `/api/machines` | Liste des machines |
| GET | `/api/machines/{id}` | Detail d'une machine |
| GET | `/api/skills` | Liste des skills |
| GET | `/api/skills/{name}` | Detail d'un skill |
| GET | `/api/areas` | Liste des aires |
| GET | `/api/areas/{id}` | Detail d'une aire |
| POST | `/api/refresh` | Force rafraichissement |

WebSocket:
| Path | Description |
|------|-------------|
| `/ws` | Connexion temps reel |

### redis_client.py - RedisSubscriber

Ecoute le channel `onyx:events` et traite les evenements:
- `heartbeat` → Update metriques machine
- `status_change` → Update couleur skill/aire/machine
- `skill_started` → Ajout skill
- `skill_stopped` → Retrait skill
- `sync_complete` → Refresh architecture

### core_client.py - CoreAPIClient

Client HTTP vers OnyxCore (`http://10.0.0.44:8050`):

| Endpoint Core | Description |
|---------------|-------------|
| `/nodes/health` | Liste des machines avec Heart et metriques |
| `/skills` | Liste des skills enregistres |
| `/skills/{name}` | Detail d'un skill |
| `/areas` | Liste des aires cerebrales |
| `/emit` | Emettre un evenement |

### state_manager.py - StateManager

Gere le cache et l'heritage des statuts:
- Cache machines, skills, aires, hearts
- Calcul automatique des statuts herites
- Propagation des changements

### websocket_manager.py - WebSocketManager

Gestion des connexions WebSocket:
- Broadcast vers tous les clients
- Messages types: `init`, `status_update`, `metrics_update`, `topology_change`

## Frontend (static/js/)

### Messages WebSocket

**Serveur → Client:**
```json
{"type": "init", "data": {...}}
{"type": "refresh", "reason": "...", "data": {...}}
{"type": "status_update", "target": "skill|machine|area", "id": "...", "status": "..."}
{"type": "metrics_update", "node_id": "...", "metrics": {...}}
{"type": "topology_change", "action": "add|remove", "entity_type": "...", "entity": {...}}
```

**Client → Serveur:**
```json
{"type": "ping"}
{"type": "refresh"}
{"type": "set_focus", "target": "...", "id": "..."}
```

### Modules Frontend

| Module | Role |
|--------|------|
| `app.js` | Orchestration, init, callbacks WebSocket |
| `scene.js` | Setup Three.js, camera, lumieres, renderer |
| `physics.js` | Layout force-directed (positions dynamiques) |
| `machines.js` | Creation/update des meshes machines |
| `connections.js` | Lignes entre machines et core |
| `animations.js` | Pulse, blink selon statut |
| `navigation.js` | Selection, focus camera |
| `ui.js` | Panel d'infos, statistiques |
| `websocket.js` | Client WebSocket |
| `config.js` | Couleurs, tailles, constantes |

## Configuration

### Variables d'environnement

| Variable | Defaut | Description |
|----------|--------|-------------|
| `BRAIN3D_DEV` | `false` | Mode developpement |
| `ONYX_CORE_URL` | `http://10.0.0.44:8050` | URL API OnyxCore |
| `REDIS_URL` | `redis://10.0.0.44:6379` | URL Redis |

### Ports

| Mode | Port |
|------|------|
| Production | 8888 |
| Developpement | 9888 |

## Dependances

### Python (requirements.txt)
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
redis>=5.0.0
httpx>=0.25.0
pydantic>=2.0.0
jinja2>=3.0.0
websockets>=12.0
```

### Frontend (CDN)
```
Three.js r128
OrbitControls
```

## Lancement

```bash
# Production (port 8888)
python -m src.main

# Developpement (port 9888, reload)
BRAIN3D_DEV=true python -m src.main

# Ou via uvicorn direct
uvicorn src.main:app --host 0.0.0.0 --port 8888 --reload
```

## Acces Distant (OnyxLab)

OnyxLab est sur un reseau NAT (192.168.122.66). Pour y acceder depuis l'exterieur:

```bash
# Via OnyxDendrite (10.0.0.13)
ssh -L 9888:192.168.122.66:9888 onyx@10.0.0.13

# Puis ouvrir http://localhost:9888
```

Ports forwards configures sur Dendrite (iptables):
- 8000-9999 → 192.168.122.66:8000-9999
