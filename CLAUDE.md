# Brain3D - Contexte Claude

## Description

Brain3D v3.0.0 est le skill de visualisation 3D temps reel de l'ecosysteme Onyx.
Il affiche les machines, skills et aires cerebrales dans une interface Three.js interactive.

## Architecture

```
brain3d/
├── src/                 # Backend Python FastAPI
│   ├── main.py         # Point d'entree, routes REST + WebSocket
│   ├── config.py       # Configuration (ports, URLs, couleurs)
│   ├── models.py       # Pydantic: Machine, Skill, Area, NetworkState
│   ├── redis_client.py # Subscriber Redis (onyx:events)
│   ├── core_client.py  # Client HTTP vers OnyxCore
│   ├── websocket_manager.py
│   └── state_manager.py # Cache + heritage statuts
├── static/js/          # Frontend Three.js
│   ├── app.js          # Point d'entree
│   ├── scene.js        # Setup Three.js
│   ├── physics.js      # Layout force-directed
│   ├── machines.js     # Rendu machines (formes 3D)
│   ├── connections.js  # Lignes entre machines
│   ├── animations.js   # Pulse, blink par statut
│   └── websocket.js    # Client WS
├── templates/index.html
└── manifest.json
```

## Types de Machines

| Type | Forme 3D | Description |
|------|----------|-------------|
| `core` | Dodecaedre | OnyxSoma (machine principale avec Core + Heart) |
| `forge` | Icosaedre | OnyxLab (machine dev avec Forge + Heart) |
| `heart` | Cube | Machines avec Heart uniquement |
| `network` | Sphere bleue | Devices reseau sans Heart |

**Important**: Toutes les machines ont un Heart. OnyxSoma a Core EN PLUS du Heart.
OnyxLab a Forge EN PLUS du Heart.

## Statuts et Couleurs

| Statut | Couleur | Hex | Animation |
|--------|---------|-----|-----------|
| UP | Vert | #00ff88 | pulse-slow |
| WORKING | Magenta | #ff00ff | pulse-fast |
| DOWN | Gris | #555555 | none |
| ERROR | Orange | #ff8800 | blink |
| UNKNOWN | Bleu | #4488ff | none |

## Endpoints Principaux

### Brain3D API
- `GET /` - Page principale
- `GET /health` - Health check
- `GET /api/state` - Etat complet du reseau
- `GET /api/machines` - Liste machines
- `WS /ws` - WebSocket temps reel

### OnyxCore API (utilises par Brain3D)
- `GET /nodes/health` - Liste machines avec Heart
- `GET /skills` - Liste skills
- `GET /areas` - Liste aires cerebrales

**Note**: Ne PAS utiliser `/api/machines` ou `/api/skills` - ces endpoints n'existent pas sur Core.

## Configuration

| Variable | Defaut | Description |
|----------|--------|-------------|
| `BRAIN3D_DEV` | false | Mode dev (port 9888, reload) |
| `ONYX_CORE_URL` | http://10.0.0.44:8050 | URL OnyxCore |
| `REDIS_URL` | redis://10.0.0.44:6379 | URL Redis |

## Lancement

```bash
# Dev (port 9888)
BRAIN3D_DEV=true python -m src.main

# Prod (port 8888)
python -m src.main
```

## Reseau

- OnyxLab: 192.168.122.66 (NAT via Dendrite)
- OnyxDendrite: 10.0.0.13 (pont reseau)
- Ports 8000-9999 forwardes via iptables

## Probleme Actuel

Seule OnyxSoma (type=core) s'affiche dans la vue 3D.
L'API retourne 8 machines mais seulement 1 est rendue.
Verifier le parsing de `machine_type` dans le frontend.

## Fichiers Cles a Editer

- `src/core_client.py` - Communication avec OnyxCore
- `src/models.py` - Modeles de donnees
- `static/js/machines.js` - Rendu des formes 3D
- `static/js/config.js` - Couleurs, tailles
