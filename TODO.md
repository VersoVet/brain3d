# TODO - Brain3D v3.0.0

## Termine

### 31 dec 2025 - Refonte v3.0.0
- [x] Nouvelle architecture modulaire (src/ + static/js/)
- [x] Backend FastAPI avec modules separes
  - [x] main.py - Routes REST + WebSocket
  - [x] config.py - Configuration centralisee
  - [x] models.py - Modeles Pydantic
  - [x] redis_client.py - Subscriber Redis
  - [x] core_client.py - Client HTTP vers Core
  - [x] websocket_manager.py - Gestion WS
  - [x] state_manager.py - Cache + heritage statuts
- [x] Frontend modulaire Three.js
  - [x] scene.js - Setup Three.js
  - [x] physics.js - Layout force-directed
  - [x] machines.js - Rendu machines (Cube/Sphere/Dodeca/Icosa)
  - [x] connections.js - Lignes elastiques
  - [x] animations.js - Pulse/blink par statut
  - [x] navigation.js - Selection, focus
  - [x] ui.js - Panel infos
  - [x] websocket.js - Client WS
- [x] Correction endpoints Core (utiliser /nodes/health au lieu de /api/machines)
- [x] Correction serialisation datetime (model_dump mode='json')
- [x] Installation websockets/wsproto pour WebSocket
- [x] Configuration iptables Dendrite pour acces distant
- [x] Mise a jour documentation ARCHITECTURE.md

### Sessions precedentes
- [x] Couleurs des aires uniformisees (cyan #00d4aa)
- [x] Gestion skills "off -> working"
- [x] OnyxHeart v2 deploye sur OnyxSoma
- [x] onyx-sdk v2.0 cree

---

## En Cours

### Debug affichage machines
- [ ] **Probleme**: Seule OnyxSoma (Core) s'affiche dans la vue 3D
- [ ] L'API retourne 8 machines mais seulement 1 est rendue
- [ ] Verifier le parsing machine_type dans le frontend
- [ ] Verifier que les autres types (heart, forge) sont bien crees

---

## A Faire

### Haute Priorite

#### Frontend 3D
- [ ] Corriger l'affichage de toutes les machines
- [ ] Verifier les formes: Cube (heart), Icosa (forge), Dodeca (core)
- [ ] Tester les animations par statut
- [ ] Ajouter labels sur les machines

#### Backend
- [ ] Verifier integration Redis temps reel
- [ ] Tester propagation des status_change
- [ ] Verifier heritage des statuts (skill → aire → machine)

### Moyenne Priorite

#### Vue interne machine
- [ ] Drill-down sur clic machine
- [ ] Afficher Heart + aires + skills
- [ ] Bouton retour vers vue reseau

#### Metriques temps reel
- [ ] Panel metriques toggleable
- [ ] Graphes CPU/RAM/Disk
- [ ] Torus autour des machines (anneaux metriques)

### Basse Priorite

#### Polish
- [ ] Transitions fluides entre vues
- [ ] Gestion deconnexion Redis (fallback HTTP)
- [ ] Support mobile/touch
- [ ] Responsive design

---

## Architecture Actuelle

```
                    REDIS (10.0.0.44:6379)
                           │
                    onyx:events
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BRAIN3D v3.0.0                           │
│                                                             │
│  Backend (FastAPI)          Frontend (Three.js)            │
│  ┌─────────────────┐        ┌─────────────────────┐        │
│  │ redis_client    │        │ scene.js            │        │
│  │ core_client     │◄──────►│ physics.js          │        │
│  │ state_manager   │        │ machines.js         │        │
│  │ websocket_mgr   │        │ animations.js       │        │
│  └─────────────────┘        └─────────────────────┘        │
│         │                            ▲                      │
│         └────────── WebSocket ───────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Types de Machines

| Type | Forme | Exemple |
|------|-------|---------|
| `core` | Dodecaedre | OnyxSoma (Core + Heart) |
| `forge` | Icosaedre | OnyxLab (Forge + Heart) |
| `heart` | Cube | Machines avec Heart uniquement |
| `network` | Sphere bleue | Devices sans Heart |

## Couleurs Statuts

| Statut | Hex | Animation |
|--------|-----|-----------|
| UP | #00ff88 | pulse-slow |
| WORKING | #ff00ff | pulse-fast |
| DOWN | #555555 | none |
| ERROR | #ff8800 | blink |
| UNKNOWN | #4488ff | none |

---

## Commandes Utiles

```bash
# Lancer Brain3D dev
BRAIN3D_DEV=true python -m src.main

# Tester API
curl http://localhost:9888/health
curl http://localhost:9888/api/state | jq

# Logs
tail -f /var/log/brain3d.log

# Test Core endpoints
curl http://10.0.0.44:8050/nodes/health | jq
curl http://10.0.0.44:8050/skills | jq
```

---

## Notes

- OnyxLab (192.168.122.66) accessible via Dendrite (10.0.0.13)
- Ports 8000-9999 forwardes via iptables
- Brain3D dev sur port 9888, prod sur 8888
- Toutes les machines ont un Heart
- OnyxSoma a Core + Heart
- OnyxLab a Forge + Heart
