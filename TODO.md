# TODO - Brain3D & Architecture Onyx

## Terminé

### 18 dec 2025
- [x] État des lieux OnyxHeart v1
- [x] Création OnyxHeart v2 simplifié (~500 lignes vs ~3000)
  - Suppression modules peers et vpn
  - Nouveau endpoint `POST /skills/status`
  - Envoi vers OnyxCore (plus Brain3D direct)
- [x] Création onyx-sdk v2 Python
  - Envoi vers OnyxHeart local (localhost:8900)
  - API simple : `onyx.up()`, `onyx.working()`, `onyx.error()`
  - Context manager : `with onyx.task("..."):`

### 17 dec 2025
- [x] Couleurs des aires uniformisées (cyan #00d4aa)
- [x] Gestion skills "off -> working" (skills sans mesh)
- [x] Monitoring avec Torus (5 anneaux par machine : CPU, GPU, RAM, DISK, NET)

---

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUX DE DONNÉES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  FLUX 1: STATUS (event-driven, temps réel)                                  │
│  ─────────────────────────────────────────                                  │
│                                                                             │
│   Skill ──► OnyxHeart local ──► OnyxCore ──► Brain3D                       │
│        (onyx-sdk)     (:8900)      (:8000)    (WebSocket)                   │
│                                                                             │
│   • Skill utilise onyx-sdk pour envoyer son status                         │
│   • OnyxHeart reçoit via POST /skills/status                               │
│   • OnyxHeart forward à OnyxCore                                           │
│   • OnyxCore broadcast WebSocket aux subscribers                           │
│                                                                             │
│  FLUX 2: REFRESH (on-demand)                                                │
│  ───────────────────────────                                                │
│                                                                             │
│   Brain3D ──[bouton]──► OnyxCore ──► OnyxHeart(s) ──► poll skills          │
│                                                                             │
│   • Utilisateur clique "Refresh"                                            │
│   • OnyxCore interroge chaque OnyxHeart                                     │
│   • OnyxHeart fait /health sur chaque skill local                          │
│   • Résultat remonte et broadcast à Brain3D                                 │
│                                                                             │
│  FLUX 3: MÉTRIQUES (polling 1s, optionnel)                                  │
│  ─────────────────────────────────────────                                  │
│                                                                             │
│   OnyxHeart ──► OnyxCore ──► Brain3D                                       │
│            (heartbeat avec metrics)                                         │
│                                                                             │
│   • Métriques: CPU, GPU, RAM, DISK, NET (5 total)                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Composants

| Composant | Version | Chemin | Rôle |
|-----------|---------|--------|------|
| **OnyxHeart v2** | 2.0.0 | `/apps/onyx-heart-v2/` | Agent local par machine |
| **onyx-sdk** | 2.0.0 | `/apps/onyx-sdk/` | Librairie Python pour skills |
| **OnyxCore** | - | `/apps/onyx/skills/onyx-api-master/` | Cerveau central |
| **Brain3D** | - | `/apps/onyx-dev/skills/brain3d/` | Visualisation 3D |

---

## À Faire

### Haute Priorité

#### Déploiement OnyxHeart v2
- [x] Remplacer OnyxHeart v1 par v2 sur OnyxSoma
- [x] Déployer OnyxHeart v2 sur VERSO-ACQUI (Windows service via NSSM)
- [ ] Déployer OnyxHeart v2 sur les autres machines
- [ ] Tester la chaîne complète Skill → OnyxHeart → OnyxCore → Brain3D

#### Migration des skills vers BrainClient SDK
- [x] Modifier SDK `/apps/onyx/sdk/brain_client.py` pour envoyer vers OnyxHeart local (localhost:8900)
- [x] Modifier Brain3D prod pour utiliser OnyxHeart
- [ ] **Identifier et migrer TOUS les skills actifs vers BrainClient SDK**
  - Skills a migrer : project-manager, network-inventory, dev-orchestrator, skill-validator, etc.
  - Chaque skill doit utiliser `BrainClient` ou `AsyncBrainClient` du SDK
- [ ] Tester chaque skill migré

#### skill-init (template)
- [ ] Mettre à jour le template `skill.py` pour inclure BrainClient SDK par defaut
- [ ] Mettre à jour le template `CLAUDE.md` avec documentation SDK
- [ ] Ajouter import `from onyx.sdk.brain_client import BrainClient` dans le template

#### skill-validator
- [ ] Ajouter verification que le skill importe BrainClient
- [ ] Ajouter verification que le skill appelle notify (status_up, status_working, etc.)
- [ ] Verifier que le skill envoie bien vers localhost:8900 (pas directement vers OnyxCore)

#### OnyxHeart v2
- [ ] **Ajouter scan du repertoire skills pour decouvrir les nouveaux skills**
  - Lire les manifest.json dans le repertoire skills
  - Faire health check sur les ports declares
  - Enregistrer les skills dans le store
- [ ] Ajouter endpoint `GET /skills/discover` pour forcer la decouverte
- [x] Vérifier endpoint `/skills/status` recoit bien les status

#### OnyxCore
- [x] Vérifier endpoint `/status` reçoit bien les status forwardés
- [ ] Créer endpoint `POST /api/refresh` pour refresh global
- [ ] S'assurer que les métriques sont bien relayées

### Moyenne Priorité

#### Brain3D
- [ ] Ajouter bouton "Refresh" pour forcer poll des skills
- [ ] Passer fréquence métriques à 1s
- [ ] Supprimer réception directe des métriques (passer par OnyxCore)

### Basse Priorité

#### Skill vpn-connector (nouveau)
- [ ] Créer skill Python pour gérer les connexions VPN
- [ ] Endpoints : `/connect`, `/disconnect`, `/status`
- [ ] Auto-reconnexion configurable

---

## Fichiers Créés (18 dec 2025)

```
/mnt/verso-data/cluster/apps/
├── onyx-heart-v2/
│   ├── main.go          # ~500 lignes, tout en un
│   ├── go.mod
│   ├── go.sum
│   ├── heart.yaml       # Config exemple
│   ├── Makefile         # Build multi-plateforme
│   ├── README.md
│   └── onyxheart        # Binaire compilé
│
└── onyx-sdk/
    ├── onyx_sdk.py      # SDK Python
    ├── setup.py         # Installation pip
    └── README.md
```

---

## Usage Rapide

### OnyxHeart v2

```bash
# Build
cd /mnt/verso-data/cluster/apps/onyx-heart-v2
make build

# Run
./onyxheart --core http://10.0.0.11:8000

# Test endpoints
curl http://localhost:8900/health
curl http://localhost:8900/status
curl http://localhost:8900/metrics

# Test skill status
curl -X POST http://localhost:8900/skills/status \
  -H "Content-Type: application/json" \
  -d '{"skill_name":"test","status":"up","brain_area":"temporal"}'
```

### onyx-sdk v2

```python
from onyx_sdk import OnyxClient

onyx = OnyxClient("mon-skill", brain_area="temporal", port=8100)

# Status simples
onyx.up("Ready")
onyx.working("Processing...")
onyx.error("Failed")

# Context manager
with onyx.task("Processing batch"):
    do_work()
# Auto up() à la fin
```

---

## Notes Techniques

| Service | Port Dev | Port Prod |
|---------|----------|-----------|
| Brain3D | 9888 | 8888 |
| OnyxCore | - | 8000 |
| OnyxHeart | - | 8900 |
